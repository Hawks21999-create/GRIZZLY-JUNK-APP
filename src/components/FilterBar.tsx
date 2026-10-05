"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { cx } from "./ui";

export type FilterOption = { value: string; label: string };

const PERIODS: FilterOption[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "year", label: "This Year" },
  { value: "all", label: "All Time" },
  { value: "custom", label: "Custom" },
];

/**
 * Period tabs + Source / City / Status filters, kept in the URL so the view is
 * shareable and survives refresh. Big touch targets for iPhone.
 */
export function FilterBar({
  defaultPeriod = "month",
  sources,
  cities,
  statuses,
  statusParam = "status",
  allowAllTime = false,
}: {
  defaultPeriod?: string;
  sources?: FilterOption[];
  cities?: FilterOption[];
  statuses?: FilterOption[];
  statusParam?: string;
  allowAllTime?: boolean;
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const period = sp.get("period") ?? defaultPeriod;
  const [open, setOpen] = useState(Boolean(sp.get("source") || sp.get("city") || sp.get(statusParam)));
  const [from, setFrom] = useState(sp.get("from") ?? "");
  const [to, setTo] = useState(sp.get("to") ?? "");

  function push(patch: Record<string, string | null>) {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.push(`${path}?${p.toString()}`);
  }

  const active = [sp.get("source"), sp.get("city"), sp.get(statusParam)].filter(Boolean).length;
  const periods = PERIODS.filter((p) => allowAllTime || p.value !== "all");

  return (
    <div className="space-y-2">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {periods.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => push({ period: p.value, ...(p.value !== "custom" ? { from: null, to: null } : {}) })}
            className={cx(
              "min-h-10 shrink-0 rounded-full px-3.5 text-sm font-semibold ring-1",
              period === p.value ? "bg-bear-900 text-brand-400 ring-bear-900" : "bg-white text-stone-700 ring-stone-300",
            )}
          >
            {p.label}
          </button>
        ))}
        {sources || cities || statuses ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cx(
              "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold ring-1",
              active ? "bg-brand-500 text-bear-950 ring-brand-500" : "bg-white text-stone-700 ring-stone-300",
            )}
          >
            <SlidersHorizontal className="h-4 w-4" /> Filters{active ? ` (${active})` : ""}
          </button>
        ) : null}
      </div>
      {period === "custom" ? (
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          <button type="button" className="btn-dark" onClick={() => push({ period: "custom", from, to })}>
            Go
          </button>
        </div>
      ) : null}
      {open ? (
        <div className="card grid gap-2 p-3 sm:grid-cols-3">
          {sources ? <FilterSelect label="Lead source" value={sp.get("source") ?? ""} options={sources} onChange={(v) => push({ source: v })} /> : null}
          {cities ? <FilterSelect label="City" value={sp.get("city") ?? ""} options={cities} onChange={(v) => push({ city: v })} /> : null}
          {statuses ? <FilterSelect label="Status" value={sp.get(statusParam) ?? ""} options={statuses} onChange={(v) => push({ [statusParam]: v })} /> : null}
          {active ? (
            <button type="button" className="btn-ghost text-sm sm:col-span-3" onClick={() => push({ source: null, city: null, [statusParam]: null })}>
              <X className="h-4 w-4" /> Clear filters
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: FilterOption[]; onChange: (v: string | null) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold tracking-wide text-stone-500 uppercase">{label}</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
