import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { formatJobNumber, JOB_TYPE_LABEL, LEAD_STATUS_LABEL, STATUS_LABEL, leadStatusOf } from "@/lib/constants";
import { isValidYmd, toHm, toYmd } from "@/lib/tz";
import { buildReport } from "@/server/reports";
import { getSettings } from "@/server/settings";

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // neutralize spreadsheet formula injection
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function GET(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u || u.role === "EMPLOYEE") return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  if (!isValidYmd(from) || !isValidYmd(to)) return NextResponse.json({ error: "from/to required" }, { status: 400 });
  const s = await getSettings();
  const r = await buildReport(from, to);
  const header = ["Job #", "Date", "Time", "Status", "Lead Status", "Lead Came In", "Customer", "Phone", "Address", "City", "Job Type", "Lead Source", "Lost Reason", "Diesel $/gal", "MPG", "Price", "Miles", "Fuel", "Maintenance", "Depreciation", "Dump", "Labor", "Labor Hours", "Lead Cost", "Other", "Total Cost", "Profit", "Margin %", "Numbers"];
  const lines = [header.join(",")];
  for (const { job, fin } of r.jobs) {
    const b = fin.best;
    lines.push(
      [
        formatJobNumber(job.jobNumber, s.jobNumberPrefix),
        job.scheduledStart ? toYmd(job.scheduledStart, s.timezone) : "",
        job.scheduledStart ? toHm(job.scheduledStart, s.timezone) : "",
        STATUS_LABEL[job.status],
        LEAD_STATUS_LABEL[leadStatusOf(job.status)],
        `${toYmd(job.leadReceivedAt, s.timezone)} ${toHm(job.leadReceivedAt, s.timezone)}`,
        job.customer.name,
        job.customer.phone,
        job.address,
        job.city,
        JOB_TYPE_LABEL[job.jobType],
        job.leadSource?.name,
        job.lostReason,
        job.fuelPrice,
        job.mpg,
        b.price,
        b.miles,
        b.fuel,
        b.maintenance,
        b.depreciation,
        b.dump,
        b.labor,
        b.laborHours,
        b.lead,
        b.other,
        b.totalCost,
        b.profit,
        b.margin ?? "",
        fin.actual ? "Actual" : "Estimate",
      ]
        .map(esc)
        .join(","),
    );
  }
  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="grizzly-jobs-${from}-to-${to}.csv"`,
    },
  });
}
