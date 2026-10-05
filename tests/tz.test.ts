import { describe, expect, it } from "vitest";
import { addDays, addMonths, endOfMonth, periodDays, startOfWeek, toHm, toYmd, utcRangeForDays, zonedTimeToUtc } from "@/lib/tz";

const NY = "America/New_York";

describe("zonedTimeToUtc", () => {
  it("EDT (UTC-4)", () => {
    expect(zonedTimeToUtc("2026-10-02", "09:00", NY).toISOString()).toBe("2026-10-02T13:00:00.000Z");
  });
  it("EST (UTC-5)", () => {
    expect(zonedTimeToUtc("2026-12-15", "14:30", NY).toISOString()).toBe("2026-12-15T19:30:00.000Z");
  });
  it("round-trips across DST end (Nov 1 2026)", () => {
    for (const hm of ["00:00", "08:00", "23:59"]) {
      const d = zonedTimeToUtc("2026-11-01", hm, NY);
      expect(toYmd(d, NY)).toBe("2026-11-01");
      expect(toHm(d, NY)).toBe(hm);
    }
  });
  it("round-trips across DST start (Mar 8 2026)", () => {
    const d = zonedTimeToUtc("2026-03-08", "10:00", NY);
    expect(toHm(d, NY)).toBe("10:00");
  });
});

describe("calendar math", () => {
  it("adds days and months", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
    expect(startOfWeek("2026-10-02")).toBe("2026-09-27"); // Friday → Sunday
  });
  it("local day range is 24h in UTC and covers late-evening jobs", () => {
    const r = utcRangeForDays("2026-10-02", "2026-10-02", NY);
    expect(r.start.toISOString()).toBe("2026-10-02T04:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-10-03T04:00:00.000Z");
    const lateJob = zonedTimeToUtc("2026-10-02", "21:00", NY); // 01:00Z next day
    expect(lateJob >= r.start && lateJob < r.end).toBe(true);
  });
  it("periods", () => {
    const now = new Date("2026-10-02T15:00:00Z");
    expect(periodDays("month", NY, undefined, now)).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
    expect(periodDays("last_month", NY, undefined, now)).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
    expect(periodDays("today", NY, undefined, now)).toMatchObject({ from: "2026-10-02", to: "2026-10-02" });
    expect(periodDays("custom", NY, { from: "2026-10-10", to: "2026-10-01" }, now)).toMatchObject({ from: "2026-10-10", to: "2026-10-10" });
  });
  it("'today' uses the business time zone, not the server's", () => {
    // 02:00 UTC on Oct 3 is still Oct 2 in Georgia
    expect(periodDays("today", NY, undefined, new Date("2026-10-03T02:00:00Z")).from).toBe("2026-10-02");
  });
});
