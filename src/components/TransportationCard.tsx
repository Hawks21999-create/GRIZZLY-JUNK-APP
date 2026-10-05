"use client";

import { useState } from "react";
import { Fuel, Loader2, RefreshCw } from "lucide-react";
import { money } from "@/lib/format";
import { NumInput } from "./form";
import { cx } from "./ui";

/**
 * TRANSPORTATION block used on the job/lead form:
 * one-way / return / total miles, van MPG, diesel price (auto with manual
 * override), gallons used and fuel cost — all calculated automatically.
 */
export function TransportationCard({
  oneWay,
  returnMiles,
  totalMiles,
  overridden,
  mpg,
  fuelPrice,
  fuelSource,
  fuelOverride,
  onFuelPrice,
  onUseCurrent,
  current,
  currency,
}: {
  oneWay: number | null;
  returnMiles: number | null;
  totalMiles: number;
  overridden: boolean;
  mpg: number;
  fuelPrice: number;
  fuelSource: string | null;
  fuelOverride: boolean;
  onFuelPrice: (n: number | null) => void;
  onUseCurrent: (price: number, label: string) => void;
  current: { price: number; label: string };
  currency: string;
}) {
  const [editing, setEditing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const gallons = mpg > 0 ? totalMiles / mpg : 0;
  const fuelCost = Math.round(gallons * fuelPrice * 100) / 100;

  async function refresh() {
    setRefreshing(true);
    try {
      const r = await fetch("/api/fuel/diesel?refresh=1");
      const d = await r.json();
      if (r.ok) onUseCurrent(d.price, d.label);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-black/10">
      <div className="grid grid-cols-3 divide-x divide-white/10 bg-bear-900 text-white">
        <MileCell label="One-way" value={oneWay} />
        <MileCell label="Return" value={returnMiles} />
        <MileCell label={overridden ? "Total (override)" : "Total job miles"} value={totalMiles} strong />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 bg-white p-4 sm:grid-cols-4">
        <Cell label="Van MPG" value={`${mpg}`} />
        <div>
          <div className="text-[11px] font-bold tracking-wide text-stone-500 uppercase">Diesel price</div>
          {editing ? (
            <NumInput value={fuelPrice} onChange={onFuelPrice} prefix="$" suffix="/gal" ariaLabel="Diesel price per gallon" />
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="tabular text-left text-lg font-extrabold underline decoration-dotted underline-offset-4">
              ${fuelPrice.toFixed(2)}
              <span className="text-xs font-semibold text-stone-500">/gal</span>
            </button>
          )}
        </div>
        <Cell label="Gallons used" value={gallons.toFixed(2)} />
        <Cell label="Fuel cost" value={money(fuelCost, currency)} strong />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 bg-stone-50 px-4 py-2 text-xs text-stone-600">
        <span className="flex min-w-0 items-center gap-1.5">
          <Fuel className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{fuelOverride ? "Manual price for this job" : (fuelSource ?? "Diesel price")}</span>
        </span>
        <span className="flex items-center gap-3">
          {fuelOverride || Math.abs(fuelPrice - current.price) > 0.0005 ? (
            <button
              type="button"
              className="font-semibold text-brand-700"
              onClick={() => {
                setEditing(false);
                onUseCurrent(current.price, current.label);
              }}
            >
              Use current ${current.price.toFixed(2)}
            </button>
          ) : null}
          <button type="button" className="inline-flex items-center gap-1 font-semibold text-brand-700" onClick={refresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
          </button>
          {!editing ? (
            <button type="button" className="font-semibold text-brand-700" onClick={() => setEditing(true)}>
              Override
            </button>
          ) : null}
        </span>
      </div>
      <div className="bg-white px-4 pb-3 text-[11px] text-stone-400">
        {totalMiles.toFixed(1)} mi ÷ {mpg} mpg = {gallons.toFixed(2)} gal × ${fuelPrice.toFixed(2)} = {money(fuelCost, currency)}
      </div>
    </div>
  );
}

function MileCell({ label, value, strong }: { label: string; value: number | null; strong?: boolean }) {
  return (
    <div className="px-3 py-3 text-center">
      <div className="text-[10px] font-bold tracking-wider text-stone-400 uppercase">{label}</div>
      <div className={cx("tabular font-black", strong ? "text-2xl text-brand-400" : "text-xl")}>
        {value === null ? "—" : value.toFixed(1)}
        <span className="ml-0.5 text-xs font-bold text-stone-400">mi</span>
      </div>
    </div>
  );
}

function Cell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-bold tracking-wide text-stone-500 uppercase">{label}</div>
      <div className={cx("tabular text-lg font-extrabold", strong && "text-stone-900")}>{value}</div>
    </div>
  );
}
