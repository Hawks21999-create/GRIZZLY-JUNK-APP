import { describe, expect, it } from "vitest";
import {
  computeActual,
  computeCosts,
  computeEstimate,
  jobFinancials,
  laborCost,
  round2,
  sumBreakdowns,
  vehicleCost,
  type JobForCalc,
} from "@/lib/calc";

const sprinter = { mpg: 16, fuelPrice: 3.8, maintenancePerMile: 0.25, depreciationPerMile: 0.16 };

describe("vehicleCost", () => {
  it("applies the spec formulas", () => {
    // 60 mi / 16 mpg = 3.75 gal × $3.80 = $14.25
    const v = vehicleCost(60, sprinter);
    expect(v.fuelGallons).toBe(3.75);
    expect(v.fuel).toBe(14.25);
    expect(v.maintenance).toBe(15); // 60 × 0.25
    expect(v.depreciation).toBe(9.6); // 60 × 0.16
    expect(v.total).toBe(38.85);
  });
  it("handles zero / invalid MPG without dividing by zero", () => {
    expect(vehicleCost(50, { ...sprinter, mpg: 0 }).fuel).toBe(0);
    expect(vehicleCost(-5, sprinter).total).toBe(0);
  });
});

describe("laborCost", () => {
  it("matches the spec example: Daniel 3h×$20 + Worker 3h×$18 = $114", () => {
    const l = laborCost([
      { name: "Daniel", hourlyRate: 20, hours: 3 },
      { name: "Worker 2", hourlyRate: 18, hours: 3 },
    ]);
    expect(l.cost).toBe(114);
    expect(l.hours).toBe(6);
  });
});

describe("computeCosts — spec example", () => {
  // CUSTOMER PRICE $650; Fuel 14.25, Maint 12.50, Depr 8.00, Dump 85, Labor 110, Lead 35, Other 10
  // TOTAL $274.75, PROFIT $375.25, MARGIN 57.7%
  const b = computeCosts({
    price: 650,
    miles: 50,
    vehicle: { mpg: 13.333333333, fuelPrice: 3.8, maintenancePerMile: 0.25, depreciationPerMile: 0.16 },
    dump: 85,
    labor: [{ hourlyRate: 27.5, hours: 4 }],
    leadCost: 35,
    other: 10,
  });
  it("vehicle lines", () => {
    expect(b.fuel).toBe(14.25);
    expect(b.maintenance).toBe(12.5);
    expect(b.depreciation).toBe(8);
  });
  it("totals, profit and margin", () => {
    expect(b.totalCost).toBe(274.75);
    expect(b.profit).toBe(375.25);
    expect(b.margin).toBe(57.7);
  });
  it("per-hour and per-mile", () => {
    expect(b.profitPerLaborHour).toBe(round2(375.25 / 4));
    expect(b.profitPerMile).toBe(round2(375.25 / 50));
  });
  it("margin undefined when price is 0", () => {
    const z = computeCosts({ price: 0, miles: 0, vehicle: sprinter, dump: 0, labor: [], leadCost: 0, other: 0 });
    expect(z.margin).toBeNull();
    expect(z.profitPerLaborHour).toBeNull();
    expect(z.profitPerMile).toBeNull();
  });
});

const baseJob = (over: Partial<JobForCalc> = {}): JobForCalc => ({
  status: "SCHEDULED",
  quotedPrice: 650,
  finalPrice: null,
  leadCost: 35,
  workersCount: 2,
  estLaborHours: 3,
  ...sprinter,
  routeMiles: 42.3,
  milesOverride: null,
  actualMiles: null,
  estDumpCost: 85,
  labor: [
    { employeeName: "Daniel", hourlyRate: 20, estHours: 3, actualHours: null },
    { employeeName: "Marcus", hourlyRate: 18, estHours: 3, actualHours: null },
  ],
  dumpRecords: [],
  expenses: [{ amount: 10 }],
  ...over,
});

describe("estimated vs actual", () => {
  it("estimate uses route miles, est dump, est hours", () => {
    const e = computeEstimate(baseJob(), 20);
    expect(e.miles).toBe(42.3);
    expect(e.dump).toBe(85);
    expect(e.labor).toBe(114);
    expect(e.other).toBe(10);
    expect(e.lead).toBe(35);
  });
  it("mileage override wins over route miles", () => {
    expect(computeEstimate(baseJob({ milesOverride: 70 }), 20).miles).toBe(70);
  });
  it("falls back to workers × hours × default rate when no workers assigned", () => {
    const e = computeEstimate(baseJob({ labor: [], workersCount: 3, estLaborHours: 2 }), 22);
    expect(e.labor).toBe(132);
    expect(e.laborHours).toBe(6);
  });
  it("actual uses final price, actual miles, multiple dump receipts and actual hours", () => {
    const j = baseJob({
      status: "COMPLETED",
      finalPrice: 700,
      actualMiles: 51.2,
      dumpRecords: [{ fee: 65 }, { fee: 42 }],
      labor: [
        { employeeName: "Daniel", hourlyRate: 20, estHours: 3, actualHours: 3.5 },
        { employeeName: "Marcus", hourlyRate: 18, estHours: 3, actualHours: 3.5 },
      ],
    });
    const a = computeActual(j, 20);
    expect(a.price).toBe(700);
    expect(a.miles).toBe(51.2);
    expect(a.dump).toBe(107); // $65 + $42
    expect(a.labor).toBe(133); // 3.5×20 + 3.5×18
    const v = vehicleCost(51.2, sprinter);
    expect(a.totalCost).toBe(round2(v.total + 107 + 133 + 35 + 10));
    expect(a.profit).toBe(round2(700 - a.totalCost));
  });
  it("jobFinancials uses frozen estimate snapshot after completion and reports the difference", () => {
    const snap = computeEstimate(baseJob(), 20);
    const done = baseJob({ status: "COMPLETED", estimateSnapshot: snap, finalPrice: 650, dumpRecords: [{ fee: 120 }] });
    const f = jobFinancials(done, 20);
    expect(f.estimate).toEqual(snap);
    expect(f.actual).not.toBeNull();
    expect(f.best).toBe(f.actual);
    expect(f.profitDifference).toBe(round2(f.actual!.profit - snap.profit));
    expect(f.profitDifference).toBe(-35); // dump came in $35 over estimate
  });
  it("open jobs report the estimate", () => {
    const f = jobFinancials(baseJob(), 20);
    expect(f.actual).toBeNull();
    expect(f.best).toBe(f.estimate);
    expect(f.profitDifference).toBeNull();
  });
});

describe("sumBreakdowns", () => {
  it("adds without float drift", () => {
    const parts = Array.from({ length: 10 }, () =>
      computeCosts({ price: 0.1, miles: 0, vehicle: sprinter, dump: 0, labor: [], leadCost: 0, other: 0 }),
    );
    expect(sumBreakdowns(parts).revenue).toBe(1);
  });
});
