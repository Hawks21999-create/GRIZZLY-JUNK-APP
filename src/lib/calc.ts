/**
 * Job profitability engine.
 *
 * Everything here is pure (no DB access) so it can be unit tested and used on
 * both server and client (live estimates while typing).
 *
 *   Fuel Used          = Miles / MPG
 *   Fuel Cost          = Fuel Used × Fuel Price
 *   Maintenance Cost   = Miles × Maintenance $/mi
 *   Depreciation Cost  = Miles × Depreciation $/mi
 *   Vehicle Cost       = Fuel (+ Maintenance + Depreciation when "vehicle wear" is on)
 *   Total Job Cost     = Lead + Fuel + Dump + Labor + Other (+ wear when on)
 *   Job Profit         = Price − Total Job Cost
 *   Profit Margin %    = Job Profit / Price × 100
 */

export type VehicleRates = {
  mpg: number;
  fuelPrice: number;
  maintenancePerMile: number;
  depreciationPerMile: number;
};

export type LaborLine = {
  name?: string;
  hourlyRate: number;
  hours: number;
};

export type CostInput = {
  price: number;
  miles: number;
  vehicle: VehicleRates;
  dump: number;
  labor: LaborLine[];
  leadCost: number;
  other: number;
  /** Add per-mile maintenance & depreciation to job cost (default true for backward compatibility). */
  includeWear?: boolean;
};

export type CalcOptions = { laborRate: number; includeWear: boolean };

function opts(o: number | CalcOptions): CalcOptions {
  return typeof o === "number" ? { laborRate: o, includeWear: true } : o;
}

export type CostBreakdown = {
  price: number;
  miles: number;
  fuelGallons: number;
  fuel: number;
  maintenance: number;
  depreciation: number;
  vehicle: number;
  dump: number;
  labor: number;
  laborHours: number;
  lead: number;
  other: number;
  totalCost: number;
  profit: number;
  /** null when price is 0 (margin undefined) */
  margin: number | null;
  profitPerLaborHour: number | null;
  profitPerMile: number | null;
};

/** Round to cents, avoiding binary float artefacts (1.005 → 1.01). */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function round1(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

const nz = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? n : 0);

export function vehicleCost(miles: number, v: VehicleRates) {
  const m = Math.max(0, nz(miles));
  const fuelGallons = v.mpg > 0 ? m / v.mpg : 0;
  const fuel = round2(fuelGallons * nz(v.fuelPrice));
  const maintenance = round2(m * nz(v.maintenancePerMile));
  const depreciation = round2(m * nz(v.depreciationPerMile));
  return {
    fuelGallons: Math.round(fuelGallons * 1000) / 1000,
    fuel,
    maintenance,
    depreciation,
    total: round2(fuel + maintenance + depreciation),
  };
}

export function laborCost(lines: LaborLine[]) {
  let cost = 0;
  let hours = 0;
  for (const l of lines) {
    const h = Math.max(0, nz(l.hours));
    cost += round2(h * nz(l.hourlyRate));
    hours += h;
  }
  return { cost: round2(cost), hours: Math.round(hours * 100) / 100 };
}

export function computeCosts(input: CostInput): CostBreakdown {
  const price = round2(nz(input.price));
  const miles = round1(Math.max(0, nz(input.miles)));
  const wear = input.includeWear ?? true;
  const v0 = vehicleCost(miles, input.vehicle);
  const v = wear ? v0 : { ...v0, maintenance: 0, depreciation: 0, total: v0.fuel };
  const l = laborCost(input.labor);
  const dump = round2(nz(input.dump));
  const lead = round2(nz(input.leadCost));
  const other = round2(nz(input.other));
  const totalCost = round2(v.total + dump + l.cost + lead + other);
  const profit = round2(price - totalCost);
  return {
    price,
    miles,
    fuelGallons: v.fuelGallons,
    fuel: v.fuel,
    maintenance: v.maintenance,
    depreciation: v.depreciation,
    vehicle: v.total,
    dump,
    labor: l.cost,
    laborHours: l.hours,
    lead,
    other,
    totalCost,
    profit,
    margin: price > 0 ? Math.round((profit / price) * 1000) / 10 : null,
    profitPerLaborHour: l.hours > 0 ? round2(profit / l.hours) : null,
    profitPerMile: miles > 0 ? round2(profit / miles) : null,
  };
}

export function marginPct(profit: number, revenue: number): number | null {
  return revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null;
}

// ───────────── Job-level helpers (estimated vs actual) ─────────────

export type JobForCalc = {
  status: string;
  quotedPrice: number;
  finalPrice: number | null;
  leadCost: number;
  workersCount: number;
  estLaborHours: number;
  mpg: number;
  fuelPrice: number;
  maintenancePerMile: number;
  depreciationPerMile: number;
  routeMiles: number | null;
  milesOverride: number | null;
  actualMiles: number | null;
  estDumpCost: number;
  estimateSnapshot?: CostBreakdown | null;
  labor: { employeeName?: string; hourlyRate: number; estHours: number; actualHours: number | null }[];
  dumpRecords: { fee: number }[];
  expenses: { amount: number }[];
};

export function jobVehicleRates(j: JobForCalc): VehicleRates {
  return {
    mpg: j.mpg,
    fuelPrice: j.fuelPrice,
    maintenancePerMile: j.maintenancePerMile,
    depreciationPerMile: j.depreciationPerMile,
  };
}

/** Planned miles: manual override wins over the routed distance. */
export function estimatedMiles(j: Pick<JobForCalc, "milesOverride" | "routeMiles">): number {
  return nz(j.milesOverride ?? j.routeMiles ?? 0);
}

