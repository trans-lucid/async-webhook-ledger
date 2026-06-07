import { readFile } from "node:fs/promises";
import type pg from "pg";
import type { ExternalEvent, ExternalProvider, ProcessResult, ReconciliationSummary } from "./types.js";

type ObjectState = "created" | "paid" | "cancelled";

type WebhookRow = {
  status: string;
  side_effect_key: string | null;
};

type BusinessObjectRow = {
  state: ObjectState;
  paid_at: Date | null;
  cancelled_at: Date | null;
  version: number;
};

function validate(event: ExternalEvent): string | undefined {
  if (!event.providerEventId) return "missing providerEventId";
  if (!event.source) return "missing source";
  if (!event.accountId) return "missing accountId";
  if (!event.objectId) return "missing objectId";
  if (!event.occurredAt || Number.isNaN(Date.parse(event.occurredAt))) return "invalid occurredAt";
  if (!["order.created", "order.paid", "order.cancelled"].includes(event.eventType)) return "unsupported eventType";
  return undefined;
}

function providerEventIdFor(event: ExternalEvent) {
  return event.providerEventId || `invalid:${event.source || "unknown"}:${event.objectId || "unknown"}`;
}

function reduceState(current: BusinessObjectRow | undefined, event: ExternalEvent) {
  let state: ObjectState = current?.state ?? "created";
  let paidAt: Date | string | null = current?.paid_at ?? null;
  let cancelledAt: Date | string | null = current?.cancelled_at ?? null;

  if (event.eventType === "order.created") {
    state = current?.state === "paid" || current?.state === "cancelled" ? current.state : "created";
  }
  if (event.eventType === "order.paid") {
    state = "paid";
    paidAt = event.occurredAt;
  }
  if (event.eventType === "order.cancelled") {
    state = "cancelled";
    cancelledAt = event.occurredAt;
  }

  return {
    state,
    paidAt,
    cancelledAt,
    version: (current?.version ?? 0) + 1,
  };
}

export async function migrate(pool: pg.Pool) {
  const sql = await readFile(new URL("../migrations/001_init.sql", import.meta.url), "utf8");
  await pool.query(sql);
}

export async function resetState(pool: pg.Pool) {
  await pool.query("truncate table provider_side_effects, business_objects, webhook_events");
}

export class PostgresEventLedger {
  constructor(
    private readonly pool: pg.Pool,
    private readonly provider: ExternalProvider,
  ) {}

