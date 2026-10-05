import Link from "@/components/Link";
import type { JobStatus } from "@/db/schema";
import { STATUS_STYLE } from "@/lib/constants";
import { money0 } from "@/lib/format";
import { fmtDate, fmtTime } from "@/lib/tz";
import { StatusChip, cx } from "./ui";

export type JobCardData = {
  id: string;
  jobNumber: string;
  status: JobStatus;
  customerName: string;
  address: string;
  city: string | null;
  scheduledStart: Date | null;
  price: number;
  profit: number;
  profitIsActual: boolean;
};

export function JobCard({
  j,
  tz,
  currency,
  showDate = false,
}: {
  j: JobCardData;
  tz: string;
  currency: string;
  showDate?: boolean;
}) {
  return (
    <Link
      href={`/jobs/${j.id}`}
      className={cx(
        "card flex items-stretch gap-3 border-l-4 p-3.5 active:bg-stone-50",
        STATUS_STYLE[j.status].bar,
        j.status === "CANCELLED" || j.status === "NOT_BOOKED" ? "opacity-60" : "",
      )}
    >
      <div className="w-[78px] shrink-0">
        <div className="tabular text-[15px] leading-tight font-extrabold whitespace-nowrap text-stone-900">{fmtTime(j.scheduledStart, tz)}</div>
        {showDate ? <div className="text-xs font-medium text-stone-500">{fmtDate(j.scheduledStart, tz)}</div> : null}
        <div className="mt-0.5 text-[11px] text-stone-400">{j.jobNumber}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold text-stone-900">{j.customerName}</div>
        <div className="truncate text-sm text-stone-500">{j.city ? `${j.city} · ` : ""}{j.address}</div>
        <div className="mt-1.5">
          <StatusChip status={j.status} />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="tabular text-lg font-extrabold text-stone-900">{money0(j.price, currency)}</div>
        <div className={cx("tabular text-sm font-bold", j.profit >= 0 ? "text-emerald-700" : "text-red-600")}>
          {money0(j.profit, currency)}
        </div>
        <div className="text-[10px] font-semibold tracking-wide text-stone-400 uppercase">
          {j.profitIsActual ? "profit" : "est. profit"}
        </div>
      </div>
    </Link>
  );
}

/** Map a loaded job + financials into card data. */
export function toCardData(
  job: {
    id: string;
    jobNumber: number;
    status: JobStatus;
    address: string;
    city: string | null;
    scheduledStart: Date | null;
    customer: { name: string };
  },
  fin: { best: { price: number; profit: number }; actual: unknown },
  prefix: string,
): JobCardData {
  return {
    id: job.id,
    jobNumber: `${prefix}-${String(job.jobNumber).padStart(4, "0")}`,
    status: job.status,
    customerName: job.customer.name,
    address: job.address,
    city: job.city,
    scheduledStart: job.scheduledStart,
    price: fin.best.price,
    profit: fin.best.profit,
    profitIsActual: Boolean(fin.actual),
  };
}
