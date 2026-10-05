import type {
  ExpenseCategory,
  JobExpenseCategory,
  JobStatus,
  JobType,
  PaymentMethod,
  PaymentStatus,
} from "@/db/schema";

export const JOB_STATUSES: JobStatus[] = [
  "LEAD",
  "CONTACTED",
  "ESTIMATE_REQUESTED",
  "ESTIMATE_SCHEDULED",
  "QUOTE_SENT",
  "SCHEDULED",
  "ON_THE_WAY",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NOT_BOOKED",
];

export const STATUS_LABEL: Record<JobStatus, string> = {
  LEAD: "New Lead",
  CONTACTED: "Contacted",
  ESTIMATE_REQUESTED: "Estimate Requested",
  ESTIMATE_SCHEDULED: "Estimate Scheduled",
  QUOTE_SENT: "Quote Sent",
  SCHEDULED: "Scheduled",
  ON_THE_WAY: "On The Way",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NOT_BOOKED: "Lost",
};

/** Tailwind classes for status chips; each status also has a distinct icon glyph for color-blind use. */
export const STATUS_STYLE: Record<JobStatus, { chip: string; dot: string; bar: string; icon: string }> = {
  LEAD: { chip: "bg-slate-100 text-slate-700 ring-slate-300", dot: "bg-slate-400", bar: "border-l-slate-400", icon: "○" },
  CONTACTED: { chip: "bg-indigo-50 text-indigo-800 ring-indigo-200", dot: "bg-indigo-400", bar: "border-l-indigo-400", icon: "☎" },
  ESTIMATE_REQUESTED: { chip: "bg-violet-50 text-violet-800 ring-violet-200", dot: "bg-violet-400", bar: "border-l-violet-400", icon: "?" },
  ESTIMATE_SCHEDULED: { chip: "bg-violet-100 text-violet-900 ring-violet-300", dot: "bg-violet-600", bar: "border-l-violet-600", icon: "◇" },
  QUOTE_SENT: { chip: "bg-sky-50 text-sky-800 ring-sky-200", dot: "bg-sky-500", bar: "border-l-sky-500", icon: "✉" },
  SCHEDULED: { chip: "bg-blue-100 text-blue-900 ring-blue-300", dot: "bg-blue-600", bar: "border-l-blue-600", icon: "◆" },
  ON_THE_WAY: { chip: "bg-amber-100 text-amber-900 ring-amber-300", dot: "bg-amber-500", bar: "border-l-amber-500", icon: "➜" },
  IN_PROGRESS: { chip: "bg-orange-100 text-orange-900 ring-orange-300", dot: "bg-orange-600", bar: "border-l-orange-600", icon: "▶" },
  COMPLETED: { chip: "bg-emerald-100 text-emerald-900 ring-emerald-300", dot: "bg-emerald-600", bar: "border-l-emerald-600", icon: "✓" },
  CANCELLED: { chip: "bg-red-50 text-red-800 ring-red-200 line-through", dot: "bg-red-500", bar: "border-l-red-500", icon: "✕" },
  NOT_BOOKED: { chip: "bg-zinc-100 text-zinc-500 ring-zinc-200", dot: "bg-zinc-400", bar: "border-l-zinc-300", icon: "–" },
};

/** Statuses that represent a booked (won) job. */
export const BOOKED_STATUSES: JobStatus[] = ["SCHEDULED", "ON_THE_WAY", "IN_PROGRESS", "COMPLETED"];
/** Statuses shown as "upcoming / active work". */
export const ACTIVE_STATUSES: JobStatus[] = [
  "ESTIMATE_SCHEDULED",
  "SCHEDULED",
  "ON_THE_WAY",
  "IN_PROGRESS",
];
/** Statuses that should exist on Google Calendar. */
export const CALENDAR_SYNC_STATUSES: JobStatus[] = [
  "ESTIMATE_SCHEDULED",
  "SCHEDULED",
  "ON_THE_WAY",
  "IN_PROGRESS",
  "COMPLETED",
];