  async processEvent(event: ExternalEvent): Promise<ProcessResult> {
    const providerEventId = providerEventIdFor(event);
    const eventForValidation = { ...event, providerEventId };
    const rejectionReason = validate(eventForValidation);

    if (rejectionReason) {
      await this.pool.query(
        `insert into webhook_events (
          provider_event_id, source, event_type, account_id, object_id, occurred_at,
          status, rejection_reason, attempts, payload
        ) values ($1, $2, $3, $4, $5, $6, 'rejected', $7, 1, $8)
        on conflict (provider_event_id) do update set
          status = 'rejected',
          rejection_reason = excluded.rejection_reason,
          attempts = webhook_events.attempts + 1,
          last_seen_at = now(),
          payload = excluded.payload`,
        [
          providerEventId,
          event.source || "unknown",
          event.eventType || "order.created",
          event.accountId || null,
          event.objectId || null,
          event.occurredAt || null,
          rejectionReason,
          event.payload ?? {},
        ],
      );
      return { providerEventId, status: "rejected", duplicate: false, rejectionReason };
    }

    const sideEffectKey = `${event.source}:${providerEventId}`;
    await this.pool.query("begin");

    try {
      const upsert = await this.pool.query<WebhookRow>(
        `insert into webhook_events (
          provider_event_id, source, event_type, account_id, object_id, occurred_at,
          status, attempts, side_effect_key, payload
        ) values ($1, $2, $3, $4, $5, $6, 'processing', 1, $7, $8)
        on conflict (provider_event_id) do update set
          attempts = webhook_events.attempts + 1,
          duplicate_deliveries = case
            when webhook_events.status = 'processed' then webhook_events.duplicate_deliveries + 1
            else webhook_events.duplicate_deliveries
          end,
          last_seen_at = now(),
          payload = excluded.payload
        returning status, side_effect_key`,
        [
          providerEventId,
          event.source,
          event.eventType,
          event.accountId,
          event.objectId,
          event.occurredAt,
          sideEffectKey,
          event.payload,
        ],
      );

      const eventRow = upsert.rows[0];
      if (eventRow?.status === "processed") {
        await this.pool.query("commit");
        return {
          providerEventId,
          status: "duplicate",
          duplicate: true,
          sideEffectKey: eventRow.side_effect_key ?? sideEffectKey,
        };
      }

      const existingSideEffect = await this.pool.query(
        "select side_effect_key from provider_side_effects where side_effect_key = $1",
        [sideEffectKey],
      );

      if (existingSideEffect.rowCount === 0) {
        try {
          const sideEffect = await this.provider.performSideEffect({
            sideEffectKey,
            accountId: event.accountId,
            objectId: event.objectId,
            eventType: event.eventType,
          });
          await this.pool.query(
            `insert into provider_side_effects (
              side_effect_key, provider_event_id, account_id, object_id, result
            ) values ($1, $2, $3, $4, $5)
            on conflict (side_effect_key) do nothing`,
            [sideEffectKey, providerEventId, event.accountId, event.objectId, sideEffect],
          );
        } catch (error) {
          await this.pool.query(
            `update webhook_events
             set status = 'failed', last_seen_at = now()
             where provider_event_id = $1`,
            [providerEventId],
          );
          await this.pool.query("commit");
          const failureReason = error instanceof Error ? error.message : String(error);
          return { providerEventId, status: "failed", duplicate: false, sideEffectKey, failureReason };
        }
      }

      await this.applyBusinessTransition(event);
      await this.pool.query(
        `update webhook_events
         set status = 'processed',
             side_effect_key = $2,
             rejection_reason = null,
             processed_at = now(),
             last_seen_at = now()
         where provider_event_id = $1`,
        [providerEventId, sideEffectKey],
      );
      await this.pool.query("commit");
      return { providerEventId, status: "processed", duplicate: false, sideEffectKey };
    } catch (error) {
      await this.pool.query("rollback");
      throw error;
    }
  }

  private async applyBusinessTransition(event: ExternalEvent) {
    const current = await this.pool.query<BusinessObjectRow>(
      `select state, paid_at, cancelled_at, version
       from business_objects
       where account_id = $1 and object_id = $2
       for update`,
      [event.accountId, event.objectId],
    );
    const next = reduceState(current.rows[0], event);

    await this.pool.query(
      `insert into business_objects (
        account_id, object_id, state, paid_at, cancelled_at, version, last_event_id
      ) values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (account_id, object_id) do update set
        state = excluded.state,
        paid_at = excluded.paid_at,
        cancelled_at = excluded.cancelled_at,
        version = excluded.version,
        last_event_id = excluded.last_event_id,
        updated_at = now()`,
      [
        event.accountId,
        event.objectId,
        next.state,
        next.paidAt,
        next.cancelledAt,
        next.version,
        event.providerEventId,
      ],
    );
  }
}

export async function buildPostgresReconciliationSummary(pool: pg.Pool): Promise<ReconciliationSummary> {
  const { rows } = await pool.query<{
    total_events: string;
    processed: string;
    rejected: string;
    failed: string;
    duplicates: string;
  }>(`
    select
      count(*) as total_events,
      count(*) filter (where status = 'processed') as processed,
      count(*) filter (where status = 'rejected') as rejected,
      count(*) filter (where status = 'failed') as failed,
      coalesce(sum(duplicate_deliveries), 0) as duplicates
    from webhook_events
  `);

  const counts = rows[0] ?? { total_events: "0", processed: "0", rejected: "0", failed: "0", duplicates: "0" };
  const processed = Number(counts.processed);
  const rejected = Number(counts.rejected);
  const failed = Number(counts.failed);
  const duplicates = Number(counts.duplicates);
  const operatorNotes = [`${processed} events processed with ${duplicates} duplicate deliveries suppressed.`];
  if (rejected > 0) operatorNotes.push(`${rejected} rejected events need payload/schema review.`);
  if (failed > 0) operatorNotes.push(`${failed} failed events need retry or provider reconciliation.`);

  return {
    totalEvents: Number(counts.total_events),
    processed,
    rejected,
    failed,
    duplicates,
    pendingObjects: [],
    operatorNotes,
  };
}
