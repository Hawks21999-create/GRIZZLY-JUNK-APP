/**
 * Browser test of the Google-Maps-style address autocomplete, with the
 * /api/maps/* endpoints stubbed (no real Google calls). Start the app with any
 * GOOGLE_MAPS_API_KEY value so Maps features are on:
 *   GOOGLE_MAPS_API_KEY=test npm run start   (or npm run dev)
 *   npx tsx scripts/e2e-address.ts
 */
import "./load-env";
import { Pool } from "pg";
import { chromium, type Page, type BrowserContext } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PH = "Start typing the address…";
let passed = 0;
function ok(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
  passed++;
  console.log("✓", msg);
}

type Sugg = { placeId: string; main: string; secondary: string; full: string };
const BETHELVIEW: Sugg[] = [
  { placeId: "place_bethel_rd_0001", main: "123 Bethelview Rd", secondary: "Cumming, GA 30040", full: "123 Bethelview Rd, Cumming, GA 30040" },
  { placeId: "place_bethel_dr_0002", main: "123 Bethelview Dr", secondary: "Cumming, GA 30040", full: "123 Bethelview Dr, Cumming, GA 30040" },
];
const MARKET: Sugg[] = [
  { placeId: "place_market_pl_0003", main: "25 Market Pl", secondary: "Dawsonville, GA 30534", full: "25 Market Pl, Dawsonville, GA 30534" },
];
const PLACES: Record<string, object> = {
  place_bethel_rd_0001: { formatted: "123 Bethelview Rd, Cumming, GA 30040", street: "123 Bethelview Rd", streetNumber: "123", streetName: "Bethelview Road", city: "Cumming", state: "GA", zip: "30040", lat: 34.1987, lng: -84.1932, placeId: "place_bethel_rd_0001" },
  place_bethel_dr_0002: { formatted: "123 Bethelview Dr, Cumming, GA 30040", street: "123 Bethelview Dr", streetNumber: "123", streetName: "Bethelview Drive", city: "Cumming", state: "GA", zip: "30040", lat: 34.2001, lng: -84.1901, placeId: "place_bethel_dr_0002" },
  place_market_pl_0003: { formatted: "25 Market Pl, Dawsonville, GA 30534", street: "25 Market Pl", streetNumber: "25", streetName: "Market Place", city: "Dawsonville", state: "GA", zip: "30534", lat: 34.4211, lng: -84.1191, placeId: "place_market_pl_0003" },
};

async function stub(ctx: BrowserContext) {
  const queries: string[] = [];
  const routeBodies: { stops: { address: string; lat?: number | null }[] }[] = [];
  await ctx.route("**/api/maps/autocomplete**", async (r) => {
    const q = new URL(r.request().url()).searchParams.get("q") ?? "";
    queries.push(q);
    if (/quota/i.test(q)) return r.fulfill({ status: 429, json: { error: "Address suggestions are busy right now — keep typing the address." } });
    if (/zzzq/i.test(q)) return r.fulfill({ json: { suggestions: [] } });
    if (/^slow/i.test(q)) await new Promise((res) => setTimeout(res, 1200)); // stale-response test
    const list = /market/i.test(q) ? MARKET : /bethel|^123|^slow/i.test(q) ? BETHELVIEW : [];
    return r.fulfill({ json: { suggestions: /^slow/i.test(q) ? [{ ...BETHELVIEW[0], main: "STALE RESULT" }] : list } });
  });
  await ctx.route("**/api/maps/place**", (r) => {
    const id = new URL(r.request().url()).searchParams.get("id") ?? "";
    return r.fulfill({ json: { place: PLACES[id] } });
  });
  await ctx.route("**/api/maps/route", async (r) => {
    const body = JSON.parse(r.request().postData() ?? "{}");
    routeBodies.push(body);
    const legs = [9.4, 6.2, 11.8, 4.5, 7.7].slice(0, body.stops.length - 1);
    await r.fulfill({ json: { legsMiles: legs, totalMiles: Math.round(legs.reduce((a, b) => a + b, 0) * 10) / 10, durationMinutes: 50 } });
  });
  return { queries, routeBodies };
}

