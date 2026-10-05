/**
 * First-time setup (safe to run repeatedly):
 *  • settings row, default lead sources, the Sprinter vehicle, default workers
 *  • owner login from ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME if no users exist
 *
 *   npm run db:bootstrap
 */
import "./load-env";
import bcrypt from "bcryptjs";
import { count, eq } from "drizzle-orm";
import { db } from "../src/db";
import { employees, leadSources, settings, users, vehicles } from "../src/db/schema";
import { DEFAULT_LEAD_SOURCES } from "../src/lib/constants";

async function main() {
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing();

  for (const [i, name] of DEFAULT_LEAD_SOURCES.entries()) {
    await db.insert(leadSources).values({ name, sortOrder: i }).onConflictDoNothing();
  }

  const [{ n: vCount }] = await db.select({ n: count() }).from(vehicles);
  if (vCount === 0) {
    // Starting values — change any time in Settings → Vehicles.
    const [v] = await db
      .insert(vehicles)
      .values({
        name: "2019 Mercedes-Benz Sprinter 2500 Diesel",
        fuelType: "DIESEL",
        mpg: 15,
        fuelPrice: 3.75,
        maintenancePerMile: 0.2,
        depreciationPerMile: 0.15,
      })
      .returning();
    await db.update(settings).set({ defaultVehicleId: v.id }).where(eq(settings.id, 1));
    console.log("✓ Added vehicle:", v.name);
  }

  const [{ n: eCount }] = await db.select({ n: count() }).from(employees);
  let ownerEmployeeId: string | null = null;
  if (eCount === 0) {
    const [owner] = await db
      .insert(employees)
      .values({ name: process.env.ADMIN_NAME || "Owner", hourlyCost: 20 })
      .returning();
    await db.insert(employees).values({ name: "Helper", hourlyCost: 18 });
    ownerEmployeeId = owner.id;
    console.log("✓ Added workers:", owner.name, "+ Helper");
  }

  const [{ n: uCount }] = await db.select({ n: count() }).from(users);
  if (uCount === 0) {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) {
      console.warn("! No users exist. Set ADMIN_EMAIL and ADMIN_PASSWORD and re-run, or run `npm run user:create`.");
    } else {
      if (password.length < 10) throw new Error("ADMIN_PASSWORD must be at least 10 characters");
      await db.insert(users).values({
        email,
        name: process.env.ADMIN_NAME || "Owner",
        role: "OWNER",
        passwordHash: await bcrypt.hash(password, 12),
        employeeId: ownerEmployeeId,
      });
      console.log("✓ Created owner login:", email);
    }
  }
  console.log("✓ Bootstrap complete");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
