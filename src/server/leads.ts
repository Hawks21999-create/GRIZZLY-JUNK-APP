import "server-only";
import { and, desc, eq, gte, ilike, inArray, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { jobFinancials, marginPct, round2 } from "@/lib/calc";
import { cityKey, cityFromAddress } from "@/lib/city";
import { BOOKED_STATUSES, LEAD_STATUS_JOB_STATUSES, type LeadStatus } from "@/lib/constants";
import { utcRangeForDays } from "@/lib/tz";
import { loadJobsForCalc } from "./jobs";
import { calcOpts, getSettings } from "./settings";

export type LeadFilters = {
  from?: string;
  to?: string;
  leadStatus?: LeadStatus | null;
  sourceId?: string | null;
  city?: string | null; // normalized "Cumming, GA"
  q?: string | null;
};

/** Leads = every job record, dated by when the lead came in. */
export async function listLeads(f: LeadFilters) {
  const s = await getSettings();
  const conds: SQL[] = [];
  if (f.from && f.to) {
    const { start, end } = utcRangeForDays(f.from, f.to, s.timezone);
    conds.push(gte(jobs.leadReceivedAt, start), lt(jobs.leadReceivedAt, end));
  }
  if (f.leadStatus) conds.push(inArray(jobs.status, LEAD_STATUS_JOB_STATUSES[f.leadStatus]));
  if (f.sourceId) conds.push(f.sourceId === "none" ? sql`${jobs.leadSourceId} is null` : eq(jobs.leadSourceId, f.sourceId));
  if (f.city) conds.push(ilike(jobs.city, f.city.split(",")[0].trim()));
  const rows = await loadJobsForCalc(conds.length ? and(...conds) : undefined, "desc", 500);
  const opts = calcOpts(s);
  let list = rows.map((j) => ({ job: j, fin: jobFinancials(j.calc, opts), city: cityKey(j.city ?? cityFromAddress(j.address), j.state) }));
  if (f.q) {
    const t = f.q.toLowerCase();
    const digits = f.q.replace(/\D/g, "");
    list = list.filter(
      (x) =>
        x.job.customer.name.toLowerCase().includes(t) ||
        x.job.address.toLowerCase().includes(t) ||
        (digits.length >= 3 && (x.job.customer.phoneDigits ?? "").includes(digits)),
    );
  }
  list.sort((a, b) => b.job.leadReceivedAt.getTime() - a.job.leadReceivedAt.getTime());

  const booked = list.filter((x) => BOOKED_STATUSES.includes(x.job.status));
  const completed = list.filter((x) => x.job.status === "COMPLETED");
  const leadCost = round2(list.reduce((a, x) => a + x.job.leadCost, 0));
  const revenue = round2(completed.reduce((a, x) => a + x.fin.best.price, 0));
  const profit = round2(completed.reduce((a, x) => a + x.fin.best.profit, 0));
  return {
    list,
    summary: {
      leads: list.length,
      leadCost,
      cpl: list.length ? round2(leadCost / list.length) : null,
      booked: booked.length,
      conversion: list.length ? Math.round((booked.length / list.length) * 1000) / 10 : null,
      completed: completed.length,
      revenue,
      profit,
      margin: marginPct(profit, revenue),
    },
  };
}

export async function distinctCities(): Promise<string[]> {
  const rows = await db.selectDistinct({ city: jobs.city, state: jobs.state }).from(jobs).orderBy(desc(jobs.city));
  const set = new Set<string>();
  for (const r of rows) {
    const k = cityKey(r.city, r.state);
    if (k) set.add(k);
  }
  return [...set].sort();
}
