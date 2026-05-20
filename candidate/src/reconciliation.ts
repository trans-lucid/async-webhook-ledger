import type { ReconciliationSummary } from "./types.js";
import type { InMemoryLedgerStore } from "./eventLedger.js";

export function buildReconciliationSummary(store: InMemoryLedgerStore): ReconciliationSummary {
  const records = [...store.events.values()];
  const processed = records.filter((record) => record.status === "processed").length;
  const rejected = records.filter((record) => record.status === "rejected").length;
  const failed = records.filter((record) => record.status === "failed").length;

  return {
    totalEvents: records.length,
    processed,
    rejected,
    failed,
    duplicates: 0,
    pendingObjects: [],
    operatorNotes: [
      "Starter summary is incomplete. Include duplicates, pending lifecycle gaps, rejected events, and side-effect keys.",
    ],
  };
}
