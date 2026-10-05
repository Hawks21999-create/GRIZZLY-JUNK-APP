import { z } from "zod";
import {
  PRE_BOOKING_STATUSES,
  EXPENSE_CATEGORIES,
  JOB_EXPENSE_CATEGORIES,
  JOB_STATUSES,
  JOB_TYPES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from "./constants";
import { isValidHm, isValidYmd } from "./tz";

const trimmed = (max: number) => z.string().trim().max(max);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const moneyField = z.number().finite().min(0, "Must be 0 or more").max(1_000_000, "Too large");
const optMoney = moneyField.nullable().optional().transform((v) => (v === undefined ? null : v));
const hours = z.number().finite().min(0).max(200);
const uuid = z.string().uuid();
const optUuid = z
  .string()
  .uuid()
  .nullable()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));
const lat = z.number().min(-90).max(90).nullable().optional();
const lng = z.number().min(-180).max(180).nullable().optional();

export const ymdSchema = z.string().refine(isValidYmd, "Invalid date (YYYY-MM-DD)");
export const hmSchema = z.string().refine(isValidHm, "Invalid time (HH:MM)");

const email = z
  .string()
  .trim()
  .max(200)
  .optional()
  .nullable()
  .transform((v) => (v ? v.toLowerCase() : null))
  .refine((v) => v === null || z.string().email().safeParse(v).success, "Invalid email");

const phone = z
  .string()
  .trim()
  .max(40)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || (v.replace(/\D/g, "").length >= 7 && /^[\d\s()+.\-x]+$/i.test(v)), "Invalid phone number");

export const routeStopSchema = z.object({
  type: z.enum(["BUSINESS", "CUSTOMER", "DUMP", "OTHER"]),
  label: trimmed(120).min(1),
  address: trimmed(300).min(1, "Stop address required"),
  lat,
  lng,
  legMiles: z.number().min(0).max(5000).nullable().optional(),
});

export const jobInputSchema = z
  .object({
    customerId: optUuid,
    customer: z.object({
      name: trimmed(120).min(1, "Customer name is required"),
      phone,
      email,
    }),
    address: trimmed(300),
    city: optText(100),
    state: optText(40),
    zip: optText(20),
    lat,
    lng,
    date: z.union([ymdSchema, z.literal("")]).nullable().optional(),
    time: z.union([hmSchema, z.literal("")]).nullable().optional(),
    durationMinutes: z.number().int().min(15).max(24 * 60),
    jobType: z.enum(JOB_TYPES as [string, ...string[]]),
    status: z.enum(JOB_STATUSES as [string, ...string[]]),
    quotedPrice: moneyField,
    deposit: moneyField,
    paymentStatus: z.enum(PAYMENT_STATUSES as [string, ...string[]]),
    paymentMethod: z
      .enum(PAYMENT_METHODS as [string, ...string[]])
      .nullable()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? v : null)),
    leadSourceId: optUuid,
    leadCost: moneyField,
    workersCount: z.number().int().min(0).max(20),
    estLaborHours: hours,
    labor: z
      .array(z.object({ employeeId: uuid, estHours: hours }))
      .max(20)
      .refine((l) => new Set(l.map((x) => x.employeeId)).size === l.length, "A worker is listed twice"),
    vehicleId: optUuid,
    dumpFacilityId: optUuid,
    estDumpCost: moneyField,
    route: z
      .object({
        stops: z.array(routeStopSchema).min(2).max(25),
        totalMiles: z.number().min(0).max(10000).nullable(),
        error: z.string().max(500).nullable().optional(),
      })
      .nullable()
      .optional(),
    milesOverride: z.number().min(0).max(10000).nullable().optional(),
    expenses: z
      .array(
        z.object({
          category: z.enum(JOB_EXPENSE_CATEGORIES as [string, ...string[]]),
          description: trimmed(200).min(1, "Expense description required"),
          amount: moneyField,
        }),
      )
      .max(50),
    notes: optText(5000),
    /** Diesel price used for this job; null = use today's price. */
    fuelPrice: z.number().min(0).max(50).nullable().optional(),
    fuelPriceSource: optText(200),
    /** When the lead came in (local date/time); defaults to now. */
    leadReceivedDate: z.union([ymdSchema, z.literal("")]).nullable().optional(),
    leadReceivedTime: z.union([hmSchema, z.literal("")]).nullable().optional(),
    lostReason: optText(300),
  })
  .superRefine((v, ctx) => {
    if (!PRE_BOOKING_STATUSES.includes(v.status as never) && v.address.length < 3) {
      ctx.addIssue({ code: "custom", path: ["address"], message: "Job address is required once the job is scheduled" });
    }
    if (v.deposit > v.quotedPrice && v.quotedPrice > 0) {
      ctx.addIssue({ code: "custom", path: ["deposit"], message: "Deposit is more than the quoted price" });
    }
    if (v.time && !v.date) {
      ctx.addIssue({ code: "custom", path: ["date"], message: "Pick a date for this time" });
    }
  });

