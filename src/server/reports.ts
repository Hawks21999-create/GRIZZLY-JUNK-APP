import "server-only";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { businessExpenses, jobs, leadSources } from "@/db/schema";
import { addToTotals, emptyTotals, jobFinancials, marginPct, round2, type Totals } from "@/lib/calc";
import { ACTIVE_STATUSES, BOOKED_STATUSES, JOB_TYPE_LABEL } from "@/lib/constants";
import { utcRangeForDays } from "@/lib/tz";
import { FOCUS_CITIES, cityFromAddress, cityKey } from "@/lib/city";
import type { JobStatus } from "@/db/schema";
import { inPeriod, loadJobsForCalc, type LoadedJob } from "./jobs";
import { calcOpts, getSettings } from "./settings";

export type SourceRow = {
  id: string | null;
  name: string;
  leads: number;
  booked: number;
  completed: number;
  bookingRate: number | null;
  revenue: number;
  jobCosts: number; // completed job costs excluding lead/ad cost
  operatingProfit: number; // revenue − jobCosts
  adSpend: number; // per-job lead costs + advertising expenses tagged to the source
  leadCostSpend: number;
  adExpenseSpend: number;
  costPerLead: number | null;
  costPerBooked: number | null;
  avgJobValue: number | null;
  profitAfterAds: number;
  roas: number | null;
};

export type CityRow = {
  city: string;
  leads: number;
  leadCost: number;
  cpl: number | null;
  booked: number;
  bookingRate: number | null;
  completed: number;
  revenue: number;
  fuel: number;
  dump: number;
  labor: number;
  other: number;
  wear: number;
  /** all lead costs in the city + completed-job fuel, dump, labor, other (+ wear) */
  totalCosts: number;
  profit: number;
  margin: number | null;
  avgJobValue: number | null;
  avgProfitPerJob: number | null;
  miles: number;
};

export type TypeRow = { type: string; label: string; count: number; revenue: number; profit: number; margin: number | null };

export type Report = Awaited<ReturnType<typeof buildReport>>;

const div = (a: number, b: number) => (b > 0 ? round2(a / b) : null);

/**
 * The single source of truth for money totals across Dashboard, Reports and
 * Marketing.
 *
 * Double-counting rules:
 *  • Job costs (fuel/maintenance/depreciation by mileage, dump receipts, labor,
 *    job extras, lead cost) live only on jobs.
 *  • Business expenses flagged `coveredByJobCosts` (e.g. diesel fill-ups,
 *    landfill invoices, payroll runs) are shown for reconciliation but are NOT
 *    subtracted again.
 *  • Advertising business expenses are counted once, as advertising.
 */
export type ReportFilters = {
  /** lead source id, or "none" for jobs without a source */
  sourceId?: string | null;
  /** normalized city key, e.g. "Cumming, GA" */
  city?: string | null;
  /** job status */
  status?: JobStatus | null;
};

