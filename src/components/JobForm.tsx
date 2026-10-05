"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Trash2, UserCheck, X } from "lucide-react";
import { saveJob } from "@/app/actions/jobs";
import type { JobExpenseCategory, JobStatus, JobType, PaymentMethod, PaymentStatus } from "@/db/schema";
import { computeEstimate, type JobForCalc } from "@/lib/calc";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_TO_JOB,
  LOST_REASONS,
  leadStatusOf,
  JOB_EXPENSE_CATEGORIES,
  JOB_EXPENSE_CATEGORY_LABEL,
  JOB_STATUSES,
  JOB_TYPES,
  JOB_TYPE_LABEL,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABEL,
  STATUS_LABEL,
} from "@/lib/constants";
import { money, pct } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import type { JobFormOptions } from "@/server/settings";
import type { JobFormInitial } from "@/lib/job-form-initial";
export type { JobFormInitial };
import { AddressInput, type ResolvedAddress } from "./AddressInput";
import { CostLines, ProfitHero } from "./FinancialSummary";
import { ErrorBanner, Field, NumInput, Segmented, Select, useDebounced } from "./form";
import { RouteEditor } from "./RouteEditor";
import { customerStop, dumpStop, splitMiles, sumLegs, type Stop } from "@/lib/route-stops";
import { TransportationCard } from "./TransportationCard";
import { cx } from "./ui";

type CustomerLite = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  leadSourceId: string | null;
};


const DURATIONS = [60, 120, 180, 240, 360, 480];

