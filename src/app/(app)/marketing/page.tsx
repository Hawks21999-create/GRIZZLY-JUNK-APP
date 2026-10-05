import { requireAdmin } from "@/lib/auth/server";
import { money, money0, pct, ratio } from "@/lib/format";
import { fmtYmd, parsePeriod, periodDays } from "@/lib/tz";
import { distinctCities } from "@/server/leads";
import { FilterBar } from "@/components/FilterBar";
import { buildReport } from "@/server/reports";
import { getSettings } from "@/server/settings";
import { Card, PageHeader, cx } from "@/components/ui";

export const metadata = { title: "Marketing" };

export default async function MarketingPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string; city?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const s = await getSettings();
  const key = parsePeriod(sp.period, "month");
  const p = periodDays(key, s.timezone, { from: sp.from, to: sp.to });
  const [r, cities] = await Promise.all([buildReport(p.from, p.to, { city: sp.city || null }), distinctCities()]);
  const cur = s.currency;
  const totalSpend = r.bySource.reduce((a, x) => a + x.adSpend, 0);
  const totalRev = r.bySource.reduce((a, x) => a + x.revenue, 0);
  const best = r.bySource.filter((x) => x.completed > 0)[0];

  return (
    <div className="space-y-4">
      <PageHeader title="Lead Source Performance" subtitle={`Ranked by profit, not lead count · ${fmtYmd(p.from)} – ${fmtYmd(p.to, { year: true })}`} />
      <FilterBar defaultPeriod="month" allowAllTime cities={cities.map((c) => ({ value: c, label: c }))} />

      <Card className="grid grid-cols-3 gap-3 p-4">
        <div>
          <div className="text-[11px] font-bold text-stone-500 uppercase">Ad Spend</div>
          <div className="tabular text-xl font-extrabold">{money0(totalSpend, cur)}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-stone-500 uppercase">Revenue</div>
          <div className="tabular text-xl font-extrabold">{money0(totalRev, cur)}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-stone-500 uppercase">Overall ROAS</div>
          <div className="tabular text-xl font-extrabold">{totalSpend > 0 ? ratio(totalRev / totalSpend) : "—"}</div>
        </div>
        {best ? (
          <div className="col-span-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Most profitable source: <b>{best.name}</b> · {money0(best.profitAfterAds, cur)} after ad spend
          </div>
        ) : null}
      </Card>

      <div className="space-y-3">
        {r.bySource.map((x, i) => (
          <Card key={x.id ?? x.name} className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-lg font-extrabold">{x.name}</div>
                <div className="text-xs text-stone-500">
                  #{i + 1} by profit · {x.leads} leads · {x.booked} booked
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold text-stone-500 uppercase">Profit</div>
                <div className={cx("tabular text-xl font-black", x.profitAfterAds >= 0 ? "text-emerald-700" : "text-red-600")}>{money0(x.profitAfterAds, cur)}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-x-3 gap-y-3 px-4 py-3 text-sm">
              <Metric label="Total Leads" value={String(x.leads)} />
              <Metric label="Ad / Lead Cost" value={money0(x.adSpend, cur)} />
              <Metric label="Avg Cost / Lead" value={x.costPerLead !== null ? money(x.costPerLead, cur) : "—"} />
              <Metric label="Booked Jobs" value={String(x.booked)} />
              <Metric label="Cost / Booked" value={x.costPerBooked !== null ? money(x.costPerBooked, cur) : "—"} />
              <Metric label="Conversion" value={pct(x.bookingRate)} />
              <Metric label="Revenue" value={money0(x.revenue, cur)} />
              <Metric label="Job Costs" value={money0(x.jobCosts, cur)} />
              <Metric label="ROAS" value={x.roas !== null ? ratio(x.roas) : "—"} />
              <Metric label="Completed" value={String(x.completed)} />
              <Metric label="Avg Job" value={money0(x.avgJobValue, cur)} />
              <Metric label="Profit Before Ads" value={money0(x.operatingProfit, cur)} />
            </div>
          </Card>
        ))}
        {!r.bySource.length ? <Card className="p-6 text-center text-sm text-stone-500">No leads in this period.</Card> : null}
      </div>

      <div className="space-y-1 px-1 text-xs text-stone-500">
        <p>
          <b>Leads</b> = every job record from that source (including lost leads). <b>Booked</b> = Scheduled, On The Way, In Progress or Completed.
        </p>
        <p>
          <b>Ad spend</b> = per-job lead costs + Advertising business expenses tagged to the source. <b>Operating profit</b> = revenue − job costs (fuel,
          vehicle, dump, labor, other). <b>Profit after ads</b> = operating profit − ad spend. <b>ROAS</b> = revenue ÷ ad spend.
        </p>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10px] font-bold tracking-wide text-stone-500 uppercase">{label}</div>
      <div className="tabular truncate font-bold">{value}</div>
    </div>
  );
}
