import { readFile } from "node:fs/promises";
import { EventLedger, FakeExternalProvider, InMemoryLedgerStore } from "./handlers.js";
import type { ExternalEvent } from "./types.js";

async function main() {
  const fixturePath = process.env.EVENT_FIXTURE ?? "fixtures/public/public_events.jsonl";
  const body = await readFile(fixturePath, "utf8");
  const store = new InMemoryLedgerStore();
  const provider = new FakeExternalProvider();
  const ledger = new EventLedger(store, provider);

  for (const line of body.split("\n").filter(Boolean)) {
    await ledger.processEvent(JSON.parse(line) as ExternalEvent);
  }

  console.log(`processed fixture deliveries=${body.split("\n").filter(Boolean).length}`);
  console.log(`provider side effects=${provider.calls.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
