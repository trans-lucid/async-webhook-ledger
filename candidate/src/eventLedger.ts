import type { BusinessObject, EventStatus, ExternalEvent, ExternalProvider, ProcessResult } from "./types.js";

type LedgerRecord = {
  event: ExternalEvent;
  status: EventStatus;
  rejectionReason?: string;
  sideEffectKey?: string;
};

export class InMemoryLedgerStore {
  public events = new Map<string, LedgerRecord>();
  public objects = new Map<string, BusinessObject>();
  public sideEffects = new Map<string, unknown>();
}

export class FakeExternalProvider implements ExternalProvider {
  public calls: string[] = [];

  async performSideEffect(input: {
    sideEffectKey: string;
    accountId: string;
    objectId: string;
    eventType: string;
  }): Promise<{ providerRequestId: string; status: string }> {
    this.calls.push(input.sideEffectKey);
    return { providerRequestId: `req_${input.sideEffectKey}`, status: "accepted" };
  }
}

export class EventLedger {
  constructor(
    private readonly store: InMemoryLedgerStore,
    private readonly provider: ExternalProvider,
  ) {}

  async processEvent(event: ExternalEvent): Promise<ProcessResult> {
    if (!event.providerEventId || !event.accountId || !event.objectId || !event.eventType) {
      const providerEventId = event.providerEventId || "unknown";
      this.store.events.set(providerEventId, {
        event: { ...event, providerEventId },
        status: "rejected",
        rejectionReason: "missing required event fields",
      });
      return {
        providerEventId,
        status: "rejected",
        duplicate: false,
        rejectionReason: "missing required event fields",
      };
    }

    // Starter implementation intentionally contains the production bug:
    // every delivery is applied again and lifecycle order is not reconciled.
    const sideEffectKey = `${event.source}:${event.providerEventId}`;
    await this.provider.performSideEffect({
      sideEffectKey,
      accountId: event.accountId,
      objectId: event.objectId,
      eventType: event.eventType,
    });

    this.store.events.set(`${event.providerEventId}:${Date.now()}:${Math.random()}`, {
      event,
      status: "processed",
      sideEffectKey,
    });

    const objectKey = `${event.accountId}:${event.objectId}`;
    const current = this.store.objects.get(objectKey);
    const state = event.eventType === "order.paid" ? "paid" : event.eventType === "order.cancelled" ? "cancelled" : "created";
    this.store.objects.set(objectKey, {
      accountId: event.accountId,
      objectId: event.objectId,
      state,
      paidAt: state === "paid" ? event.occurredAt : current?.paidAt,
      cancelledAt: state === "cancelled" ? event.occurredAt : current?.cancelledAt,
      version: (current?.version ?? 0) + 1,
      lastEventId: event.providerEventId,
    });

    return { providerEventId: event.providerEventId, status: "processed", duplicate: false, sideEffectKey };
  }
}
