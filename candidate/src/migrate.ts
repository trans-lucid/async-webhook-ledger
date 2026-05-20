import { createPool } from "./db.js";
import { migrate } from "./postgresLedger.js";

const pool = createPool();

migrate(pool)
  .then(() => console.log("database schema ready"))
  .finally(() => pool.end())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
