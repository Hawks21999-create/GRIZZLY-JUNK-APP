import { describe, expect, it, vi } from "vitest";
import { applyWearPolicy, computeCosts, computeEstimate, type JobForCalc } from "@/lib/calc";
import { cityFromAddress, cityKey } from "@/lib/city";
import { LEAD_STATUS_TO_JOB, leadStatusOf } from "@/lib/constants";
import { eiaRegionalDiesel, googleLocalDiesel, median, moneyToNumber } from "@/lib/fuel-price";
import { splitMiles } from "@/lib/route-stops";

const van = { mpg: 15, fuelPrice: 4, maintenancePerMile: 0.2, depreciationPerMile: 0.15 };

describe("fuel cost (spec example)", () => {
  it("30 miles ÷ 15 MPG = 2 gallons × $4.00 = $8.00", () => {
    const b = computeCosts({ price: 0, miles: 30, vehicle: van, dump: 0, labor: [], leadCost: 0, other: 0, includeWear: false });
    expect(b.fuelGallons).toBe(2);
    expect(b.fuel).toBe(8);
    expect(b.vehicle).toBe(8);
    expect(b.maintenance).toBe(0);
  });
});

describe("TOTAL JOB COST = Lead + Fuel + Dump + Labor + Other (spec example)", () => {
  // Revenue $500; Lead $50; Fuel $12; Dump $70; Labor $60; Other $8 → cost $200, profit $300, margin 60%
  const b = computeCosts({
    price: 500,
    miles: 45, // 45 / 15 = 3 gal × $4 = $12
    vehicle: van,
    dump: 70,
    labor: [{ hourlyRate: 20, hours: 3 }],
    leadCost: 50,
    other: 8,
    includeWear: false,
  });
  it("cost breakdown", () => {
    expect(b.fuel).toBe(12);
    expect(b.totalCost).toBe(200);
    expect(b.profit).toBe(300);
    expect(b.margin).toBe(60);
  });
  it("vehicle wear is only added when turned on", () => {
    const withWear = computeCosts({ price: 500, miles: 45, vehicle: van, dump: 70, labor: [{ hourlyRate: 20, hours: 3 }], leadCost: 50, other: 8, includeWear: true });
    expect(withWear.totalCost).toBe(200 + 9 + 6.75);
    expect(applyWearPolicy(withWear, false)).toMatchObject({ totalCost: 200, profit: 300, margin: 60, maintenance: 0, depreciation: 0 });
  });
  it("job-level estimate honours the setting", () => {
    const j: JobForCalc = {
      status: "SCHEDULED", quotedPrice: 500, finalPrice: null, leadCost: 50, workersCount: 0, estLaborHours: 0, ...van,
      routeMiles: 45, milesOverride: null, actualMiles: null, estDumpCost: 70,
      labor: [{ hourlyRate: 20, estHours: 3, actualHours: null }], dumpRecords: [], expenses: [{ amount: 8 }],
    };
    expect(computeEstimate(j, { laborRate: 20, includeWear: false }).profit).toBe(300);
  });
});

describe("mileage split", () => {
  it("Start → Customer → Return", () => {
    expect(splitMiles([{ type: "BUSINESS", legMiles: null }, { type: "CUSTOMER", legMiles: 13 }, { type: "BUSINESS", legMiles: 13.2 }])).toEqual({ oneWay: 13, returnMiles: 13.2, total: 26.2 });
  });
  it("return includes the dump run", () => {
    expect(
      splitMiles([{ type: "BUSINESS", legMiles: null }, { type: "CUSTOMER", legMiles: 10 }, { type: "DUMP", legMiles: 8 }, { type: "BUSINESS", legMiles: 12 }]),
    ).toEqual({ oneWay: 10, returnMiles: 20, total: 30 });
  });
  it("unknown until every leg has miles", () => {
    expect(splitMiles([{ type: "BUSINESS", legMiles: null }, { type: "CUSTOMER", legMiles: null }, { type: "BUSINESS", legMiles: 4 }]).total).toBeNull();
  });
});

