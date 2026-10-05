"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Info, Loader2, Trash2 } from "lucide-react";
import { deleteExpense, saveExpense } from "@/app/actions/expenses";
import type { ExpenseCategory } from "@/db/schema";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL, JOB_COVERED_CATEGORIES } from "@/lib/constants";
import { ErrorBanner, Field, NumInput, Select, Toggle } from "./form";
import { uploadFile, type AttachmentLite } from "./JobActions";

export type ExpenseValues = {
  date: string;
  vendor: string;
  category: ExpenseCategory;
  description: string;
  amount: number | null;
  leadSourceId: string | null;
  coveredByJobCosts: boolean;
};

export function ExpenseForm({
  id,
  initial,
  leadSources,
  attachments = [],
}: {
  id: string | null;
  initial: ExpenseValues;
  leadSources: { id: string; name: string }[];
  attachments?: AttachmentLite[];
}) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [touchedCovered, setTouchedCovered] = useState(Boolean(id));
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof ExpenseValues>(k: K, v: ExpenseValues[K]) => setF((p) => ({ ...p, [k]: v }));

  return (
    <form
      className="card space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        start(async () => {
          const r = await saveExpense(id, { ...f, amount: f.amount ?? 0, vendor: f.vendor || null, description: f.description || null });
          if (!r.ok) {
            setErr(r.error);
            setFe(r.fieldErrors ?? {});
            return;
          }
          if (file) {
            const m = await uploadFile(file, { businessExpenseId: r.data.id });
            if (m) return setErr(`Saved, but the receipt failed: ${m}`);
          }
          window.location.assign("/expenses");
        });
      }}
    >
      <ErrorBanner error={err} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" error={fe.date}>
          <input type="date" className="input" value={f.date} onChange={(e) => set("date", e.target.value)} />
        </Field>
        <Field label="Amount" error={fe.amount}>
          <NumInput value={f.amount} onChange={(n) => set("amount", n)} prefix="$" />
        </Field>
      </div>
      <Field label="Category">
        <Select
          value={f.category}
          onChange={(v) => {
            if (!v) return;
            setF((p) => ({ ...p, category: v, coveredByJobCosts: touchedCovered ? p.coveredByJobCosts : JOB_COVERED_CATEGORIES.includes(v) }));
          }}
          options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABEL[c] }))}
        />
      </Field>
      {f.category === "ADVERTISING" ? (
        <Field label="Lead source this ad spend belongs to" hint="Used for cost per lead, cost per booked job and ROAS on the Marketing page.">
          <Select value={f.leadSourceId} onChange={(v) => set("leadSourceId", v || null)} placeholder="Not attributed" options={leadSources.map((l) => ({ value: l.id, label: l.name }))} />
        </Field>
      ) : null}
      <Field label="Vendor">
        <input className="input" value={f.vendor} onChange={(e) => set("vendor", e.target.value)} placeholder="e.g. QuikTrip, Google, Home Depot" />
      </Field>
      <Field label="Description">
        <input className="input" value={f.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      {f.category !== "ADVERTISING" ? (
        <div className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
          <Toggle
            checked={f.coveredByJobCosts}
            onChange={(v) => {
              setTouchedCovered(true);
              set("coveredByJobCosts", v);
            }}
            label="Already counted in job costs"
            hint="Turn on for fuel fill-ups, landfill invoices, payroll and routine maintenance — jobs already charge for these through mileage, dump receipts and labor. It's then kept for records but not subtracted twice."
          />
        </div>
      ) : (
        <div className="flex gap-2 rounded-xl bg-blue-50 p-3 text-xs text-blue-900">
          <Info className="h-4 w-4 shrink-0" /> Advertising is counted once as marketing spend. Per-job lead fees belong on the job (Lead cost) instead.
        </div>
      )}

      {attachments.length ? (
        <div className="grid grid-cols-3 gap-2">
          {attachments.map((a) => (
            <a key={a.id} href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-xl bg-stone-100 ring-1 ring-stone-200">
              {a.mimeType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/attachments/${a.id}`} alt={a.fileName} className="h-full w-full object-cover" />
              ) : (
                <div className="p-2 text-xs">{a.fileName}</div>
              )}
            </a>
          ))}
        </div>
      ) : null}
      <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <button type="button" className="btn-secondary w-full" onClick={() => fileRef.current?.click()}>
        <Camera className="h-5 w-5" /> {file ? file.name : "Attach receipt"}
      </button>

      <button className="btn-primary btn-xl w-full" disabled={pending}>
        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null} Save expense
      </button>
      {id ? (
        <button
          type="button"
          className="btn-ghost w-full text-red-600"
          onClick={() =>
            confirm("Delete this expense?") &&
            start(async () => {
              const r = await deleteExpense(id);
              if (!r.ok) return setErr(r.error);
              window.location.assign("/expenses");
            })
          }
        >
          <Trash2 className="h-5 w-5" /> Delete
        </button>
      ) : null}
    </form>
  );
}
