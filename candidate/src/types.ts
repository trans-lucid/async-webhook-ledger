export type EventStatus = "received" | "processed" | "duplicate" | "rejected" | "failed";

export type ExternalEvent = {
  providerEventId: string;
  source: string;
  eventType: "order.created" | "order.paid" | "order.cancelled";
  accountId: string;
  objectId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export type ProcessResult = {
  providerEventId: string;
  status: EventStatus;
  duplicate: boolean;
  sideEffectKey?: string;
  rejectionReason?: string;
};

export type BusinessObject = {
  accountId: string;
  objectId: string;
  state: "created" | "paid" | "cancelled";
  paidAt?: string;
  cancelledAt?: string;
  version: number;
  lastEventId: string;
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
