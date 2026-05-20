import { createPool } from "./db.js";
import { migrate } from "./postgresLedger.js";

const pool = createPool();

async function migrateWithRetry() {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      await migrate(pool);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

migrateWithRetry()
  .then(() => console.log("database schema ready"))
  .finally(() => pool.end())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