/** The verified check inside one specific address field. */
const badge = (input: ReturnType<Page["getByPlaceholder"]>) => input.locator("xpath=..").getByLabel("Verified address");

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill("#email", process.env.ADMIN_EMAIL!);
  await page.fill("#password", process.env.ADMIN_PASSWORD!);
  await Promise.all([page.waitForURL(`${BASE}/`), page.click("button[type=submit]")]);
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" });

  // ───────────────────────── iPhone ─────────────────────────
  const phone = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const s1 = await stub(phone);
  const page = await phone.newPage();
  await login(page);
  await page.goto(`${BASE}/jobs/new`, { waitUntil: "networkidle" });
  const name = `Addr Test ${Date.now().toString().slice(-6)}`;
  await page.getByPlaceholder("Full name").fill(name);

  const addr = page.getByPlaceholder(PH).first();
  await addr.tap();
  await addr.pressSequentially("12", { delay: 40 });
  await page.waitForTimeout(450);
  ok(s1.queries.length === 0, "No lookups before 3 characters");

  await addr.pressSequentially("3 Bethelview", { delay: 45 });
  const list = page.getByRole("listbox", { name: "Address suggestions" });
  await list.waitFor({ timeout: 4000 });
  ok(s1.queries.length >= 1 && s1.queries.length <= 4, `Debounced: ${s1.queries.length} lookup(s) for 12 keystrokes`);
  ok(s1.queries.at(-1) === "123 Bethelview", "Last lookup used the full typed text");
  const opts = list.getByRole("option");
  ok((await opts.count()) === 2, "Shows matching suggestions under the field without pressing Enter");
  ok((await opts.first().innerText()).includes("123 Bethelview Rd") && (await opts.first().innerText()).includes("Cumming, GA 30040"), "Street is the main line, city/state/ZIP secondary");

  // Dropdown sits directly under the field and nothing covers it (z-index).
  const ib = (await addr.boundingBox())!;
  const lb = (await list.boundingBox())!;
  ok(lb.y >= ib.y + ib.height - 1 && lb.y - (ib.y + ib.height) < 12, "Dropdown is directly below the address field");
  const covered = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('[role="option"]'));
    return items.some((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return r.bottom < window.innerHeight && !(hit && el.contains(hit));
    });
  });
  ok(!covered, "No other element (save bar, nav) covers the suggestions");
  const tapH = await opts.first().evaluate((el) => el.getBoundingClientRect().height);
  ok(tapH >= 44, `Suggestion rows are easy to tap (${Math.round(tapH)}px tall)`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(overflow <= 0, "No sideways scrolling on iPhone width");
  await page.screenshot({ path: "screenshots/address_suggestions_iphone.png" });

  const routesBefore = s1.routeBodies.length;
  await opts.nth(1).tap();
  await list.waitFor({ state: "detached", timeout: 3000 });
  ok(true, "Tapping a suggestion closes the dropdown");
  await badge(addr).waitFor({ timeout: 3000 });
  ok((await addr.inputValue()) === "123 Bethelview Dr, Cumming, GA 30040", "Field filled with the standardized full address");
  ok((await page.getByPlaceholder("City").inputValue()) === "Cumming" && (await page.getByPlaceholder("ZIP").inputValue()) === "30040", "City, state and ZIP filled automatically");
  await page.waitForTimeout(900);
  ok(s1.routeBodies.length > routesBefore, "Mileage route recalculated automatically after picking");
  const custStop = s1.routeBodies.at(-1)!.stops.find((s) => s.address.includes("Bethelview Dr"));
  ok(custStop && custStop.lat === 34.2001, "Route uses the verified latitude/longitude");
  await page.screenshot({ path: "screenshots/address_verified_iphone.png" });

  // Typing again clears "verified" (so a stale lat/lng never sticks).
  await addr.tap();
  await addr.press("End");
  await addr.pressSequentially(" Apt 2", { delay: 20 });
  ok((await badge(addr).count()) === 0, "Editing the text removes the verified mark");
  // re-pick so the saved job is verified
  await addr.fill("");
  await addr.pressSequentially("123 Bethelview", { delay: 20 });
  await list.waitFor();
  await list.getByRole("option").nth(1).tap();
  await badge(addr).waitFor();

  await page.getByText("Quoted price", { exact: true }).locator("..").locator("input").fill("500");
  await Promise.all([page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/), page.getByRole("button", { name: /SAVE/ }).first().click()]);
  const jobId = page.url().split("/").pop()!;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query(
    "select j.address, j.city, j.state, j.zip, j.lat, j.lng, j.place_id, c.place_id as cust_place, coalesce(j.miles_override, j.route_miles) as total_miles from jobs j join customers c on c.id = j.customer_id where j.id = $1",
    [jobId],
  );
  const j = rows[0];
  ok(j.address === "123 Bethelview Dr, Cumming, GA 30040" && j.city === "Cumming" && j.state === "GA" && j.zip === "30040", "Saved the standardized address, city, state, ZIP");
  ok(j.lat === 34.2001 && j.lng === -84.1901, "Saved latitude/longitude");
  ok(j.place_id === "place_bethel_dr_0002" && j.cust_place === "place_bethel_dr_0002", "Saved the Google Place ID on the job and customer");
  ok(Number(j.total_miles) > 0, `Job mileage saved (${j.total_miles} mi)`);
  await page.getByText(/fuel/i).first().waitFor();
  ok(true, "Job page with transportation/fuel costs still renders");

  // ───────────────────────── Desktop ─────────────────────────
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const s2 = await stub(desk);
  const d = await desk.newPage();
  await login(d);
  await d.goto(`${BASE}/jobs/new`, { waitUntil: "networkidle" });
  await d.getByPlaceholder("Full name").fill(`${name} Desk`);
  const da = d.getByPlaceholder(PH).first();
  await da.click();
  await da.pressSequentially("Market Pl Dawsonville", { delay: 25 });
  const dl = d.getByRole("listbox", { name: "Address suggestions" });
  await dl.waitFor();
  await da.press("ArrowDown");
  ok((await dl.getByRole("option").first().getAttribute("aria-selected")) === "true", "↓ highlights the first suggestion");
  await da.press("ArrowUp");
  await da.press("ArrowDown");
  const urlBefore = d.url();
  await da.press("Enter");
  await badge(da).waitFor();
  ok(d.url() === urlBefore, "Enter picks the highlighted address without submitting the form");
  ok((await da.inputValue()) === "25 Market Pl, Dawsonville, GA 30534", "Dawsonville address selected by keyboard");
  ok((await d.getByPlaceholder("City").inputValue()) === "Dawsonville", "City set to Dawsonville (city reports)");

  await da.fill("");
  await da.pressSequentially("123 Beth", { delay: 25 });
  await dl.waitFor();
  await da.press("Escape");
  await dl.waitFor({ state: "detached" });
  ok(true, "Escape closes the suggestions");
  await da.pressSequentially("e", { delay: 25 });
  await dl.waitFor();
  await d.getByText("Job Address").first().click();
  await dl.waitFor({ state: "detached" });
  ok(true, "Clicking outside closes the suggestions");

  // No results
  await da.fill("");
  await da.click();
  await da.pressSequentially("zzzq road", { delay: 20 });
  await d.getByText("No matching addresses").waitFor();
  ok(true, "Shows a 'No matching addresses' note");

  // Stale-request protection: a slow earlier response must not overwrite a newer one.
  await da.fill("");
  await da.pressSequentially("slow", { delay: 20 });
  await d.waitForTimeout(400); // the slow lookup is now in flight
  await da.fill("");
  await da.pressSequentially("123 Bethelview", { delay: 20 });
  await dl.waitFor();
  await d.waitForTimeout(1500); // let the slow one finish
  ok((await d.getByText("STALE RESULT").count()) === 0 && (await dl.getByRole("option").count()) === 2, "Late responses from older searches are ignored");

  // Google failure → small message, field still usable, mileage still routes by text.
  await da.fill("");
  await da.pressSequentially("99 Quota Way, Cumming GA", { delay: 15 });
  await d.getByText("Address suggestions are busy right now").waitFor();
  ok(await da.isEditable(), "On a Google error the field stays usable with a small message");
  const before = s2.routeBodies.length;
  await d.getByPlaceholder("Full name").click(); // blur → typed address used for routing
  await d.waitForTimeout(900);
  ok(s2.routeBodies.length > before && s2.routeBodies.at(-1)!.stops.some((s) => s.address === "99 Quota Way, Cumming GA"), "A typed (not picked) address still drives the mileage route");
  await d.screenshot({ path: "screenshots/address_desktop.png" });

  // Customer form and Settings business address use the same field.
  await d.goto(`${BASE}/customers/new`, { waitUntil: "networkidle" });
  const ca = d.getByPlaceholder(PH).first();
  await ca.click();
  await ca.pressSequentially("123 Bethelview", { delay: 20 });
  await d.getByRole("listbox", { name: "Address suggestions" }).getByRole("option").first().click();
  await badge(ca).waitFor();
  ok((await ca.inputValue()) === "123 Bethelview Rd, Cumming, GA 30040", "Customer form address autocomplete works");
  await d.goto(`${BASE}/settings/business`, { waitUntil: "networkidle" });
  const ba = d.getByPlaceholder(PH).first();
  ok((await ba.count()) === 1, "Settings business (starting) address uses autocomplete");

  await pool.query("delete from jobs where id = $1", [jobId]);
  await pool.end();
  await browser.close();
  console.log(`\nAll ${passed} address checks passed.`);
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