export const JOB_TYPES: JobType[] = [
  "SINGLE_ITEM",
  "FURNITURE_REMOVAL",
  "APPLIANCE_REMOVAL",
  "GARAGE_CLEANOUT",
  "BASEMENT_CLEANOUT",
  "ATTIC_CLEANOUT",
  "ESTATE_CLEANOUT",
  "MOVE_OUT_CLEANOUT",
  "CONSTRUCTION_DEBRIS",
  "PROPERTY_CLEANOUT",
  "COMMERCIAL",
  "OTHER",
];

export const JOB_TYPE_LABEL: Record<JobType, string> = {
  SINGLE_ITEM: "Single Item",
  FURNITURE_REMOVAL: "Furniture Removal",
  APPLIANCE_REMOVAL: "Appliance Removal",
  GARAGE_CLEANOUT: "Garage Cleanout",
  BASEMENT_CLEANOUT: "Basement Cleanout",
  ATTIC_CLEANOUT: "Attic Cleanout",
  ESTATE_CLEANOUT: "Estate Cleanout",
  MOVE_OUT_CLEANOUT: "Move-Out Cleanout",
  CONSTRUCTION_DEBRIS: "Construction Debris",
  PROPERTY_CLEANOUT: "Property Cleanout",
  COMMERCIAL: "Commercial Junk Removal",
  OTHER: "Other",
};

export const PAYMENT_STATUSES: PaymentStatus[] = ["NOT_PAID", "DEPOSIT_PAID", "PAID"];
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  NOT_PAID: "Not Paid",
  DEPOSIT_PAID: "Deposit Paid",
  PAID: "Paid",
};

export const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "CARD", "CHECK", "ACH", "OTHER"];
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  CARD: "Card",
  CHECK: "Check",
  ACH: "ACH",
  OTHER: "Other",
};

export const DEFAULT_LEAD_SOURCES = [
  "Google Ads",
  "Google Business Profile",
  "Facebook Ads",
  "Facebook Organic",
  "Website",
  "Phone Call",
  "Realtor",
  "Property Manager",
  "Referral",
  "Repeat Customer",
  "Yard Sign",
  "Other",
];

// ───────────── Lead lifecycle ─────────────
// A lead is the same record as the job (one record from first call to
// completed job), so its lead status is derived from the job status.

export type LeadStatus = "NEW" | "CONTACTED" | "ESTIMATE_SCHEDULED" | "QUOTE_SENT" | "BOOKED" | "LOST" | "COMPLETED";

export const LEAD_STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "ESTIMATE_SCHEDULED", "QUOTE_SENT", "BOOKED", "LOST", "COMPLETED"];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "New Lead",
  CONTACTED: "Contacted",
  ESTIMATE_SCHEDULED: "Estimate Scheduled",
  QUOTE_SENT: "Quote Sent",
  BOOKED: "Booked",
  LOST: "Lost",
  COMPLETED: "Completed",
};

export function leadStatusOf(s: JobStatus): LeadStatus {
  switch (s) {
    case "LEAD":
      return "NEW";
    case "CONTACTED":
    case "ESTIMATE_REQUESTED":
      return "CONTACTED";
    case "ESTIMATE_SCHEDULED":
      return "ESTIMATE_SCHEDULED";
    case "QUOTE_SENT":
      return "QUOTE_SENT";
    case "SCHEDULED":
    case "ON_THE_WAY":
    case "IN_PROGRESS":
      return "BOOKED";
    case "COMPLETED":
      return "COMPLETED";
    case "CANCELLED":
    case "NOT_BOOKED":
      return "LOST";
  }
}

