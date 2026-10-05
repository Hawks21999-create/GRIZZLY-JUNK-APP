/**
 * Loads realistic SAMPLE data so you can try the app.
 *   npm run db:seed-demo            (adds demo data)
 *   npm run db:seed-demo -- --reset (wipes jobs/customers/expenses first)
 *
 * All demo customers have "(Demo)" in their notes and 555 phone numbers.
 * Don't run --reset against your real data.
 */
import "./load-env";
import { count, eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import {
  businessExpenses,
  customers,
  dumpFacilities,
  dumpRecords,
  employees,
  jobExpenses,
  jobLabor,
  jobRouteStops,
  jobs,
  leadSources,
  settings,
  vehicles,
} from "../src/db/schema";
import { computeEstimate, type JobForCalc } from "../src/lib/calc";
import { addDays, todayYmd, zonedTimeToUtc } from "../src/lib/tz";

const reset = process.argv.includes("--reset");

// deterministic PRNG so demo data is the same every run
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const between = (a: number, b: number) => a + rand() * (b - a);
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

const BUSINESS = { address: "Cumming, GA 30040", lat: 34.2073, lng: -84.1402 };

const AREAS = [
  { city: "Cumming", zip: "30040", lat: 34.2073, lng: -84.1402, miles: [6, 14] },
  { city: "Cumming", zip: "30041", lat: 34.198, lng: -84.08, miles: [5, 12] },
  { city: "Alpharetta", zip: "30004", lat: 34.0754, lng: -84.2941, miles: [12, 20] },
  { city: "Alpharetta", zip: "30005", lat: 34.083, lng: -84.231, miles: [11, 17] },
  { city: "Johns Creek", zip: "30097", lat: 34.0289, lng: -84.1986, miles: [14, 20] },
  { city: "Milton", zip: "30004", lat: 34.1322, lng: -84.3006, miles: [11, 17] },
  { city: "Dawsonville", zip: "30534", lat: 34.4212, lng: -84.1191, miles: [16, 24] },
  { city: "Dawsonville", zip: "30534", lat: 34.38, lng: -84.15, miles: [13, 20] },
  { city: "Cumming", zip: "30028", lat: 34.29, lng: -84.17, miles: [7, 13] },
  { city: "Gainesville", zip: "30501", lat: 34.2979, lng: -83.8241, miles: [20, 28] },
  { city: "Canton", zip: "30114", lat: 34.2368, lng: -84.4908, miles: [20, 27] },
  { city: "Roswell", zip: "30075", lat: 34.0232, lng: -84.3616, miles: [19, 26] },
];

const STREETS = ["Oak Ridge Dr", "Bethelview Rd", "Windermere Pkwy", "Haw Creek Ln", "Old Atlanta Rd", "Castleberry Rd", "Mullinax Rd", "Kemp Rd", "Pilgrim Mill Rd", "Majors Rd", "Brookwood Ct", "Shady Grove Rd", "Post Rd", "Hopewell Rd", "Waterside Dr", "Settles Bridge Rd"];
const FIRST = ["James", "Linda", "Robert", "Patricia", "Michael", "Jennifer", "David", "Susan", "Chris", "Karen", "Brian", "Megan", "Kevin", "Laura", "Jason", "Amy", "Tom", "Rachel", "Greg", "Nicole", "Steve", "Heather", "Mark", "Tina", "Paul", "Diane", "Eric", "Carla"];
const LAST = ["Anderson", "Brooks", "Carter", "Dawson", "Ellis", "Foster", "Graham", "Hughes", "Irwin", "Jensen", "Keller", "Lawson", "Mason", "Nolan", "Owens", "Parker", "Quinn", "Reeves", "Sutton", "Turner", "Vaughn", "Walsh"];
const COMPANIES = ["Lakeside Property Mgmt", "Northpoint Realty Group", "Sawnee Senior Living", "Windward Apartments", "Peachtree Estates HOA"];

const TYPES: { type: (typeof jobs.$inferInsert)["jobType"]; price: [number, number]; dump: [number, number]; hours: [number, number] }[] = [
  { type: "SINGLE_ITEM", price: [95, 175], dump: [0, 25], hours: [0.75, 1.25] },
  { type: "FURNITURE_REMOVAL", price: [225, 450], dump: [35, 70], hours: [1.5, 2.5] },
  { type: "APPLIANCE_REMOVAL", price: [125, 275], dump: [0, 40], hours: [1, 1.75] },
  { type: "GARAGE_CLEANOUT", price: [450, 850], dump: [65, 140], hours: [2.5, 4] },
  { type: "BASEMENT_CLEANOUT", price: [550, 1100], dump: [80, 170], hours: [3, 5] },
  { type: "ATTIC_CLEANOUT", price: [400, 750], dump: [55, 110], hours: [2.5, 4] },
  { type: "ESTATE_CLEANOUT", price: [1200, 2600], dump: [180, 360], hours: [6, 9] },
  { type: "MOVE_OUT_CLEANOUT", price: [450, 950], dump: [70, 150], hours: [2.5, 4.5] },
  { type: "CONSTRUCTION_DEBRIS", price: [500, 1000], dump: [110, 220], hours: [2.5, 4] },
  { type: "PROPERTY_CLEANOUT", price: [800, 1800], dump: [140, 280], hours: [4, 7] },
  { type: "COMMERCIAL", price: [700, 1600], dump: [120, 260], hours: [3, 6] },
];

const SOURCE_WEIGHTS: [string, number, [number, number]][] = [
  // name, weight, lead cost range
  ["Google Ads", 26, [30, 60]],
  ["Google Business Profile", 18, [0, 0]],
  ["Facebook Ads", 10, [10, 25]],
  ["Facebook Organic", 4, [0, 0]],
  ["Website", 7, [0, 0]],
  ["Phone Call", 5, [0, 0]],
  ["Realtor", 7, [0, 0]],
  ["Property Manager", 6, [0, 0]],
  ["Referral", 8, [0, 0]],
  ["Repeat Customer", 6, [0, 0]],
  ["Yard Sign", 4, [0, 0]],
  ["Other", 2, [0, 0]],
];

function weightedSource() {
  const total = SOURCE_WEIGHTS.reduce((a, s) => a + s[1], 0);
  let x = rand() * total;
  for (const s of SOURCE_WEIGHTS) {
    x -= s[1];
    if (x <= 0) return s;
  }
  return SOURCE_WEIGHTS[0];
}

async function main() {
  const [s] = await db.select().from(settings).where(eq(settings.id, 1));
  if (!s) throw new Error("Run `npm run db:bootstrap` first.");
  const tz = s.timezone;

  if (reset) {
    await db.execute(sql`truncate table attachments, dump_records, job_expenses, job_labor, job_route_stops, jobs, customers, business_expenses restart identity cascade`);
    console.log("✓ Cleared jobs, customers and expenses");
  } else {
    const [{ n }] = await db.select({ n: count() }).from(jobs);
    if (n > 0) {
      console.log(`Database already has ${n} jobs — skipping. Use --reset to replace them with demo data.`);
      return;
    }
  }

  // Business location + defaults
  if (!s.businessAddress) {
    await db.update(settings).set({ businessAddress: BUSINESS.address, businessLat: BUSINESS.lat, businessLng: BUSINESS.lng }).where(eq(settings.id, 1));
  }

  // Dump facilities (demo names — replace with your real ones in Settings)
  let facilities = await db.select().from(dumpFacilities);
  if (!facilities.length) {
    facilities = await db
      .insert(dumpFacilities)
      .values([
        { name: "Demo Transfer Station (Cumming)", address: "Cumming, GA 30040", lat: 34.24, lng: -84.12, defaultFee: 85 },
        { name: "Demo County Landfill", address: "Ball Ground, GA 30107", lat: 34.338, lng: -84.376, defaultFee: 65 },
      ])
      .returning();
    await db.update(settings).set({ defaultDumpFacilityId: facilities[0].id, defaultDumpCost: 85 }).where(eq(settings.id, 1));
  }

  let crew = await db.select().from(employees);
  if (crew.length < 3) {
    await db.insert(employees).values({ name: "Marcus", hourlyCost: 19 });
    crew = await db.select().from(employees);
  }
  const [vehicle] = await db.select().from(vehicles).limit(1);
  if (!vehicle) throw new Error("No vehicle — run bootstrap first");
  const sources = await db.select().from(leadSources);
  const srcId = (name: string) => sources.find((x) => x.name === name)?.id ?? null;

  // Customers
  const customerRows: (typeof customers.$inferSelect)[] = [];
  for (let i = 0; i < 46; i++) {
    const area = pick(AREAS);
    const business = i % 9 === 0;
    const name = business ? COMPANIES[(i / 9) % COMPANIES.length] : `${pick(FIRST)} ${pick(LAST)}`;
    const num = 100 + Math.floor(rand() * 9800);
    const address = `${num} ${pick(STREETS)}, ${area.city}, GA ${area.zip}`;
    const phoneDigits = `770555${String(1000 + i).slice(-4)}`;
    const [c] = await db
      .insert(customers)
      .values({
        name,
        phone: `(770) 555-${phoneDigits.slice(-4)}`,
        phoneDigits,
        email: business ? `office${i}@example.com` : `${name.split(" ")[0].toLowerCase()}${i}@example.com`,
        emailLower: business ? `office${i}@example.com` : `${name.split(" ")[0].toLowerCase()}${i}@example.com`,
        address,
        city: area.city,
        state: "GA",
        zip: area.zip,
        lat: area.lat + between(-0.03, 0.03),
        lng: area.lng + between(-0.03, 0.03),
        notes: "(Demo) sample customer",
      })
      .returning();
    customerRows.push(c);
  }

  const today = todayYmd(tz);
  const start = addDays(today.slice(0, 8) + "01", -62); // ~2 months back
  let created = 0;

  for (let day = 0; day < 105; day++) {
    const ymd = addDays(start, day);
    const dow = new Date(ymd + "T12:00:00Z").getUTCDay();
    if (dow === 0) continue; // closed Sundays
    const isPast = ymd < today;
    const isToday = ymd === today;
    const perDay = isToday ? 3 : ymd > today ? (rand() < 0.55 ? 1 : 0) + (rand() < 0.35 ? 1 : 0) : rand() < 0.15 ? 0 : 1 + (rand() < 0.45 ? 1 : 0);

    for (let k = 0; k < perDay; k++) {
      const t = pick(TYPES);
      const [srcName, , costRange] = weightedSource();
      const customer = pick(customerRows);
      const area = AREAS.find((a) => customer.city === a.city) ?? AREAS[0];
      const quoted = Math.round(between(t.price[0], t.price[1]) / 5) * 5;
      const hours = r2(Math.round(between(t.hours[0], t.hours[1]) * 4) / 4);
      const leadCost = costRange[1] > 0 ? r2(between(costRange[0], costRange[1])) : 0;
      const hour = [8, 10, 12, 14, 15][k % 5] + (rand() < 0.5 ? 0 : 0);
      const time = `${String(hour).padStart(2, "0")}:${rand() < 0.5 ? "00" : "30"}`;
      const scheduledStart = zonedTimeToUtc(ymd, time, tz);

      // status
      let status: (typeof jobs.$inferInsert)["status"];
      const roll = rand();
      if (isPast) status = roll < 0.74 ? "COMPLETED" : roll < 0.8 ? "CANCELLED" : "NOT_BOOKED";
      else if (isToday) status = k === 0 ? "COMPLETED" : k === 1 ? "IN_PROGRESS" : "SCHEDULED";
      else status = roll < 0.62 ? "SCHEDULED" : roll < 0.74 ? "ESTIMATE_SCHEDULED" : roll < 0.84 ? "QUOTE_SENT" : roll < 0.92 ? "CONTACTED" : "LEAD";

      const toCust = r1(between(area.miles[0], area.miles[1]));
      const facility = rand() < 0.75 ? facilities[0] : facilities[1];
      const custToDump = r1(between(4, 18) + (facility === facilities[1] ? 8 : 0));
      const dumpToBiz = r1(between(4, 16) + (facility === facilities[1] ? 10 : 0));
      const needsDump = t.dump[1] > 30;
      const workers = t.type === "SINGLE_ITEM" || t.type === "APPLIANCE_REMOVAL" ? crew.slice(0, 1) : t.type === "ESTATE_CLEANOUT" || t.type === "PROPERTY_CLEANOUT" ? crew.slice(0, 3) : crew.slice(0, 2);
      const estDump = needsDump ? Math.round(between(t.dump[0], t.dump[1]) / 5) * 5 : 0;
      const stops = needsDump
        ? [
            { type: "BUSINESS" as const, label: "Business", address: BUSINESS.address, legMiles: null },
            { type: "CUSTOMER" as const, label: "Customer", address: customer.address!, legMiles: toCust },
            { type: "DUMP" as const, label: facility.name, address: facility.address!, legMiles: custToDump },
            { type: "BUSINESS" as const, label: "Business", address: BUSINESS.address, legMiles: dumpToBiz },
          ]
        : [
            { type: "BUSINESS" as const, label: "Business", address: BUSINESS.address, legMiles: null },
            { type: "CUSTOMER" as const, label: "Customer", address: customer.address!, legMiles: toCust },
            { type: "BUSINESS" as const, label: "Business", address: BUSINESS.address, legMiles: r1(toCust * between(0.95, 1.05)) },
          ];
      const routeMiles = r1(stops.reduce((a, x) => a + (x.legMiles ?? 0), 0));
      const deposit = quoted >= 800 && rand() < 0.5 ? 100 : 0;

      const [job] = await db
        .insert(jobs)
        .values({
          customerId: customer.id,
          status,
          jobType: t.type,
          scheduledStart,
          durationMinutes: Math.max(60, Math.round((hours * 60) / 30) * 30 + 30),
          address: customer.address!,
          city: customer.city,
          state: "GA",
          zip: customer.zip,
          lat: customer.lat,
          lng: customer.lng,
          quotedPrice: quoted,
          deposit,
          paymentStatus: deposit ? "DEPOSIT_PAID" : "NOT_PAID",
          leadSourceId: srcId(srcName),
          leadCost,
          workersCount: workers.length,
          estLaborHours: hours,
          vehicleId: vehicle.id,
          mpg: vehicle.mpg,
          fuelPrice: vehicle.fuelPrice,
          maintenancePerMile: vehicle.maintenancePerMile,
          depreciationPerMile: vehicle.depreciationPerMile,
          routeMiles,
          routeCalculatedAt: new Date(),
          dumpFacilityId: needsDump ? facility.id : null,
          estDumpCost: estDump,
          notes: rand() < 0.3 ? pick(["Gate code 4321", "Items in garage, door will be open", "Couch + 2 mattresses upstairs", "Call 15 min before arrival", "Park in driveway, narrow street"]) : null,
          createdAt: new Date(scheduledStart.getTime() - between(1, 9) * 86400000),
          leadReceivedAt: new Date(scheduledStart.getTime() - between(1, 9) * 86400000),
          bookedAt: ["SCHEDULED", "IN_PROGRESS", "COMPLETED"].includes(status) ? new Date(scheduledStart.getTime() - between(0.5, 5) * 86400000) : null,
          lostReason: status === "CANCELLED" || status === "NOT_BOOKED" ? pick(["Price too high", "Went with another company", "No response", "Timing / scheduling"]) : null,
          fuelPriceSource: "Demo data",
        })
        .returning();
      created++;

      await db.insert(jobRouteStops).values(stops.map((x, i) => ({ ...x, jobId: job.id, position: i })));
      await db.insert(jobLabor).values(workers.map((w) => ({ jobId: job.id, employeeId: w.id, hourlyRate: w.hourlyCost, estHours: hours })));
      if (rand() < 0.12) {
        await db.insert(jobExpenses).values({ jobId: job.id, category: pick(["TOLLS", "PARKING", "DISPOSAL_SUPPLIES"] as const), description: pick(["Contractor bags", "Parking", "GA-400 toll", "Mattress disposal fee"]), amount: r2(between(5, 30)) });
      }

      if (status === "COMPLETED") {
        const calc: JobForCalc = {
          status: "SCHEDULED",
          quotedPrice: quoted,
          finalPrice: null,
          leadCost,
          workersCount: workers.length,
          estLaborHours: hours,
          mpg: vehicle.mpg,
          fuelPrice: vehicle.fuelPrice,
          maintenancePerMile: vehicle.maintenancePerMile,
          depreciationPerMile: vehicle.depreciationPerMile,
          routeMiles,
          milesOverride: null,
          actualMiles: null,
          estDumpCost: estDump,
          labor: workers.map((w) => ({ hourlyRate: w.hourlyCost, estHours: hours, actualHours: null })),
          dumpRecords: [],
          expenses: [],
        };
        const snapshot = computeEstimate(calc, { laborRate: s.defaultLaborRate, includeWear: true });
        const finalPrice = rand() < 0.2 ? quoted + pick([25, 50, 75, -25]) : quoted;
        const actualHours = r2(Math.max(0.5, hours + pick([-0.5, -0.25, 0, 0, 0.25, 0.5, 1])));
        const actualMiles = r1(routeMiles + between(-1.5, 4));
        await db.update(jobs).set({
          finalPrice,
          actualMiles,
          completedAt: new Date(scheduledStart.getTime() + actualHours * 3600000),
          paymentStatus: "PAID",
          paymentMethod: pick(["CARD", "CARD", "CASH", "CHECK", "ACH"] as const),
          estimateSnapshot: snapshot,
        }).where(eq(jobs.id, job.id));
        await db.update(jobLabor).set({ actualHours }).where(eq(jobLabor.jobId, job.id));
        if (needsDump) {
          const loads = estDump > 200 && rand() < 0.6 ? 2 : 1;
          for (let l = 0; l < loads; l++) {
            const fee = r2((estDump / loads) * between(0.8, 1.3));
            await db.insert(dumpRecords).values({ jobId: job.id, facilityId: facility.id, facilityName: facility.name, fee, weightLbs: Math.round(between(400, 2400)), loads: 1 });
          }
        }
      }
    }
  }

  // Business (overhead) expenses for each month in range
  const months = [addDays(today.slice(0, 8) + "01", -62).slice(0, 8), addDays(today.slice(0, 8) + "01", -31).slice(0, 8), today.slice(0, 8)];
  for (const m of [...new Set(months)]) {
    const d = (day: number) => `${m}${String(day).padStart(2, "0")}`;
    const isCurrent = m === today.slice(0, 8);
    const upTo = isCurrent ? Number(today.slice(8)) : 28;
    const rows: (typeof businessExpenses.$inferInsert)[] = [
      { date: d(1), vendor: "Progressive Commercial", category: "INSURANCE", description: "Commercial auto + GL insurance", amount: 412.5 },
      { date: d(1), vendor: "Google Ads", category: "ADVERTISING", description: "Google Ads monthly spend", amount: 1350, leadSourceId: srcId("Google Ads") },
      { date: d(3), vendor: "Meta", category: "ADVERTISING", description: "Facebook boosted posts", amount: 180, leadSourceId: srcId("Facebook Ads") },
      { date: d(5), vendor: "Verizon", category: "PHONE", description: "Business line", amount: 72.4 },
      { date: d(5), vendor: "Jobber / software", category: "SOFTWARE", description: "Software subscriptions", amount: 49 },
      { date: d(10), vendor: "Home Depot", category: "SUPPLIES", description: "Contractor bags, straps, gloves", amount: 86.37 },
      { date: d(12), vendor: "QuikTrip", category: "FUEL", description: "Diesel fill-up", amount: 118.6, coveredByJobCosts: true },
      { date: d(24), vendor: "QuikTrip", category: "FUEL", description: "Diesel fill-up", amount: 124.1, coveredByJobCosts: true },
      { date: d(18), vendor: "Mercedes-Benz of Cumming", category: "VEHICLE_MAINTENANCE", description: "Oil change + filters", amount: 289.0, coveredByJobCosts: true },
      { date: d(15), vendor: "Vistaprint", category: "ADVERTISING", description: "Yard signs + door hangers", amount: 96, leadSourceId: srcId("Yard Sign") },
    ];
    const toInsert = rows.filter((r) => Number(String(r.date).slice(8)) <= upTo);
    if (toInsert.length) await db.insert(businessExpenses).values(toInsert);
  }

  console.log(`✓ Demo data loaded: ${customerRows.length} customers, ${created} jobs, overhead expenses for ${new Set(months).size} months`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
