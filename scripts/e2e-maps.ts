/**
 * UI test of the address → automatic route mileage flow with the Google Maps
 * endpoints stubbed in the browser. Start the dev server with any
 * GOOGLE_MAPS_API_KEY value so the app enables Maps features:
 *   GOOGLE_MAPS_API_KEY=test npm run dev
 *   npx tsx scripts/e2e-maps.ts
 */
import "./load-env";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3000";

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" });
  const page = await (await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
  const routeBodies: { stops: { address: string }[] }[] = [];
  await page.route("**/api/maps/autocomplete**", (r) =>
    r.fulfill({ json: { suggestions: [{ placeId: "place_abc_123456", main: "4321 Haw Creek Ln", secondary: "Cumming, GA, USA", full: "4321 Haw Creek Ln, Cumming, GA, USA" }] } }),
  );
  await page.route("**/api/maps/place**", (r) =>
    r.fulfill({ json: { place: { formatted: "4321 Haw Creek Ln, Cumming, GA 30041", street: "4321 Haw Creek Ln", city: "Cumming", state: "GA", zip: "30041", lat: 34.21, lng: -84.08 } } }),
  );
  await page.route("**/api/maps/route", async (r) => {
    const body = JSON.parse(r.request().postData() ?? "{}");
    routeBodies.push(body);
    const n = body.stops.length - 1;
    const legs = [9.4, 6.2, 11.8, 4.5, 7.7].slice(0, n);
    await r.fulfill({ json: { legsMiles: legs, totalMiles: Math.round(legs.reduce((a, b) => a + b, 0) * 10) / 10, durationMinutes: 50 } });
  });

  await page.goto(`${BASE}/login`);
  await page.fill("#email", process.env.ADMIN_EMAIL!);
  await page.fill("#password", process.env.ADMIN_PASSWORD!);
  await Promise.all([page.waitForURL(`${BASE}/`), page.click("button[type=submit]")]);
  await page.goto(`${BASE}/jobs/new`, { waitUntil: "networkidle" });

  const addr = page.getByPlaceholder("Start typing the address…").first();
  await addr.click();
  await addr.pressSequentially("4321 Haw", { delay: 30 });
  await page.getByText("4321 Haw Creek Ln").first().click();
  await page.getByText("Cumming, GA 30041").first().waitFor();
  await page.waitForTimeout(800);
  if (!routeBodies.length) throw new Error("route was not calculated automatically");
  const last = routeBodies.at(-1)!;
  if (!last.stops.some((s) => s.address.includes("Haw Creek"))) throw new Error("customer address not in route");
  const expected = [9.4, 6.2, 11.8, 4.5].slice(0, last.stops.length - 1).reduce((a, b) => a + b, 0).toFixed(1);
  const totalBox = page.getByText("Total Job Miles", { exact: true }).first().locator("..");
  await totalBox.getByText(expected).first().waitFor({ timeout: 5000 });
  console.log(`✓ Address picked → route auto-calculated over ${last.stops.length} stops → TOTAL JOB MILES ${expected}`);
  await page.screenshot({ path: "screenshots/route_auto.png" });

  const before = routeBodies.length;
  await page.getByRole("button", { name: "Business → Customer → Business" }).click();
  await page.waitForTimeout(800);
  if (routeBodies.length <= before) throw new Error("route not recalculated after template change");
  await totalBox.getByText((9.4 + 6.2).toFixed(1)).first().waitFor();
  console.log("✓ Switching to Business → Customer → Business recalculates (15.6 mi)");

  await page.getByText("Manually override total miles").click();
  await page.getByLabel("Total miles override").fill("41.5");
  await page.getByText("Manual override (route = 15.6 mi)").waitFor();
  await totalBox.getByText("41.5").first().waitFor();
  console.log("✓ Manual mileage override replaces the routed total");

  const legsShown = await page.getByText(/^\d+\.\d mi$/).allInnerTexts();
  console.log("Leg distances shown:", legsShown.join(", "));
  await browser.close();
}
main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