describe("lead status", () => {
  it("maps job statuses to lead statuses", () => {
    expect(leadStatusOf("LEAD")).toBe("NEW");
    expect(leadStatusOf("CONTACTED")).toBe("CONTACTED");
    expect(leadStatusOf("SCHEDULED")).toBe("BOOKED");
    expect(leadStatusOf("IN_PROGRESS")).toBe("BOOKED");
    expect(leadStatusOf("NOT_BOOKED")).toBe("LOST");
    expect(leadStatusOf("CANCELLED")).toBe("LOST");
    expect(leadStatusOf("COMPLETED")).toBe("COMPLETED");
    expect(LEAD_STATUS_TO_JOB.BOOKED).toBe("SCHEDULED");
  });
});

describe("city grouping", () => {
  it("normalizes", () => {
    expect(cityKey(" cumming ", null)).toBe("Cumming, GA");
    expect(cityKey("DAWSONVILLE, GA", "ga")).toBe("Dawsonville, GA");
    expect(cityKey("", null)).toBeNull();
    expect(cityFromAddress("123 Main St, Dawsonville, GA 30534")).toBe("Dawsonville");
  });
});

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

describe("diesel price lookup", () => {
  it("parses Google Money values", () => {
    expect(moneyToNumber({ units: "3", nanos: 899000000 })).toBeCloseTo(3.899);
    expect(median([4, 3, 5])).toBe(4);
    expect(median([3, 4])).toBe(3.5);
  });
  it("takes the median DIESEL price of nearby stations, ignoring stale/implausible ones", async () => {
    const now = new Date("2026-10-02T12:00:00Z");
    const f = vi.fn(async (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.includedTypes).toEqual(["gas_station"]);
      expect(body.locationRestriction.circle.center).toEqual({ latitude: 34.2, longitude: -84.1 });
      return json({
        places: [
          { fuelOptions: { fuelPrices: [{ type: "REGULAR_UNLEADED", price: { units: "3", nanos: 0 } }, { type: "DIESEL", price: { units: "3", nanos: 790000000 }, updateTime: "2026-10-01T10:00:00Z" }] } },
          { fuelOptions: { fuelPrices: [{ type: "DIESEL", price: { units: "3", nanos: 890000000 }, updateTime: "2026-10-02T08:00:00Z" }] } },
          { fuelOptions: { fuelPrices: [{ type: "DIESEL", price: { units: "4", nanos: 90000000 }, updateTime: "2026-09-30T08:00:00Z" }] } },
          { fuelOptions: { fuelPrices: [{ type: "DIESEL", price: { units: "2", nanos: 0 }, updateTime: "2026-08-01T00:00:00Z" }] } }, // stale
          { fuelOptions: { fuelPrices: [{ type: "DIESEL", price: { units: "0", nanos: 10000000 } }] } }, // bogus
          { displayName: { text: "No fuel data" } },
        ],
      });
    });
    const q = await googleLocalDiesel("K", 34.2, -84.1, { now }, f as unknown as typeof fetch);
    expect(q).toMatchObject({ price: 3.89, sampleSize: 3, source: "Local stations (Google)" });
  });
  it("returns null when no station reports diesel", async () => {
    const f = vi.fn(async () => json({ places: [{ fuelOptions: { fuelPrices: [] } }] }));
    expect(await googleLocalDiesel("K", 1, 1, {}, f as unknown as typeof fetch)).toBeNull();
  });
  it("EIA regional fallback", async () => {
    const f = vi.fn(async (u: string) => {
      expect(u).toContain("EMD_EPD2D_PTE_R1Z_DPG");
      return json({ response: { data: [{ period: "2026-09-28", value: "3.712" }] } });
    });
    expect(await eiaRegionalDiesel("KEY", f as unknown as typeof fetch)).toMatchObject({ price: 3.712, detail: "Week of 2026-09-28" });
  });
});
