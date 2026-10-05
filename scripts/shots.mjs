// Usage: node scripts/shots.mjs /path1 /path2 ...   (iPhone 14 Pro viewport)
import { chromium } from "playwright-core";
const base = process.env.BASE ?? "http://localhost:3000";
const paths = process.argv.slice(2);
const full = process.env.FULL === "1";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(base + "/login");
await page.fill("#email", process.env.ADMIN_EMAIL ?? "owner@grizzlyjunkremoval.com");
await page.fill("#password", process.env.ADMIN_PASSWORD ?? "ChangeMe-Grizzly-2026!");
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);
for (const p of paths) {
  await page.goto(base + p, { waitUntil: "networkidle" });
  const name = p.replace(/[^\w]+/g, "_").replace(/^_|_$/g, "") || "dashboard";
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: full });
  // horizontal overflow check (mobile layout bug detector)
  const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - 393);
  console.log(p, "→", `screenshots/${name}.png`, overflow > 0 ? `⚠ horizontal overflow ${overflow}px` : "ok");
}
if (errors.length) console.log("Browser errors:\n" + [...new Set(errors)].join("\n"));
await browser.close();
