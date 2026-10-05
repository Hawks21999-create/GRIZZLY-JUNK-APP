import Link from "@/components/Link";
import { ChevronRight } from "lucide-react";
import type { JobStatus } from "@/db/schema";
import { LEAD_STATUS_LABEL, STATUS_LABEL, STATUS_STYLE, leadStatusOf, type LeadStatus } from "@/lib/constants";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("card", className)}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between">
      <h2 className="section-title">{children}</h2>
      {action ? <div className="pb-2">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        {back ? (
          <Link href={back} className="-ml-1 mb-1 inline-flex min-h-9 items-center text-sm font-semibold text-brand-700">
            ‹ Back
          </Link>
        ) : null}
        <h1 className="truncate text-2xl font-extrabold tracking-tight text-stone-900">{title}</h1>
        {subtitle ? <div className="mt-0.5 text-sm text-stone-500">{subtitle}</div> : null}
      </div>
      {action ? <div className="shrink-0 pt-1">{action}</div> : null}
    </div>
  );
}

export function StatusChip({ status, size = "sm" }: { status: JobStatus; size?: "sm" | "md" }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap ring-1 ring-inset",
        s.chip,
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
      )}
    >
      <span aria-hidden="true" className="text-[0.85em] no-underline">
        {s.icon}
      </span>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "default",
  big = false,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "profit" | "loss" | "muted";
  big?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] font-bold tracking-wide text-stone-500 uppercase">{label}</div>
      <div
        className={cx(
          "tabular truncate font-extrabold tracking-tight",
          big ? "text-3xl" : "text-xl",
          tone === "profit" && "text-emerald-700",
          tone === "loss" && "text-red-600",
          tone === "muted" && "text-stone-500",
          tone === "default" && "text-stone-900",
        )}
      >
        {value}
      </div>
      {sub ? <div className="truncate text-xs text-stone-500">{sub}</div> : null}
    </div>
  );
}

export function profitTone(n: number | null | undefined): "profit" | "loss" | "muted" {
  if (n === null || n === undefined) return "muted";
  return n >= 0 ? "profit" : "loss";
}

export function Row({
  label,
  value,
  strong,
  tone,
  hint,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  strong?: boolean;
  tone?: "profit" | "loss" | "muted";
  hint?: React.ReactNode;
}) {
  return (
    <div className={cx("flex items-baseline justify-between gap-3 py-1.5", strong && "font-bold")}>
      <div className="min-w-0 text-stone-600">
        {label}
        {hint ? <div className="text-xs font-normal text-stone-400">{hint}</div> : null}
      </div>
      <div
        className={cx(
          "tabular shrink-0 text-right",
          strong ? "text-stone-900" : "text-stone-800",
          tone === "profit" && "text-emerald-700",
          tone === "loss" && "text-red-600",
          tone === "muted" && "text-stone-400",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function ListLink({ href, children, right }: { href: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Link href={href} className="flex min-h-14 items-center gap-3 px-4 py-3 active:bg-stone-50">
      <div className="min-w-0 flex-1">{children}</div>
      {right}
      <ChevronRight className="h-5 w-5 shrink-0 text-stone-300" />
    </Link>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card px-5 py-10 text-center">
      <div className="font-semibold text-stone-700">{title}</div>
      {children ? <div className="mt-1 text-sm text-stone-500">{children}</div> : null}
    </div>
  );
}

export function Bar({ value, max, tone = "brand" }: { value: number; max: number; tone?: "brand" | "profit" | "loss" }) {
  const pctW = max > 0 ? Math.max(0, Math.min(100, (Math.abs(value) / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100">
      <div
        className={cx(
          "h-full rounded-full",
          tone === "brand" && "bg-brand-500",
          tone === "profit" && "bg-emerald-600",
          tone === "loss" && "bg-red-500",
        )}
        style={{ width: `${pctW}%` }}
      />
    </div>
  );
}

export const LEAD_STATUS_STYLE: Record<LeadStatus, string> = {
  NEW: "bg-sky-100 text-sky-900 ring-sky-300",
  CONTACTED: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  ESTIMATE_SCHEDULED: "bg-violet-100 text-violet-900 ring-violet-300",
  QUOTE_SENT: "bg-amber-50 text-amber-900 ring-amber-200",
  BOOKED: "bg-brand-100 text-brand-800 ring-brand-300",
  LOST: "bg-red-50 text-red-700 ring-red-200",
  COMPLETED: "bg-bear-900 text-brand-400 ring-bear-900",
};

export function LeadStatusChip({ status }: { status: JobStatus }) {
  const ls = leadStatusOf(status);
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ring-1 ring-inset", LEAD_STATUS_STYLE[ls])}>
      {LEAD_STATUS_LABEL[ls]}
    </span>
  );
}
