import { describe, expect, it } from "vitest";
import { EventLedger, FakeExternalProvider, InMemoryLedgerStore, buildReconciliationSummary } from "../src/handlers.js";
import type { ExternalEvent } from "../src/types.js";

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

describe("reference solution public behavior", () => {
  it("suppresses duplicate deliveries before provider side effects", async () => {
    const store = new InMemoryLedgerStore();
    const provider = new FakeExternalProvider();
    const ledger = new EventLedger(store, provider);

    await ledger.processEvent(event());
    const duplicate = await ledger.processEvent(event());

    expect(duplicate.status).toBe("duplicate");
    expect(duplicate.duplicate).toBe(true);
    expect(provider.calls).toEqual(["fixture-payments:evt_public_1"]);
  });

  it("rejects malformed events and surfaces operator context", async () => {
    const store = new InMemoryLedgerStore();
    const ledger = new EventLedger(store, new FakeExternalProvider());

    await ledger.processEvent(event({ providerEventId: "", objectId: "" }));
    const summary = buildReconciliationSummary(store);

    expect(summary.rejected).toBe(1);
    expect(summary.operatorNotes.join(" ")).toContain("rejected");
  });

  it("keeps the final state when paid arrives before created", async () => {
    const store = new InMemoryLedgerStore();
    const ledger = new EventLedger(store, new FakeExternalProvider());

    await ledger.processEvent(event({ providerEventId: "evt_paid_first", eventType: "order.paid" }));
    await ledger.processEvent(event({ providerEventId: "evt_created_late", eventType: "order.created" }));

    expect(store.objects.get("acct_public:order_public")?.state).toBe("paid");
  });
});