/** Job statuses that belong to each lead status (for filtering). */
export const LEAD_STATUS_JOB_STATUSES: Record<LeadStatus, JobStatus[]> = {
  NEW: ["LEAD"],
  CONTACTED: ["CONTACTED", "ESTIMATE_REQUESTED"],
  ESTIMATE_SCHEDULED: ["ESTIMATE_SCHEDULED"],
  QUOTE_SENT: ["QUOTE_SENT"],
  BOOKED: ["SCHEDULED", "ON_THE_WAY", "IN_PROGRESS"],
  LOST: ["NOT_BOOKED", "CANCELLED"],
  COMPLETED: ["COMPLETED"],
};

/** The job status a one-tap lead-status change sets. */
export const LEAD_STATUS_TO_JOB: Record<LeadStatus, JobStatus> = {
  NEW: "LEAD",
  CONTACTED: "CONTACTED",
  ESTIMATE_SCHEDULED: "ESTIMATE_SCHEDULED",
  QUOTE_SENT: "QUOTE_SENT",
  BOOKED: "SCHEDULED",
  LOST: "NOT_BOOKED",
  COMPLETED: "COMPLETED",
};

export const LOST_REASONS = [
  "Price too high",
  "Went with another company",
  "No response",
  "Outside service area",
  "Timing / scheduling",
  "Did it themselves",
  "Just shopping prices",
  "Other",
];

/** Statuses before booking — address and date are optional here. */
export const PRE_BOOKING_STATUSES: JobStatus[] = ["LEAD", "CONTACTED", "ESTIMATE_REQUESTED", "QUOTE_SENT", "NOT_BOOKED", "CANCELLED"];

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "FUEL",
  "VEHICLE_MAINTENANCE",
  "VEHICLE_REPAIR",
  "INSURANCE",
  "ADVERTISING",
  "EQUIPMENT",
  "SOFTWARE",
  "PHONE",
  "DUMP_FEES",
  "PAYROLL",
  "SUPPLIES",
  "OFFICE",
  "OTHER",
];

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  FUEL: "Fuel",
  VEHICLE_MAINTENANCE: "Vehicle Maintenance",
  VEHICLE_REPAIR: "Vehicle Repair",
  INSURANCE: "Insurance",
  ADVERTISING: "Advertising",
  EQUIPMENT: "Equipment",
  SOFTWARE: "Software",
  PHONE: "Phone",
  DUMP_FEES: "Dump Fees",
  PAYROLL: "Payroll",
  SUPPLIES: "Supplies",
  OFFICE: "Office",
  OTHER: "Other",
};

/**
 * Categories that job costing already accounts for (fuel & maintenance via
 * per-mile rates, dump fees via dump receipts, payroll via job labor).
 * New expenses in these categories default to "already counted in job costs".
 */
export const JOB_COVERED_CATEGORIES: ExpenseCategory[] = ["FUEL", "VEHICLE_MAINTENANCE", "DUMP_FEES", "PAYROLL"];

export const JOB_EXPENSE_CATEGORIES: JobExpenseCategory[] = [
  "DISPOSAL_SUPPLIES",
  "GAS_STATION",
  "EQUIPMENT_RENTAL",
  "PARKING",
  "TOLLS",
  "MATERIALS",
  "OTHER",
];

export const JOB_EXPENSE_CATEGORY_LABEL: Record<JobExpenseCategory, string> = {
  DISPOSAL_SUPPLIES: "Disposal supplies",
  GAS_STATION: "Gas station purchase",
  EQUIPMENT_RENTAL: "Equipment rental",
  PARKING: "Parking",
  TOLLS: "Tolls",
  MATERIALS: "Materials",
  OTHER: "Other",
};

export function formatJobNumber(n: number, prefix = "GJR") {
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

/** Parse "GJR-0012", "gjr12", "12" → 12 */
export function parseJobNumber(q: string): number | null {
  const m = q.trim().match(/^(?:[a-z]{2,5}-?)?0*(\d{1,7})$/i);
  return m ? Number(m[1]) : null;
}
