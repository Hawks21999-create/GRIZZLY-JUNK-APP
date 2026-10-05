import { formatPhone } from "./phone";

export type CalendarEventInput = {
  jobNumber: string;
  customerName: string;
  phone: string | null;
  address: string;
  quotedPrice: number;
  jobType: string;
  status: string;
  notes: string | null;
  start: Date;
  durationMinutes: number;
  timezone: string;
  appUrl?: string;
  jobId: string;
};

/** Builds the Google Calendar event body. Exported for tests. */
export function buildEventBody(e: CalendarEventInput) {
  const price = e.quotedPrice.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: e.quotedPrice % 1 === 0 ? 0 : 2,
  });
  const lines = [
    `Job: ${e.jobNumber}`,
    `Customer: ${e.customerName}`,
    `Phone: ${e.phone ? formatPhone(e.phone) : "—"}`,
    `Address: ${e.address}`,
    `Quoted Price: ${price}`,
    `Job Type: ${e.jobType}`,
    `Status: ${e.status}`,
    "",
    `Notes: ${e.notes || "—"}`,
  ];
  if (e.appUrl) lines.push("", `Open job: ${e.appUrl.replace(/\/$/, "")}/jobs/${e.jobId}`);
  return {
    summary: `Grizzly Junk Removal - ${e.customerName} - ${price}`,
    location: e.address,
    description: lines.join("\n"),
    start: { dateTime: e.start.toISOString(), timeZone: e.timezone },
    end: { dateTime: new Date(e.start.getTime() + e.durationMinutes * 60000).toISOString(), timeZone: e.timezone },
    extendedProperties: { private: { grizzlyJobId: e.jobId } },
  };
}

