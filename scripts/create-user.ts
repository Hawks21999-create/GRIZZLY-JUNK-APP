/**
 * Create or reset a login from the command line.
 *   npm run user:create -- --email you@example.com --name "Daniel" --role OWNER
 * You'll be prompted for the password (or set NEW_USER_PASSWORD).
 */
import "./load-env";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { createInterface } from "node:readline/promises";
import { db } from "../src/db";
import { users } from "../src/db/schema";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name") ?? "Owner";
  const role = (arg("role") ?? "OWNER").toUpperCase() as "OWNER" | "ADMIN" | "EMPLOYEE";
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Pass --email you@example.com");
  if (!["OWNER", "ADMIN", "EMPLOYEE"].includes(role)) throw new Error("--role must be OWNER, ADMIN or EMPLOYEE");
  let password = process.env.NEW_USER_PASSWORD;
  if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question("Password (min 10 chars, letters + numbers): ");
    rl.close();
  }
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error("Password must be 10+ characters with letters and numbers");
  }
  const hash = await bcrypt.hash(password, 12);
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    await db
      .update(users)
      .set({ passwordHash: hash, active: true, failedLogins: 0, lockedUntil: null, sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, existing.id));
    console.log(`✓ Password reset for ${email}`);
  } else {
    await db.insert(users).values({ email, name, role, passwordHash: hash });
    console.log(`✓ Created ${role} ${email}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("✗", e.message);
    process.exit(1);
  });
