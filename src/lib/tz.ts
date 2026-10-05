/**
 * Time-zone helpers. Jobs are stored as UTC instants; all calendar math
 * (today, this month, the calendar grid) happens in the business time zone
 * from Settings so the app behaves the same whether the server runs in UTC
 * (Vercel, Railway…) or locally.
 *
 * Dates as plain calendar days are passed around as "YYYY-MM-DD" strings.
 */

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function zonedParts(date: Date, tz: string): Parts {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(tz).formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  };
}

/** Offset of `tz` from UTC at `date`, in minutes (e.g. -240 for EDT). */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

export function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isValidHm(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** Convert a wall-clock date/time in `tz` to the UTC instant. Handles DST. */
export function zonedTimeToUtc(ymd: string, hm: string, tz: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const [hh, mm] = hm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes resolve DST transitions correctly.
  let ts = guess - tzOffsetMinutes(new Date(guess), tz) * 60000;
  ts = guess - tzOffsetMinutes(new Date(ts), tz) * 60000;
  return new Date(ts);
}

export function toYmd(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function toHm(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function todayYmd(tz: string, now = new Date()): string {
  return toYmd(now, tz);
}

/** Pure calendar arithmetic on YYYY-MM-DD strings. */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function addMonths(ymd: string, n: number): string {
  const [y, m] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  return dt.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function startOfWeek(ymd: string): string {
  return addDays(ymd, -weekday(ymd));
}

export function startOfMonth(ymd: string): string {
  return ymd.slice(0, 8) + "01";
}

export function daysInMonth(ymd: string): number {
  const [y, m] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function endOfMonth(ymd: string): string {
  return ymd.slice(0, 8) + String(daysInMonth(ymd)).padStart(2, "0");
}

/** Half-open UTC range [start, end) covering whole local days fromYmd..toYmd inclusive. */
export function utcRangeForDays(fromYmd: string, toYmdInclusive: string, tz: string) {
  return {
    start: zonedTimeToUtc(fromYmd, "00:00", tz),
    end: zonedTimeToUtc(addDays(toYmdInclusive, 1), "00:00", tz),
  };
}

export type PeriodKey = "today" | "week" | "month" | "last_month" | "year" | "all" | "custom";

export function periodDays(
  key: PeriodKey,
  tz: string,
  custom?: { from?: string; to?: string },
  now = new Date(),
): { from: string; to: string; label: string } {
  const today = todayYmd(tz, now);
  switch (key) {
    case "today":
      return { from: today, to: today, label: "Today" };
    case "week": {
      const s = startOfWeek(today);
      return { from: s, to: addDays(s, 6), label: "This Week" };
    }
    case "last_month": {
      const s = addMonths(startOfMonth(today), -1);
      return { from: s, to: endOfMonth(s), label: "Last Month" };
    }
    case "all":
      return { from: "2000-01-01", to: addDays(today, 365), label: "All Time" };
    case "year": {
      const s = today.slice(0, 4) + "-01-01";
      return { from: s, to: today.slice(0, 4) + "-12-31", label: "This Year" };
    }
    case "custom": {
      const from = custom?.from && isValidYmd(custom.from) ? custom.from : startOfMonth(today);
      let to = custom?.to && isValidYmd(custom.to) ? custom.to : today;
      if (to < from) to = from;
      return { from, to, label: "Custom Range" };
    }
    case "month":
    default: {
      const s = startOfMonth(today);
      return { from: s, to: endOfMonth(s), label: "This Month" };
    }
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function fmtYmd(ymd: string, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = `${MONTHS[m - 1]} ${d}`;
  const wd = opts.weekday ? `${DOW[weekday(ymd)]}, ` : "";
  return `${wd}${base}${opts.year ? `, ${y}` : ""}`;
}

export function fmtMonthYear(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

export function fmtHm(hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function fmtTime(date: Date | null | undefined, tz: string): string {
  return date ? fmtHm(toHm(date, tz)) : "—";
}

export function fmtDate(date: Date | null | undefined, tz: string, opts: { weekday?: boolean; year?: boolean } = {}) {
  return date ? fmtYmd(toYmd(date, tz), opts) : "Unscheduled";
}

export const DOW_SHORT = DOW;

export const PERIOD_KEYS: PeriodKey[] = ["today", "week", "month", "last_month", "year", "all", "custom"];
export function parsePeriod(v: string | undefined, fallback: PeriodKey = "month"): PeriodKey {
  return PERIOD_KEYS.includes(v as PeriodKey) ? (v as PeriodKey) : fallback;
}
