/**
 * Applies pending SQL migrations from ./drizzle (production-safe, no drizzle-kit needed).
 *   npm run db:migrate
 */
import "./load-env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({
    connectionString: url,
    ssl: /sslmode=require/.test(url) || process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("✓ Database migrations applied");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
