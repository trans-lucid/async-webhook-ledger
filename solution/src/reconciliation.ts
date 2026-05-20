import type { ReconciliationSummary } from "./types.js";
import type { InMemoryLedgerStore } from "./eventLedger.js";

export function buildReconciliationSummary(store: InMemoryLedgerStore): ReconciliationSummary {
  const records = [...store.events.values()];
  const processed = records.filter((record) => record.status === "processed").length;
  const rejected = records.filter((record) => record.status === "rejected").length;
  const failed = records.filter((record) => record.status === "failed").length;
  const duplicates = records.reduce((sum, record) => sum + record.duplicateDeliveries, 0);
  const pendingObjects = [...store.objects.values()]
    .filter((object) => object.pending.length > 0)
    .map((object) => ({
      accountId: object.accountId,
      objectId: object.objectId,
      reason: `waiting on ${object.pending.join(", ")}`,
    }));

  const operatorNotes = [
    `${processed} events processed with ${duplicates} duplicate deliveries suppressed.`,
  ];
  if (rejected > 0) operatorNotes.push(`${rejected} rejected events need payload/schema review.`);
  if (failed > 0) operatorNotes.push(`${failed} failed events need retry or provider reconciliation.`);
  if (pendingObjects.length > 0) operatorNotes.push(`${pendingObjects.length} objects still have pending lifecycle gaps.`);

  return {
    totalEvents: records.length,
    processed,
    rejected,
    failed,
    duplicates,
    pendingObjects,
    operatorNotes,
  };
}
