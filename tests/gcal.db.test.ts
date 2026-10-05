/**
 * Google Calendar sync flow with the Google HTTP API mocked:
 * schedule → event created; time change → event updated; cancel → event deleted.
 * Runs only when TEST_DATABASE_URL is set (TRUNCATES it).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {}
}
const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

type Call = { method: string; url: string; body?: Record<string, unknown> };

d("Google Calendar sync", () => {
  const calls: Call[] = [];
  let jobId = "";
  let actorId = "";
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.GOOGLE_CLIENT_ID = "cid";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.APP_URL = "https://grizzly.example.com";
    process.env.APP_ENCRYPTION_KEY ||= "test-encryption-key-123456";

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input);
      const method = init?.method ?? "GET";
      calls.push({ method, url: u, body: init?.body && typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : undefined });
      if (u.startsWith("https://oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "at", expires_in: 3600 }), { status: 200 });
      if (method === "POST") return new Response(JSON.stringify({ id: "evt_1" }), { status: 200 });
      if (method === "PATCH") return new Response(JSON.stringify({ id: "evt_1" }), { status: 200 });
      if (method === "DELETE") return new Response(null, { status: 204 });
      return new Response("{}", { status: 404 });
    }) as typeof fetch;

    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({ connectionString: url });
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    await pool.query("truncate attachments, dump_records, job_expenses, job_labor, job_route_stops, jobs, customers, business_expenses, lead_sources, vehicles, dump_facilities, employees, users, settings restart identity cascade");
    await pool.end();

    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    const { encryptSecret } = await import("@/lib/crypto");
    await db.insert(s.settings).values({ id: 1, gcalEnabled: true, gcalRefreshTokenEnc: encryptSecret("refresh-token") });
    await db.insert(s.vehicles).values({ name: "Van", mpg: 16, fuelPrice: 3.8, maintenancePerMile: 0.2, depreciationPerMile: 0.15 });
    const [u] = await db.insert(s.users).values({ email: "t@example.com", name: "T", passwordHash: "x" }).returning();
    actorId = u.id;
  });

  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  it("creates an event when a job is scheduled", async () => {
    const { createJob } = await import("@/server/jobs");
    const { jobInputSchema } = await import("@/lib/validation");
    jobId = await createJob(
      jobInputSchema.parse({
        customer: { name: "Jane Smith", phone: "770-555-0100", email: null },
        address: "100 Main St, Cumming, GA 30040",
        date: "2026-10-05",
        time: "09:00",
        durationMinutes: 120,
        jobType: "GARAGE_CLEANOUT",
        status: "SCHEDULED",
        quotedPrice: 650,
        deposit: 0,
        paymentStatus: "NOT_PAID",
        leadCost: 0,
        workersCount: 2,
        estLaborHours: 2,
        labor: [],
        estDumpCost: 85,
        expenses: [],
        notes: "Gate code 1234",
      }),
      { id: actorId },
    );
    const post = calls.find((c) => c.method === "POST" && c.url.includes("/calendars/primary/events"));
    expect(post?.body?.summary).toBe("Grizzly Junk Removal - Jane Smith - $650");
    expect((post?.body?.start as { dateTime: string }).dateTime).toBe("2026-10-05T13:00:00.000Z");
    const { db } = await import("@/db");
    const row = await db.query.jobs.findFirst({ where: (j, { eq }) => eq(j.id, jobId) });
    expect(row?.gcalEventId).toBe("evt_1");
    expect(row?.gcalSyncError).toBeNull();
  });

  it("updates the event when the time changes", async () => {
    calls.length = 0;
    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { syncJobToCalendar } = await import("@/server/gcal");
    await db.update(s.jobs).set({ scheduledStart: new Date("2026-10-05T18:30:00Z") }).where(eq(s.jobs.id, jobId));
    await syncJobToCalendar(jobId);
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.url).toContain("/events/evt_1");
    expect((patch?.body?.start as { dateTime: string }).dateTime).toBe("2026-10-05T18:30:00.000Z");
  });

  it("deletes the event when the job is cancelled", async () => {
    calls.length = 0;
    const { setJobStatus } = await import("@/server/jobs");
    await setJobStatus(jobId, "CANCELLED");
    expect(calls.some((c) => c.method === "DELETE" && c.url.includes("/events/evt_1"))).toBe(true);
    const { db } = await import("@/db");
    const row = await db.query.jobs.findFirst({ where: (j, { eq }) => eq(j.id, jobId) });
    expect(row?.gcalEventId).toBeNull();
  });
});