export function JobForm({
  initial,
  options,
  mode = "job",
}: {
  initial: JobFormInitial;
  options: JobFormOptions;
  /** "lead" = quick lead capture while on the phone (fewer fields). */
  mode?: "job" | "lead";
}) {
  const isLead = mode === "lead";
  const [showRoute, setShowRoute] = useState(!isLead);
  const router = useRouter();
  const { settings: st, mapsEnabled } = options;
  const [f, setF] = useState<JobFormInitial>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [autoKey, setAutoKey] = useState("");
  const [routeError, setRouteError] = useState<string | null>(null);
  const isEdit = Boolean(initial.id);
  const set = <K extends keyof JobFormInitial>(k: K, v: JobFormInitial[K]) => setF((p) => ({ ...p, [k]: v }));

  // ── Repeat-customer detection ─────────────────────────────
  const [suggestions, setSuggestions] = useState<CustomerLite[]>([]);
  const [linked, setLinked] = useState<CustomerLite | null>(null);
  const nameQ = useDebounced(f.customer.name, 250);
  const phoneQ = useDebounced(f.customer.phone, 400);
  const nameTyped = useRef(false);

  useEffect(() => {
    if (f.customerId || !nameTyped.current || nameQ.trim().length < 2) return setSuggestions([]);
    const ctrl = new AbortController();
    fetch(`/api/customers/search?q=${encodeURIComponent(nameQ)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => setSuggestions(d.customers ?? []))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [nameQ, f.customerId]);

  useEffect(() => {
    if (f.customerId || phoneQ.replace(/\D/g, "").length < 10) return;
    const ctrl = new AbortController();
    fetch(`/api/customers/search?phone=${encodeURIComponent(phoneQ)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => d.match && pickCustomer(d.match))
      .catch(() => undefined);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneQ, f.customerId]);

  function pickCustomer(c: CustomerLite) {
    setLinked(c);
    setSuggestions([]);
    nameTyped.current = false;
    setF((p) => ({
      ...p,
      customerId: c.id,
      customer: { name: c.name, phone: c.phone ?? p.customer.phone, email: c.email ?? p.customer.email },
      leadSourceId: p.leadSourceId ?? (options.leadSources.find((l) => l.name === "Repeat Customer")?.id || c.leadSourceId),
    }));
    if (c.address && !f.address) applyAddress({ formatted: c.address, street: null, city: c.city, state: c.state, zip: c.zip, lat: c.lat, lng: c.lng });
  }

  // ── Address → route ──────────────────────────────────────
  function syncCustomerStop(addr: string, lat: number | null, lng: number | null) {
    setF((p) => {
      const idx = p.stops.findIndex((s) => s.type === "CUSTOMER");
      const stops = [...p.stops];
      if (idx >= 0) stops[idx] = { ...stops[idx], address: addr, lat, lng, legMiles: mapsEnabled ? null : stops[idx].legMiles };
      else stops.splice(1, 0, customerStop(addr, lat, lng));
      return { ...p, stops: mapsEnabled ? stops.map((s) => ({ ...s, legMiles: null })) : stops };
    });
  }

  function applyAddress(a: ResolvedAddress) {
    setF((p) => ({ ...p, address: a.formatted, city: a.city ?? p.city, state: a.state ?? p.state, zip: a.zip ?? p.zip, lat: a.lat, lng: a.lng }));
    syncCustomerStop(a.formatted, a.lat, a.lng);
    setAutoKey(`${a.formatted}|${a.lat}|${a.lng}`);
  }

  // ── Workers ──────────────────────────────────────────────
  const empById = useMemo(() => new Map(options.employees.map((e) => [e.id, e])), [options.employees]);
  function toggleWorker(id: string) {
    setF((p) => {
      const on = p.labor.some((l) => l.employeeId === id);
      const labor = on ? p.labor.filter((l) => l.employeeId !== id) : [...p.labor, { employeeId: id, estHours: p.estLaborHours }];
      return { ...p, labor, workersCount: labor.length || p.workersCount };
    });
  }
  function setAllHours(h: number | null) {
    setF((p) => ({ ...p, estLaborHours: h, labor: p.labor.map((l) => ({ ...l, estHours: h })) }));
  }

  // ── Live estimate ────────────────────────────────────────
  const vehicle = options.vehicles.find((v) => v.id === f.vehicleId) ?? options.vehicles[0];
  const baseRates =
    isEdit && initial.vehicleRates && f.vehicleId === initial.vehicleId
      ? initial.vehicleRates
      : vehicle
        ? { mpg: vehicle.mpg, fuelPrice: vehicle.fuelPrice, maintenancePerMile: vehicle.maintenancePerMile, depreciationPerMile: vehicle.depreciationPerMile }
        : { mpg: 0, fuelPrice: 0, maintenancePerMile: 0, depreciationPerMile: 0 };
  const rates = { ...baseRates, fuelPrice: f.fuelPrice ?? baseRates.fuelPrice };
  const routeMiles = sumLegs(f.stops);
  const miles = splitMiles(f.stops);
  const calcInput: JobForCalc = {
    status: "SCHEDULED",
    quotedPrice: f.quotedPrice ?? 0,
    finalPrice: null,
    leadCost: f.leadCost ?? 0,
    workersCount: f.workersCount,
    estLaborHours: f.estLaborHours ?? 0,
    ...rates,
    routeMiles,
    milesOverride: f.milesOverride,
    actualMiles: null,
    estDumpCost: f.estDumpCost ?? 0,
    labor: f.labor.map((l) => ({
      employeeName: empById.get(l.employeeId)?.name,
      hourlyRate: l.hourlyRate ?? empById.get(l.employeeId)?.hourlyCost ?? st.defaultLaborRate,
      estHours: l.estHours ?? 0,
      actualHours: null,
    })),
    dumpRecords: [],
    expenses: f.expenses.map((e) => ({ amount: e.amount ?? 0 })),
  };
  const est = computeEstimate(calcInput, { laborRate: st.defaultLaborRate, includeWear: st.includeVehicleWear });

  // keep dump estimate in sync with the chosen facility (new jobs only, until edited)
  const dumpTouched = useRef(isEdit);
  function chooseDump(id: string) {
    const d = options.dumpFacilities.find((x) => x.id === id);
    setF((p) => ({
      ...p,
      dumpFacilityId: id || null,
      estDumpCost: !dumpTouched.current && d && d.defaultFee > 0 ? d.defaultFee : p.estDumpCost,
      stops: p.stops.map((s) => (s.type === "DUMP" && d ? { ...dumpStop(d), key: s.key, legMiles: null } : s)),
    }));
    if (mapsEnabled) setAutoKey(`dump:${id}:${Date.now()}`);
  }

  function submit() {
    setError(null);
    setErrors({});
    const payload = {
      customerId: f.customerId,
      customer: { name: f.customer.name, phone: f.customer.phone || null, email: f.customer.email || null },
      address: f.address,
      city: f.city,
      state: f.state,
      zip: f.zip,
      lat: f.lat,
      lng: f.lng,
      date: f.date || null,
      time: f.time || null,
      durationMinutes: f.durationMinutes,
      jobType: f.jobType,
      status: f.status,
      quotedPrice: f.quotedPrice ?? 0,
      deposit: f.deposit ?? 0,
      paymentStatus: f.paymentStatus,
      paymentMethod: f.paymentMethod,
      leadSourceId: f.leadSourceId,
      leadCost: f.leadCost ?? 0,
      workersCount: f.workersCount,
      estLaborHours: f.estLaborHours ?? 0,
      labor: f.labor.map((l) => ({ employeeId: l.employeeId, estHours: l.estHours ?? 0 })),
      vehicleId: f.vehicleId,
      dumpFacilityId: f.dumpFacilityId,
      estDumpCost: f.estDumpCost ?? 0,
      route: f.stops.length >= 2 && f.stops.every((s) => s.address.trim())
        ? {
            stops: f.stops.map((s) => ({ type: s.type, label: s.label, address: s.address, lat: s.lat, lng: s.lng, legMiles: s.legMiles })),
            totalMiles: routeMiles,
            error: routeError,
          }
        : null,
      milesOverride: f.milesOverride,
      expenses: f.expenses.map((e) => ({ category: e.category, description: e.description, amount: e.amount ?? 0 })),
      expenseIds: f.expenses.map((e) => e.id),
      notes: f.notes || null,
      fuelPrice: f.fuelPrice,
      fuelPriceSource: f.fuelOverride ? "Manual" : f.fuelPriceSource,
      leadReceivedDate: f.leadReceivedDate || null,
      leadReceivedTime: f.leadReceivedTime || null,
      lostReason: f.lostReason,
    };
    start(async () => {
      const res = await saveJob(initial.id ?? null, payload);
      if (!res.ok) {
        setError(res.error);
        setErrors(res.fieldErrors ?? {});
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      window.location.assign(`/jobs/${res.data.id}`);
    });
  }

  const e = (k: string) => errors[k];

  return (
    <form
      className="space-y-4 pb-28"
      onSubmit={(ev) => {
        ev.preventDefault();
        submit();
      }}
    >
      <ErrorBanner error={error} />

      {/* CUSTOMER */}
      <Section title="Customer">
        {linked || f.customerId ? (
          <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-3 py-2.5 ring-1 ring-emerald-200">
            <UserCheck className="h-5 w-5 shrink-0 text-emerald-700" />
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-bold text-emerald-900">{isEdit && !linked ? "Linked customer" : "Repeat customer found"}</div>
              <div className="truncate text-emerald-800">This job will be added to {f.customer.name}&apos;s history.</div>
            </div>
            {!isEdit ? (
              <button
                type="button"
                className="rounded-lg p-2 text-emerald-800"
                aria-label="Not this customer"
                onClick={() => {
                  setLinked(null);
                  set("customerId", null);
                }}
              >
                <X className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        ) : null}
        <Field label="Customer name" error={e("customer.name")}>
          <div className="relative">
            <input
              className="input"
              value={f.customer.name}
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="next"
              placeholder="Full name"
              onChange={(ev) => {
                nameTyped.current = true;
                setF((p) => ({ ...p, customer: { ...p.customer, name: ev.target.value } }));
              }}
              onBlur={() => setTimeout(() => setSuggestions([]), 200)}
            />
            {suggestions.length ? (
              <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/10">
                <li className="px-4 pt-2 text-[11px] font-bold tracking-wide text-stone-400 uppercase">Existing customers</li>
                {suggestions.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => pickCustomer(c)}
                      className="block min-h-12 w-full px-4 py-2 text-left active:bg-stone-100"
                    >
                      <div className="font-semibold">{c.name}</div>
                      <div className="text-sm text-stone-500">
                        {[formatPhone(c.phone), c.city].filter(Boolean).join(" · ")}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Phone" error={e("customer.phone")}>
            <input
              className="input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={f.customer.phone}
              placeholder="(770) 555-0123"
              onChange={(ev) => setF((p) => ({ ...p, customer: { ...p.customer, phone: ev.target.value } }))}
            />
          </Field>
          <Field label="Email" error={e("customer.email")}>
            <input
              className="input"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoComplete="email"
              value={f.customer.email}
              placeholder="optional"
              onChange={(ev) => setF((p) => ({ ...p, customer: { ...p.customer, email: ev.target.value } }))}
            />
          </Field>
        </div>
      </Section>

      {/* LOCATION */}
      <Section title="Job Address">
        <Field error={e("address")} hint={f.city ? `${f.city}${f.state ? ", " + f.state : ""} ${f.zip ?? ""}` : undefined}>
          <AddressInput
            value={f.address}
            mapsEnabled={mapsEnabled}
            onChange={(t) => {
              setF((p) => ({ ...p, address: t, lat: null, lng: null }));
              if (!mapsEnabled) syncCustomerStop(t, null, null);
            }}
            onResolved={applyAddress}
          />
        </Field>
        <div className="grid grid-cols-[1fr_4.5rem_6rem] gap-2">
          <Field label="City">
            <input className="input" placeholder="City" list="gjr-cities" value={f.city ?? ""} onChange={(ev) => set("city", ev.target.value || null)} />
            <datalist id="gjr-cities">
              {["Cumming", "Dawsonville", "Alpharetta", "Milton", "Johns Creek", "Gainesville", "Canton", "Roswell", "Ball Ground", "Suwanee", "Buford"].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="State">
            <input className="input uppercase" placeholder="GA" maxLength={2} value={f.state ?? ""} onChange={(ev) => set("state", ev.target.value.toUpperCase() || null)} />
          </Field>
          <Field label="ZIP">
            <input className="input" placeholder="ZIP" inputMode="numeric" value={f.zip ?? ""} onChange={(ev) => set("zip", ev.target.value || null)} />
          </Field>
        </div>
      </Section>

      {/* LEAD */}
      <Section title="Lead">
        <Field label="Lead source">
          <div className="flex flex-wrap gap-1.5">
            {options.leadSources.map((l) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={f.leadSourceId === l.id}
                onClick={() => set("leadSourceId", f.leadSourceId === l.id ? null : l.id)}
                className={cx(
                  "min-h-11 rounded-xl px-3 text-sm font-semibold ring-1 active:scale-95",
                  f.leadSourceId === l.id ? "bg-bear-900 text-brand-400 ring-bear-900" : "bg-white text-stone-700 ring-stone-300",
                )}
              >
                {l.name}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Lead cost" error={e("leadCost")} hint="What this lead cost you (ad click, lead fee…). $0 for free sources.">
          <NumInput value={f.leadCost} onChange={(n) => set("leadCost", n)} prefix="$" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Lead came in" className="min-w-0">
            <input className="input min-w-0 px-2" type="date" value={f.leadReceivedDate} onChange={(ev) => set("leadReceivedDate", ev.target.value)} />
          </Field>
          <Field label="Time" className="min-w-0">
            <input className="input min-w-0 px-2" type="time" value={f.leadReceivedTime} onChange={(ev) => set("leadReceivedTime", ev.target.value)} />
          </Field>
        </div>
        {isLead ? (
          <Field label="Lead status">
            <Segmented
              value={leadStatusOf(f.status)}
              onChange={(v) => set("status", LEAD_STATUS_TO_JOB[v])}
              options={LEAD_STATUSES.filter((x) => x !== "COMPLETED").map((x) => ({ value: x, label: LEAD_STATUS_LABEL[x] }))}
            />
          </Field>
        ) : null}
        {f.status === "NOT_BOOKED" || f.status === "CANCELLED" ? (
          <Field label="Lost reason">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {LOST_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => set("lostReason", r)}
                  className={cx("min-h-9 rounded-lg px-2.5 text-xs font-semibold ring-1", f.lostReason === r ? "bg-red-600 text-white ring-red-600" : "bg-white text-stone-700 ring-stone-300")}
                >
                  {r}
                </button>
              ))}
            </div>
            <input className="input" placeholder="Or type a reason" value={f.lostReason ?? ""} onChange={(ev) => set("lostReason", ev.target.value || null)} />
          </Field>
        ) : null}
      </Section>

      {isLead ? (
        <Section title="Estimate">
          <div className="grid grid-cols-[8rem_1fr] gap-3">
            <Field label="Estimate / price" error={e("quotedPrice")}>
              <NumInput value={f.quotedPrice} onChange={(n) => set("quotedPrice", n)} prefix="$" />
            </Field>
            <Field label="Job type">
              <Select value={f.jobType} onChange={(v) => v && set("jobType", v)} options={JOB_TYPES.map((t) => ({ value: t, label: JOB_TYPE_LABEL[t] }))} />
            </Field>
          </div>
        </Section>
      ) : null}

      {/* TRANSPORTATION */}
      <Section title="Transportation">
        <TransportationCard
          oneWay={miles.oneWay}
          returnMiles={miles.returnMiles}
          totalMiles={est.miles}
          overridden={f.milesOverride !== null}
          mpg={rates.mpg}
          fuelPrice={rates.fuelPrice}
          fuelSource={f.fuelPriceSource}
          fuelOverride={f.fuelOverride}
          onFuelPrice={(n) => setF((p) => ({ ...p, fuelPrice: n, fuelOverride: true }))}
          onUseCurrent={(price, label) => setF((p) => ({ ...p, fuelPrice: price, fuelPriceSource: label, fuelOverride: false }))}
          current={{ price: options.diesel.price, label: options.diesel.label }}
          currency={st.currency}
        />
        {!showRoute ? (
          <button type="button" className="btn-secondary w-full" onClick={() => setShowRoute(true)}>
            Edit route / enter miles
          </button>
        ) : null}
        <div className={showRoute ? "space-y-3" : "hidden"}>
          {options.vehicles.length > 1 ? (
            <Field label="Vehicle">
              <Select value={f.vehicleId} onChange={(v) => set("vehicleId", v || null)} options={options.vehicles.map((v) => ({ value: v.id, label: v.name }))} />
            </Field>
          ) : null}
          <RouteEditor
            stops={f.stops}
            setStops={(s) => setF((p) => ({ ...p, stops: s }))}
            business={{ address: st.businessAddress, lat: st.businessLat, lng: st.businessLng }}
            dumpFacilities={options.dumpFacilities}
            defaultDumpId={f.dumpFacilityId ?? st.defaultDumpFacilityId}
            mapsEnabled={mapsEnabled}
            milesOverride={f.milesOverride}
            setMilesOverride={(n) => set("milesOverride", n)}
            autoCalcKey={autoKey}
            onError={setRouteError}
          />
        </div>
      </Section>

      {!isLead || f.status === "ESTIMATE_SCHEDULED" || f.status === "SCHEDULED" ? (
      <Section title={isLead && f.status === "ESTIMATE_SCHEDULED" ? "Estimate Appointment" : "Date & Time"}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" error={e("date")}>
            <input className="input" type="date" value={f.date} onChange={(ev) => set("date", ev.target.value)} />
          </Field>
          <Field label="Arrival time" error={e("time")}>
            <input className="input" type="time" step={900} value={f.time} onChange={(ev) => set("time", ev.target.value)} />
          </Field>
        </div>
        <Field label="Estimated duration">
          <Segmented
            value={String(f.durationMinutes)}
            onChange={(v) => set("durationMinutes", Number(v))}
            options={[...new Set([...DURATIONS, f.durationMinutes])].sort((a, b) => a - b).map((m) => ({ value: String(m), label: `${m / 60}h` }))}
          />
        </Field>
      </Section>
      ) : null}

      {!isLead ? (
      <>
      {/* JOB */}
      <Section title="Job">
        <Field label="Job type">
          <Select value={f.jobType} onChange={(v) => v && set("jobType", v)} options={JOB_TYPES.map((t) => ({ value: t, label: JOB_TYPE_LABEL[t] }))} />
        </Field>
        <Field label="Status">
          <Segmented
            value={["LEAD", "QUOTE_SENT", "ESTIMATE_SCHEDULED", "SCHEDULED"].includes(f.status) ? f.status : null}
            onChange={(v) => set("status", v)}
            options={(["SCHEDULED", "ESTIMATE_SCHEDULED", "QUOTE_SENT", "LEAD"] as JobStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
          />
          <div className="mt-2">
            <Select value={f.status} onChange={(v) => v && set("status", v)} options={JOB_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} ariaLabel="All statuses" />
          </div>
        </Field>
      </Section>

      {/* PRICE */}
      <Section title="Price & Payment">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quoted price" error={e("quotedPrice")}>
            <NumInput value={f.quotedPrice} onChange={(n) => set("quotedPrice", n)} prefix="$" />
          </Field>
          <Field label="Deposit" error={e("deposit")}>
            <NumInput value={f.deposit} onChange={(n) => set("deposit", n)} prefix="$" />
          </Field>
        </div>
        <Field label="Payment status">
          <Segmented value={f.paymentStatus} onChange={(v) => set("paymentStatus", v)} options={PAYMENT_STATUSES.map((p) => ({ value: p, label: PAYMENT_STATUS_LABEL[p] }))} />
        </Field>
        <Field label="Payment method">
          <Segmented
            value={f.paymentMethod}
            onChange={(v) => set("paymentMethod", f.paymentMethod === v ? null : v)}
            options={PAYMENT_METHODS.map((p) => ({ value: p, label: PAYMENT_METHOD_LABEL[p] }))}
          />
        </Field>
      </Section>

      {/* CREW */}
      <Section title="Crew & Labor">
        {options.employees.length ? (
          <div className="flex flex-wrap gap-2">
            {options.employees.map((emp) => {
              const on = f.labor.some((l) => l.employeeId === emp.id);
              return (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => toggleWorker(emp.id)}
                  aria-pressed={on}
                  className={cx(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold ring-1",
                    on ? "bg-bear-900 text-white ring-bear-900" : "bg-white text-stone-700 ring-stone-300",
                  )}
                >
                  {on ? <Check className="h-4 w-4" /> : null}
                  {emp.name} <span className={on ? "text-stone-400" : "text-stone-400"}>${emp.hourlyCost}/h</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-stone-500">Add workers in Settings → Workers to pick them here.</div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Est. hours per worker">
            <NumInput value={f.estLaborHours} onChange={setAllHours} suffix="hrs" />
          </Field>
          {f.labor.length === 0 ? (
            <Field label="Number of workers">
              <NumInput value={f.workersCount} decimals={false} onChange={(n) => set("workersCount", Math.max(0, Math.min(20, n ?? 0)))} />
            </Field>
          ) : (
            <Field label="Workers">
              <div className="input flex items-center font-semibold">{f.labor.length}</div>
            </Field>
          )}
        </div>
        {f.labor.length > 1 ? (
          <div className="space-y-2">
            {f.labor.map((l) => (
              <div key={l.employeeId} className="flex items-center gap-3">
                <div className="flex-1 text-sm font-semibold">{empById.get(l.employeeId)?.name ?? "Worker"}</div>
                <NumInput
                  className="w-32"
                  value={l.estHours}
                  suffix="hrs"
                  onChange={(n) => setF((p) => ({ ...p, labor: p.labor.map((x) => (x.employeeId === l.employeeId ? { ...x, estHours: n } : x)) }))}
                  ariaLabel={`Hours for ${empById.get(l.employeeId)?.name}`}
                />
              </div>
            ))}
          </div>
        ) : null}
        <div className="text-sm text-stone-600">
          Estimated labor: <b className="tabular">{money(est.labor, st.currency)}</b>
          {f.labor.length === 0 ? <span className="text-stone-400"> (at default ${st.defaultLaborRate}/h)</span> : null}
        </div>
      </Section>

      {/* DUMP */}
      <Section title="Dump Estimate">
        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <Field label="Dump facility">
            <Select
              value={f.dumpFacilityId}
              onChange={(v) => chooseDump(v)}
              placeholder="None"
              options={options.dumpFacilities.map((d) => ({ value: d.id, label: d.name }))}
            />
          </Field>
          <Field label="Est. dump fee">
            <NumInput
              value={f.estDumpCost}
              onChange={(n) => {
                dumpTouched.current = true;
                set("estDumpCost", n);
              }}
              prefix="$"
            />
          </Field>
        </div>
        <div className="text-xs text-stone-500">Actual dump receipts (multiple loads allowed) are entered when you complete the job.</div>
      </Section>

      {/* OTHER COSTS */}
      <Section title="Other Job Costs">
        {f.expenses.map((x, i) => (
          <div key={i} className="space-y-2 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
            <div className="flex gap-2">
              <div className="flex-1">
                <Select
                  value={x.category}
                  onChange={(v) => v && setF((p) => ({ ...p, expenses: p.expenses.map((y, j) => (j === i ? { ...y, category: v } : y)) }))}
                  options={JOB_EXPENSE_CATEGORIES.map((c) => ({ value: c, label: JOB_EXPENSE_CATEGORY_LABEL[c] }))}
                  ariaLabel="Category"
                />
              </div>
              <button
                type="button"
                aria-label="Remove cost"
                className="btn-ghost text-red-600"
                onClick={() => setF((p) => ({ ...p, expenses: p.expenses.filter((_, j) => j !== i) }))}
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-[1fr_8rem] gap-2">
              <input
                className="input"
                placeholder="Description"
                value={x.description}
                onChange={(ev) => setF((p) => ({ ...p, expenses: p.expenses.map((y, j) => (j === i ? { ...y, description: ev.target.value } : y)) }))}
              />
              <NumInput
                value={x.amount}
                prefix="$"
                onChange={(n) => setF((p) => ({ ...p, expenses: p.expenses.map((y, j) => (j === i ? { ...y, amount: n } : y)) }))}
                ariaLabel="Amount"
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() =>
            setF((p) => ({ ...p, expenses: [...p.expenses, { id: null, category: "OTHER", description: "", amount: null }] }))
          }
        >
          <Plus className="h-5 w-5" /> Add cost (tolls, parking, rental…)
        </button>
      </Section>

      </>
      ) : null}

      <Section title="Notes">
        <textarea
          className="input min-h-28"
          placeholder="Gate code, items, stairs, special instructions…"
          value={f.notes}
          onChange={(ev) => set("notes", ev.target.value)}
        />
      </Section>

      {/* ESTIMATE */}
      {!isLead || (f.quotedPrice ?? 0) > 0 ? (
      <Section title="Estimated Profit">
        <ProfitHero b={est} currency={st.currency} label="Estimated Profit" />
        <CostLines b={est} currency={st.currency} />
      </Section>
      ) : null}

      {/* Sticky save bar (sits above the bottom nav on phones) */}
      <div
        className="fixed inset-x-0 z-30 border-t border-stone-200 bg-white/95 backdrop-blur lg:left-64"
        style={{ bottom: "calc(var(--nav-h) + var(--safe-bottom))" }}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5 lg:max-w-5xl lg:px-8">
          {isLead && !(f.quotedPrice ?? 0) ? (
            <div className="w-24 shrink-0 text-xs leading-tight text-stone-500">Add an estimate to see profit</div>
          ) : (
          <div className="shrink-0">
            <div className="text-[10px] font-bold tracking-wide text-stone-500 uppercase">Est. profit</div>
            <div className={cx("tabular text-lg leading-tight font-black", est.profit >= 0 ? "text-emerald-700" : "text-red-600")}>
              {money(est.profit, st.currency)}
            </div>
            <div className="tabular text-[11px] text-stone-500">{pct(est.margin)} margin</div>
          </div>
          )}
          <button type="submit" disabled={pending} className="btn-primary btn-xl flex-1 text-base">
            {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {pending ? "Saving…" : isEdit ? "SAVE CHANGES" : isLead ? "SAVE LEAD" : "SAVE & SCHEDULE JOB"}
          </button>
        </div>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-3 p-4">
      <h2 className="text-xs font-bold tracking-wider text-stone-500 uppercase">{title}</h2>
      {children}
    </section>
  );
}

