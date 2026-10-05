/**
 * Integration test for company-wide and marketing math against a real
 * PostgreSQL database. Runs only when TEST_DATABASE_URL is set (it TRUNCATES
 * that database — never point it at production).
 */
import { beforeAll, describe, expect, it } from "vitest";

for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {}
}
const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("buildReport (Google Ads example from the spec)", () => {
  let report: Awaited<ReturnType<typeof import("@/server/reports").buildReport>>;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({ connectionString: url });
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    await pool.query(
      "truncate attachments, dump_records, job_expenses, job_labor, job_route_stops, jobs, customers, business_expenses, lead_sources, vehicles, dump_facilities, employees, users, settings restart identity cascade",
    );
    await pool.end();

    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    const { zonedTimeToUtc } = await import("@/lib/tz");
    await db.insert(s.settings).values({ id: 1, defaultLaborRate: 20 });
    const [v] = await db.insert(s.vehicles).values({ name: "Van", mpg: 20, fuelPrice: 4, maintenancePerMile: 0, depreciationPerMile: 0 }).returning();
    const [gads] = await db.insert(s.leadSources).values({ name: "Google Ads" }).returning();
    const [ref] = await db.insert(s.leadSources).values({ name: "Referral" }).returning();
    const [c] = await db.insert(s.customers).values({ name: "Test" }).returning();
    const snap = { mpg: v.mpg, fuelPrice: v.fuelPrice, maintenancePerMile: 0, depreciationPerMile: 0, vehicleId: v.id };
    const when = zonedTimeToUtc("2026-09-10", "09:00", "America/New_York");

    // 35 Google Ads leads: 14 completed ($7,200 revenue, $200 dump each = $2,800 job costs), 21 not booked
    for (let i = 0; i < 35; i++) {
      const completed = i < 14;
      const price = i === 0 ? 700 : 500;
      const [j] = await db
        .insert(s.jobs)
        .values({
          customerId: c.id,
          status: completed ? "COMPLETED" : "NOT_BOOKED",
          address: "x",
          scheduledStart: when,
          quotedPrice: price,
          finalPrice: completed ? price : null,
          leadSourceId: gads.id,
          workersCount: 0,
          actualMiles: 0,
          ...snap,
        })
        .returning();
      if (completed) await db.insert(s.dumpRecords).values({ jobId: j.id, fee: 200, loads: 1 });
    }
    // A referral job with real vehicle + labor costs, and a $15 per-job lead fee
    const [rj] = await db
      .insert(s.jobs)
      .values({ customerId: c.id, status: "COMPLETED", address: "y", city: "cumming", scheduledStart: when, quotedPrice: 400, finalPrice: 400, leadSourceId: ref.id, leadCost: 15, workersCount: 0, actualMiles: 40, ...snap })
      .returning();
    const [emp] = await db.insert(s.employees).values({ name: "W", hourlyCost: 20 }).returning();
    await db.insert(s.jobLabor).values({ jobId: rj.id, employeeId: emp.id, hourlyRate: 20, estHours: 2, actualHours: 2 });
    // a scheduled (not completed) job from last month should not count as revenue
    await db.insert(s.jobs).values({ customerId: c.id, status: "SCHEDULED", address: "z", city: "Dawsonville", state: "GA", scheduledStart: when, quotedPrice: 999, leadSourceId: ref.id, workersCount: 0, ...snap });

    await db.insert(s.businessExpenses).values([
      { date: "2026-09-01", category: "ADVERTISING", amount: 1500, leadSourceId: gads.id },
      { date: "2026-09-02", category: "INSURANCE", amount: 300 },
      { date: "2026-09-03", category: "FUEL", amount: 120, coveredByJobCosts: true },
      { date: "2026-10-01", category: "INSURANCE", amount: 999 }, // outside range
    ]);

    const { buildReport } = await import("@/server/reports");
    report = await buildReport("2026-09-01", "2026-09-30");
  });

  it("marketing metrics per source", () => {
    const g = report.bySource.find((x) => x.name === "Google Ads")!;
    expect(g.leads).toBe(35);
    expect(g.booked).toBe(14);
    expect(g.bookingRate).toBe(40);
    expect(g.revenue).toBe(7200);
    expect(g.adSpend).toBe(1500);
    expect(g.jobCosts).toBe(2800);
    expect(g.operatingProfit).toBe(4400);
    expect(g.costPerLead).toBe(42.86); // 1500 / 35
    expect(g.costPerBooked).toBe(107.14); // 1500 / 14
    expect(g.roas).toBe(4.8); // 7200 / 1500
    expect(g.profitAfterAds).toBe(2900);
    expect(g.avgJobValue).toBe(514.29);
  });

  it("referral job: lead cost counted as ad spend, not as job cost", () => {
    const r = report.bySource.find((x) => x.name === "Referral")!;
    // vehicle: 40 mi / 20 mpg × $4 = $8, labor 2h × $20 = $40
    expect(r.jobCosts).toBe(48);
    expect(r.adSpend).toBe(15);
    expect(r.profitAfterAds).toBe(400 - 48 - 15);
    expect(r.leads).toBe(2);
    expect(r.booked).toBe(2);
  });

  it("company totals avoid double counting", () => {
    expect(report.totals.revenue).toBe(7600); // only completed jobs
    expect(report.completedCount).toBe(15);
    expect(report.totals.dump).toBe(2800);
    expect(report.totals.fuel).toBe(8);
    expect(report.totals.labor).toBe(40);
    expect(report.totals.lead).toBe(15);
    expect(report.jobProfit).toBe(7600 - 2800 - 8 - 40 - 15);
    expect(report.overhead).toBe(300); // fuel receipt excluded (already in job costs)
    expect(report.covered).toBe(120);
    expect(report.advertising.expenses).toBe(1500);
    expect(report.netProfit).toBe(report.jobProfit - 1500 - 300);
  });

  it("city performance (Cumming vs Dawsonville)", () => {
    const cum = report.byCity.find((c) => c.city === "Cumming, GA")!;
    expect(cum).toMatchObject({ leads: 1, leadCost: 15, booked: 1, completed: 1, revenue: 400, fuel: 8, labor: 40, dump: 0 });
    expect(cum.totalCosts).toBe(63); // 15 lead + 8 fuel + 40 labor
    expect(cum.profit).toBe(337);
    expect(cum.avgProfitPerJob).toBe(337);
    const daw = report.byCity.find((c) => c.city === "Dawsonville, GA")!;
    expect(daw).toMatchObject({ leads: 1, booked: 1, completed: 0, revenue: 0, bookingRate: 100 });
    expect(report.byCity[0].city).toBe("Cumming, GA"); // focus cities pinned first
  });

  it("filters by city and source", async () => {
    const { buildReport } = await import("@/server/reports");
    const r = await buildReport("2026-09-01", "2026-09-30", { city: "Cumming, GA" });
    expect(r.totals.revenue).toBe(400);
    expect(r.leadCount).toBe(1);
    expect(r.advertising.expenses).toBe(0); // ad spend can't be split by city
    const g = await buildReport("2026-09-01", "2026-09-30", { sourceId: report.bySource.find((x) => x.name === "Google Ads")!.id });
    expect(g.leadCount).toBe(35);
    expect(g.advertising.expenses).toBe(1500);
    expect(g.overhead).toBe(0);
  });

  it("pipeline holds booked-but-not-completed work", () => {
    expect(report.pipeline.revenue).toBe(999);
  });
});