function estimatedLaborLines(j: JobForCalc, defaultLaborRate: number): LaborLine[] {
  if (j.labor.length > 0) {
    return j.labor.map((l) => ({ name: l.employeeName, hourlyRate: l.hourlyRate, hours: l.estHours }));
  }
  // No specific workers assigned yet → workers × hours × default rate
  return Array.from({ length: Math.max(0, j.workersCount) }, (_, i) => ({
    name: `Worker ${i + 1}`,
    hourlyRate: defaultLaborRate,
    hours: j.estLaborHours,
  }));
}

function actualLaborLines(j: JobForCalc, defaultLaborRate: number): LaborLine[] {
  if (j.labor.length > 0) {
    return j.labor.map((l) => ({
      name: l.employeeName,
      hourlyRate: l.hourlyRate,
      hours: l.actualHours ?? l.estHours,
    }));
  }
  return estimatedLaborLines(j, defaultLaborRate);
}

const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + nz(b), 0));

/** Live estimate from the job's current planning inputs. */
export function computeEstimate(j: JobForCalc, o: number | CalcOptions): CostBreakdown {
  const { laborRate: defaultLaborRate, includeWear } = opts(o);
  return computeCosts({
    includeWear,
    price: j.quotedPrice,
    miles: estimatedMiles(j),
    vehicle: jobVehicleRates(j),
    dump: j.estDumpCost,
    labor: estimatedLaborLines(j, defaultLaborRate),
    leadCost: j.leadCost,
    other: sum(j.expenses.map((e) => e.amount)),
  });
}

/** Actuals: final price, actual miles, real dump receipts, actual hours. */
export function computeActual(j: JobForCalc, o: number | CalcOptions): CostBreakdown {
  const { laborRate: defaultLaborRate, includeWear } = opts(o);
  return computeCosts({
    includeWear,
    price: j.finalPrice ?? j.quotedPrice,
    miles: j.actualMiles ?? estimatedMiles(j),
    vehicle: jobVehicleRates(j),
    dump: sum(j.dumpRecords.map((d) => d.fee)),
    labor: actualLaborLines(j, defaultLaborRate),
    leadCost: j.leadCost,
    other: sum(j.expenses.map((e) => e.amount)),
  });
}

export type JobFinancials = {
  estimate: CostBreakdown;
  actual: CostBreakdown | null;
  /** The numbers to use for reporting: actual when completed, else estimate. */
  best: CostBreakdown;
  /** actual.profit − estimate.profit (null until completed) */
  profitDifference: number | null;
};

/**
 * Re-applies the current vehicle-wear setting to a stored breakdown (estimate
 * snapshots are frozen with whatever setting was active at the time).
 */
export function applyWearPolicy(b: CostBreakdown, includeWear: boolean): CostBreakdown {
  if (includeWear || (b.maintenance === 0 && b.depreciation === 0)) return b;
  const removed = round2(b.maintenance + b.depreciation);
  const totalCost = round2(b.totalCost - removed);
  const profit = round2(b.price - totalCost);
  return {
    ...b,
    maintenance: 0,
    depreciation: 0,
    vehicle: b.fuel,
    totalCost,
    profit,
    margin: b.price > 0 ? Math.round((profit / b.price) * 1000) / 10 : null,
    profitPerLaborHour: b.laborHours > 0 ? round2(profit / b.laborHours) : null,
    profitPerMile: b.miles > 0 ? round2(profit / b.miles) : null,
  };
}

export function jobFinancials(j: JobForCalc, o: number | CalcOptions): JobFinancials {
  const op = opts(o);
  const completed = j.status === "COMPLETED";
  const estimate = completed && j.estimateSnapshot ? applyWearPolicy(j.estimateSnapshot, op.includeWear) : computeEstimate(j, op);
  const actual = completed ? computeActual(j, op) : null;
  return {
    estimate,
    actual,
    best: actual ?? estimate,
    profitDifference: actual ? round2(actual.profit - estimate.profit) : null,
  };
}

// ───────────── Aggregation ─────────────

export type Totals = {
  count: number;
  revenue: number;
  fuel: number;
  maintenance: number;
  depreciation: number;
  vehicle: number;
  dump: number;
  labor: number;
  laborHours: number;
  lead: number;
  other: number;
  totalCost: number;
  profit: number;
  miles: number;
};

export function emptyTotals(): Totals {
  return {
    count: 0,
    revenue: 0,
    fuel: 0,
    maintenance: 0,
    depreciation: 0,
    vehicle: 0,
    dump: 0,
    labor: 0,
    laborHours: 0,
    lead: 0,
    other: 0,
    totalCost: 0,
    profit: 0,
    miles: 0,
  };
}

export function addToTotals(t: Totals, b: CostBreakdown): Totals {
  t.count += 1;
  t.revenue = round2(t.revenue + b.price);
  t.fuel = round2(t.fuel + b.fuel);
  t.maintenance = round2(t.maintenance + b.maintenance);
  t.depreciation = round2(t.depreciation + b.depreciation);
  t.vehicle = round2(t.vehicle + b.vehicle);
  t.dump = round2(t.dump + b.dump);
  t.labor = round2(t.labor + b.labor);
  t.laborHours = Math.round((t.laborHours + b.laborHours) * 100) / 100;
  t.lead = round2(t.lead + b.lead);
  t.other = round2(t.other + b.other);
  t.totalCost = round2(t.totalCost + b.totalCost);
  t.profit = round2(t.profit + b.profit);
  t.miles = round1(t.miles + b.miles);
  return t;
}

export function sumBreakdowns(list: CostBreakdown[]): Totals {
  return list.reduce(addToTotals, emptyTotals());
}
