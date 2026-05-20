import { CreateQueueCommand, GetQueueUrlCommand, PurgeQueueCommand, SendMessageBatchCommand } from "@aws-sdk/client-sqs";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { createPool } from "../../src/db.js";
import { migrate, resetState } from "../../src/postgresLedger.js";
import { createSqsClient, ensureQueue, queueName } from "../../src/queueSetup.js";
import { drainQueue } from "../../src/queueConsumer.js";

const providerBaseUrl = process.env.PROVIDER_BASE_URL ?? "http://localhost:8089";

async function requireLocalServices(pool: pg.Pool) {
  try {
    await pool.query("select 1");
    await fetch(`${providerBaseUrl}/__admin/requests/reset`, { method: "POST" });
    await ensureQueue();
  } catch (error) {
    throw new Error(
      `Public integration test requires local services. Run 'make dev' first. Cause: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function resetQueue() {
  const client = createSqsClient();
  try {
    const existing = await client.send(new GetQueueUrlCommand({ QueueName: queueName }));
    if (existing.QueueUrl) {
      await client.send(new PurgeQueueCommand({ QueueUrl: existing.QueueUrl }));
      return;
    }
  } catch {
    // Queue may not exist yet.
  }
  await client.send(new CreateQueueCommand({ QueueName: queueName }));
}

async function providerCallCount() {
  const response = await fetch(`${providerBaseUrl}/__admin/requests`);
  const body = await response.json() as { requests?: unknown[] };
  return body.requests?.length ?? 0;
}

describe("public local production simulator contract", () => {
  it("drains duplicate SQS messages through Postgres and WireMock exactly once", async () => {
    const pool = createPool();
    await requireLocalServices(pool);
    await migrate(pool);
    await resetState(pool);
    await resetQueue();

    const fixture = JSON.parse(
      await readFile(new URL("../../fixtures/public/public_events.jsonl", import.meta.url), "utf8")
        .then((body) => body.split("\n").find(Boolean) ?? "{}"),
    );
    const sqs = createSqsClient();
    const queueUrl = await ensureQueue(sqs);

    await sqs.send(
      new SendMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: [
          { Id: "first", MessageBody: JSON.stringify({ ...fixture, providerEventId: "evt_integration_duplicate" }) },
          { Id: "second", MessageBody: JSON.stringify({ ...fixture, providerEventId: "evt_integration_duplicate" }) },
        ],
      }),
    );

    await drainQueue({ maxMessages: 2 });

    const ledger = await pool.query(
      "select attempts, duplicate_deliveries, status from webhook_events where provider_event_id = $1",
      ["evt_integration_duplicate"],
    );
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0].status).toBe("processed");
    expect(Number(ledger.rows[0].duplicate_deliveries)).toBe(1);
    expect(await providerCallCount()).toBe(1);

    await pool.end();
  });
});
