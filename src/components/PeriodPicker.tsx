import Link from "@/components/Link";
import type { PeriodKey } from "@/lib/tz";
import { cx } from "./ui";

const OPTIONS: [PeriodKey, string][] = [
  ["today", "Today"],
  ["week", "This Week"],
  ["month", "This Month"],
  ["last_month", "Last Month"],
  ["year", "This Year"],
  ["custom", "Custom"],
];

/** Period tabs + a custom date-range form (plain GET — works without JS). */
export function PeriodPicker({ base, current, from, to }: { base: string; current: PeriodKey; from: string; to: string }) {
  return (
    <div className="space-y-2">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {OPTIONS.map(([k, label]) => (
          <Link
            key={k}
            href={`${base}?period=${k}`}
            className={cx(
              "shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold ring-1",
              current === k ? "bg-bear-900 text-white ring-bear-900" : "bg-white text-stone-700 ring-stone-300",
            )}
          >
            {label}
          </Link>
        ))}
      </div>
      {current === "custom" ? (
        <form action={base} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <input type="hidden" name="period" value="custom" />
          <input type="date" name="from" defaultValue={from} className="input" aria-label="From" />
          <input type="date" name="to" defaultValue={to} className="input" aria-label="To" />
          <button className="btn-dark">Go</button>
        </form>
      ) : null}
    </div>
  );
}
