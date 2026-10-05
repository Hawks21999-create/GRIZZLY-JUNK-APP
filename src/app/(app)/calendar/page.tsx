import Link from "@/components/Link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { JobStatus } from "@/db/schema";
import { JOB_STATUSES, STATUS_LABEL, STATUS_STYLE } from "@/lib/constants";
import { money0 } from "@/lib/format";
import {
  DOW_SHORT,
  addDays,
  addMonths,
  fmtHm,
  fmtMonthYear,
  fmtYmd,
  isValidYmd,
  startOfMonth,
  startOfWeek,
  toHm,
  toYmd,
  todayYmd,
  utcRangeForDays,
} from "@/lib/tz";
import { db } from "@/db";
import { customers, jobs } from "@/db/schema";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { getSettings } from "@/server/settings";
import { cx } from "@/components/ui";

export const metadata = { title: "Calendar" };

type View = "day" | "week" | "month";
type CalJob = {
  id: string;
  status: JobStatus;
  name: string;
  city: string | null;
  price: number;
  ymd: string;
  hm: string;
  duration: number;
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const tz = s.timezone;
  const today = todayYmd(tz);
  const view: View = sp.view === "day" || sp.view === "week" ? sp.view : "month";
  const date = sp.date && isValidYmd(sp.date) ? sp.date : today;

  // visible range
  let from: string, to: string;
  if (view === "day") [from, to] = [date, date];
  else if (view === "week") [from, to] = [startOfWeek(date), addDays(startOfWeek(date), 6)];
  else {
    from = startOfWeek(startOfMonth(date));
    to = addDays(from, 41);
  }
  const { start, end } = utcRangeForDays(from, to, tz);
  const rows = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      name: customers.name,
      city: jobs.city,
      quoted: jobs.quotedPrice,
      final: jobs.finalPrice,
      start: jobs.scheduledStart,
      duration: jobs.durationMinutes,
    })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .where(and(gte(jobs.scheduledStart, start), lt(jobs.scheduledStart, end)))
    .orderBy(asc(jobs.scheduledStart));

  const list: CalJob[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    name: r.name,
    city: r.city,
    price: r.final ?? r.quoted,
    ymd: toYmd(r.start!, tz),
    hm: toHm(r.start!, tz),
    duration: r.duration,
  }));
  const byDay = new Map<string, CalJob[]>();
  for (const j of list) byDay.set(j.ymd, [...(byDay.get(j.ymd) ?? []), j]);

  const href = (v: View, d: string) => `/calendar?view=${v}&date=${d}`;
  const prev = view === "day" ? addDays(date, -1) : view === "week" ? addDays(date, -7) : addMonths(date, -1);
  const next = view === "day" ? addDays(date, 1) : view === "week" ? addDays(date, 7) : addMonths(date, 1);
  const title =
    view === "day" ? fmtYmd(date, { weekday: true, year: true }) : view === "week" ? `Week of ${fmtYmd(from)}` : fmtMonthYear(date);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="truncate text-xl font-extrabold tracking-tight">{title}</h1>
        <Link href={`/jobs/new?date=${date}`} className="btn-primary min-h-10 shrink-0 px-3 text-sm">
          <Plus className="h-4 w-4" /> Job
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <Link href={href(view, prev)} aria-label="Previous" className="btn-secondary min-h-11 w-11 px-0">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <Link href={href(view, today)} className="btn-secondary min-h-11 px-3 text-sm">
          Today
        </Link>
        <Link href={href(view, next)} aria-label="Next" className="btn-secondary min-h-11 w-11 px-0">
          <ChevronRight className="h-5 w-5" />
        </Link>
        <div className="ml-auto flex rounded-xl bg-stone-200 p-1">
          {(["day", "week", "month"] as View[]).map((v) => (
            <Link
              key={v}
              href={href(v, date)}
              className={cx("rounded-lg px-3 py-2 text-sm font-semibold capitalize", view === v ? "bg-white text-stone-900 shadow-sm" : "text-stone-600")}
            >
              {v}
            </Link>
          ))}
        </div>
      </div>

      {view === "month" ? (
        <>
          <div className="card overflow-hidden">
            <div className="grid grid-cols-7 border-b border-stone-100 bg-stone-50 text-center text-[11px] font-bold text-stone-500 uppercase">
              {DOW_SHORT.map((d) => (
                <div key={d} className="py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: 42 }, (_, i) => addDays(from, i)).map((d) => {
                const inMonth = d.slice(0, 7) === date.slice(0, 7);
                const js = byDay.get(d) ?? [];
                const sel = d === date;
                return (
                  <Link
                    key={d}
                    href={href("month", d)}
                    className={cx(
                      "flex min-h-[64px] flex-col border-t border-r border-stone-100 p-1 text-left lg:min-h-[104px]",
                      !inMonth && "bg-stone-50/60 text-stone-300",
                      sel && "bg-brand-50 ring-2 ring-brand-500 ring-inset",
                    )}
                  >
                    <span
                      className={cx(
                        "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                        d === today ? "bg-bear-900 text-white" : inMonth ? "text-stone-800" : "",
                      )}
                    >
                      {Number(d.slice(8))}
                    </span>
                    {/* phones: dots; desktop: mini bars */}
                    <div className="mt-auto flex flex-wrap gap-0.5 lg:hidden">
                      {js.slice(0, 6).map((j) => (
                        <span key={j.id} className={cx("h-2 w-2 rounded-full", STATUS_STYLE[j.status].dot)} />
                      ))}
                    </div>
                    <div className="hidden space-y-0.5 lg:block">
                      {js.slice(0, 3).map((j) => (
                        <div key={j.id} className={cx("truncate rounded px-1 text-[11px] font-semibold text-white", STATUS_STYLE[j.status].dot)}>
                          {fmtHm(j.hm).replace(":00", "").replace(" ", "").toLowerCase()} {j.name}
                        </div>
                      ))}
                      {js.length > 3 ? <div className="text-[11px] text-stone-500">+{js.length - 3} more</div> : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
          <DayAgenda ymd={date} jobs={byDay.get(date) ?? []} currency={s.currency} />
        </>
      ) : null}

      {view === "week" ? (
        <div className="space-y-3">
          {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => (
            <DayAgenda key={d} ymd={d} jobs={byDay.get(d) ?? []} currency={s.currency} compact today={d === today} />
          ))}
        </div>
      ) : null}

      {view === "day" ? <DayTimeline ymd={date} jobs={byDay.get(date) ?? []} currency={s.currency} /> : null}

      <Legend />
    </div>
  );
}

function CalJobCard({ j, currency }: { j: CalJob; currency: string }) {
  return (
    <Link
      href={`/jobs/${j.id}`}
      className={cx("card flex items-center gap-3 border-l-4 px-3 py-2.5 active:bg-stone-50", STATUS_STYLE[j.status].bar, (j.status === "CANCELLED" || j.status === "NOT_BOOKED") && "opacity-60")}
    >
      <div className="tabular w-[70px] shrink-0 text-sm font-extrabold whitespace-nowrap">{fmtHm(j.hm)}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold">{j.name}</div>
        <div className="flex items-center gap-1.5 text-xs text-stone-500">
          <span className={cx("h-2 w-2 shrink-0 rounded-full", STATUS_STYLE[j.status].dot)} />
          <span className="truncate">
            {STATUS_LABEL[j.status]}
            {j.city ? ` · ${j.city}` : ""}
          </span>
        </div>
      </div>
      <div className="tabular shrink-0 font-extrabold">{money0(j.price, currency)}</div>
    </Link>
  );
}

function DayAgenda({ ymd, jobs: js, currency, compact, today }: { ymd: string; jobs: CalJob[]; currency: string; compact?: boolean; today?: boolean }) {
  const active = js.filter((j) => j.status !== "CANCELLED" && j.status !== "NOT_BOOKED");
  const total = active.reduce((a, j) => a + j.price, 0);
  return (
    <section>
      <div className="flex items-baseline justify-between px-1 pb-1.5">
        <h2 className={cx("text-sm font-bold", today ? "text-brand-700" : "text-stone-700")}>
          {fmtYmd(ymd, { weekday: true })}
          {today ? " · Today" : ""}
        </h2>
        {js.length ? (
          <span className="tabular text-xs font-semibold text-stone-500">
            {active.length} job{active.length === 1 ? "" : "s"} · {money0(total, currency)}
          </span>
        ) : null}
      </div>
      {js.length ? (
        <div className="space-y-2">
          {js.map((j) => (
            <CalJobCard key={j.id} j={j} currency={currency} />
          ))}
        </div>
      ) : compact ? (
        <div className="rounded-xl border border-dashed border-stone-300 px-3 py-2 text-xs text-stone-400">No jobs</div>
      ) : (
        <Link href={`/jobs/new?date=${ymd}`} className="block rounded-xl border border-dashed border-stone-300 px-3 py-4 text-center text-sm font-semibold text-stone-500">
          No jobs · tap to book one
        </Link>
      )}
    </section>
  );
}

const HOUR_PX = 64;

function DayTimeline({ ymd, jobs: js, currency }: { ymd: string; jobs: CalJob[]; currency: string }) {
  const mins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
  const firstHour = Math.min(7, ...js.map((j) => Math.floor(mins(j.hm) / 60)));
  const lastHour = Math.max(19, ...js.map((j) => Math.ceil((mins(j.hm) + j.duration) / 60)));
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);
  // simple column layout for overlapping jobs
  const placed: { j: CalJob; col: number; cols: number }[] = [];
  const sorted = [...js].sort((a, b) => mins(a.hm) - mins(b.hm));
  for (const j of sorted) {
    const startM = mins(j.hm);
    const overlapping = placed.filter((p) => mins(p.j.hm) + p.j.duration > startM);
    const used = new Set(overlapping.map((p) => p.col));
    let col = 0;
    while (used.has(col)) col++;
    placed.push({ j, col, cols: 1 });
  }
  for (const p of placed) {
    const s0 = mins(p.j.hm);
    const e0 = s0 + p.j.duration;
    p.cols = Math.max(...placed.filter((q) => mins(q.j.hm) < e0 && mins(q.j.hm) + q.j.duration > s0).map((q) => q.col)) + 1;
  }
  return (
    <div className="space-y-3">
      <div className="card relative overflow-hidden" style={{ height: hours.length * HOUR_PX }}>
        {hours.map((h, i) => (
          <div key={h} className="absolute inset-x-0 flex border-t border-stone-100" style={{ top: i * HOUR_PX }}>
            <div className="w-14 shrink-0 pt-1 pr-2 text-right text-[11px] font-semibold text-stone-400">{fmtHm(`${String(h).padStart(2, "0")}:00`).replace(":00", "")}</div>
          </div>
        ))}
        {placed.map(({ j, col, cols }) => {
          const top = ((mins(j.hm) - firstHour * 60) / 60) * HOUR_PX;
          const height = Math.max(44, (j.duration / 60) * HOUR_PX - 4);
          return (
            <Link
              key={j.id}
              href={`/jobs/${j.id}`}
              className={cx("absolute overflow-hidden rounded-xl border-l-4 bg-white p-2 shadow ring-1 ring-black/5", STATUS_STYLE[j.status].bar)}
              style={{ top: top + 2, height, left: `calc(3.75rem + (100% - 4.25rem) * ${col / cols})`, width: `calc((100% - 4.25rem) / ${cols} - 4px)` }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="truncate text-sm font-bold">{j.name}</div>
                <div className="tabular shrink-0 text-sm font-extrabold">{money0(j.price, currency)}</div>
              </div>
              <div className="truncate text-xs text-stone-500">
                {fmtHm(j.hm)} · {STATUS_LABEL[j.status]}
                {j.city ? ` · ${j.city}` : ""}
              </div>
            </Link>
          );
        })}
      </div>
      {!js.length ? <DayAgenda ymd={ymd} jobs={[]} currency={currency} /> : null}
    </div>
  );
}

function Legend() {
  const shown: JobStatus[] = JOB_STATUSES.filter((s) => s !== "LEAD" && s !== "ESTIMATE_REQUESTED" && s !== "QUOTE_SENT");
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5 px-1 pt-2">
      {shown.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5 text-xs text-stone-600">
          <span className={cx("h-2.5 w-2.5 rounded-full", STATUS_STYLE[s].dot)} />
          {STATUS_LABEL[s]}
        </span>
      ))}
    </div>
  );
}

