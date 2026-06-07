import { describe, expect, it } from "vitest";
import { EventLedger, FakeExternalProvider, InMemoryLedgerStore, buildReconciliationSummary } from "../../src/handlers.js";
import type { ExternalEvent } from "../../src/types.js";

function event(overrides: Partial<ExternalEvent> = {}): ExternalEvent {
  return {
    providerEventId: "evt_public_1",
    source: "fixture-payments",
    eventType: "order.created",
    accountId: "acct_public",
    objectId: "order_public",
    occurredAt: "2026-05-19T10:00:00.000Z",
    payload: { amountCents: 4900 },
    ...overrides,
  };
}

describe("public async webhook ledger contract", () => {
  it("records duplicate deliveries without repeating side effects", async () => {
    const store = new InMemoryLedgerStore();
    const provider = new FakeExternalProvider();
    const ledger = new EventLedger(store, provider);

    await ledger.processEvent(event());
    const second = await ledger.processEvent(event());

    expect(second.duplicate, "duplicate_deliveries: duplicate event must be recorded without reprocessing").toBe(true);
    expect(provider.calls, "duplicate_deliveries: duplicate provider event must not repeat side effects").toHaveLength(1);
  });

  it("rejects malformed events and includes them in reconciliation", async () => {
    const store = new InMemoryLedgerStore();
    const ledger = new EventLedger(store, new FakeExternalProvider());

    const result = await ledger.processEvent(event({ providerEventId: "", objectId: "" }));
    const summary = buildReconciliationSummary(store);

    expect(result.status).toBe("rejected");
    expect(summary.rejected).toBe(1);
    expect(summary.operatorNotes.join(" ")).toContain("rejected");
  });

  it("recovers when paid arrives before created", async () => {
    const store = new InMemoryLedgerStore();
    const ledger = new EventLedger(store, new FakeExternalProvider());

    await ledger.processEvent(event({ providerEventId: "evt_paid_first", eventType: "order.paid" }));
    await ledger.processEvent(event({ providerEventId: "evt_created_late", eventType: "order.created" }));

    expect(
      store.objects.get("acct_public:order_public")?.state,
      "out_of_order_state_regression: paid must win over earlier created events"
    ).toBe("paid");
  });
});
