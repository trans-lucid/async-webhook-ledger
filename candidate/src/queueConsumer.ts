import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageBatchCommand } from "@aws-sdk/client-sqs";
import { readFile } from "node:fs/promises";
import { createPool } from "./db.js";
import type { ExternalEvent } from "./types.js";
import { PostgresEventLedger, migrate } from "./postgresLedger.js";
import { WireMockExternalProvider } from "./provider.js";
import { createSqsClient, ensureQueue } from "./queueSetup.js";

export async function seedQueueFromFixture(fixturePath = process.env.EVENT_FIXTURE ?? "fixtures/public/public_events.jsonl") {
  const body = await readFile(fixturePath, "utf8");
  const events = body.split("\n").filter(Boolean);
  const client = createSqsClient();
  const queueUrl = await ensureQueue(client);

  for (let i = 0; i < events.length; i += 10) {
    await client.send(new SendMessageBatchCommand({
      QueueUrl: queueUrl,
      Entries: events.slice(i, i + 10).map((line, offset) => ({
        Id: `${i + offset}`,
        MessageBody: line,
      })),
    }));
  }
  return events.length;
}

export async function drainQueue(options: { maxMessages?: number } = {}) {
  const maxMessages = options.maxMessages ?? Number(process.env.MAX_MESSAGES ?? 50);
  const client = createSqsClient();
  const queueUrl = await ensureQueue(client);
  const pool = createPool();
  await migrate(pool);
  const ledger = new PostgresEventLedger(pool, new WireMockExternalProvider());
  let processed = 0;

  try {
    while (processed < maxMessages) {
      const response = await client.send(new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: Math.min(10, maxMessages - processed),
        WaitTimeSeconds: 1,
      }));
      if (!response.Messages?.length) break;

      for (const message of response.Messages) {
        if (!message.Body) continue;
        await ledger.processEvent(JSON.parse(message.Body) as ExternalEvent);
        processed += 1;
        if (message.ReceiptHandle) {
          await client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }));
        }
      }
    }
  } finally {
    await pool.end();
  }

  return processed;
}

async function main() {
  if (process.env.SEED_QUEUE === "1") {
    const seeded = await seedQueueFromFixture();
    console.log(`seeded queue deliveries=${seeded}`);
  }
  const processed = await drainQueue();
  console.log(`processed queue deliveries=${processed}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
