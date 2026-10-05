import type { CostBreakdown } from "@/lib/calc";
import { money, pct } from "@/lib/format";
import { Row, cx } from "./ui";

export function ProfitHero({ b, currency, label }: { b: CostBreakdown; currency: string; label: string }) {
  const good = b.profit >= 0;
  return (
    <div className={cx("rounded-2xl px-4 py-4 text-white", good ? "bg-emerald-700" : "bg-red-700")}>
      <div className="text-[11px] font-bold tracking-wider text-white/70 uppercase">{label}</div>
      <div className="flex items-end justify-between gap-3">
        <div className="tabular text-4xl font-black">{money(b.profit, currency)}</div>
        <div className="tabular pb-1 text-xl font-extrabold text-white/90">{pct(b.margin)}</div>
      </div>
      <div className="mt-1 flex gap-4 text-xs text-white/80">
        <span>{b.profitPerLaborHour !== null ? `${money(b.profitPerLaborHour, currency)}/labor hr` : "— /labor hr"}</span>
        <span>{b.profitPerMile !== null ? `${money(b.profitPerMile, currency)}/mile` : "— /mile"}</span>
      </div>
    </div>
  );
}

export function CostLines({ b, currency }: { b: CostBreakdown; currency: string }) {
  return (
    <div className="divide-y divide-stone-100 text-[15px]">
      <Row label="Customer price" value={money(b.price, currency)} strong />
      <div className="py-1">
        <Row label="Lead cost" value={money(b.lead, currency)} />
        <Row label="Fuel" hint={`${b.miles.toFixed(1)} mi · ${b.fuelGallons.toFixed(2)} gal`} value={money(b.fuel, currency)} />
        <Row label="Dump fees" value={money(b.dump, currency)} />
        <Row label="Labor" hint={b.laborHours ? `${b.laborHours} worker-hours` : undefined} value={money(b.labor, currency)} />
        <Row label="Other" value={money(b.other, currency)} />
        {b.maintenance || b.depreciation ? (
          <>
            <Row label="Maintenance" value={money(b.maintenance, currency)} />
            <Row label="Vehicle depreciation" value={money(b.depreciation, currency)} />
          </>
        ) : null}
      </div>
      <Row label="Total job cost" value={money(b.totalCost, currency)} strong />
      <Row label="Job profit" value={money(b.profit, currency)} strong tone={b.profit >= 0 ? "profit" : "loss"} />
      <Row label="Profit margin" value={pct(b.margin)} />
    </div>
  );
}

const LINES: { key: keyof CostBreakdown; label: string }[] = [
  { key: "price", label: "Price" },
  { key: "miles", label: "Miles" },
  { key: "fuel", label: "Fuel" },
  { key: "maintenance", label: "Maintenance" },
  { key: "depreciation", label: "Depreciation" },
  { key: "dump", label: "Dump" },
  { key: "labor", label: "Labor" },
  { key: "laborHours", label: "Labor hours" },
  { key: "lead", label: "Lead cost" },
  { key: "other", label: "Other" },
  { key: "totalCost", label: "Total cost" },
  { key: "profit", label: "Profit" },
];

export function EstimateVsActual({ est, act, currency }: { est: CostBreakdown; act: CostBreakdown; currency: string }) {
  const fmt = (k: keyof CostBreakdown, v: number | null) =>
    v === null ? "—" : k === "miles" || k === "laborHours" ? v.toFixed(1) : money(v, currency);
  return (
    <div className="overflow-hidden">
      <div className="grid grid-cols-4 gap-2 border-b border-stone-200 pb-2 text-[11px] font-bold tracking-wide text-stone-500 uppercase">
        <div />
        <div className="text-right">Estimated</div>
        <div className="text-right">Actual</div>
        <div className="text-right">Diff</div>
      </div>
      {LINES.filter(({ key }) => !((key === "maintenance" || key === "depreciation") && !est[key] && !act[key])).map(({ key, label }) => {
        const e = est[key] as number;
        const a = act[key] as number;
        const d = Math.round((a - e) * 100) / 100;
        // For costs, positive diff is bad; for price/profit positive is good
        const goodWhenUp = key === "price" || key === "profit";
        const neutral = key === "miles" || key === "laborHours";
        const tone = d === 0 || neutral ? "text-stone-500" : (d > 0) === goodWhenUp ? "text-emerald-700" : "text-red-600";
        return (
          <div
            key={key}
            className={cx(
              "tabular grid grid-cols-4 gap-2 py-1.5 text-sm",
              (key === "profit" || key === "totalCost") && "border-t border-stone-200 font-bold",
            )}
          >
            <div className="text-stone-600">{label}</div>
            <div className="text-right">{fmt(key, e)}</div>
            <div className="text-right">{fmt(key, a)}</div>
            <div className={cx("text-right font-semibold", tone)}>
              {d === 0 ? "—" : `${d > 0 ? "+" : "−"}${fmt(key, Math.abs(d))}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
