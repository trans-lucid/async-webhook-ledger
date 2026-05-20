import express from "express";
import { createPool } from "./db.js";
import { EventLedger, FakeExternalProvider, InMemoryLedgerStore, buildReconciliationSummary } from "./handlers.js";
import { buildPostgresReconciliationSummary, migrate } from "./postgresLedger.js";
import type { ExternalEvent } from "./types.js";

const app = express();
app.use(express.json());

const store = new InMemoryLedgerStore();
const ledger = new EventLedger(store, new FakeExternalProvider());
const pool = createPool();

app.post("/webhooks/events", async (req, res) => {
  const result = await ledger.processEvent(req.body as ExternalEvent);
  res.status(result.status === "rejected" ? 400 : 202).json(result);
});

app.get("/reconciliation", (_req, res) => {
  res.json(buildReconciliationSummary(store));
});

app.get("/reconciliation/postgres", async (_req, res, next) => {
  try {
    await migrate(pool);
    res.json(await buildPostgresReconciliationSummary(pool));
  } catch (error) {
    next(error);
  }
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`async webhook ledger listening on ${port}`);
});
