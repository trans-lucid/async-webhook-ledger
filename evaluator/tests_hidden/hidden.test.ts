import { describe, expect, it } from "vitest";
import { EventLedger, FakeExternalProvider, InMemoryLedgerStore, buildReconciliationSummary } from "../../solution/src/handlers.js";
import type { ExternalEvent } from "../../solution/src/types.js";

function event(overrides: Partial<ExternalEvent> = {}): ExternalEvent {
  return {
    providerEventId: "evt_hidden_1",
    source: "fixture-payments",
    eventType: "order.created",
    accountId: "acct_hidden",
    objectId: "order_hidden",
    occurredAt: "2026-05-19T10:00:00.000Z",
    payload: { amountCents: 9900, plan: "team" },
    ...overrides,
  };
}

describe("hidden evaluator behavior", () => {
  it("handles concurrent duplicate deliveries with one provider side effect", async () => {
    const store = new InMemoryLedgerStore();
    const provider = new FakeExternalProvider();
    const ledger = new EventLedger(store, provider);

    const results = await Promise.all([
      ledger.processEvent(event({ providerEventId: "evt_concurrent" })),
      ledger.processEvent(event({ providerEventId: "evt_concurrent" })),
      ledger.processEvent(event({ providerEventId: "evt_concurrent" })),
    ]);

    expect(results.filter((result) => result.status === "processed")).toHaveLength(1);
    expect(results.filter((result) => result.status === "duplicate")).toHaveLength(2);
    expect(provider.calls).toEqual(["fixture-payments:evt_concurrent"]);
  });

  it("does not repeat provider side effects after ambiguous timeout and redelivery", async () => {
    const store = new InMemoryLedgerStore();
    const provider = new FakeExternalProvider();
    const ledger = new EventLedger(store, provider);
    provider.failOnceAfterSideEffect("fixture-payments:evt_timeout");

    const first = await ledger.processEvent(event({ providerEventId: "evt_timeout" }));
    const retry = await ledger.processEvent(event({ providerEventId: "evt_timeout" }));

    expect(first.status).toBe("failed");
    expect(retry.status).toBe("processed");
    expect(provider.calls).toEqual(["fixture-payments:evt_timeout"]);
    expect(store.sideEffects.get("fixture-payments:evt_timeout")?.status).toBe("ambiguous-timeout");
  });

  it("does not downgrade a paid object when a late create event arrives", async () => {
    const store = new InMemoryLedgerStore();
    const ledger = new EventLedger(store, new FakeExternalProvider());

    await ledger.processEvent(event({ providerEventId: "evt_paid", eventType: "order.paid", occurredAt: "2026-05-19T10:05:00.000Z" }));
    await ledger.processEvent(event({ providerEventId: "evt_created", eventType: "order.created", occurredAt: "2026-05-19T10:00:00.000Z" }));

    const object = store.objects.get("acct_hidden:order_hidden");
    expect(object?.state).toBe("paid");
    expect(object?.paidAt).toBe("2026-05-19T10:05:00.000Z");
  });

  it("writes reconciliation notes that explain failed, rejected, and duplicate delivery classes", async () => {
    const store = new InMemoryLedgerStore();
    const provider = new FakeExternalProvider();
    const ledger = new EventLedger(store, provider);
    provider.failOnceAfterSideEffect("fixture-payments:evt_ambiguous");

    await ledger.processEvent(event({ providerEventId: "evt_ok" }));
    await ledger.processEvent(event({ providerEventId: "evt_ok" }));
    await ledger.processEvent(event({ providerEventId: "", accountId: "" }));
    await ledger.processEvent(event({ providerEventId: "evt_ambiguous" }));

    const summary = buildReconciliationSummary(store);
    const notes = summary.operatorNotes.join(" ").toLowerCase();

    expect(summary.duplicates).toBe(1);
    expect(summary.rejected).toBe(1);
    expect(summary.failed).toBe(1);
    expect(notes).toContain("duplicate");
    expect(notes).toContain("rejected");
    expect(notes).toContain("failed");
  });
});
