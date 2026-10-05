/**
 * End-to-end test of the core workflow against a running server:
 *   BOOK JOB → ROUTE MILES → ESTIMATE → STATUS → COMPLETE → ACTUAL PROFIT → REPEAT CUSTOMER → EDIT → DELETE
 *
 *   npm run dev            (in another terminal, with the database set up)
 *   npm run test:e2e
 *
 * Creates and then deletes its own test records (customer "E2E Test …").
 */
import "./load-env";
import { chromium, type Page } from "playwright-core";
import { Pool } from "pg";
import { applyWearPolicy, computeCosts, type CostBreakdown } from "../src/lib/calc";

const BASE = process.env.BASE ?? "http://localhost:3000";
const EMAIL = process.env.ADMIN_EMAIL!;
const PASSWORD = process.env.ADMIN_PASSWORD!;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows as T[];

let passed = 0;
function ok(cond: unknown, msg: string) {
  if (!cond) throw new Error("✗ " + msg);
  passed++;
  console.log("✓", msg);
}
const near = (a: number, b: number, eps = 0.011) => Math.abs(a - b) <= eps;

async function fillNum(page: Page, label: string, value: string) {
  const el = page.getByLabel(label, { exact: true });
  await el.fill(value);
}

async function main() {
  const tag = Date.now().toString().slice(-6);
  const name = `E2E Test ${tag}`;
  const phone = `(770) 555-${tag.slice(-4)}`;

  // 0. unauthenticated access is blocked
  const r401 = await fetch(`${BASE}/api/customers/search?q=a`);
  ok(r401.status === 401, "API rejects requests without a session (401)");
  const rLogin = await fetch(`${BASE}/`, { redirect: "manual" });
  ok(rLogin.status === 307 && rLogin.headers.get("location")?.includes("/login"), "Pages redirect to /login when signed out");

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  try {

  // 1. bad login
  await page.goto(`${BASE}/login`);
  await page.fill("#email", EMAIL);
  await page.fill("#password", "wrong-password-1");
  await page.click("button[type=submit]");
  await page.getByText("Incorrect email or password").waitFor();
  ok(true, "Wrong password is rejected");
  await q("update users set failed_logins = 0 where email = $1", [EMAIL]);

  // 2. login
  await page.fill("#password", PASSWORD);
  await Promise.all([page.waitForURL(`${BASE}/`), page.click("button[type=submit]")]);
  ok(true, "Owner can sign in");

  // 3. book a job
  await page.goto(`${BASE}/jobs/new`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("Full name").fill(name);
  await page.getByPlaceholder("(770) 555-0123").fill(phone);
  await page.getByPlaceholder("Start typing the address…").first().fill("123 Test Trail, Cumming, GA 30040");
  await page.locator('input[type="time"][step="900"]').fill("10:30");
  await page.locator("select").filter({ hasText: "Garage Cleanout" }).first().selectOption("GARAGE_CLEANOUT");
  await page.getByText("Quoted price", { exact: true }).locator("..").locator("input").fill("650");
  await page.getByRole("button", { name: "Google Ads", exact: true }).click();
  await page.getByText("Lead cost", { exact: true }).first().locator("..").locator("input").fill("35");
  await page.getByLabel("Diesel price per gallon").count(); // transportation card present
  // crew: default first two workers selected; set 3h each
  await page.getByText("Est. hours per worker").locator("..").locator("input").fill("3");
  // route legs (no maps key in test → manual leg miles)
  const legs = page.locator('input[aria-label^="Miles to"]');
  const legCount = await legs.count();
  const legValues = ["10", "8", "12", "5"].slice(0, legCount);
  for (let i = 0; i < legCount; i++) await legs.nth(i).fill(legValues[i]);
  const expectedMiles = legValues.reduce((a, b) => a + Number(b), 0);
  await page.getByText("Est. dump fee").locator("..").locator("input").fill("85");
  await Promise.all([page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/), page.getByRole("button", { name: "SAVE & SCHEDULE JOB" }).click()]);
  const jobId = page.url().split("/").pop()!;
  ok(jobId.length === 36, "Job saved and opened");

  const [job] = await q<{ job_number: number; route_miles: string; status: string; quoted_price: string; lead_cost: string; customer_id: string; scheduled_start: Date }>(
    "select * from jobs where id = $1",
    [jobId],
  );
  ok(Number(job.route_miles) === expectedMiles, `Total job miles = sum of legs (${expectedMiles})`);
  ok(job.status === "SCHEDULED" && Number(job.quoted_price) === 650 && Number(job.lead_cost) === 35, "Status, price and lead cost stored");
  const stops = await q("select * from job_route_stops where job_id = $1 order by position", [jobId]);
  ok(stops.length === legCount + 1, `Route stored with ${stops.length} stops`);
  const labor = await q<{ hourly_rate: string; est_hours: string }>("select * from job_labor where job_id = $1", [jobId]);
  ok(labor.length >= 1 && labor.every((l) => Number(l.est_hours) === 3), "Workers assigned with estimated hours");
  const hm = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(job.scheduled_start);
  ok(hm === "10:30", "Arrival time stored correctly in business time zone");
  await page.getByText(/GJR-\d{4}/).first().waitFor();
  ok(true, "Job number assigned (GJR-xxxx)");

  // estimated profit shown matches calculation
  const [veh] = await q<{ mpg: string; fuel_price: string; maintenance_per_mile: string; depreciation_per_mile: string }>("select mpg, fuel_price, maintenance_per_mile, depreciation_per_mile from jobs where id=$1", [jobId]);
  const vehicle = { mpg: Number(veh.mpg), fuelPrice: Number(veh.fuel_price), maintenancePerMile: Number(veh.maintenance_per_mile), depreciationPerMile: Number(veh.depreciation_per_mile) };
  const est = computeCosts({ price: 650, miles: expectedMiles, vehicle, dump: 85, labor: labor.map((l) => ({ hourlyRate: Number(l.hourly_rate), hours: 3 })), leadCost: 35, other: 0, includeWear: false });
  const estText = `$${est.profit.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  await page.getByText(estText).first().waitFor();
  ok(true, `Estimated profit displayed (${estText})`);

  // 4. one-tap status
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /ON THE WAY/ }).click();
  await page.getByText("CURRENT", { exact: true }).waitFor();
  const st1 = (await q<{ status: string }>("select status from jobs where id=$1", [jobId]))[0].status;
  ok(st1 === "ON_THE_WAY", `One-tap status → On The Way (${st1})`);

  // 5. complete job
  await page.getByRole("button", { name: /COMPLETE JOB/ }).click();
  await page.waitForURL(/\/complete$/);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Final customer price").fill("700");
  await page.getByLabel("Actual mileage").fill("32");
  await page.getByLabel("Dump fee").first().fill("65");
  await page.getByRole("button", { name: "Add another dump" }).click();
  await page.getByLabel("Dump fee").nth(1).fill("42");
  const hourInputs = page.locator('input[aria-label^="Hours for"]');
  for (let i = 0; i < (await hourInputs.count()); i++) await hourInputs.nth(i).fill("3.5");
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByPlaceholder("Description").last().fill("Contractor bags");
  await page.getByLabel("Amount").last().fill("12.50");
  await page.getByRole("radio", { name: "Card" }).click();
  await page.locator("form").getByRole("button", { name: "COMPLETE JOB" }).click();
  await page.getByText("JOB COMPLETE").waitFor();
  ok(true, "Complete-job workflow shows JOB COMPLETE");

  const actual = computeCosts({ price: 700, miles: 32, vehicle, dump: 107, labor: labor.map((l) => ({ hourlyRate: Number(l.hourly_rate), hours: 3.5 })), leadCost: 35, other: 12.5, includeWear: false });
  const shownProfit = `$${actual.profit.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  await page.getByText(shownProfit).first().waitFor();
  ok(true, `Actual profit displayed (${shownProfit}, margin ${actual.margin}%)`);
  const [done] = await q<{ status: string; final_price: string; actual_miles: string; payment_status: string; estimate_snapshot: CostBreakdown }>("select * from jobs where id=$1", [jobId]);
  ok(done.status === "COMPLETED" && Number(done.final_price) === 700 && Number(done.actual_miles) === 32 && done.payment_status === "PAID", "Actuals saved, job marked Completed & Paid");
  ok(near(applyWearPolicy(done.estimate_snapshot, false).profit, est.profit), "Estimate frozen at completion for estimated-vs-actual");
  const dumps = await q<{ fee: string }>("select fee from dump_records where job_id=$1", [jobId]);
  ok(dumps.length === 2 && near(dumps.reduce((a, d) => a + Number(d.fee), 0), 107), "Multiple dump receipts saved ($65 + $42 = $107)");

  // job page shows estimated vs actual
  await page.goto(`${BASE}/jobs/${jobId}`);
  await page.getByText("Estimated vs Actual").waitFor();
  ok(true, "Job page shows Estimated vs Actual");

  // 6. repeat customer → linked, no duplicate
  await page.goto(`${BASE}/jobs/new`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("(770) 555-0123").fill(phone);
  await page.getByText("Repeat customer found").waitFor({ timeout: 5000 });
  ok(true, "Repeat customer detected from phone number");
  await page.locator('input[aria-label^="Miles to"]').first().fill("9");
  await page.getByText("Quoted price", { exact: true }).locator("..").locator("input").fill("300");
  await Promise.all([page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/), page.getByRole("button", { name: "SAVE & SCHEDULE JOB" }).click()]);
  const job2 = page.url().split("/").pop()!;
  const custs = await q("select id from customers where phone_digits = $1", [phone.replace(/\D/g, "")]);
  const [j2] = await q<{ customer_id: string }>("select customer_id from jobs where id=$1", [job2]);
  ok(custs.length === 1 && j2.customer_id === job.customer_id, "Second job linked to the same customer (no duplicate)");

  // 7. edit — change time
  await page.goto(`${BASE}/jobs/${job2}/edit`, { waitUntil: "networkidle" });
  await page.locator('input[type="time"][step="900"]').fill("14:15");
  await Promise.all([page.waitForURL(`${BASE}/jobs/${job2}`), page.getByRole("button", { name: "SAVE CHANGES" }).click()]);
  const [j2b] = await q<{ scheduled_start: Date }>("select scheduled_start from jobs where id=$1", [job2]);
  const hm2 = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(j2b.scheduled_start);
  ok(hm2 === "14:15", `Editing a job updates its time (${hm2})`);

  // 8. customer lifetime stats
  await page.goto(`${BASE}/customers/${job.customer_id}`);
  await page.getByText("$700").first().waitFor();
  ok(true, "Customer page shows lifetime revenue from completed job");

  // 9. search by job number
  await page.goto(`${BASE}/jobs?q=GJR-${String(job.job_number).padStart(4, "0")}`);
  await page.getByText(name).first().waitFor();
  ok(true, "Job history search by job number");

  // 10. LEAD lifecycle: add lead → contacted → lost (with reason); second lead → book job
  await page.goto(`${BASE}/leads/new`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("Full name").fill(`${name} Lead`);
  await page.getByPlaceholder("(770) 555-0123").fill(`(678) 555-${tag.slice(-4)}`);
  await page.getByPlaceholder("Start typing the address…").first().fill("88 Lake Rd");
  await page.getByPlaceholder("City").fill("Dawsonville");
  await page.getByRole("button", { name: "Facebook Ads", exact: true }).click();
  await page.getByText("Lead cost", { exact: true }).first().locator("..").locator("input").fill("22");
  await page.getByText("Estimate / price").locator("..").locator("input").fill("400");
  await Promise.all([page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/), page.getByRole("button", { name: "SAVE LEAD" }).click()]);
  const leadId = page.url().split("/").pop()!;
  const [lead] = await q<{ status: string; city: string; lead_cost: string; lead_received_at: Date | null; source: string; quoted_price: string; fuel_price: string; mpg: string }>(
    "select j.status, j.city, j.lead_cost, j.lead_received_at, ls.name as source, j.quoted_price, j.fuel_price, j.mpg from jobs j left join lead_sources ls on ls.id = j.lead_source_id where j.id=$1",
    [leadId],
  );
  ok(lead.status === "LEAD" && lead.city === "Dawsonville" && Number(lead.lead_cost) === 22 && lead.source === "Facebook Ads" && lead.lead_received_at, "New lead saved with source, cost, city and time it came in");
  ok(Number(lead.mpg) === 15 && Number(lead.fuel_price) > 0, `Lead stores van MPG (15) and diesel price ($${lead.fuel_price})`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Contacted", exact: true }).click();
  await page.getByRole("button", { name: "● Contacted" }).waitFor();
  ok((await q<{ status: string }>("select status from jobs where id=$1", [leadId]))[0].status === "CONTACTED", "One-tap lead status → Contacted");
  await page.getByRole("button", { name: "Lost", exact: true }).click();
  await page.getByRole("button", { name: "Price too high" }).click();
  await page.getByRole("button", { name: "Mark lost" }).click();
  await page.getByText("Lost reason").first().waitFor();
  const [lost] = await q<{ status: string; lost_reason: string }>("select status, lost_reason from jobs where id=$1", [leadId]);
  ok(lost.status === "NOT_BOOKED" && lost.lost_reason === "Price too high", "Lost lead stores the lost reason");

  await page.goto(`${BASE}/leads/new`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("Full name").fill(`${name} Booked`);
  await page.getByPlaceholder("Start typing the address…").first().fill("12 Main St");
  await page.getByPlaceholder("City").fill("Cumming");
  await page.getByRole("button", { name: "Google Business Profile", exact: true }).click();
  await Promise.all([page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/), page.getByRole("button", { name: "SAVE LEAD" }).click()]);
  const lead2 = page.url().split("/").pop()!;
  await page.waitForLoadState("networkidle");
  await Promise.all([page.waitForURL(/edit\?book=1/), page.getByRole("link", { name: /BOOK JOB/ }).click()]);
  await page.waitForLoadState("networkidle");
  await page.locator('input[aria-label^="Miles to"]').first().fill("13");
  await page.locator('input[aria-label^="Miles to"]').nth(1).fill("13");
  await page.getByText("Quoted price", { exact: true }).locator("..").locator("input").fill("450");
  await Promise.all([page.waitForURL(`${BASE}/jobs/${lead2}`), page.getByRole("button", { name: "SAVE CHANGES" }).click()]);
  const [bk] = await q<{ status: string; booked_at: Date | null; route_miles: string; scheduled_start: Date | null }>("select status, booked_at, route_miles, scheduled_start from jobs where id=$1", [lead2]);
  ok(bk.status === "SCHEDULED" && bk.booked_at && bk.scheduled_start && Number(bk.route_miles) === 26, "BOOK JOB turns the lead into a scheduled job (26 mi round trip)");
  await page.getByText("13.0 one-way + 13.0 return").waitFor();
  ok(true, "Job view shows one-way + return miles");

  await page.goto(`${BASE}/leads?period=all&lead=LOST`);
  await page.getByText(`${name} Lead`).first().waitFor();
  ok(true, "Leads list filters by lead status (Lost)");
  await page.goto(`${BASE}/cities?period=all`);
  await page.getByText("Cumming vs Dawsonville").waitFor();
  ok(true, "City performance page loads");

  for (const id of [leadId, lead2]) {
    await page.goto(`${BASE}/jobs/${id}`, { waitUntil: "networkidle" });
    await Promise.all([page.waitForURL(`${BASE}/jobs`), page.getByRole("button", { name: "Delete job" }).click()]);
  }
  await q("delete from customers c where c.name like $1 and not exists (select 1 from jobs j where j.customer_id = c.id)", [`${name}%`]);

  // 11. delete
  for (const id of [job2, jobId]) {
    await page.goto(`${BASE}/jobs/${id}`, { waitUntil: "networkidle" });
    await Promise.all([page.waitForURL(`${BASE}/jobs`), page.getByRole("button", { name: "Delete job" }).click()]);
  }
  ok((await q("select id from jobs where id = any($1)", [[jobId, job2]])).length === 0, "Jobs deleted (with their costs)");
  await q("delete from customers where id=$1", [job.customer_id]);

  const realErrors = errors.filter((e) => !/404/.test(e)); // missing optional logo file is expected
  ok(realErrors.length === 0, `No browser errors${realErrors.length ? ": " + realErrors.join("; ") : ""}`);
  } catch (e) {
    await page.screenshot({ path: "screenshots/e2e-fail.png", fullPage: true }).catch(() => undefined);
    const banner = await page.locator('[role="alert"]').allInnerTexts().catch(() => []);
    if (banner.length) console.error("Page alert:", banner.join(" | "));
    throw e;
  } finally {
    await browser.close();
  }
  console.log(`\nAll ${passed} end-to-end checks passed.`);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
