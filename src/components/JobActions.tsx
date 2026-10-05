"use client";

import { useEffect, useRef, useState } from "react";
import { useAction } from "./useAction";
import Link from "@/components/Link";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, FileText, Loader2, Play, Plus, RefreshCw, Trash2, Truck } from "lucide-react";
import {
  addDumpRecord,
  addJobExpense,
  deleteDumpRecord,
  deleteJob,
  deleteJobExpense,
  refreshVehicleRates,
  setJobStatus,
} from "@/app/actions/jobs";
import type { JobExpenseCategory, JobStatus } from "@/db/schema";
import {
  JOB_EXPENSE_CATEGORIES,
  JOB_EXPENSE_CATEGORY_LABEL,
  JOB_STATUSES,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_TO_JOB,
  LOST_REASONS,
  STATUS_LABEL,
  STATUS_STYLE,
  leadStatusOf,
  type LeadStatus,
} from "@/lib/constants";
import { money } from "@/lib/format";
import { ErrorBanner, NumInput, Select } from "./form";
import { cx } from "./ui";

// ───────────────────────── Status ─────────────────────────

export function StatusButtons({ jobId, status }: { jobId: string; status: JobStatus }) {
  const router = useRouter();
  const [pending, start] = useAction();
  const [err, setErr] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState<JobStatus | null>(null);
  const [askLost, setAskLost] = useState<JobStatus | null>(null);
  // Optimistic: show the new status as soon as the server confirms it.
  const [local, setLocal] = useState(status);
  useEffect(() => setLocal(status), [status]);

  function go(s: JobStatus) {
    if (s === "COMPLETED") {
      router.push(`/jobs/${jobId}/complete`);
      return;
    }
    if ((s === "NOT_BOOKED" || s === "CANCELLED") && askLost !== s) {
      setAskLost(s);
      return;
    }
    setBusy(s);
    start(async () => {
      const r = await setJobStatus(jobId, s);
      if (!r.ok) setErr(r.error);
      else setLocal(s);
      setBusy(null);
      setShowAll(false);
      // page updates from the server action's revalidation
    });
  }

  const closed = local === "COMPLETED" || local === "CANCELLED" || local === "NOT_BOOKED";
  return (
    <div className="space-y-2">
      <ErrorBanner error={err} />
      {!closed ? (
        <div className="grid grid-cols-3 gap-2">
          <BigBtn
            active={local === "ON_THE_WAY"}
            disabled={pending}
            loading={busy === "ON_THE_WAY"}
            onClick={() => go("ON_THE_WAY")}
            className="bg-amber-500 text-white"
            icon={<Truck className="h-7 w-7" />}
          >
            ON THE WAY
          </BigBtn>
          <BigBtn
            active={local === "IN_PROGRESS"}
            disabled={pending}
            loading={busy === "IN_PROGRESS"}
            onClick={() => go("IN_PROGRESS")}
            className="bg-orange-600 text-white"
            icon={<Play className="h-7 w-7" />}
          >
            START JOB
          </BigBtn>
          <BigBtn disabled={pending} onClick={() => go("COMPLETED")} className="bg-brand-500 text-bear-950" icon={<CheckCircle2 className="h-7 w-7" />}>
            COMPLETE JOB
          </BigBtn>
        </div>
      ) : local === "COMPLETED" ? (
        <Link href={`/jobs/${jobId}/complete`} className="btn-secondary w-full">
          Edit actual costs
        </Link>
      ) : null}
      <button type="button" className="w-full py-2 text-sm font-semibold text-stone-500" onClick={() => setShowAll((v) => !v)}>
        {showAll ? "Hide statuses" : "Change status…"}
      </button>
      {askLost ? (
        <LostReasonPicker
          pending={pending}
          onCancel={() => setAskLost(null)}
          onConfirm={(reason) => {
            const target = askLost;
            setBusy(target);
            start(async () => {
              const r = await setJobStatus(jobId, target, reason);
              if (!r.ok) setErr(r.error);
              else setLocal(target);
              setBusy(null);
              setAskLost(null);
              setShowAll(false);
              // page updates from the server action's revalidation
            });
          }}
        />
      ) : null}
      {showAll ? (
        <div className="grid grid-cols-2 gap-2">
          {JOB_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending || s === local}
              onClick={() => go(s)}
              className={cx(
                "flex min-h-12 items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold ring-1 disabled:opacity-100",
                s === local ? "bg-bear-900 text-white ring-bear-900" : "bg-white text-stone-800 ring-stone-300 active:bg-stone-100",
              )}
            >
              <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full", STATUS_STYLE[s].dot)} />
              {busy === s ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BigBtn({
  children,
  icon,
  onClick,
  className,
  active,
  disabled,
  loading,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
  className: string;
  active?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-2xl px-1 text-[13px] leading-tight font-black shadow-sm active:scale-95 disabled:opacity-60",
        className,
        active && "ring-4 ring-bear-900/80 ring-offset-2",
      )}
    >
      {loading ? <Loader2 className="h-7 w-7 animate-spin" /> : icon}
      {children}
      {active ? <span className="text-[10px] font-bold opacity-80">CURRENT</span> : null}
    </button>
  );
}

// ───────────────────────── Lead actions ─────────────────────────

/** One-tap lead pipeline: status chips, BOOK JOB, and Lost (with reason). */
export function LeadActions({ jobId, status }: { jobId: string; status: JobStatus }) {
  const router = useRouter();
  const [pending, start] = useAction();
  const [err, setErr] = useState<string | null>(null);
  const [askLost, setAskLost] = useState(false);
  const [local, setLocal] = useState(status);
  useEffect(() => setLocal(status), [status]);
  const current = leadStatusOf(local);
  const quick: LeadStatus[] = ["NEW", "CONTACTED", "ESTIMATE_SCHEDULED", "QUOTE_SENT"];

  function set(s: JobStatus, reason?: string | null) {
    start(async () => {
      const r = await setJobStatus(jobId, s, reason);
      if (!r.ok) setErr(r.error);
      else setLocal(s);
      setAskLost(false);
      // page updates from the server action's revalidation
    });
  }

  return (
    <div className="space-y-2">
      <ErrorBanner error={err} />
      <div className="grid grid-cols-2 gap-2">
        {quick.map((ls) => (
          <button
            key={ls}
            type="button"
            disabled={pending}
            onClick={() => set(LEAD_STATUS_TO_JOB[ls])}
            className={cx(
              "min-h-12 rounded-xl px-3 text-sm font-bold ring-1",
              current === ls ? "bg-bear-900 text-brand-400 ring-bear-900" : "bg-white text-stone-800 ring-stone-300 active:bg-stone-100",
            )}
          >
            {current === ls ? "● " : ""}
            {LEAD_STATUS_LABEL[ls]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Link href={`/jobs/${jobId}/edit?book=1`} className="btn-primary btn-xl">
          <CheckCircle2 className="h-6 w-6" /> BOOK JOB
        </Link>
        <button type="button" className="btn-secondary btn-xl text-red-600" onClick={() => setAskLost(true)} disabled={pending}>
          Lost
        </button>
      </div>
      {askLost ? <LostReasonPicker pending={pending} onCancel={() => setAskLost(false)} onConfirm={(r) => set("NOT_BOOKED", r)} /> : null}
    </div>
  );
}

function LostReasonPicker({ onConfirm, onCancel, pending }: { onConfirm: (reason: string | null) => void; onCancel: () => void; pending: boolean }) {
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-2 rounded-xl bg-red-50 p-3 ring-1 ring-red-200">
      <div className="text-sm font-bold text-red-900">Why was this lead lost?</div>
      <div className="flex flex-wrap gap-1.5">
        {LOST_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setReason(r)}
            className={cx("min-h-10 rounded-lg px-3 text-sm font-semibold ring-1", reason === r ? "bg-red-600 text-white ring-red-600" : "bg-white text-stone-700 ring-stone-300")}
          >
            {r}
          </button>
        ))}
      </div>
      <input className="input" placeholder="Other reason (optional)" value={LOST_REASONS.includes(reason) ? "" : reason} onChange={(e) => setReason(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn-danger" disabled={pending} onClick={() => onConfirm(reason.trim() || null)}>
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null} Mark lost
        </button>
      </div>
    </div>
  );
}

// ───────────────────────── Dump receipts ─────────────────────────

type DumpRec = { id: string; facilityName: string | null; fee: number; weightLbs: number | null; loads: number };
type Facility = { id: string; name: string; defaultFee: number };

export function DumpRecordsPanel({
  jobId,
  records,
  facilities,
  defaultFacilityId,
  currency,
}: {
  jobId: string;
  records: DumpRec[];
  facilities: Facility[];
  defaultFacilityId: string | null;
  currency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [facilityId, setFacilityId] = useState(defaultFacilityId ?? facilities[0]?.id ?? "");
  const [fee, setFee] = useState<number | null>(null);
  const [weight, setWeight] = useState<number | null>(null);
  const [loads, setLoads] = useState<number | null>(1);
  const [photo, setPhoto] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useAction();

  function save() {
    setErr(null);
    start(async () => {
      const fac = facilities.find((f) => f.id === facilityId);
      const r = await addDumpRecord({
        jobId,
        facilityId: facilityId || null,
        facilityName: fac?.name ?? null,
        fee: fee ?? 0,
        weightLbs: weight,
        loads: loads ?? 1,
        notes: null,
      });
      if (!r.ok) return setErr(r.error);
      if (photo) {
        const up = await uploadFile(photo, { jobId, dumpRecordId: r.data.id });
        if (up) setErr(up);
      }
      setOpen(false);
      setFee(null);
      setWeight(null);
      setPhoto(null);
      if (photo) router.refresh(); // uploads go through a route handler
    });
  }

  const total = records.reduce((a, r) => a + r.fee, 0);
  return (
    <div className="space-y-2">
      {records.map((r, i) => (
        <div key={r.id} className="flex items-center gap-3 rounded-xl bg-stone-50 px-3 py-2.5 ring-1 ring-stone-200">
          <div className="min-w-0 flex-1">
            <div className="font-semibold">
              Dump #{i + 1} {r.facilityName ? <span className="font-normal text-stone-500">· {r.facilityName}</span> : null}
            </div>
            <div className="text-xs text-stone-500">
              {r.loads} load{r.loads === 1 ? "" : "s"}
              {r.weightLbs ? ` · ${r.weightLbs.toLocaleString()} lbs` : ""}
            </div>
          </div>
          <div className="tabular font-bold">{money(r.fee, currency)}</div>
          <ConfirmDelete
            onConfirm={async () => {
              const res = await deleteDumpRecord(jobId, r.id);
              if (!res.ok) setErr(res.error);
              // page updates from the server action's revalidation
            }}
          />
        </div>
      ))}
      {records.length > 1 ? (
        <div className="flex justify-between px-1 font-bold">
          <span>Total dump cost</span>
          <span className="tabular">{money(total, currency)}</span>
        </div>
      ) : null}
      <ErrorBanner error={err} />
      {open ? (
        <div className="space-y-3 rounded-xl bg-white p-3 ring-1 ring-stone-300">
          {facilities.length ? (
            <Select
              value={facilityId}
              onChange={(v) => setFacilityId(v)}
              placeholder="Other facility"
              options={facilities.map((f) => ({ value: f.id, label: f.name }))}
              ariaLabel="Facility"
            />
          ) : null}
          <div className="grid grid-cols-3 gap-2">
            <NumInput value={fee} onChange={setFee} prefix="$" placeholder="Fee" ariaLabel="Dump fee" />
            <NumInput value={weight} onChange={setWeight} suffix="lbs" placeholder="Weight" ariaLabel="Weight" />
            <NumInput value={loads} onChange={setLoads} decimals={false} suffix="loads" ariaLabel="Loads" />
          </div>
          <PhotoPicker file={photo} onFile={setPhoto} label="Attach receipt photo" />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-dark" onClick={save} disabled={pending || fee === null}>
              {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null} Save dump
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn-secondary w-full" onClick={() => setOpen(true)}>
          <Plus className="h-5 w-5" /> Add dump receipt
        </button>
      )}
    </div>
  );
}

// ───────────────────────── Other job costs ─────────────────────────

type Exp = { id: string; category: JobExpenseCategory; description: string; amount: number };

export function JobExpensesPanel({ jobId, expenses, currency }: { jobId: string; expenses: Exp[]; currency: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<JobExpenseCategory>("OTHER");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useAction();

  function save() {
    setErr(null);
    start(async () => {
      const r = await addJobExpense({ jobId, category, description: description || JOB_EXPENSE_CATEGORY_LABEL[category], amount: amount ?? 0 });
      if (!r.ok) return setErr(r.error);
      if (photo) {
        const up = await uploadFile(photo, { jobId, jobExpenseId: r.data.id });
        if (up) setErr(up);
      }
      setOpen(false);
      setDescription("");
      setAmount(null);
      setPhoto(null);
      if (photo) router.refresh(); // uploads go through a route handler
    });
  }

  return (
    <div className="space-y-2">
      {expenses.map((x) => (
        <div key={x.id} className="flex items-center gap-3 rounded-xl bg-stone-50 px-3 py-2.5 ring-1 ring-stone-200">
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{x.description}</div>
            <div className="text-xs text-stone-500">{JOB_EXPENSE_CATEGORY_LABEL[x.category]}</div>
          </div>
          <div className="tabular font-bold">{money(x.amount, currency)}</div>
          <ConfirmDelete
            onConfirm={async () => {
              await deleteJobExpense(jobId, x.id);
              // page updates from the server action's revalidation
            }}
          />
        </div>
      ))}
      <ErrorBanner error={err} />
      {open ? (
        <div className="space-y-3 rounded-xl bg-white p-3 ring-1 ring-stone-300">
          <Select
            value={category}
            onChange={(v) => v && setCategory(v)}
            options={JOB_EXPENSE_CATEGORIES.map((c) => ({ value: c, label: JOB_EXPENSE_CATEGORY_LABEL[c] }))}
            ariaLabel="Category"
          />
          <div className="grid grid-cols-[1fr_8rem] gap-2">
            <input className="input" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <NumInput value={amount} onChange={setAmount} prefix="$" ariaLabel="Amount" />
          </div>
          <PhotoPicker file={photo} onFile={setPhoto} label="Attach receipt photo" />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-dark" onClick={save} disabled={pending || amount === null}>
              {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null} Save cost
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn-secondary w-full" onClick={() => setOpen(true)}>
          <Plus className="h-5 w-5" /> Add other cost
        </button>
      )}
    </div>
  );
}

// ───────────────────────── Attachments ─────────────────────────

export type AttachmentLite = { id: string; fileName: string; mimeType: string };

export function AttachmentsPanel({ jobId, items }: { jobId: string; items: AttachmentLite[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-3">
      {items.length ? (
        <div className="grid grid-cols-3 gap-2">
          {items.map((a) => (
            <div key={a.id} className="relative">
              <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-xl bg-stone-100 ring-1 ring-stone-200">
                {a.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/attachments/${a.id}`} alt={a.fileName} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center p-2 text-center text-xs text-stone-600">
                    <FileText className="mb-1 h-8 w-8" />
                    {a.fileName}
                  </div>
                )}
              </a>
              <button
                type="button"
                aria-label="Delete photo"
                className="absolute top-1 right-1 rounded-full bg-white/90 p-1.5 text-red-600 shadow"
                onClick={async () => {
                  if (!confirm("Delete this file?")) return;
                  await fetch(`/api/attachments/${a.id}`, { method: "DELETE" });
                  router.refresh();
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-stone-500">No receipts or photos yet.</div>
      )}
      <ErrorBanner error={err} />
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        multiple
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (!files.length) return;
          setBusy(true);
          setErr(null);
          for (const f of files) {
            const m = await uploadFile(f, { jobId });
            if (m) setErr(m);
          }
          setBusy(false);
          router.refresh();
        }}
      />
      <button type="button" className="btn-secondary w-full" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
        {busy ? "Uploading…" : "Add receipt / photo"}
      </button>
    </div>
  );
}

function PhotoPicker({ file, onFile, label }: { file: File | null; onFile: (f: File | null) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input ref={ref} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      <button type="button" className="btn-ghost w-full ring-1 ring-stone-200" onClick={() => ref.current?.click()}>
        <Camera className="h-5 w-5" /> {file ? file.name : label}
      </button>
    </div>
  );
}

/**
 * Upload a receipt. Photos are downscaled to ≤1600px JPEG in the browser
 * (iPhone HEIC photos included) to keep the database small.
 * Returns an error message or null.
 */
export async function uploadFile(file: File, link: Record<string, string>): Promise<string | null> {
  let blob: Blob = file;
  let name = file.name || "receipt.jpg";
  if (file.type.startsWith("image/")) {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", 0.82));
      name = name.replace(/\.(heic|heif|png|webp|jpeg)$/i, "") + (name.toLowerCase().endsWith(".jpg") ? "" : ".jpg");
    } catch {
      /* fall back to the original file */
    }
  }
  const fd = new FormData();
  fd.append("file", new File([blob], name, { type: blob.type || file.type }));
  for (const [k, v] of Object.entries(link)) fd.append(k, v);
  const r = await fetch("/api/attachments", { method: "POST", body: fd });
  if (!r.ok) return (await r.json().catch(() => ({}))).error ?? "Upload failed";
  return null;
}

// ───────────────────────── Misc ─────────────────────────

function ConfirmDelete({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [pending, start] = useAction();
  return (
    <button
      type="button"
      aria-label="Delete"
      disabled={pending}
      className="rounded-lg p-2 text-red-500 active:bg-red-50"
      onClick={() => confirm("Delete this item?") && start(onConfirm)}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </button>
  );
}

export function DeleteJobButton({ jobId, label }: { jobId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useAction();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <ErrorBanner error={err} />
      <button
        type="button"
        className="btn-ghost w-full text-red-600"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Permanently delete ${label}? This removes its costs, receipts and calendar event. To keep history, set the status to Cancelled instead.`)) return;
          start(async () => {
            const r = await deleteJob(jobId);
            if (!r.ok) return setErr(r.error);
            window.location.assign("/jobs");
          });
        }}
      >
        <Trash2 className="h-5 w-5" /> Delete job
      </button>
    </div>
  );
}

export function RefreshRatesButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, start] = useAction();
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await refreshVehicleRates(jobId);
          // page updates from the server action's revalidation
        })
      }
    >
      <RefreshCw className={cx("h-3.5 w-3.5", pending && "animate-spin")} /> Use current vehicle rates
    </button>
  );
}