export type JobInput = z.input<typeof jobInputSchema>;
export type JobInputParsed = z.output<typeof jobInputSchema>;

export const completeJobSchema = z.object({
  jobId: uuid,
  finalPrice: moneyField,
  actualMiles: z.number().min(0).max(10000).nullable(),
  dumpRecords: z
    .array(
      z.object({
        facilityId: optUuid,
        facilityName: optText(120),
        fee: moneyField,
        weightLbs: z.number().min(0).max(1_000_000).nullable().optional(),
        loads: z.number().int().min(1).max(50).default(1),
      }),
    )
    .max(20),
  labor: z.array(z.object({ employeeId: uuid, actualHours: hours })).max(20),
  expenses: z
    .array(
      z.object({
        category: z.enum(JOB_EXPENSE_CATEGORIES as [string, ...string[]]),
        description: trimmed(200).min(1),
        amount: moneyField,
      }),
    )
    .max(50),
  paymentMethod: z
    .enum(PAYMENT_METHODS as [string, ...string[]])
    .nullable()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  paid: z.boolean(),
  /** Diesel price actually paid (optional override). */
  fuelPrice: z.number().min(0).max(50).nullable().optional(),
});
export type CompleteJobInput = z.input<typeof completeJobSchema>;

export const dumpRecordSchema = z.object({
  jobId: uuid,
  facilityId: optUuid,
  facilityName: optText(120),
  fee: moneyField,
  weightLbs: z.number().min(0).max(1_000_000).nullable().optional(),
  loads: z.number().int().min(1).max(50),
  notes: optText(500),
});

export const jobExpenseSchema = z.object({
  jobId: uuid,
  category: z.enum(JOB_EXPENSE_CATEGORIES as [string, ...string[]]),
  description: trimmed(200).min(1, "Description required"),
  amount: moneyField,
});

export const customerSchema = z.object({
  name: trimmed(120).min(1, "Name is required"),
  phone,
  email,
  address: optText(300),
  city: optText(100),
  state: optText(40),
  zip: optText(20),
  lat,
  lng,
  leadSourceId: optUuid,
  notes: optText(5000),
});

export const businessExpenseSchema = z.object({
  date: ymdSchema,
  vendor: optText(120),
  category: z.enum(EXPENSE_CATEGORIES as [string, ...string[]]),
  description: optText(500),
  amount: moneyField.refine((v) => v > 0, "Amount must be more than 0"),
  leadSourceId: optUuid,
  coveredByJobCosts: z.boolean(),
});

export const businessSettingsSchema = z.object({
  businessName: trimmed(120).min(1),
  businessPhone: phone,
  businessEmail: email,
  businessAddress: optText(300),
  businessLat: lat,
  businessLng: lng,
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone"),
  currency: z.string().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code like USD"),
  jobNumberPrefix: z.string().trim().regex(/^[A-Z]{2,5}$/, "2–5 capital letters"),
});

export const jobDefaultsSchema = z.object({
  defaultVehicleId: optUuid,
  defaultDumpFacilityId: optUuid,
  defaultDumpCost: moneyField,
  defaultLaborRate: moneyField,
  defaultJobDuration: z.number().int().min(15).max(1440),
  defaultWorkers: z.number().int().min(0).max(20),
  defaultIncludeDump: z.boolean(),
  avoidTolls: z.boolean(),
  avoidHighways: z.boolean(),
  includeVehicleWear: z.boolean(),
  fuelPriceAuto: z.boolean(),
});

export const vehicleSchema = z.object({
  id: optUuid,
  name: trimmed(120).min(1),
  fuelType: z.enum(["DIESEL", "GASOLINE", "ELECTRIC", "OTHER"]),
  mpg: z.number().positive("MPG must be more than 0").max(200),
  fuelPrice: z.number().min(0).max(50),
  maintenancePerMile: z.number().min(0).max(50),
  depreciationPerMile: z.number().min(0).max(50),
  active: z.boolean(),
});

export const employeeSchema = z.object({
  id: optUuid,
  name: trimmed(120).min(1),
  phone,
  hourlyCost: moneyField,
  active: z.boolean(),
});

export const dumpFacilitySchema = z.object({
  id: optUuid,
  name: trimmed(120).min(1),
  address: optText(300),
  lat,
  lng,
  defaultFee: moneyField,
  active: z.boolean(),
});

export const leadSourceSchema = z.object({
  id: optUuid,
  name: trimmed(80).min(1),
  active: z.boolean(),
});

export { optMoney };

/** Flatten zod errors into { "customer.name": "msg" } */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const k = issue.path.join(".") || "_";
    if (!out[k]) out[k] = issue.message;
  }
  return out;
}
