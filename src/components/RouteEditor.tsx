"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Building2, Loader2, MapPin, Plus, RefreshCw, Trash2, Truck, User } from "lucide-react";
import type { RouteStopType } from "@/db/schema";
import { AddressInput } from "./AddressInput";
import { businessStop, customerStop, dumpStop, stopKey, sumLegs, type DumpOption, type Stop } from "@/lib/route-stops";
export type { Stop, DumpOption };
import { NumInput, Toggle } from "./form";
import { cx } from "./ui";

const ICON: Record<RouteStopType, typeof MapPin> = { BUSINESS: Building2, CUSTOMER: User, DUMP: Truck, OTHER: MapPin };

export function RouteEditor({
  stops,
  setStops,
  business,
  dumpFacilities,
  defaultDumpId,
  mapsEnabled,
  milesOverride,
  setMilesOverride,
  autoCalcKey,
  onError,
}: {
  stops: Stop[];
  setStops: (s: Stop[]) => void;
  business: { address: string | null; lat: number | null; lng: number | null };
  dumpFacilities: DumpOption[];
  defaultDumpId: string | null;
  mapsEnabled: boolean;
  milesOverride: number | null;
  setMilesOverride: (n: number | null) => void;
  /** Changing this value triggers an automatic route calculation. */
  autoCalcKey: string;
  onError?: (msg: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [overrideOn, setOverrideOn] = useState(milesOverride !== null);
  const stopsRef = useRef(stops);
  stopsRef.current = stops;

  const total = sumLegs(stops);
  const defaultDump = dumpFacilities.find((d) => d.id === defaultDumpId) ?? dumpFacilities[0];

  const calculate = useCallback(async () => {
    const current = stopsRef.current;
    const missing = current.findIndex((s) => !s.address.trim());
    if (missing >= 0) {
      const msg = `Stop ${missing + 1} (${current[missing].label}) needs an address${current[missing].type === "BUSINESS" ? " — set it in Settings" : ""}.`;
      setErr(msg);
      onError?.(msg);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/maps/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stops: current.map((s) => ({ address: s.address, lat: s.lat, lng: s.lng })) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Route failed");
      const legs: number[] = d.legsMiles;
      setStops(current.map((s, i) => ({ ...s, legMiles: i === 0 ? null : (legs[i - 1] ?? null) })));
      setStale(false);
      onError?.(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Route failed";
      setErr(msg);
      onError?.(msg);
    } finally {
      setBusy(false);
    }
  }, [setStops, onError]);

  const calcRef = useRef(calculate);
  calcRef.current = calculate;

  // Auto-calc when the customer address is resolved
  const lastAuto = useRef(autoCalcKey);
  useEffect(() => {
    if (!mapsEnabled || !autoCalcKey || autoCalcKey === lastAuto.current) return;
    lastAuto.current = autoCalcKey;
    void calcRef.current();
  }, [autoCalcKey, mapsEnabled]);

  // Structural edits (reorder / add / remove / new address) invalidate leg
  // distances; with Maps enabled we recalculate automatically.
  const [tick, setTick] = useState(0);
  function update(next: Stop[], structural = true) {
    if (structural && mapsEnabled) {
      setStops(next.map((s) => ({ ...s, legMiles: null })));
      setStale(true);
      setTick((t) => t + 1);
    } else {
      setStops(next);
    }
  }
  useEffect(() => {
    if (!tick) return;
    if (stopsRef.current.every((s) => s.address.trim())) void calcRef.current();
  }, [tick]);

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= stops.length) return;
    const next = [...stops];
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  }

  function template(withDump: boolean) {
    const cust = stops.filter((s) => s.type === "CUSTOMER");
    const b = businessStop(business.address, business.lat, business.lng);
    const next = [b, ...cust.map((c) => ({ ...c, legMiles: null }))];
    if (withDump) next.push(dumpStop(defaultDump));
    next.push(businessStop(business.address, business.lat, business.lng));
    update(next);
  }

  function addStop(type: RouteStopType) {
    const n =
      type === "DUMP"
        ? dumpStop(defaultDump)
        : type === "BUSINESS"
          ? businessStop(business.address, business.lat, business.lng)
          : type === "CUSTOMER"
            ? customerStop("", null, null, `Customer #${stops.filter((s) => s.type === "CUSTOMER").length + 1}`)
            : { key: stopKey(), type: "OTHER" as const, label: "Stop", address: "", lat: null, lng: null, legMiles: null };
    // insert before the final "return to business" stop when there is one
    const last = stops[stops.length - 1];
    const idx = last?.type === "BUSINESS" && stops.length > 1 ? stops.length - 1 : stops.length;
    const next = [...stops];
    next.splice(idx, 0, n);
    update(next);
  }

  const effective = overrideOn && milesOverride !== null ? milesOverride : total;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary min-h-10 text-xs" onClick={() => template(true)}>
          Business → Customer → Dump → Business
        </button>
        <button type="button" className="btn-secondary min-h-10 text-xs" onClick={() => template(false)}>
          Business → Customer → Business
        </button>
      </div>

      <ol className="space-y-2">
        {stops.map((s, i) => {
          const Icon = ICON[s.type];
          return (
            <li key={s.key}>
              {i > 0 ? (
                <div className="flex items-center gap-2 py-1 pl-4 text-xs text-stone-500">
                  <span className="h-4 border-l-2 border-dashed border-stone-300" />
                  {mapsEnabled ? (
                    <span className="tabular font-semibold">{s.legMiles !== null ? `${s.legMiles.toFixed(1)} mi` : "— mi"}</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <NumInput
                        className="w-28"
                        value={s.legMiles}
                        onChange={(n) => update(stops.map((x) => (x.key === s.key ? { ...x, legMiles: n } : x)), false)}
                        suffix="mi"
                        ariaLabel={`Miles to ${s.label}`}
                      />
                      <span>leg miles</span>
                    </div>
                  )}
                </div>
              ) : null}
              <div className="flex items-start gap-2 rounded-xl bg-stone-50 p-2.5 ring-1 ring-stone-200">
                <div
                  className={cx(
                    "mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    s.type === "DUMP" ? "bg-amber-100 text-amber-800" : s.type === "BUSINESS" ? "bg-bear-900 text-brand-400" : "bg-blue-100 text-blue-800",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-stone-800">
                    {i + 1}. {s.label}
                  </div>
                  {s.type === "DUMP" && dumpFacilities.length ? (
                    <select
                      className="input mt-1 min-h-11 py-2"
                      value={s.dumpFacilityId ?? ""}
                      onChange={(e) => {
                        const d = dumpFacilities.find((x) => x.id === e.target.value);
                        update(stops.map((x) => (x.key === s.key ? { ...dumpStop(d), key: s.key } : x)));
                      }}
                    >
                      {dumpFacilities.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {s.type === "BUSINESS" ? (
                    <div className="truncate text-sm text-stone-500">{s.address || "Set business address in Settings"}</div>
                  ) : s.type === "DUMP" ? (
                    <div className="truncate text-xs text-stone-500">{s.address || "No address on this facility"}</div>
                  ) : (
                    <div className="mt-1">
                      <AddressInput
                        value={s.address}
                        mapsEnabled={mapsEnabled}
                        onChange={(t) => update(stops.map((x) => (x.key === s.key ? { ...x, address: t, lat: null, lng: null } : x)), false)}
                        onResolved={(a) =>
                          update(stops.map((x) => (x.key === s.key ? { ...x, address: a.formatted, lat: a.lat, lng: a.lng } : x)))
                        }
                      />
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col">
                  <button type="button" aria-label="Move up" className="p-1.5 text-stone-400 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    className="p-1.5 text-stone-400 disabled:opacity-30"
                    disabled={i === stops.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  {stops.length > 2 ? (
                    <button type="button" aria-label="Remove stop" className="p-1.5 text-red-400" onClick={() => update(stops.filter((x) => x.key !== s.key))}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap gap-2">
        <AddBtn onClick={() => addStop("CUSTOMER")}>Customer</AddBtn>
        <AddBtn onClick={() => addStop("DUMP")}>Dump</AddBtn>
        <AddBtn onClick={() => addStop("OTHER")}>Other stop</AddBtn>
        <AddBtn onClick={() => addStop("BUSINESS")}>Business</AddBtn>
      </div>

      {mapsEnabled ? (
        <button type="button" className={cx("w-full", stale ? "btn-primary" : "btn-secondary")} onClick={calculate} disabled={busy}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
          {busy ? "Calculating route…" : stale ? "Recalculate miles" : "Calculate miles"}
        </button>
      ) : (
        <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Automatic mileage needs a Google Maps API key (see README). Enter leg miles above or override the total below.
        </div>
      )}
      {err ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-2xl bg-bear-900 px-4 py-3 text-white">
        <div className="text-[11px] font-bold tracking-wider text-stone-400 uppercase">Total Job Miles</div>
        <div className="tabular text-3xl font-black">
          {effective !== null ? `${effective.toFixed(1)}` : "—"} <span className="text-lg font-bold text-stone-400">miles</span>
        </div>
        {overrideOn && milesOverride !== null && total !== null ? (
          <div className="text-xs text-brand-400">Manual override (route = {total.toFixed(1)} mi)</div>
        ) : null}
      </div>

      <Toggle
        checked={overrideOn}
        onChange={(v) => {
          setOverrideOn(v);
          if (!v) setMilesOverride(null);
          else if (milesOverride === null) setMilesOverride(total);
        }}
        label="Manually override total miles"
      />
      {overrideOn ? <NumInput value={milesOverride} onChange={setMilesOverride} suffix="mi" ariaLabel="Total miles override" /> : null}
    </div>
  );
}

function AddBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-white px-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-300 active:bg-stone-100">
      <Plus className="h-4 w-4" /> {children}
    </button>
  );
}
