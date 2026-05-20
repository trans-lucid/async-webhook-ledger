import { readFile } from "node:fs/promises";
import type pg from "pg";
import type { BusinessObject, ExternalEvent, ExternalProvider, ProcessResult, ReconciliationSummary } from "./types.js";

function stateFor(eventType: ExternalEvent["eventType"]): BusinessObject["state"] {
  if (eventType === "order.paid") return "paid";
  if (eventType === "order.cancelled") return "cancelled";
  return "created";
}

function validate(event: ExternalEvent): string | undefined {
  if (!event.providerEventId) return "missing providerEventId";
  if (!event.source) return "missing source";
  if (!event.accountId) return "missing accountId";
  if (!event.objectId) return "missing objectId";
  if (!event.occurredAt || Number.isNaN(Date.parse(event.occurredAt))) return "invalid occurredAt";
  if (!["order.created", "order.paid", "order.cancelled"].includes(event.eventType)) return "unsupported eventType";
  return undefined;
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
    const providerEventId = event.providerEventId || "unknown";
    const rejectionReason = validate({ ...event, providerEventId });
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
          last_seen_at = now()`,
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

    // Starter implementation intentionally preserves the production bug:
    // it calls the provider before checking whether the event has already
    // been processed, so queue redelivery can repeat side effects.
    const sideEffectKey = `${event.source}:${providerEventId}`;
    const sideEffect = await this.provider.performSideEffect({
      sideEffectKey,
      accountId: event.accountId,
      objectId: event.objectId,
      eventType: event.eventType,
    });

    await this.pool.query("begin");
    try {
      await this.pool.query(
        `insert into provider_side_effects (
          side_effect_key, provider_event_id, account_id, object_id, result
        ) values ($1, $2, $3, $4, $5)
        on conflict (side_effect_key) do update set result = excluded.result`,
        [sideEffectKey, providerEventId, event.accountId, event.objectId, sideEffect],
      );

      await this.pool.query(
        `insert into webhook_events (
          provider_event_id, source, event_type, account_id, object_id, occurred_at,
          status, attempts, side_effect_key, payload, processed_at
        ) values ($1, $2, $3, $4, $5, $6, 'processed', 1, $7, $8, now())
        on conflict (provider_event_id) do update set
          attempts = webhook_events.attempts + 1,
          last_seen_at = now(),
          processed_at = now()`,
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

      const state = stateFor(event.eventType);
      await this.pool.query(
        `insert into business_objects (
          account_id, object_id, state, paid_at, cancelled_at, version, last_event_id
        ) values ($1, $2, $3, $4, $5, 1, $6)
        on conflict (account_id, object_id) do update set
          state = excluded.state,
          paid_at = coalesce(excluded.paid_at, business_objects.paid_at),
          cancelled_at = coalesce(excluded.cancelled_at, business_objects.cancelled_at),
          version = business_objects.version + 1,
          last_event_id = excluded.last_event_id,
          updated_at = now()`,
        [
          event.accountId,
          event.objectId,
          state,
          state === "paid" ? event.occurredAt : null,
          state === "cancelled" ? event.occurredAt : null,
          providerEventId,
        ],
      );
      await this.pool.query("commit");
      return { providerEventId, status: "processed", duplicate: false, sideEffectKey };
    } catch (error) {
      await this.pool.query("rollback");
      throw error;
    }
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
  return {
    totalEvents: Number(counts.total_events),
    processed: Number(counts.processed),
    rejected: Number(counts.rejected),
    failed: Number(counts.failed),
    duplicates: Number(counts.duplicates),
    pendingObjects: [],
    operatorNotes: [
      "Starter summary is incomplete. Include duplicates, pending lifecycle gaps, rejected events, and side-effect keys.",
    ],
  };
}
