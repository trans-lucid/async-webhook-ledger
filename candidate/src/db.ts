import pg from "pg";

const { Pool } = pg;

export function createPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/webhooks",
  });
}
