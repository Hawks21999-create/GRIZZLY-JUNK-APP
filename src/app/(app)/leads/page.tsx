import Link from "@/components/Link";
import { Plus, Search } from "lucide-react";
import { LEAD_STATUSES, LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/constants";
import { money, money0, pct } from "@/lib/format";
import { fmtDate, fmtTime, parsePeriod, periodDays } from "@/lib/tz";
import { distinctCities, listLeads } from "@/server/leads";
import { getLeadSources, getSettings } from "@/server/settings";
import { FilterBar } from "@/components/FilterBar";
import { Card, Empty, LeadStatusChip, PageHeader, Stat, cx, profitTone } from "@/components/ui";

export const metadata = { title: "Leads" };

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; source?: string; city?: string; lead?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const s = await getSettings();
  const key = parsePeriod(sp.period, "month");
  const p = periodDays(key, s.timezone, { from: sp.from, to: sp.to });
  const leadStatus = (LEAD_STATUSES as string[]).includes(sp.lead ?? "") ? (sp.lead as LeadStatus) : null;
  const [sources, cities, data] = await Promise.all([
    getLeadSources(true),
    distinctCities(),
    listLeads({ from: p.from, to: p.to, leadStatus, sourceId: sp.source || null, city: sp.city || null, q: sp.q?.slice(0, 100) || null }),
  ]);
  const sm = data.summary;
  const cur = s.currency;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Leads"
        subtitle={`${p.label} · by date the lead came in`}
        action={
          <Link href="/leads/new" className="btn-primary">
            <Plus className="h-5 w-5" /> Lead
          </Link>
        }
      />
      <FilterBar
        defaultPeriod="month"
        allowAllTime
        sources={[...sources.map((x) => ({ value: x.id, label: x.name })), { value: "none", label: "No source" }]}
        cities={cities.map((c) => ({ value: c, label: c }))}
        statuses={LEAD_STATUSES.map((x) => ({ value: x, label: LEAD_STATUS_LABEL[x] }))}
        statusParam="lead"
      />
      <form action="/leads" className="relative">
        {Object.entries(sp)
          .filter(([k, v]) => k !== "q" && v)
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        <Search className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-stone-400" />
        <input name="q" defaultValue={sp.q ?? ""} type="search" enterKeyHint="search" className="input pl-10" placeholder="Search name, phone, address" />
      </form>

      <Card className="grid grid-cols-3 gap-x-3 gap-y-4 p-4">
        <Stat label="Leads" value={sm.leads} />
        <Stat label="Lead cost" value={money0(sm.leadCost, cur)} sub={sm.cpl !== null ? `${money(sm.cpl, cur)}/lead` : undefined} />
        <Stat label="Booked" value={sm.booked} sub={`${pct(sm.conversion)} conversion`} />
        <Stat label="Completed" value={sm.completed} />
        <Stat label="Revenue" value={money0(sm.revenue, cur)} />
        <Stat label="Profit" value={money0(sm.profit, cur)} tone={profitTone(sm.profit)} sub={pct(sm.margin)} />
      </Card>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {[null, ...LEAD_STATUSES].map((ls) => {
          const q = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
          if (ls) q.set("lead", ls);
          else q.delete("lead");
          return (
            <Link
              key={ls ?? "all"}
              href={`/leads?${q}`}
              className={cx(
                "shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold ring-1",
                leadStatus === ls ? "bg-bear-900 text-brand-400 ring-bear-900" : "bg-white text-stone-700 ring-stone-300",
              )}
            >
              {ls ? LEAD_STATUS_LABEL[ls] : "All"}
            </Link>
          );
        })}
      </div>

      {data.list.length ? (
        <div className="space-y-2">
          {data.list.map(({ job: j, fin, city }) => {
            const done = j.status === "COMPLETED";
            return (
              <Link key={j.id} href={`/jobs/${j.id}`} className="card block p-3.5 active:bg-stone-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-bold">{j.customer.name}</div>
                    <div className="truncate text-sm text-stone-500">
                      {city ?? "No city"} · {j.leadSource?.name ?? "No source"}
                    </div>
                    <div className="mt-0.5 text-xs text-stone-400">
                      {fmtDate(j.leadReceivedAt, s.timezone)} {fmtTime(j.leadReceivedAt, s.timezone)}
                      {j.lostReason && (j.status === "NOT_BOOKED" || j.status === "CANCELLED") ? ` · Lost: ${j.lostReason}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <LeadStatusChip status={j.status} />
                    <div className="tabular mt-1 text-xs text-stone-500">Lead cost {money(j.leadCost, cur)}</div>
                  </div>
                </div>
                {done || fin.best.price > 0 ? (
                  <div className="mt-2 grid grid-cols-3 gap-2 border-t border-stone-100 pt-2 text-center">
                    <div>
                      <div className="text-[10px] font-bold text-stone-400 uppercase">{done ? "Revenue" : "Estimate"}</div>
                      <div className="tabular text-sm font-bold">{money0(fin.best.price, cur)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-stone-400 uppercase">Cost</div>
                      <div className="tabular text-sm font-bold">{money0(fin.best.totalCost, cur)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-stone-400 uppercase">{done ? "Profit" : "Est. profit"}</div>
                      <div className={cx("tabular text-sm font-extrabold", fin.best.profit >= 0 ? "text-brand-700" : "text-red-600")}>{money0(fin.best.profit, cur)}</div>
                    </div>
                  </div>
                ) : null}
              </Link>
            );
          })}
        </div>
      ) : (
        <Empty title="No leads match">
          <Link href="/leads/new" className="font-semibold text-brand-700">
            Add a lead
          </Link>
        </Empty>
      )}
    </div>
  );
}
