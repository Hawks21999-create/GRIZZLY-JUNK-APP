"use client";

import { useState, useTransition } from "react";
import Link from "@/components/Link";
import { CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { completeJob } from "@/app/actions/jobs";
import type { JobExpenseCategory, PaymentMethod } from "@/db/schema";
import { computeActual, type CostBreakdown, type JobForCalc } from "@/lib/calc";
import { JOB_EXPENSE_CATEGORIES, JOB_EXPENSE_CATEGORY_LABEL, PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { money, pct } from "@/lib/format";
import { CostLines } from "./FinancialSummary";
import { ErrorBanner, Field, NumInput, Segmented, Select } from "./form";
import { cx } from "./ui";

type DumpRow = { id: string | null; facilityId: string | null; fee: number | null; weightLbs: number | null; loads: number | null };
type LaborRow = { employeeId: string; name: string; hourlyRate: number; hours: number | null };
type ExpRow = { id: string | null; category: JobExpenseCategory; description: string; amount: number | null };

export type CompleteInitial = {
  jobId: string;
  jobNumber: string;
  customerName: string;
  finalPrice: number;
  actualMiles: number;
  dump: DumpRow[];
  labor: LaborRow[];
  expenses: ExpRow[];
  paymentMethod: PaymentMethod | null;
  paid: boolean;
  calcBase: JobForCalc;
  estimatedProfit: number;
  defaultLaborRate: number;
  includeWear: boolean;
  fuelPrice: number;
};

export function CompleteJobForm({
  init,
  facilities,
  employees,
  currency,
}: {
  init: CompleteInitial;
  facilities: { id: string; name: string; defaultFee: number }[];
  employees: { id: string; name: string; hourlyCost: number }[];
  currency: string;
}) {
  const [finalPrice, setFinalPrice] = useState<number | null>(init.finalPrice);
  const [actualMiles, setActualMiles] = useState<number | null>(init.actualMiles);
  const [dump, setDump] = useState<DumpRow[]>(init.dump);
  const [labor, setLabor] = useState<LaborRow[]>(init.labor);
  const [expenses, setExpenses] = useState<ExpRow[]>(init.expenses);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(init.paymentMethod);
  const [paid, setPaid] = useState(init.paid);
  const [fuelPrice, setFuelPrice] = useState<number | null>(init.fuelPrice);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CostBreakdown | null>(null);
  const [pending, start] = useTransition();

  const preview = computeActual(
    {
      ...init.calcBase,
      fuelPrice: fuelPrice ?? init.fuelPrice,
      status: "COMPLETED",
      finalPrice: finalPrice ?? 0,
      actualMiles: actualMiles ?? 0,
      dumpRecords: dump.map((d) => ({ fee: d.fee ?? 0 })),
      labor: labor.map((l) => ({ employeeName: l.name, hourlyRate: l.hourlyRate, estHours: l.hours ?? 0, actualHours: l.hours ?? 0 })),
      expenses: expenses.map((e) => ({ amount: e.amount ?? 0 })),
    },
    { laborRate: init.defaultLaborRate, includeWear: init.includeWear },
  );

  function submit() {
    setError(null);
    start(async () => {
      const r = await completeJob({
        jobId: init.jobId,
        finalPrice: finalPrice ?? 0,
        actualMiles,
        dumpRecords: dump.map((d) => ({
          facilityId: d.facilityId,
          facilityName: facilities.find((f) => f.id === d.facilityId)?.name ?? null,
          fee: d.fee ?? 0,
          weightLbs: d.weightLbs,
          loads: d.loads ?? 1,
        })),
        dumpRecordIds: dump.map((d) => d.id),
        labor: labor.map((l) => ({ employeeId: l.employeeId, actualHours: l.hours ?? 0 })),
        expenses: expenses.map((e) => ({ category: e.category, description: e.description || JOB_EXPENSE_CATEGORY_LABEL[e.category], amount: e.amount ?? 0 })),
        expenseIds: expenses.map((e) => e.id),
        paymentMethod,
        paid,
        fuelPrice,
      });
      if (!r.ok) {
        setError(r.error);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setResult(r.data.actual ?? r.data.best);
      window.scrollTo({ top: 0 });
    });
  }

  if (result) {
    return (
      <div className="space-y-4">
        <div className="card overflow-hidden text-center">
          <div className="bg-emerald-700 px-4 py-6 text-white">
            <CheckCircle2 className="mx-auto h-14 w-14" />
            <div className="mt-2 text-2xl font-black tracking-wide">JOB COMPLETE</div>
            <div className="text-sm text-white/80">
              {init.jobNumber} · {init.customerName}
            </div>
          </div>
          <div className="space-y-3 p-5">
            <BigLine label="Revenue" value={money(result.price, currency)} />
            <BigLine label="Total Cost" value={money(result.totalCost, currency)} />
            <div className="rounded-2xl bg-emerald-50 py-3 ring-1 ring-emerald-200">
              <div className="text-xs font-bold tracking-wider text-emerald-800 uppercase">Profit</div>
              <div className={cx("tabular text-5xl font-black", result.profit >= 0 ? "text-emerald-700" : "text-red-600")}>
                {money(result.profit, currency)}
              </div>
            </div>
            <BigLine label="Margin" value={pct(result.margin)} />
            <div className="text-sm text-stone-500">
              Estimated profit was {money(init.estimatedProfit, currency)} ({result.profit - init.estimatedProfit >= 0 ? "+" : "−"}
              {money(Math.abs(Math.round((result.profit - init.estimatedProfit) * 100) / 100), currency)})
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/jobs/${init.jobId}`} className="btn-secondary btn-xl">
            View job
          </Link>
          <Link href="/" className="btn-dark btn-xl">
            Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-4 pb-28"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <ErrorBanner error={error} />
      <Card title="Final customer price">
        <NumInput value={finalPrice} onChange={setFinalPrice} prefix="$" ariaLabel="Final customer price" />
      </Card>

      <Card title="Actual mileage &amp; fuel">
        <NumInput value={actualMiles} onChange={setActualMiles} suffix="miles" ariaLabel="Actual mileage" />
        <div className="text-xs text-stone-500">Pre-filled from the planned route. Use your odometer if it was different.</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Diesel price">
            <NumInput value={fuelPrice} onChange={setFuelPrice} prefix="$" suffix="/gal" ariaLabel="Diesel price" />
          </Field>
          <div className="rounded-xl bg-stone-50 px-3 py-2 ring-1 ring-stone-200">
            <div className="text-[11px] font-bold text-stone-500 uppercase">Fuel</div>
            <div className="tabular text-sm">
              {preview.fuelGallons.toFixed(2)} gal @ {init.calcBase.mpg} mpg
            </div>
            <div className="tabular font-extrabold">{money(preview.fuel, currency)}</div>
          </div>
        </div>
      </Card>

      <Card title="Dump fees">
        {dump.map((d, i) => (
          <div key={i} className="space-y-2 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold">Dump #{i + 1}</div>
              <button type="button" aria-label="Remove dump" className="p-1.5 text-red-500" onClick={() => setDump(dump.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {facilities.length ? (
              <Select
                value={d.facilityId}
                onChange={(v) => setDump(dump.map((x, j) => (j === i ? { ...x, facilityId: v || null } : x)))}
                placeholder="Other facility"
                options={facilities.map((f) => ({ value: f.id, label: f.name }))}
                ariaLabel="Facility"
              />
            ) : null}
            <div className="grid grid-cols-[1.3fr_1fr_4.5rem] gap-2">
              <NumInput value={d.fee} prefix="$" placeholder="Fee" ariaLabel="Dump fee" onChange={(n) => setDump(dump.map((x, j) => (j === i ? { ...x, fee: n } : x)))} />
              <NumInput value={d.weightLbs} suffix="lbs" placeholder="Wt" ariaLabel="Weight" onChange={(n) => setDump(dump.map((x, j) => (j === i ? { ...x, weightLbs: n } : x)))} />
              <NumInput value={d.loads} decimals={false} placeholder="1" ariaLabel="Loads" onChange={(n) => setDump(dump.map((x, j) => (j === i ? { ...x, loads: n } : x)))} />
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() => setDump([...dump, { id: null, facilityId: dump[dump.length - 1]?.facilityId ?? facilities[0]?.id ?? null, fee: null, weightLbs: null, loads: 1 }])}
        >
          <Plus className="h-5 w-5" /> Add another dump
        </button>
        <div className="flex justify-between px-1 text-sm font-bold">
          <span>Total dump cost</span>
          <span className="tabular">{money(preview.dump, currency)}</span>
        </div>
        <div className="text-xs text-stone-500">Receipt photos can be attached on the job page.</div>
      </Card>

      <Card title="Actual labor hours">
        {labor.map((l, i) => (
          <div key={l.employeeId} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{l.name}</div>
              <div className="text-xs text-stone-500">{money(l.hourlyRate, currency)}/h</div>
            </div>
            <NumInput className="w-28" value={l.hours} suffix="hrs" ariaLabel={`Hours for ${l.name}`} onChange={(n) => setLabor(labor.map((x, j) => (j === i ? { ...x, hours: n } : x)))} />
            <button type="button" aria-label="Remove worker" className="p-1.5 text-red-500" onClick={() => setLabor(labor.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {employees.filter((e) => !labor.some((l) => l.employeeId === e.id)).length ? (
          <div className="flex flex-wrap gap-2">
            {employees
              .filter((e) => !labor.some((l) => l.employeeId === e.id))
              .map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-white px-3 text-sm font-semibold ring-1 ring-stone-300"
                  onClick={() => setLabor([...labor, { employeeId: e.id, name: e.name, hourlyRate: e.hourlyCost, hours: labor[0]?.hours ?? null }])}
                >
                  <Plus className="h-4 w-4" /> {e.name}
                </button>
              ))}
          </div>
        ) : null}
        <div className="flex justify-between px-1 text-sm font-bold">
          <span>Labor cost</span>
          <span className="tabular">{money(preview.labor, currency)}</span>
        </div>
      </Card>

      <Card title="Additional expenses">
        {expenses.map((x, i) => (
          <div key={i} className="space-y-2 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
            <div className="flex gap-2">
              <div className="flex-1">
                <Select
                  value={x.category}
                  onChange={(v) => v && setExpenses(expenses.map((y, j) => (j === i ? { ...y, category: v } : y)))}
                  options={JOB_EXPENSE_CATEGORIES.map((c) => ({ value: c, label: JOB_EXPENSE_CATEGORY_LABEL[c] }))}
                  ariaLabel="Category"
                />
              </div>
              <button type="button" aria-label="Remove expense" className="p-2 text-red-500" onClick={() => setExpenses(expenses.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-[1fr_7.5rem] gap-2">
              <input className="input" placeholder="Description" value={x.description} onChange={(e) => setExpenses(expenses.map((y, j) => (j === i ? { ...y, description: e.target.value } : y)))} />
              <NumInput value={x.amount} prefix="$" ariaLabel="Amount" onChange={(n) => setExpenses(expenses.map((y, j) => (j === i ? { ...y, amount: n } : y)))} />
            </div>
          </div>
        ))}
        <button type="button" className="btn-secondary w-full" onClick={() => setExpenses([...expenses, { id: null, category: "OTHER", description: "", amount: null }])}>
          <Plus className="h-5 w-5" /> Add expense
        </button>
      </Card>

      <Card title="Payment">
        <Field label="Payment method">
          <Segmented value={paymentMethod} onChange={(v) => setPaymentMethod(v)} options={PAYMENT_METHODS.map((p) => ({ value: p, label: PAYMENT_METHOD_LABEL[p] }))} />
        </Field>
        <Field label="Paid?">
          <Segmented value={paid ? "yes" : "no"} onChange={(v) => setPaid(v === "yes")} options={[{ value: "yes", label: "Yes — paid in full" }, { value: "no", label: "No" }]} />
        </Field>
      </Card>

      <Card title="Actual profit preview">
        <CostLines b={preview} currency={currency} />
      </Card>

      <div className="fixed inset-x-0 z-30 border-t border-stone-200 bg-white/95 backdrop-blur lg:left-64" style={{ bottom: "calc(var(--nav-h) + var(--safe-bottom))" }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5 lg:max-w-5xl lg:px-8">
          <div className="shrink-0">
            <div className="text-[10px] font-bold tracking-wide text-stone-500 uppercase">Profit</div>
            <div className={cx("tabular text-lg leading-tight font-black", preview.profit >= 0 ? "text-emerald-700" : "text-red-600")}>{money(preview.profit, currency)}</div>
            <div className="tabular text-[11px] text-stone-500">{pct(preview.margin)} margin</div>
          </div>
          <button type="submit" className="btn btn-xl flex-1 bg-brand-500 text-bear-950 hover:bg-brand-400" disabled={pending}>
            {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            {pending ? "Saving…" : "COMPLETE JOB"}
          </button>
        </div>
      </div>
    </form>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-3 p-4">
      <h2 className="text-xs font-bold tracking-wider text-stone-500 uppercase">{title}</h2>
      {children}
    </section>
  );
}

function BigLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between px-2">
      <span className="text-stone-600">{label}</span>
      <span className="tabular text-2xl font-extrabold">{value}</span>
    </div>
  );
}
