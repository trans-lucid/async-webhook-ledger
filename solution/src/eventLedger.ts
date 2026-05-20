import type {
  BusinessObject,
  EventType,
  ExternalEvent,
  ExternalProvider,
  LedgerRecord,
  ProcessResult,
} from "./types.js";

const now = () => new Date().toISOString();

function objectKey(event: Pick<ExternalEvent, "accountId" | "objectId">) {
  return `${event.accountId}:${event.objectId}`;
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

export class InMemoryLedgerStore {
  public events = new Map<string, LedgerRecord>();
  public objects = new Map<string, BusinessObject>();
  public sideEffects = new Map<string, { providerRequestId: string; status: string }>();
  private locks = new Map<string, Promise<unknown>>();

  async withProviderEventLock<T>(providerEventId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(providerEventId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(providerEventId, previous.then(() => current));
    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(providerEventId) === current) {
        this.locks.delete(providerEventId);
      }
    }
  }
}

export class FakeExternalProvider implements ExternalProvider {
  public calls: string[] = [];
  private failOnceKeys = new Set<string>();
  private failedKeys = new Set<string>();

  failOnceAfterSideEffect(sideEffectKey: string) {
    this.failOnceKeys.add(sideEffectKey);
  }

  async performSideEffect(input: {
    sideEffectKey: string;
    accountId: string;
    objectId: string;
    eventType: string;
  }): Promise<{ providerRequestId: string; status: string }> {
    this.calls.push(input.sideEffectKey);
    if (this.failOnceKeys.has(input.sideEffectKey) && !this.failedKeys.has(input.sideEffectKey)) {
      this.failedKeys.add(input.sideEffectKey);
      throw new Error("provider timeout after side effect");
    }
    return { providerRequestId: `req_${input.sideEffectKey}`, status: "accepted" };
  }
}

export class EventLedger {
  constructor(
    private readonly store: InMemoryLedgerStore,
    private readonly provider: ExternalProvider,
  ) {}

  async processEvent(event: ExternalEvent): Promise<ProcessResult> {
    const providerEventId = event.providerEventId || `invalid:${event.source || "unknown"}:${event.objectId || "unknown"}`;

    return this.store.withProviderEventLock(providerEventId, async () => {
      const existing = this.store.events.get(providerEventId);
      if (existing?.status === "processed") {
        existing.duplicateDeliveries += 1;
        existing.lastSeenAt = now();
        return {
          providerEventId,
          status: "duplicate",
          duplicate: true,
          sideEffectKey: existing.sideEffectKey,
        };
      }

      const rejectionReason = validate({ ...event, providerEventId });
      if (rejectionReason) {
        this.store.events.set(providerEventId, {
          event: { ...event, providerEventId },
          status: "rejected",
          attempts: (existing?.attempts ?? 0) + 1,
          duplicateDeliveries: existing?.duplicateDeliveries ?? 0,
          rejectionReason,
          firstSeenAt: existing?.firstSeenAt ?? now(),
          lastSeenAt: now(),
        });
        return { providerEventId, status: "rejected", duplicate: false, rejectionReason };
      }

      const sideEffectKey = `${event.source}:${providerEventId}`;
      this.store.events.set(providerEventId, {
        event: { ...event, providerEventId },
        status: "processing",
        attempts: (existing?.attempts ?? 0) + 1,
        duplicateDeliveries: existing?.duplicateDeliveries ?? 0,
        sideEffectKey,
        firstSeenAt: existing?.firstSeenAt ?? now(),
        lastSeenAt: now(),
      });

      try {
        if (!this.store.sideEffects.has(sideEffectKey)) {
          const sideEffect = await this.provider.performSideEffect({
            sideEffectKey,
            accountId: event.accountId,
            objectId: event.objectId,
            eventType: event.eventType,
          });
          this.store.sideEffects.set(sideEffectKey, sideEffect);
        }
        this.applyBusinessTransition(event);
        const record = this.store.events.get(providerEventId);
        if (record) {
          record.status = "processed";
          record.processedAt = now();
          record.lastSeenAt = now();
        }
        return { providerEventId, status: "processed", duplicate: false, sideEffectKey };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const record = this.store.events.get(providerEventId);
        if (message.includes("after side effect")) {
          this.store.sideEffects.set(sideEffectKey, {
            providerRequestId: `ambiguous_${sideEffectKey}`,
            status: "ambiguous-timeout",
          });
        }
        if (record) {
          record.status = "failed";
          record.failureReason = message;
          record.lastSeenAt = now();
        }
        return { providerEventId, status: "failed", duplicate: false, sideEffectKey, failureReason: message };
      }
    });
  }

  private applyBusinessTransition(event: ExternalEvent) {
    const key = objectKey(event);
    const current = this.store.objects.get(key);
    const next = reduceBusinessState(current, event.eventType, event);
    this.store.objects.set(key, next);
  }
}

function reduceBusinessState(current: BusinessObject | undefined, eventType: EventType, event: ExternalEvent): BusinessObject {
  const pending = new Set(current?.pending ?? []);
  let state = current?.state ?? "created";
  let paidAt = current?.paidAt;
  let cancelledAt = current?.cancelledAt;

  if (!current && eventType !== "order.created") {
    pending.add(eventType);
  }

  if (eventType === "order.created") {
    if (current?.state === "paid" || current?.state === "cancelled") {
      state = current.state;
    } else {
      state = pending.has("order.paid") ? "paid" : pending.has("order.cancelled") ? "cancelled" : "created";
    }
  }
  if (eventType === "order.paid") {
    state = "paid";
    paidAt = event.occurredAt;
    pending.delete("order.paid");
  }
  if (eventType === "order.cancelled") {
    state = "cancelled";
    cancelledAt = event.occurredAt;
    pending.delete("order.cancelled");
  }

  return {
    accountId: event.accountId,
    objectId: event.objectId,
    state,
    paidAt,
    cancelledAt,
    version: (current?.version ?? 0) + 1,
    lastEventId: event.providerEventId,
    pending: [...pending],
  };
}
