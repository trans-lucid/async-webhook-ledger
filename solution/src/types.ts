export type EventStatus = "received" | "processing" | "processed" | "duplicate" | "rejected" | "failed";

export type EventType = "order.created" | "order.paid" | "order.cancelled";

export type ExternalEvent = {
  providerEventId: string;
  source: string;
  eventType: EventType;
  accountId: string;
  objectId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export type LedgerRecord = {
  event: ExternalEvent;
  status: EventStatus;
  attempts: number;
  duplicateDeliveries: number;
  rejectionReason?: string;
  failureReason?: string;
  sideEffectKey?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  processedAt?: string;
};

export type BusinessObject = {
  accountId: string;
  objectId: string;
  state: "created" | "paid" | "cancelled";
  paidAt?: string;
  cancelledAt?: string;
  version: number;
  lastEventId: string;
  pending: EventType[];
};

export type ProcessResult = {
  providerEventId: string;
  status: EventStatus;
  duplicate: boolean;
  sideEffectKey?: string;
  rejectionReason?: string;
  failureReason?: string;
};

export type ReconciliationSummary = {
  totalEvents: number;
  processed: number;
  rejected: number;
  failed: number;
  duplicates: number;
  pendingObjects: Array<{ accountId: string; objectId: string; reason: string }>;
  operatorNotes: string[];
};

export type ExternalProvider = {
  performSideEffect(input: {
    sideEffectKey: string;
    accountId: string;
    objectId: string;
    eventType: string;
  }): Promise<{ providerRequestId: string; status: string }>;
};
