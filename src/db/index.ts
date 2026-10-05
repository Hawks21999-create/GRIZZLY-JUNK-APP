import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __grizzlyPool: Pool | undefined;
}

function makePool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");
  const needsSsl = /sslmode=require/.test(url) || process.env.DATABASE_SSL === "true";
  return new Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });
}

// Reuse the pool across hot reloads in development.
const pool = globalThis.__grizzlyPool ?? makePool();
if (process.env.NODE_ENV !== "production") globalThis.__grizzlyPool = pool;

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export { schema };
