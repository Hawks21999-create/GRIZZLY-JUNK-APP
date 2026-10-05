/**
 * Grizzly Junk Removal — database schema (Drizzle ORM / PostgreSQL)
 *
 * Money is stored as NUMERIC(12,2) and per-unit rates as NUMERIC(10,4) so the
 * database keeps exact values; the app reads them as JS numbers.
 */
import { relations } from "drizzle-orm";
import type { CostBreakdown } from "../lib/calc";
import {
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const money = (name: string) => numeric(name, { precision: 12, scale: 2, mode: "number" });
const rate = (name: string) => numeric(name, { precision: 10, scale: 4, mode: "number" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

// ───────────────────────────── Enums ─────────────────────────────

export const userRole = pgEnum("user_role", ["OWNER", "ADMIN", "EMPLOYEE"]);

export const jobStatus = pgEnum("job_status", [
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
]);

export const jobType = pgEnum("job_type", [
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
]);

export const paymentStatus = pgEnum("payment_status", ["NOT_PAID", "DEPOSIT_PAID", "PAID"]);
export const paymentMethod = pgEnum("payment_method", ["CASH", "CARD", "CHECK", "ACH", "OTHER"]);
export const fuelType = pgEnum("fuel_type", ["DIESEL", "GASOLINE", "ELECTRIC", "OTHER"]);
export const routeStopType = pgEnum("route_stop_type", ["BUSINESS", "CUSTOMER", "DUMP", "OTHER"]);

export const expenseCategory = pgEnum("expense_category", [
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
]);

export const jobExpenseCategory = pgEnum("job_expense_category", [
  "DISPOSAL_SUPPLIES",
  "GAS_STATION",
  "EQUIPMENT_RENTAL",
  "PARKING",
  "TOLLS",
  "MATERIALS",
  "OTHER",
]);

// ───────────────────────────── Users & settings ─────────────────────────────

export const employees = pgTable("employees", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone"),
  hourlyCost: money("hourly_cost").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("OWNER"),
  active: boolean("active").notNull().default(true),
  /** Incrementing this invalidates every existing session for the user. */
  sessionVersion: integer("session_version").notNull().default(1),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  employeeId: uuid("employee_id")
    .unique()
    .references(() => employees.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const vehicles = pgTable("vehicles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  fuelType: fuelType("fuel_type").notNull().default("DIESEL"),
  mpg: numeric("mpg", { precision: 6, scale: 2, mode: "number" }).notNull(),
  fuelPrice: numeric("fuel_price", { precision: 8, scale: 3, mode: "number" }).notNull(),
  maintenancePerMile: rate("maintenance_per_mile").notNull(),
  depreciationPerMile: rate("depreciation_per_mile").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const dumpFacilities = pgTable("dump_facilities", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  address: text("address"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  defaultFee: money("default_fee").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const leadSources = pgTable("lead_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

/** Single-row table (id = 1) holding business-wide configuration. */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  businessName: text("business_name").notNull().default("Grizzly Junk Removal"),
  businessPhone: text("business_phone"),
  businessEmail: text("business_email"),
  businessAddress: text("business_address"),
  businessLat: doublePrecision("business_lat"),
  businessLng: doublePrecision("business_lng"),
  timezone: text("timezone").notNull().default("America/New_York"),
  currency: text("currency").notNull().default("USD"),
  jobNumberPrefix: text("job_number_prefix").notNull().default("GJR"),
  defaultVehicleId: uuid("default_vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
  defaultDumpFacilityId: uuid("default_dump_facility_id").references(() => dumpFacilities.id, {
    onDelete: "set null",
  }),
  defaultDumpCost: money("default_dump_cost").notNull().default(0),
  defaultLaborRate: money("default_labor_rate").notNull().default(20),
  defaultJobDuration: integer("default_job_duration").notNull().default(120),
  defaultWorkers: integer("default_workers").notNull().default(2),
  // Mileage calculation settings
  defaultIncludeDump: boolean("default_include_dump").notNull().default(false),
  /**
   * When false (default) TOTAL JOB COST = Lead + Fuel + Dump + Labor + Other.
   * When true, per-mile maintenance & depreciation are added as vehicle wear.
   */
  includeVehicleWear: boolean("include_vehicle_wear").notNull().default(false),
  /** Automatically look up the local diesel price (falls back to the vehicle's manual price). */
  fuelPriceAuto: boolean("fuel_price_auto").notNull().default(true),
  avoidTolls: boolean("avoid_tolls").notNull().default(false),
  avoidHighways: boolean("avoid_highways").notNull().default(false),
  // Google Calendar
  gcalEnabled: boolean("gcal_enabled").notNull().default(false),
  gcalCalendarId: text("gcal_calendar_id").notNull().default("primary"),
  /** OAuth refresh token, AES-256-GCM encrypted with APP_ENCRYPTION_KEY. */
  gcalRefreshTokenEnc: text("gcal_refresh_token_enc"),
  gcalConnectedEmail: text("gcal_connected_email"),
  updatedAt: updatedAt(),
});

// ───────────────────────────── Customers & jobs ─────────────────────────────

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    phone: text("phone"),
    /** Normalized 10-digit phone used for duplicate detection. */
    phoneDigits: text("phone_digits"),
    email: text("email"),
    emailLower: text("email_lower"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    leadSourceId: uuid("lead_source_id").references(() => leadSources.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("customers_phone_digits_idx").on(t.phoneDigits),
    index("customers_email_lower_idx").on(t.emailLower),
    index("customers_name_idx").on(t.name),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Sequential number shown as GJR-0001. */
    jobNumber: serial("job_number").notNull().unique(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    status: jobStatus("status").notNull().default("SCHEDULED"),
    jobType: jobType("job_type").notNull().default("OTHER"),

    // Schedule — stored as UTC instant, displayed in settings.timezone
    scheduledStart: timestamp("scheduled_start", { withTimezone: true }),
    durationMinutes: integer("duration_minutes").notNull().default(120),

    // Location
    address: text("address").notNull(),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),

    // Pricing & payment
    quotedPrice: money("quoted_price").notNull().default(0),
    finalPrice: money("final_price"),
    deposit: money("deposit").notNull().default(0),
    paymentStatus: paymentStatus("payment_status").notNull().default("NOT_PAID"),
    paymentMethod: paymentMethod("payment_method"),

    // Marketing
    leadSourceId: uuid("lead_source_id").references(() => leadSources.id, { onDelete: "set null" }),
    leadCost: money("lead_cost").notNull().default(0),

    // Labor estimate (used when no specific workers are assigned)
    workersCount: integer("workers_count").notNull().default(2),
    estLaborHours: numeric("est_labor_hours", { precision: 6, scale: 2, mode: "number" }).notNull().default(0),

    // Vehicle cost snapshot — copied from the vehicle when the job is created so
    // later fuel-price changes don't rewrite history. Can be refreshed per job.
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    mpg: numeric("mpg", { precision: 6, scale: 2, mode: "number" }).notNull(),
    fuelPrice: numeric("fuel_price", { precision: 8, scale: 3, mode: "number" }).notNull(),
    maintenancePerMile: rate("maintenance_per_mile").notNull(),
    depreciationPerMile: rate("depreciation_per_mile").notNull(),
    /** Where the job's diesel price came from, e.g. "Local average (6 stations)" or "Manual". */
    fuelPriceSource: text("fuel_price_source"),

    // Lead tracking
    /** When the lead/inquiry came in. */
    leadReceivedAt: timestamp("lead_received_at", { withTimezone: true }).notNull().defaultNow(),
    /** First time the job reached a booked status. */
    bookedAt: timestamp("booked_at", { withTimezone: true }),
    lostReason: text("lost_reason"),

    // Mileage
    routeMiles: numeric("route_miles", { precision: 8, scale: 1, mode: "number" }),
    milesOverride: numeric("miles_override", { precision: 8, scale: 1, mode: "number" }),
    actualMiles: numeric("actual_miles", { precision: 8, scale: 1, mode: "number" }),
    routeCalculatedAt: timestamp("route_calculated_at", { withTimezone: true }),
    routeError: text("route_error"),

    // Dump & other estimates
    dumpFacilityId: uuid("dump_facility_id").references(() => dumpFacilities.id, { onDelete: "set null" }),
    estDumpCost: money("est_dump_cost").notNull().default(0),

    /**
     * Frozen copy of the ESTIMATED cost breakdown taken when the job is
     * completed, so "estimated vs actual" stays stable afterwards.
     */
    estimateSnapshot: jsonb("estimate_snapshot").$type<CostBreakdown>(),

    notes: text("notes"),

    // Google Calendar sync
    gcalEventId: text("gcal_event_id"),
    gcalSyncError: text("gcal_sync_error"),
    gcalSyncedAt: timestamp("gcal_synced_at", { withTimezone: true }),

    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("jobs_scheduled_start_idx").on(t.scheduledStart),
    index("jobs_status_idx").on(t.status),
    index("jobs_customer_idx").on(t.customerId),
    index("jobs_lead_source_idx").on(t.leadSourceId),
    index("jobs_lead_received_idx").on(t.leadReceivedAt),
    index("jobs_city_idx").on(t.city),
  ],
);

/**
 * Ordered route for a job, e.g. Business → Customer → Dump → Business.
 * legMiles = driving distance from the previous stop to this stop.
 */
export const jobRouteStops = pgTable(
  "job_route_stops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    type: routeStopType("type").notNull(),
    label: text("label").notNull(),
    address: text("address").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    legMiles: numeric("leg_miles", { precision: 8, scale: 1, mode: "number" }),
  },
  (t) => [uniqueIndex("job_route_stops_job_pos_uq").on(t.jobId, t.position)],
);

export const jobLabor = pgTable(
  "job_labor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    /** Snapshot of the employee's hourly cost at the time of the job. */
    hourlyRate: money("hourly_rate").notNull(),
    estHours: numeric("est_hours", { precision: 6, scale: 2, mode: "number" }).notNull().default(0),
    actualHours: numeric("actual_hours", { precision: 6, scale: 2, mode: "number" }),
  },
  (t) => [uniqueIndex("job_labor_job_employee_uq").on(t.jobId, t.employeeId)],
);

export const dumpRecords = pgTable("dump_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  facilityId: uuid("facility_id").references(() => dumpFacilities.id, { onDelete: "set null" }),
  facilityName: text("facility_name"),
  fee: money("fee").notNull(),
  weightLbs: numeric("weight_lbs", { precision: 10, scale: 1, mode: "number" }),
  loads: integer("loads").notNull().default(1),
  notes: text("notes"),
  createdAt: createdAt(),
});

/**
 * Job-specific extra costs (tolls, parking, rentals...). These are part of job
 * cost and are never also counted as business (overhead) expenses.
 */
export const jobExpenses = pgTable("job_expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  category: jobExpenseCategory("category").notNull().default("OTHER"),
  description: text("description").notNull(),
  amount: money("amount").notNull(),
  createdAt: createdAt(),
});

/** General overhead not tied to a single job. */
export const businessExpenses = pgTable(
  "business_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date", { mode: "string" }).notNull(),
    vendor: text("vendor"),
    category: expenseCategory("category").notNull(),
    description: text("description"),
    amount: money("amount").notNull(),
    /** Advertising spend can be attributed to a lead source for marketing ROI. */
    leadSourceId: uuid("lead_source_id").references(() => leadSources.id, { onDelete: "set null" }),
    /**
     * True when this cash outlay is already represented by job costing (e.g. a
     * diesel fill-up while jobs already carry per-mile fuel cost). Such rows are
     * excluded from company profit to prevent double counting.
     */
    coveredByJobCosts: boolean("covered_by_job_costs").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("business_expenses_date_idx").on(t.date), index("business_expenses_category_idx").on(t.category)],
);

/** Receipt photos / files stored in the database (images are resized client-side). */
export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    data: bytea("data").notNull(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }),
    dumpRecordId: uuid("dump_record_id").references(() => dumpRecords.id, { onDelete: "cascade" }),
    jobExpenseId: uuid("job_expense_id").references(() => jobExpenses.id, { onDelete: "cascade" }),
    businessExpenseId: uuid("business_expense_id").references(() => businessExpenses.id, {
      onDelete: "cascade",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    index("attachments_job_idx").on(t.jobId),
    index("attachments_business_expense_idx").on(t.businessExpenseId),
  ],
);

/** History/cache of automatic diesel price lookups. */
export const fuelPriceQuotes = pgTable(
  "fuel_price_quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fuelType: fuelType("fuel_type").notNull().default("DIESEL"),
    price: numeric("price", { precision: 8, scale: 3, mode: "number" }).notNull(),
    source: text("source").notNull(),
    detail: text("detail"),
    sampleSize: integer("sample_size"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("fuel_price_quotes_fetched_idx").on(t.fetchedAt)],
);

// ───────────────────────────── Relations ─────────────────────────────

export const usersRelations = relations(users, ({ one }) => ({
  employee: one(employees, { fields: [users.employeeId], references: [employees.id] }),
}));

export const employeesRelations = relations(employees, ({ many }) => ({
  labor: many(jobLabor),
}));

export const leadSourcesRelations = relations(leadSources, ({ many }) => ({
  customers: many(customers),
  jobs: many(jobs),
  businessExpenses: many(businessExpenses),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  leadSource: one(leadSources, { fields: [customers.leadSourceId], references: [leadSources.id] }),
  jobs: many(jobs),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  customer: one(customers, { fields: [jobs.customerId], references: [customers.id] }),
  leadSource: one(leadSources, { fields: [jobs.leadSourceId], references: [leadSources.id] }),
  vehicle: one(vehicles, { fields: [jobs.vehicleId], references: [vehicles.id] }),
  dumpFacility: one(dumpFacilities, { fields: [jobs.dumpFacilityId], references: [dumpFacilities.id] }),
  routeStops: many(jobRouteStops),
  labor: many(jobLabor),
  dumpRecords: many(dumpRecords),
  expenses: many(jobExpenses),
  attachments: many(attachments),
}));

export const jobRouteStopsRelations = relations(jobRouteStops, ({ one }) => ({
  job: one(jobs, { fields: [jobRouteStops.jobId], references: [jobs.id] }),
}));

export const jobLaborRelations = relations(jobLabor, ({ one }) => ({
  job: one(jobs, { fields: [jobLabor.jobId], references: [jobs.id] }),
  employee: one(employees, { fields: [jobLabor.employeeId], references: [employees.id] }),
}));

export const dumpRecordsRelations = relations(dumpRecords, ({ one, many }) => ({
  job: one(jobs, { fields: [dumpRecords.jobId], references: [jobs.id] }),
  facility: one(dumpFacilities, { fields: [dumpRecords.facilityId], references: [dumpFacilities.id] }),
  attachments: many(attachments),
}));

export const jobExpensesRelations = relations(jobExpenses, ({ one, many }) => ({
  job: one(jobs, { fields: [jobExpenses.jobId], references: [jobs.id] }),
  attachments: many(attachments),
}));

export const businessExpensesRelations = relations(businessExpenses, ({ one, many }) => ({
  leadSource: one(leadSources, { fields: [businessExpenses.leadSourceId], references: [leadSources.id] }),
  attachments: many(attachments),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  job: one(jobs, { fields: [attachments.jobId], references: [jobs.id] }),
  dumpRecord: one(dumpRecords, { fields: [attachments.dumpRecordId], references: [dumpRecords.id] }),
  jobExpense: one(jobExpenses, { fields: [attachments.jobExpenseId], references: [jobExpenses.id] }),
  businessExpense: one(businessExpenses, {
    fields: [attachments.businessExpenseId],
    references: [businessExpenses.id],
  }),
}));

export const vehiclesRelations = relations(vehicles, ({ many }) => ({ jobs: many(jobs) }));
export const dumpFacilitiesRelations = relations(dumpFacilities, ({ many }) => ({
  dumpRecords: many(dumpRecords),
  jobs: many(jobs),
}));

export type Job = typeof jobs.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Vehicle = typeof vehicles.$inferSelect;
export type Employee = typeof employees.$inferSelect;
export type LeadSource = typeof leadSources.$inferSelect;
export type SettingsRow = typeof settings.$inferSelect;
export type BusinessExpense = typeof businessExpenses.$inferSelect;
export type JobStatus = (typeof jobStatus.enumValues)[number];
export type JobType = (typeof jobType.enumValues)[number];
export type PaymentStatus = (typeof paymentStatus.enumValues)[number];
export type PaymentMethod = (typeof paymentMethod.enumValues)[number];
export type ExpenseCategory = (typeof expenseCategory.enumValues)[number];
export type JobExpenseCategory = (typeof jobExpenseCategory.enumValues)[number];
export type RouteStopType = (typeof routeStopType.enumValues)[number];

