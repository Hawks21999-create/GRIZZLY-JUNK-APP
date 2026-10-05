import { Download } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/constants";
import { money, money0, miles, pct } from "@/lib/format";
import { fmtYmd, periodDays, type PeriodKey } from "@/lib/tz";
import { buildReport } from "@/server/reports";
import { getSettings } from "@/server/settings";
import { PeriodPicker } from "@/components/PeriodPicker";
import { Bar, Card, PageHeader, Row, SectionTitle, Stat, profitTone } from "@/components/ui";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const s = await getSettings();
  const key = (["today", "week", "month", "last_month", "year", "custom"].includes(sp.period ?? "") ? sp.period : "month") as PeriodKey;
  const p = periodDays(key, s.timezone, { from: sp.from, to: sp.to });
  const r = await buildReport(p.from, p.to);
  const t = r.totals;
  const cur = s.currency;
  const maxSrcRev = Math.max(1, ...r.bySource.map((x) => x.revenue));
  const maxSrcProfit = Math.max(1, ...r.bySource.map((x) => Math.abs(x.profitAfterAds)));
  const maxSrcJobs = Math.max(1, ...r.bySource.map((x) => x.completed));
  const maxType = Math.max(1, ...r.byJobType.map((x) => x.revenue));
  const fuelReceipts = r.coveredByCategory.find((c) => c.key === "FUEL")?.amount ?? 0;
  const dumpInvoices = r.coveredByCategory.find((c) => c.key === "DUMP_FEES")?.amount ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        subtitle={`${p.label}: ${fmtYmd(p.from, { year: true })} – ${fmtYmd(p.to, { year: true })}`}
        action={
          <a href={`/api/export/jobs?from=${p.from}&to=${p.to}`} className="btn-secondary min-h-10 text-sm">
            <Download className="h-4 w-4" /> CSV
          </a>
        }
      />
      <PeriodPicker base="/reports" current={key} from={p.from} to={p.to} />

      <Card className="overflow-hidden">
        <div className="grid grid-cols-2 gap-4 bg-bear-900 p-4 text-white">
          <div>
            <div className="text-[11px] font-bold tracking-wider text-stone-400 uppercase">Job Profit</div>
            <div className={`tabular text-3xl font-black ${r.jobProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{money0(r.jobProfit, cur)}</div>
            <div className="text-xs text-stone-400">{pct(r.margin)} margin</div>
          </div>
          <div>
            <div className="text-[11px] font-bold tracking-wider text-stone-400 uppercase">Net Profit</div>
            <div className={`tabular text-3xl font-black ${r.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{money0(r.netProfit, cur)}</div>
            <div className="text-xs text-stone-400">after ads &amp; overhead · {pct(r.netMargin)}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
          <Stat label="Revenue" value={money0(t.revenue, cur)} />
          <Stat label="Jobs Completed" value={r.completedCount} sub={`${r.leadCount} leads · ${r.bookedCount} booked`} />
          <Stat label="Avg Job Price" value={money0(r.avgJobValue, cur)} />
          <Stat label="Avg Profit / Job" value={money0(r.avgProfitPerJob, cur)} tone={profitTone(r.avgProfitPerJob)} />
          <Stat label="Miles" value={miles(t.miles)} />
          <Stat label="Labor Hours" value={t.laborHours.toFixed(1)} />
        </div>
      </Card>

      <section>
        <SectionTitle>Profit &amp; Loss</SectionTitle>
        <Card className="divide-y divide-stone-100 px-4 py-2 text-[15px]">
          <Row label="Revenue (completed jobs)" value={money(t.revenue, cur)} strong />
          <div className="py-1">
            <Row label="Fuel" value={money(t.fuel, cur)} />
            <Row label="Maintenance" value={money(t.maintenance, cur)} />
            <Row label="Depreciation" value={money(t.depreciation, cur)} />
            <Row label="Vehicle cost (total)" value={money(t.vehicle, cur)} hint="fuel + maintenance + depreciation" />
            <Row label="Dump fees" value={money(t.dump, cur)} />
            <Row label="Labor" value={money(t.labor, cur)} />
            <Row label="Lead costs (completed jobs)" value={money(t.lead, cur)} />
            <Row label="Other job costs" value={money(t.other, cur)} />
          </div>
          <Row label="Total job costs" value={money(t.totalCost, cur)} strong />
          <Row label="Job profit" value={money(r.jobProfit, cur)} strong tone={profitTone(r.jobProfit)} />
          <div className="py-1">
            <Row label="Lead costs on jobs not completed" value={money(r.advertising.unconvertedLeadCosts, cur)} />
            <Row label="Advertising expenses" value={money(r.advertising.expenses, cur)} />
            <Row label="Overhead (business expenses)" value={money(r.overhead, cur)} />
          </div>
          <Row label="Net profit" value={money(r.netProfit, cur)} strong tone={profitTone(r.netProfit)} />
          <Row label="Total advertising (all)" value={money(r.advertising.total, cur)} hint="all per-job lead costs + ad expenses" tone="muted" />
        </Card>
      </section>

      {r.completedCount ? (
        <section>
          <SectionTitle>Estimate Accuracy</SectionTitle>
          <Card className="grid grid-cols-3 gap-3 p-4">
            <Stat label="Estimated" value={money0(r.estimateAccuracy.estimatedProfit, cur)} />
            <Stat label="Actual" value={money0(r.estimateAccuracy.actualProfit, cur)} />
            <Stat
              label="Difference"
              value={`${r.estimateAccuracy.difference >= 0 ? "+" : "−"}${money0(Math.abs(r.estimateAccuracy.difference), cur)}`}
              tone={profitTone(r.estimateAccuracy.difference)}
            />
          </Card>
        </section>
      ) : null}

      <section>
        <SectionTitle>By Lead Source</SectionTitle>
        <Card className="divide-y divide-stone-100">
          {r.bySource.length ? (
            r.bySource.map((x) => (
              <div key={x.id ?? x.name} className="space-y-1.5 p-4">
                <div className="flex items-baseline justify-between">
                  <div className="font-bold">{x.name}</div>
                  <div className="text-xs text-stone-500">
                    {x.completed} job{x.completed === 1 ? "" : "s"} · {x.leads} lead{x.leads === 1 ? "" : "s"}
                  </div>
                </div>
                <BarLine label="Revenue" value={money0(x.revenue, cur)} bar={<Bar value={x.revenue} max={maxSrcRev} />} />
                <BarLine
                  label="Profit"
                  value={money0(x.profitAfterAds, cur)}
                  bar={<Bar value={x.profitAfterAds} max={maxSrcProfit} tone={x.profitAfterAds >= 0 ? "profit" : "loss"} />}
                  hint="after ad spend"
                />
                <BarLine label="Jobs" value={String(x.completed)} bar={<Bar value={x.completed} max={maxSrcJobs} tone="brand" />} />
              </div>
            ))
          ) : (
            <div className="p-4 text-sm text-stone-500">No jobs in this period.</div>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle
          action={
            <a href="/cities" className="text-sm font-semibold text-brand-700">
              Details ›
            </a>
          }
        >
          By City
        </SectionTitle>
        <Card className="divide-y divide-stone-100">
          {r.byCity
            .filter((c) => c.leads > 0 || c.city.endsWith("GA"))
            .slice(0, 8)
            .map((c) => (
              <div key={c.city} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-bold">{c.city}</div>
                  <div className="text-xs text-stone-500">
                    {c.leads} leads · {c.completed} jobs · {money0(c.revenue, cur)} revenue
                  </div>
                </div>
                <div className={`tabular shrink-0 font-extrabold ${c.profit >= 0 ? "text-brand-700" : "text-red-600"}`}>{money0(c.profit, cur)}</div>
              </div>
            ))}
        </Card>
      </section>

      <section>
        <SectionTitle>By Job Type</SectionTitle>
        <Card className="divide-y divide-stone-100">
          {r.byJobType.length ? (
            r.byJobType.map((x) => (
              <div key={x.type} className="space-y-1.5 p-4">
                <div className="flex items-baseline justify-between">
                  <div className="font-bold">{x.label}</div>
                  <div className="text-xs text-stone-500">
                    {x.count} job{x.count === 1 ? "" : "s"} · {pct(x.margin)} margin
                  </div>
                </div>
                <BarLine label="Revenue" value={money0(x.revenue, cur)} bar={<Bar value={x.revenue} max={maxType} />} />
                <BarLine label="Profit" value={money0(x.profit, cur)} bar={<Bar value={x.profit} max={maxType} tone={x.profit >= 0 ? "profit" : "loss"} />} />
              </div>
            ))
          ) : (
            <div className="p-4 text-sm text-stone-500">No completed jobs in this period.</div>
          )}
        </Card>
      </section>

      {r.overheadByCategory.length || r.coveredByCategory.length ? (
        <section>
          <SectionTitle>Business Expenses</SectionTitle>
          <Card className="divide-y divide-stone-100 px-4 py-2 text-sm">
            {r.overheadByCategory.map((c) => (
              <Row key={c.key} label={EXPENSE_CATEGORY_LABEL[c.key as keyof typeof EXPENSE_CATEGORY_LABEL]} value={money(c.amount, cur)} />
            ))}
            <Row label="Overhead total" value={money(r.overhead, cur)} strong />
            {r.coveredByCategory.length ? (
              <div className="py-2 text-xs text-stone-500">
                <div className="mb-1 font-semibold text-stone-600">Reconciliation (already in job costs, not subtracted again)</div>
                {fuelReceipts ? (
                  <div>
                    Fuel receipts {money(fuelReceipts, cur)} vs. job-calculated fuel {money(t.fuel, cur)}
                  </div>
                ) : null}
                {dumpInvoices ? (
                  <div>
                    Dump invoices {money(dumpInvoices, cur)} vs. job dump receipts {money(t.dump, cur)}
                  </div>
                ) : null}
                {r.coveredByCategory
                  .filter((c) => c.key !== "FUEL" && c.key !== "DUMP_FEES")
                  .map((c) => (
                    <div key={c.key}>
                      {EXPENSE_CATEGORY_LABEL[c.key as keyof typeof EXPENSE_CATEGORY_LABEL]}: {money(c.amount, cur)}
                    </div>
                  ))}
              </div>
            ) : null}
          </Card>
        </section>
      ) : null}
    </div>
  );
}

function BarLine({ label, value, bar, hint }: { label: string; value: string; bar: React.ReactNode; hint?: string }) {
  return (
    <div className="grid grid-cols-[64px_1fr_80px] items-center gap-2 text-sm">
      <span className="text-stone-500">{label}</span>
      {bar}
      <span className="tabular text-right font-semibold" title={hint}>
        {value}
      </span>
    </div>
  );
}
