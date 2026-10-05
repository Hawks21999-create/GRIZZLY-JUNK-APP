import { requireAdmin } from "@/lib/auth/server";
import type { CityRow } from "@/server/reports";
import { FOCUS_CITIES } from "@/lib/city";
import { money, money0, pct } from "@/lib/format";
import { fmtYmd, parsePeriod, periodDays } from "@/lib/tz";
import { buildReport } from "@/server/reports";
import { getLeadSources, getSettings } from "@/server/settings";
import { FilterBar } from "@/components/FilterBar";
import { Card, PageHeader, cx } from "@/components/ui";

export const metadata = { title: "City Performance" };

export default async function CitiesPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string; source?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const s = await getSettings();
  const key = parsePeriod(sp.period, "month");
  const p = periodDays(key, s.timezone, { from: sp.from, to: sp.to });
  const [r, sources] = await Promise.all([buildReport(p.from, p.to, { sourceId: sp.source || null }), getLeadSources(true)]);
  const cur = s.currency;
  const focus = FOCUS_CITIES.map((c) => r.byCity.find((x) => x.city === c)!);
  const others = r.byCity.filter((x) => !FOCUS_CITIES.includes(x.city) && x.leads > 0);
  const [a, b] = focus;
  const enoughData = a.completed + b.completed > 0;
  const winner = !enoughData || a.profit === b.profit ? null : a.profit > b.profit ? a : b;

  return (
    <div className="space-y-4">
      <PageHeader title="City Performance" subtitle={`${fmtYmd(p.from)} – ${fmtYmd(p.to, { year: true })} · by job city`} />
      <FilterBar defaultPeriod="month" allowAllTime sources={sources.map((x) => ({ value: x.id, label: x.name }))} />

      {/* Head-to-head */}
      <Card className="overflow-hidden">
        <div className="bg-bear-900 px-4 py-3 text-white">
          <div className="text-[11px] font-bold tracking-wider text-stone-400 uppercase">Cumming vs Dawsonville</div>
          <div className="text-lg font-extrabold">
            {winner ? (
              <>
                <span className="text-brand-400">{winner.city.replace(", GA", "")}</span> is more profitable by{" "}
                {money0(Math.abs(a.profit - b.profit), cur)}
              </>
            ) : enoughData ? (
              "Even so far"
            ) : (
              "No completed jobs in either city for this period yet"
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-[11px] font-bold tracking-wide text-stone-500 uppercase">
                <th className="px-4 py-2 text-left" />
                {focus.map((c) => (
                  <th key={c.city} className="px-3 py-2 text-right whitespace-nowrap">
                    {c.city.replace(", GA", "")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular">
              {ROWS.map(([label, fn, better]) => {
                const vals = focus.map((c) => fn(c));
                const nums = focus.map((c) => NUM[label]?.(c) ?? null);
                const best = better && nums.every((n) => n !== null) ? (better === "high" ? Math.max(...(nums as number[])) : Math.min(...(nums as number[]))) : null;
                return (
                  <tr key={label} className="border-b border-stone-100 last:border-0">
                    <td className="px-4 py-2 text-stone-600">{label}</td>
                    {vals.map((v, i) => (
                      <td
                        key={i}
                        className={cx(
                          "px-3 py-2 text-right font-semibold whitespace-nowrap",
                          best !== null && nums[i] === best && nums[0] !== nums[1] && "text-brand-700",
                          label === "Profit" && "text-base font-extrabold",
                        )}
                      >
                        {v(cur)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* All cities */}
      <h2 className="px-1 pt-2 text-xs font-bold tracking-wider text-stone-500 uppercase">All cities</h2>
      <div className="space-y-2">
        {[...focus, ...others].map((c) => (
          <CityCard key={c.city} c={c} cur={cur} />
        ))}
      </div>
      <p className="px-1 text-xs text-stone-500">
        Leads, lead cost and booking rate count every lead in the city. Revenue and fuel/dump/labor costs come from completed jobs. Total costs = lead cost + fuel + dump +
        labor + other{s.includeVehicleWear ? " + vehicle wear" : ""}. Profit = revenue − total costs. Make sure each job has a City (it fills in automatically from the address).
      </p>
    </div>
  );
}

type Fmt = (cur: string) => string;
const ROWS: [string, (c: CityRow) => Fmt, "high" | "low" | null][] = [
  ["Leads", (c) => () => String(c.leads), "high"],
  ["Lead cost", (c) => (cur) => money0(c.leadCost, cur), null],
  ["Avg CPL", (c) => (cur) => money(c.cpl, cur), "low"],
  ["Booked jobs", (c) => () => String(c.booked), "high"],
  ["Booking rate", (c) => () => pct(c.bookingRate), "high"],
  ["Revenue", (c) => (cur) => money0(c.revenue, cur), "high"],
  ["Fuel costs", (c) => (cur) => money0(c.fuel, cur), null],
  ["Dump costs", (c) => (cur) => money0(c.dump, cur), null],
  ["Labor costs", (c) => (cur) => money0(c.labor, cur), null],
  ["Total costs", (c) => (cur) => money0(c.totalCosts, cur), null],
  ["Profit", (c) => (cur) => money0(c.profit, cur), "high"],
  ["Margin", (c) => () => pct(c.margin), "high"],
  ["Avg job value", (c) => (cur) => money0(c.avgJobValue, cur), "high"],
  ["Avg profit / job", (c) => (cur) => money0(c.avgProfitPerJob, cur), "high"],
];
const NUM: Record<string, (c: CityRow) => number | null> = {
  Leads: (c) => c.leads,
  "Avg CPL": (c) => c.cpl,
  "Booked jobs": (c) => c.booked,
  "Booking rate": (c) => c.bookingRate,
  Revenue: (c) => c.revenue,
  Profit: (c) => c.profit,
  Margin: (c) => c.margin,
  "Avg job value": (c) => c.avgJobValue,
  "Avg profit / job": (c) => c.avgProfitPerJob,
};

function CityCard({ c, cur }: { c: CityRow; cur: string }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-lg font-extrabold">{c.city}</div>
          <div className="text-xs text-stone-500">
            {c.leads} leads · {c.booked} booked · {pct(c.bookingRate)} booking rate
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-bold text-stone-500 uppercase">Profit</div>
          <div className={cx("tabular text-xl font-black", c.profit >= 0 ? "text-brand-700" : "text-red-600")}>{money0(c.profit, cur)}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-3 px-4 py-3 text-sm">
        <M label="Lead cost" v={money0(c.leadCost, cur)} />
        <M label="Avg CPL" v={money(c.cpl, cur)} />
        <M label="Revenue" v={money0(c.revenue, cur)} />
        <M label="Fuel" v={money0(c.fuel, cur)} />
        <M label="Dump" v={money0(c.dump, cur)} />
        <M label="Labor" v={money0(c.labor, cur)} />
        <M label="Total costs" v={money0(c.totalCosts, cur)} />
        <M label="Avg job" v={money0(c.avgJobValue, cur)} />
        <M label="Avg profit/job" v={money0(c.avgProfitPerJob, cur)} />
      </div>
    </Card>
  );
}

function M({ label, v }: { label: string; v: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10px] font-bold tracking-wide text-stone-500 uppercase">{label}</div>
      <div className="tabular truncate font-bold">{v}</div>
    </div>
  );
}