export async function buildReport(fromYmd: string, toYmd: string, filters: ReportFilters = {}) {
  const settings = await getSettings();
  const { start, end } = utcRangeForDays(fromYmd, toYmd, settings.timezone);
  const filtered = Boolean(filters.sourceId || filters.city || filters.status);

  const [allJobRows, allExpenses, sources] = await Promise.all([
    loadJobsForCalc(inPeriod(start, end)),
    db
      .select()
      .from(businessExpenses)
      .where(and(gte(businessExpenses.date, fromYmd), lte(businessExpenses.date, toYmd))),
    db.select().from(leadSources).orderBy(asc(leadSources.sortOrder), asc(leadSources.name)),
  ]);

  const jobRows = allJobRows.filter(
    (j) =>
      (!filters.sourceId || (filters.sourceId === "none" ? j.leadSourceId === null : j.leadSourceId === filters.sourceId)) &&
      (!filters.city || cityKey(j.city ?? cityFromAddress(j.address), j.state) === filters.city) &&
      (!filters.status || j.status === filters.status),
  );
  // Business expenses can't be split by city or status. With a source filter
  // only advertising tagged to that source is kept; overhead is excluded.
  const expenses = !filtered
    ? allExpenses
    : filters.sourceId && !filters.city && !filters.status
      ? allExpenses.filter((e) => e.category === "ADVERTISING" && e.leadSourceId === filters.sourceId)
      : [];

  const withFin = jobRows.map((j) => ({ job: j, fin: jobFinancials(j.calc, calcOpts(settings)) }));
  const completed = withFin.filter((x) => x.job.status === "COMPLETED");

  const totals: Totals = emptyTotals();
  for (const x of completed) addToTotals(totals, x.fin.best);

  const pipeline = emptyTotals();
  for (const x of withFin) {
    if (x.job.status !== "COMPLETED" && BOOKED_STATUSES.includes(x.job.status)) addToTotals(pipeline, x.fin.estimate);
  }

  // Advertising
  const allLeadCosts = round2(withFin.reduce((a, x) => a + x.job.leadCost, 0));
  const unconvertedLeadCosts = round2(allLeadCosts - totals.lead);
  const adExpenses = expenses.filter((e) => e.category === "ADVERTISING");
  const adExpenseTotal = round2(adExpenses.reduce((a, e) => a + e.amount, 0));
  const advertisingTotal = round2(allLeadCosts + adExpenseTotal);

  // Overhead (not covered by job costs, not advertising)
  const overheadRows = expenses.filter((e) => e.category !== "ADVERTISING" && !e.coveredByJobCosts);
  const overhead = round2(overheadRows.reduce((a, e) => a + e.amount, 0));
  const coveredRows = expenses.filter((e) => e.category !== "ADVERTISING" && e.coveredByJobCosts);
  const covered = round2(coveredRows.reduce((a, e) => a + e.amount, 0));

  const overheadByCategory = groupSum(overheadRows, (e) => e.category);
  const coveredByCategory = groupSum(coveredRows, (e) => e.category);

  const jobProfit = totals.profit; // revenue − all job costs incl. lead cost of completed jobs
  const netProfit = round2(jobProfit - unconvertedLeadCosts - adExpenseTotal - overhead);

  // ── Marketing by lead source
  const srcMap = new Map<string | null, SourceRow>();
  const srcRow = (id: string | null, name: string): SourceRow => {
    let r = srcMap.get(id);
    if (!r) {
      r = {
        id,
        name,
        leads: 0,
        booked: 0,
        completed: 0,
        bookingRate: null,
        revenue: 0,
        jobCosts: 0,
        operatingProfit: 0,
        adSpend: 0,
        leadCostSpend: 0,
        adExpenseSpend: 0,
        costPerLead: null,
        costPerBooked: null,
        avgJobValue: null,
        profitAfterAds: 0,
        roas: null,
      };
      srcMap.set(id, r);
    }
    return r;
  };
  for (const s of sources) srcRow(s.id, s.name);
  const nameOf = new Map(sources.map((s) => [s.id, s.name]));

  for (const { job, fin } of withFin) {
    const r = srcRow(job.leadSourceId, job.leadSourceId ? (nameOf.get(job.leadSourceId) ?? "Unknown") : "No source");
    r.leads += 1;
    r.leadCostSpend = round2(r.leadCostSpend + job.leadCost);
    if (BOOKED_STATUSES.includes(job.status)) r.booked += 1;
    if (job.status === "COMPLETED") {
      r.completed += 1;
      r.revenue = round2(r.revenue + fin.best.price);
      r.jobCosts = round2(r.jobCosts + fin.best.totalCost - fin.best.lead);
    }
  }
  for (const e of adExpenses) {
    const r = srcRow(e.leadSourceId, e.leadSourceId ? (nameOf.get(e.leadSourceId) ?? "Unknown") : "Unattributed advertising");
    r.adExpenseSpend = round2(r.adExpenseSpend + e.amount);
  }
  for (const r of srcMap.values()) {
    r.adSpend = round2(r.leadCostSpend + r.adExpenseSpend);
    r.operatingProfit = round2(r.revenue - r.jobCosts);
    r.profitAfterAds = round2(r.operatingProfit - r.adSpend);
    r.bookingRate = r.leads > 0 ? Math.round((r.booked / r.leads) * 1000) / 10 : null;
    r.costPerLead = div(r.adSpend, r.leads);
    r.costPerBooked = div(r.adSpend, r.booked);
    r.avgJobValue = div(r.revenue, r.completed);
    r.roas = div(r.revenue, r.adSpend);
  }
  const bySource = [...srcMap.values()]
    .filter((r) => r.leads > 0 || r.adSpend > 0)
    .sort((a, b) => b.profitAfterAds - a.profitAfterAds || b.revenue - a.revenue);

  // ── By job type (completed)
  const typeMap = new Map<string, TypeRow>();
  for (const { job, fin } of completed) {
    let t = typeMap.get(job.jobType);
    if (!t) {
      t = { type: job.jobType, label: JOB_TYPE_LABEL[job.jobType], count: 0, revenue: 0, profit: 0, margin: null };
      typeMap.set(job.jobType, t);
    }
    t.count += 1;
    t.revenue = round2(t.revenue + fin.best.price);
    t.profit = round2(t.profit + fin.best.profit);
  }
  const byJobType = [...typeMap.values()]
    .map((t) => ({ ...t, margin: marginPct(t.profit, t.revenue) }))
    .sort((a, b) => b.revenue - a.revenue);

  // ── By city
  const cityMap = new Map<string, CityRow>();
  const cityRow = (key: string): CityRow => {
    let r = cityMap.get(key);
    if (!r) {
      r = { city: key, leads: 0, leadCost: 0, cpl: null, booked: 0, bookingRate: null, completed: 0, revenue: 0, fuel: 0, dump: 0, labor: 0, other: 0, wear: 0, totalCosts: 0, profit: 0, margin: null, avgJobValue: null, avgProfitPerJob: null, miles: 0 };
      cityMap.set(key, r);
    }
    return r;
  };
  for (const c of FOCUS_CITIES) cityRow(c);
  for (const { job, fin } of withFin) {
    const r = cityRow(cityKey(job.city ?? cityFromAddress(job.address), job.state) ?? "Unknown city");
    r.leads += 1;
    r.leadCost = round2(r.leadCost + job.leadCost);
    if (BOOKED_STATUSES.includes(job.status)) r.booked += 1;
    if (job.status === "COMPLETED") {
      const b = fin.best;
      r.completed += 1;
      r.revenue = round2(r.revenue + b.price);
      r.fuel = round2(r.fuel + b.fuel);
      r.dump = round2(r.dump + b.dump);
      r.labor = round2(r.labor + b.labor);
      r.other = round2(r.other + b.other);
      r.wear = round2(r.wear + b.maintenance + b.depreciation);
      r.miles = Math.round((r.miles + b.miles) * 10) / 10;
    }
  }
  for (const r of cityMap.values()) {
    r.totalCosts = round2(r.leadCost + r.fuel + r.dump + r.labor + r.other + r.wear);
    r.profit = round2(r.revenue - r.totalCosts);
    r.margin = marginPct(r.profit, r.revenue);
    r.cpl = div(r.leadCost, r.leads);
    r.bookingRate = r.leads > 0 ? Math.round((r.booked / r.leads) * 1000) / 10 : null;
    r.avgJobValue = div(r.revenue, r.completed);
    r.avgProfitPerJob = r.completed > 0 ? round2(r.profit / r.completed) : null;
  }
  const byCity = [...cityMap.values()].sort((a, b) => {
    const fa = FOCUS_CITIES.indexOf(a.city);
    const fb = FOCUS_CITIES.indexOf(b.city);
    if (fa !== -1 || fb !== -1) return (fa === -1 ? 99 : fa) - (fb === -1 ? 99 : fb);
    return b.profit - a.profit || b.leads - a.leads;
  });

  const statusCounts: Record<string, number> = {};
  for (const { job } of withFin) statusCounts[job.status] = (statusCounts[job.status] ?? 0) + 1;

  // Estimated vs actual accuracy for completed jobs
  const estProfit = round2(completed.reduce((a, x) => a + x.fin.estimate.profit, 0));

  return {
    from: fromYmd,
    to: toYmd,
    currency: settings.currency,
    totals,
    pipeline,
    completedCount: totals.count,
    bookedCount: withFin.filter((x) => BOOKED_STATUSES.includes(x.job.status)).length,
    leadCount: withFin.length,
    avgJobValue: div(totals.revenue, totals.count),
    avgProfitPerJob: div(totals.profit, totals.count),
    margin: marginPct(totals.profit, totals.revenue),
    jobProfit,
    advertising: { leadCosts: allLeadCosts, unconvertedLeadCosts, expenses: adExpenseTotal, total: advertisingTotal },
    overhead,
    overheadByCategory,
    covered,
    coveredByCategory,
    netProfit,
    netMargin: marginPct(netProfit, totals.revenue),
    bySource,
    byJobType,
    byCity,
    filtered,
    statusCounts,
    estimateAccuracy: { estimatedProfit: estProfit, actualProfit: totals.profit, difference: round2(totals.profit - estProfit) },
    jobs: withFin,
  };
}

