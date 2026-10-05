import Link from "@/components/Link";
import { and, gte, inArray, lt } from "drizzle-orm";
import { BarChart3, Calendar, MapPinned, PhoneIncoming, Plus, Receipt } from "lucide-react";
import { db } from "@/db";
import { jobs, type JobStatus } from "@/db/schema";
import { jobFinancials, round2 } from "@/lib/calc";
import { JOB_STATUSES, STATUS_LABEL } from "@/lib/constants";
import { money, money0, miles, pct, ratio } from "@/lib/format";
import { fmtYmd, parsePeriod, periodDays, todayYmd, utcRangeForDays } from "@/lib/tz";
import { getCurrentUser } from "@/lib/auth/server";
import { buildReport, upcomingJobs } from "@/server/reports";
import { loadJobsForCalc, scheduledBetween } from "@/server/jobs";
import { distinctCities } from "@/server/leads";
import { calcOpts, getLeadSources, getSettings } from "@/server/settings";
import { FilterBar } from "@/components/FilterBar";
import { JobCard, toCardData } from "@/components/JobCard";
import { Card, Empty, LeadStatusChip, SectionTitle, Stat, cx, profitTone } from "@/components/ui";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; source?: string; city?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const settings = await getSettings();
  const user = await getCurrentUser();
  const tz = settings.timezone;
  const cur = settings.currency;
  const opts = calcOpts(settings);
  const today = todayYmd(tz);
  const { start, end } = utcRangeForDays(today, today, tz);

  const key = parsePeriod(sp.period, "month");
  const period = periodDays(key, tz, { from: sp.from, to: sp.to });
  const status = (JOB_STATUSES as string[]).includes(sp.status ?? "") ? (sp.status as JobStatus) : null;
  const filters = { sourceId: sp.source || null, city: sp.city || null, status };

  const [todayJobs, leadsToday, bookedToday, report, upcoming, followUps, sources, cities] = await Promise.all([
    loadJobsForCalc(scheduledBetween(start, end)),
    db.$count(jobs, and(gte(jobs.leadReceivedAt, start), lt(jobs.leadReceivedAt, end))),
    db.$count(jobs, and(gte(jobs.bookedAt, start), lt(jobs.bookedAt, end))),
    buildReport(period.from, period.to, filters),
    upcomingJobs(6),
    loadJobsForCalc(inArray(jobs.status, ["LEAD", "CONTACTED", "ESTIMATE_REQUESTED", "QUOTE_SENT"]), "desc", 6),
    getLeadSources(true),
    distinctCities(),
  ]);

  // TODAY: booked jobs scheduled today (actuals when completed, estimates otherwise)
  const bookedNow = todayJobs
    .filter((j) => ["SCHEDULED", "ON_THE_WAY", "IN_PROGRESS", "COMPLETED"].includes(j.status))
    .map((j) => jobFinancials(j.calc, opts).best);
  const t = {
    jobs: bookedNow.length,
    revenue: round2(bookedNow.reduce((a, b) => a + b.price, 0)),
    costs: round2(bookedNow.reduce((a, b) => a + b.totalCost, 0)),
    profit: round2(bookedNow.reduce((a, b) => a + b.profit, 0)),
  };

  const m = report.totals;
  const adSpend = report.advertising.total;
  const showMoney = user?.role !== "EMPLOYEE";
  const div = (a: number, b: number) => (b > 0 ? a / b : null);

  return (
    <div className="space-y-6">
      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        <Quick href="/leads/new" label="New Lead" primary icon={<PhoneIncoming className="h-6 w-6" />} />
        <Quick href="/jobs/new" label="New Job" dark icon={<Plus className="h-6 w-6" strokeWidth={3} />} />
        <Quick href="/calendar" label="Calendar" icon={<Calendar className="h-6 w-6" />} />
        <Quick href="/leads" label="Leads" icon={<PhoneIncoming className="h-6 w-6" />} />
        <Quick href="/expenses" label="Expenses" icon={<Receipt className="h-6 w-6" />} className="hidden sm:flex" />
        <Quick href="/reports" label="Reports" icon={<BarChart3 className="h-6 w-6" />} className="hidden sm:flex" />
      </div>

      {/* TODAY */}
      <section>
        <SectionTitle>Today · {fmtYmd(today, { weekday: true })}</SectionTitle>
        <Card className="overflow-hidden">
          <div className="grid grid-cols-3 divide-x divide-white/10 bg-bear-900 text-white">
            <DarkStat label="New leads" value={String(leadsToday)} />
            <DarkStat label="Booked" value={String(bookedToday)} />
            <DarkStat label="Jobs today" value={String(t.jobs)} />
          </div>
          {showMoney ? (
            <div className="grid grid-cols-3 divide-x divide-stone-100 p-4">
              <Stat label="Revenue" value={money0(t.revenue, cur)} />
              <div className="pl-3">
                <Stat label="Costs" value={money0(t.costs, cur)} />
              </div>
              <div className="pl-3">
                <Stat label="Profit" value={money0(t.profit, cur)} tone={profitTone(t.profit)} />
              </div>
            </div>
          ) : null}
        </Card>
        {showMoney ? <p className="mt-1.5 px-1 text-[11px] text-stone-500">Today&apos;s money uses actuals for completed jobs and estimates for the rest.</p> : null}
      </section>

      {/* Leads needing follow-up */}
      {followUps.length ? (
        <section>
          <SectionTitle
            action={
              <Link href="/leads" className="text-sm font-semibold text-brand-700">
                All leads ›
              </Link>
            }
          >
            Open Leads
          </SectionTitle>
          <div className="card divide-y divide-stone-100 overflow-hidden">
            {followUps.map((j) => (
              <Link key={j.id} href={`/jobs/${j.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 active:bg-stone-50">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{j.customer.name}</div>
                  <div className="truncate text-xs text-stone-500">
                    {[j.city, j.leadSource?.name].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <LeadStatusChip status={j.status} />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* UPCOMING */}
      <section>
        <SectionTitle
          action={
            <Link href="/calendar" className="text-sm font-semibold text-brand-700">
              Calendar ›
            </Link>
          }
        >
          Upcoming Jobs
        </SectionTitle>
        {upcoming.length ? (
          <div className="space-y-2.5">
            {upcoming.map(({ job, fin }) => (
              <JobCard key={job.id} j={toCardData(job, fin, settings.jobNumberPrefix)} tz={tz} currency={cur} showDate />
            ))}
          </div>
        ) : (
          <Empty title="No upcoming jobs">
            <Link href="/jobs/new" className="font-semibold text-brand-700">
              Book a job
            </Link>
          </Empty>
        )}
      </section>

      {showMoney ? (
        <>
          <section className="space-y-3">
            <div className="flex items-end justify-between px-1">
              <h2 className="text-lg font-extrabold tracking-tight">Performance</h2>
              <span className="text-xs text-stone-500">
                {fmtYmd(period.from)} – {fmtYmd(period.to, { year: true })}
              </span>
            </div>
            <FilterBar
              defaultPeriod="month"
              sources={[...sources.map((x) => ({ value: x.id, label: x.name })), { value: "none", label: "No source" }]}
              cities={cities.map((c) => ({ value: c, label: c }))}
              statuses={JOB_STATUSES.map((x) => ({ value: x, label: STATUS_LABEL[x] }))}
            />
          </section>

          {/* FINANCIAL */}
          <section>
            <SectionTitle>Financial</SectionTitle>
            <Card className="overflow-hidden">
              <div className="grid grid-cols-2 gap-4 border-b border-stone-100 p-4">
                <Stat label="Gross Profit" value={money0(report.jobProfit, cur)} tone={profitTone(report.jobProfit)} big />
                <Stat label="Profit Margin" value={pct(report.margin)} tone={profitTone(report.jobProfit)} big />
              </div>
              <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
                <Stat label="Revenue" value={money0(m.revenue, cur)} sub={`${report.completedCount} completed jobs`} />
                <Stat label="Total Job Costs" value={money0(m.totalCost, cur)} />
                <Stat label="Avg Job Value" value={money0(report.avgJobValue, cur)} />
                <Stat label="Avg Profit / Job" value={money0(report.avgProfitPerJob, cur)} tone={profitTone(report.avgProfitPerJob)} />
              </div>
              {!report.filtered ? (
                <div className="border-t border-stone-100 px-4 py-2.5 text-sm text-stone-600">
                  Net after unconverted lead costs, ad expenses &amp; overhead:{" "}
                  <b className={cx("tabular", report.netProfit >= 0 ? "text-brand-700" : "text-red-600")}>{money0(report.netProfit, cur)}</b>
                </div>
              ) : null}
            </Card>
          </section>

          {/* MARKETING */}
          <section>
            <SectionTitle
              action={
                <Link href="/marketing" className="text-sm font-semibold text-brand-700">
                  By source ›
                </Link>
              }
            >
              Marketing
            </SectionTitle>
            <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
              <Stat label="Leads" value={report.leadCount} />
              <Stat label="Cost / Lead" value={money(div(adSpend, report.leadCount), cur)} />
              <Stat label="Booked Jobs" value={report.bookedCount} sub={`${pct(report.leadCount ? (report.bookedCount / report.leadCount) * 100 : null)} conversion`} />
              <Stat label="Cost / Booked Job" value={money(div(adSpend, report.bookedCount), cur)} />
              <Stat label="Ad Spend" value={money0(adSpend, cur)} sub="lead costs + ad expenses" />
              <Stat label="Revenue" value={money0(m.revenue, cur)} />
              <Stat label="ROAS" value={ratio(div(m.revenue, adSpend))} />
              <div className="flex items-end">
                <Link href="/cities" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                  <MapPinned className="h-4 w-4" /> By city ›
                </Link>
              </div>
            </Card>
          </section>

          {/* OPERATIONS */}
          <section>
            <SectionTitle>Operations</SectionTitle>
            <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-5">
              <Stat label="Miles Driven" value={miles(m.miles)} />
              <Stat label="Fuel Cost" value={money0(m.fuel, cur)} />
              <Stat label="Dump Fees" value={money0(m.dump, cur)} />
              <Stat label="Labor" value={money0(m.labor, cur)} />
              <Stat label="Other Costs" value={money0(m.other + m.maintenance + m.depreciation, cur)} sub={settings.includeVehicleWear ? "incl. vehicle wear" : undefined} />
            </Card>
            <p className="mt-2 px-1 text-xs text-stone-500">
              Money totals use completed jobs. Booked jobs not yet completed are worth an estimated {money0(report.pipeline.revenue, cur)} revenue /{" "}
              {money0(report.pipeline.profit, cur)} profit.
              {report.filtered ? " Filtered views leave out overhead and advertising expenses that can't be tied to the filter." : ""}
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}

function DarkStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-3.5 text-center">
      <div className="text-[10px] font-bold tracking-wider text-stone-400 uppercase">{label}</div>
      <div className="tabular text-3xl font-black text-brand-400">{value}</div>
    </div>
  );
}

function Quick({
  href,
  label,
  icon,
  primary,
  dark,
  className,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  primary?: boolean;
  dark?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-bold shadow-sm ring-1 active:scale-95",
        primary ? "bg-brand-500 text-bear-950 ring-brand-600" : dark ? "bg-bear-900 text-white ring-bear-900" : "bg-white text-stone-700 ring-black/5",
        className,
      )}
    >
      {icon}
      <span className="leading-none">{label}</span>
    </Link>
  );
}
