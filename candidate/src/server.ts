import express from "express";
import { EventLedger, FakeExternalProvider, InMemoryLedgerStore, buildReconciliationSummary } from "./handlers.js";
import type { ExternalEvent } from "./types.js";

const app = express();
app.use(express.json());

const store = new InMemoryLedgerStore();
const ledger = new EventLedger(store, new FakeExternalProvider());

app.post("/webhooks/events", async (req, res) => {
  const result = await ledger.processEvent(req.body as ExternalEvent);
  res.status(result.status === "rejected" ? 400 : 202).json(result);
});

app.get("/reconciliation", (_req, res) => {
  res.json(buildReconciliationSummary(store));
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`async webhook ledger listening on ${port}`);
});