function groupSum<T extends { amount: number }>(rows: T[], key: (r: T) => string) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), round2((m.get(key(r)) ?? 0) + r.amount));
  return [...m.entries()].map(([k, v]) => ({ key: k, amount: v })).sort((a, b) => b.amount - a.amount);
}

/** Dashboard "TODAY" block: booked jobs scheduled today. */
export function todayStats(rows: { job: LoadedJob; fin: ReturnType<typeof jobFinancials> }[]) {
  const booked = rows.filter((x) => BOOKED_STATUSES.includes(x.job.status));
  return {
    jobs: booked.length,
    completed: booked.filter((x) => x.job.status === "COMPLETED").length,
    revenue: round2(booked.reduce((a, x) => a + x.fin.best.price, 0)),
    profit: round2(booked.reduce((a, x) => a + x.fin.best.profit, 0)),
    miles: Math.round(booked.reduce((a, x) => a + x.fin.best.miles, 0) * 10) / 10,
  };
}

export async function upcomingJobs(limit = 8) {
  const settings = await getSettings();
  const now = new Date();
  // include jobs that started up to 12h ago and are still active
  const since = new Date(now.getTime() - 12 * 3600 * 1000);
  const rows = await loadJobsForCalc(and(gte(jobs.scheduledStart, since), inArray(jobs.status, ACTIVE_STATUSES))!, "asc", limit);
  return rows.map((j) => ({ job: j, fin: jobFinancials(j.calc, calcOpts(settings)) }));
}

