import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  customers,
  dumpRecords,
  employees,
  jobExpenses,
  jobLabor,
  jobRouteStops,
  jobs,
  vehicles,
  type JobStatus,
} from "@/db/schema";
import { jobFinancials, type JobForCalc } from "@/lib/calc";
import { formatJobNumber, parseJobNumber } from "@/lib/constants";
import { phoneDigits } from "@/lib/phone";
import { zonedTimeToUtc } from "@/lib/tz";
import type { CompleteJobInput, JobInputParsed } from "@/lib/validation";
import { completeJobSchema } from "@/lib/validation";
import { resolveCustomer } from "./customers";
import { UserError } from "@/lib/errors";
import { calcOpts, getSettings } from "./settings";
import { BOOKED_STATUSES } from "@/lib/constants";
import { getCurrentDiesel } from "./fuel";
import { syncJobToCalendar, deleteCalendarEvent } from "./gcal";

const withAll = {
  customer: true as const,
  leadSource: true as const,
  dumpFacility: true as const,
  vehicle: true as const,
  routeStops: { orderBy: [asc(jobRouteStops.position)] },
  labor: { with: { employee: true as const } },
  dumpRecords: { orderBy: [asc(dumpRecords.createdAt)] },
  expenses: { orderBy: [asc(jobExpenses.createdAt)] },
};

type JobRowRaw = NonNullable<Awaited<ReturnType<typeof fetchOne>>>;
async function fetchOne(id: string) {
  return db.query.jobs.findFirst({ where: eq(jobs.id, id), with: withAll });
}

export function toCalc(j: JobRowRaw): JobForCalc {
  return {
    status: j.status,
    quotedPrice: j.quotedPrice,
    finalPrice: j.finalPrice,
    leadCost: j.leadCost,
    workersCount: j.workersCount,
    estLaborHours: j.estLaborHours,
    mpg: j.mpg,
    fuelPrice: j.fuelPrice,
    maintenancePerMile: j.maintenancePerMile,
    depreciationPerMile: j.depreciationPerMile,
    routeMiles: j.routeMiles,
    milesOverride: j.milesOverride,
    actualMiles: j.actualMiles,
    estDumpCost: j.estDumpCost,
    estimateSnapshot: j.estimateSnapshot,
    labor: j.labor.map((l) => ({
      employeeName: l.employee?.name,
      hourlyRate: l.hourlyRate,
      estHours: l.estHours,
      actualHours: l.actualHours,
    })),
    dumpRecords: j.dumpRecords.map((d) => ({ fee: d.fee })),
    expenses: j.expenses.map((e) => ({ amount: e.amount })),
  };
}

export async function loadJobsForCalc(where?: SQL, orderBy: "asc" | "desc" = "asc", limit?: number) {
  const rows = await db.query.jobs.findMany({
    where,
    with: withAll,
    orderBy: orderBy === "asc" ? [asc(jobs.scheduledStart), asc(jobs.jobNumber)] : [desc(jobs.scheduledStart), desc(jobs.jobNumber)],
    limit,
  });
  return rows.map((r) => ({ ...r, calc: toCalc(r) }));
}

export type LoadedJob = Awaited<ReturnType<typeof loadJobsForCalc>>[number];

export async function getJobDetail(id: string) {
  const row = await fetchOne(id);
  if (!row) return null;
  const settings = await getSettings();
  const calc = toCalc(row);
  const fin = jobFinancials(calc, calcOpts(settings));
  const attachmentsList = await db.query.attachments.findMany({
    where: (a, { eq: e }) => e(a.jobId, id),
    columns: { id: true, fileName: true, mimeType: true, sizeBytes: true, dumpRecordId: true, jobExpenseId: true, createdAt: true },
    orderBy: (a, { asc: o }) => [o(a.createdAt)],
  });
  return {
    job: row,
    jobNumber: formatJobNumber(row.jobNumber, settings.jobNumberPrefix),
    financials: fin,
    attachments: attachmentsList,
    settings,
  };
}

/** Jobs whose schedule falls in [start, end). */
export function scheduledBetween(start: Date, end: Date): SQL {
  return and(gte(jobs.scheduledStart, start), lt(jobs.scheduledStart, end))!;
}

/**
 * Period filter used by reports: a job belongs to the period of its scheduled
 * date; unscheduled leads fall back to the date the lead came in.
 */
export function inPeriod(start: Date, end: Date): SQL {
  return or(
    scheduledBetween(start, end),
    and(isNull(jobs.scheduledStart), gte(jobs.leadReceivedAt, start), lt(jobs.leadReceivedAt, end)),
  )!;
}

export async function searchJobs(q: string, opts: { status?: JobStatus | "ALL"; from?: Date; to?: Date } = {}) {
  const conds: SQL[] = [];
  const term = q.trim();
  if (term) {
    const num = parseJobNumber(term);
    const digits = term.replace(/\D/g, "");
    const textConds: SQL[] = [
      ilike(customers.name, `%${term}%`),
      ilike(jobs.address, `%${term}%`),
      ilike(jobs.city, `%${term}%`),
    ];
    if (digits.length >= 3) textConds.push(ilike(customers.phoneDigits, `%${digits}%`));
    if (num !== null) textConds.push(eq(jobs.jobNumber, num));
    conds.push(or(...textConds)!);
  }
  if (opts.status && opts.status !== "ALL") conds.push(eq(jobs.status, opts.status));
  if (opts.from) conds.push(gte(jobs.scheduledStart, opts.from));
  if (opts.to) conds.push(lt(jobs.scheduledStart, opts.to));

  const ids = await db
    .select({ id: jobs.id })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(sql`${jobs.scheduledStart} desc nulls first`, desc(jobs.jobNumber))
    .limit(200);
  if (!ids.length) return [];
  const rows = await loadJobsForCalc(inArray(jobs.id, ids.map((i) => i.id)), "desc");
  const order = new Map(ids.map((r, i) => [r.id, i]));
  return rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}

// ───────────────────────────── Mutations ─────────────────────────────

type Actor = { id: string };

function scheduleFrom(input: Pick<JobInputParsed, "date" | "time">, tz: string): Date | null {
  if (!input.date) return null;
  return zonedTimeToUtc(input.date, input.time || "09:00", tz);
}

function leadReceivedFrom(input: Pick<JobInputParsed, "leadReceivedDate" | "leadReceivedTime">, tz: string): Date | null {
  if (!input.leadReceivedDate) return null;
  return zonedTimeToUtc(input.leadReceivedDate, input.leadReceivedTime || "09:00", tz);
}

/** Diesel price for a job: what the form sent (manual/override), else today's price. */
async function fuelFields(input: Pick<JobInputParsed, "fuelPrice" | "fuelPriceSource">) {
  if (input.fuelPrice != null) return { fuelPrice: input.fuelPrice, fuelPriceSource: input.fuelPriceSource ?? "Manual" };
  const d = await getCurrentDiesel();
  return { fuelPrice: d.price, fuelPriceSource: d.automatic ? `${d.source}${d.detail ? ` · ${d.detail}` : ""}` : d.source };
}

const isBooked = (s: string) => BOOKED_STATUSES.includes(s as JobStatus);
const isLost = (s: string) => s === "NOT_BOOKED" || s === "CANCELLED";

async function vehicleSnapshot(tx: Tx, vehicleId: string | null, fallbackId: string | null) {
  const id = vehicleId ?? fallbackId;
  let v = id ? (await tx.select().from(vehicles).where(eq(vehicles.id, id)).limit(1))[0] : undefined;
  if (!v) v = (await tx.select().from(vehicles).where(eq(vehicles.active, true)).limit(1))[0];
  if (!v) throw new UserError("Add a vehicle in Settings → Vehicles before booking jobs.");
  return {
    vehicleId: v.id,
    mpg: v.mpg,
    fuelPrice: v.fuelPrice,
    maintenancePerMile: v.maintenancePerMile,
    depreciationPerMile: v.depreciationPerMile,
  };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];


async function employeeRates(tx: Tx, ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const rows = await tx.select({ id: employees.id, rate: employees.hourlyCost }).from(employees).where(inArray(employees.id, ids));
  if (rows.length !== new Set(ids).size) throw new UserError("One of the selected workers no longer exists.");
  return new Map(rows.map((r) => [r.id, r.rate]));
}

function routeFields(input: JobInputParsed) {
  const r = input.route;
  return {
    routeMiles: r?.totalMiles ?? null,
    routeError: r?.error ?? null,
    routeCalculatedAt: r?.totalMiles != null ? new Date() : null,
    milesOverride: input.milesOverride ?? null,
  };
}

async function writeRouteStops(tx: Tx, jobId: string, input: JobInputParsed) {
  await tx.delete(jobRouteStops).where(eq(jobRouteStops.jobId, jobId));
  const stops = input.route?.stops ?? [];
  if (stops.length) {
    await tx.insert(jobRouteStops).values(
      stops.map((s, i) => ({
        jobId,
        position: i,
        type: s.type,
        label: s.label,
        address: s.address,
        lat: s.lat ?? null,
        lng: s.lng ?? null,
        legMiles: i === 0 ? null : (s.legMiles ?? null),
      })),
    );
  }
}

export async function createJob(input: JobInputParsed, actor: Actor) {
  const settings = await getSettings();
  const fuel = await fuelFields(input);
  const id = await db.transaction(async (tx) => {
    const customerId = await resolveCustomer(tx, {
      customerId: input.customerId,
      name: input.customer.name,
      phone: input.customer.phone,
      email: input.customer.email,
      address: input.address,
      city: input.city,
      state: input.state,
      zip: input.zip,
      lat: input.lat,
      lng: input.lng,
      leadSourceId: input.leadSourceId,
    });
    const snap = await vehicleSnapshot(tx, input.vehicleId, settings.defaultVehicleId);
    const rates = await employeeRates(tx, input.labor.map((l) => l.employeeId));
    const [job] = await tx
      .insert(jobs)
      .values({
        customerId,
        status: input.status as JobStatus,
        jobType: input.jobType as never,
        scheduledStart: scheduleFrom(input, settings.timezone),
        durationMinutes: input.durationMinutes,
        address: input.address,
        city: input.city,
        state: input.state,
        zip: input.zip,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        quotedPrice: input.quotedPrice,
        deposit: input.deposit,
        paymentStatus: input.paymentStatus as never,
        paymentMethod: input.paymentMethod as never,
        leadSourceId: input.leadSourceId,
        leadCost: input.leadCost,
        workersCount: input.labor.length || input.workersCount,
        estLaborHours: input.estLaborHours,
        ...snap,
        ...routeFields(input),
        dumpFacilityId: input.dumpFacilityId,
        estDumpCost: input.estDumpCost,
        notes: input.notes,
        ...fuel,
        leadReceivedAt: leadReceivedFrom(input, settings.timezone) ?? new Date(),
        bookedAt: isBooked(input.status) ? new Date() : null,
        lostReason: isLost(input.status) ? input.lostReason : null,
        createdById: actor.id,
      })
      .returning({ id: jobs.id });
    await writeRouteStops(tx, job.id, input);
    if (input.labor.length) {
      await tx.insert(jobLabor).values(
        input.labor.map((l) => ({ jobId: job.id, employeeId: l.employeeId, hourlyRate: rates.get(l.employeeId)!, estHours: l.estHours })),
      );
    }
    if (input.expenses.length) {
      await tx.insert(jobExpenses).values(
        input.expenses.map((e) => ({ jobId: job.id, category: e.category as never, description: e.description, amount: e.amount })),
      );
    }
    return job.id;
  });
  await syncJobToCalendar(id);
  return id;
}

export async function updateJob(id: string, input: JobInputParsed & { expenseIds?: (string | null)[] }) {
  const settings = await getSettings();
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(jobs).where(eq(jobs.id, id)).limit(1);
    if (!current) throw new UserError("Job not found");
    const customerId = await resolveCustomer(tx, {
      customerId: input.customerId ?? current.customerId,
      name: input.customer.name,
      phone: input.customer.phone,
      email: input.customer.email,
      address: input.address,
      city: input.city,
      state: input.state,
      zip: input.zip,
      lat: input.lat,
      lng: input.lng,
      leadSourceId: input.leadSourceId,
    });
    // Keep customer contact info in sync with what was edited on the job form.
    const digits = phoneDigits(input.customer.phone);
    await tx
      .update(customers)
      .set({
        name: input.customer.name,
        phone: input.customer.phone,
        phoneDigits: digits,
        email: input.customer.email,
        emailLower: input.customer.email?.toLowerCase() ?? null,
      })
      .where(eq(customers.id, customerId));

    const vehicleChanged = (input.vehicleId ?? current.vehicleId) !== current.vehicleId;
    const snap = vehicleChanged ? await vehicleSnapshot(tx, input.vehicleId, settings.defaultVehicleId) : {};
    const rates = await employeeRates(tx, input.labor.map((l) => l.employeeId));

    const statusChanged = input.status !== current.status;
    await tx
      .update(jobs)
      .set({
        customerId,
        status: input.status as JobStatus,
        jobType: input.jobType as never,
        scheduledStart: scheduleFrom(input, settings.timezone),
        durationMinutes: input.durationMinutes,
        address: input.address,
        city: input.city,
        state: input.state,
        zip: input.zip,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        quotedPrice: input.quotedPrice,
        deposit: input.deposit,
        paymentStatus: input.paymentStatus as never,
        paymentMethod: input.paymentMethod as never,
        leadSourceId: input.leadSourceId,
        leadCost: input.leadCost,
        workersCount: input.labor.length || input.workersCount,
        estLaborHours: input.estLaborHours,
        ...snap,
        ...routeFields(input),
        dumpFacilityId: input.dumpFacilityId,
        estDumpCost: input.estDumpCost,
        notes: input.notes,
        ...(input.fuelPrice != null ? { fuelPrice: input.fuelPrice, fuelPriceSource: input.fuelPriceSource ?? "Manual" } : {}),
        ...(input.leadReceivedDate ? { leadReceivedAt: leadReceivedFrom(input, settings.timezone)! } : {}),
        ...(isBooked(input.status) && !current.bookedAt ? { bookedAt: new Date() } : {}),
        lostReason: isLost(input.status) ? (input.lostReason ?? current.lostReason) : null,
        ...(statusChanged && current.status === "COMPLETED" ? { completedAt: null, estimateSnapshot: null } : {}),
      })
      .where(eq(jobs.id, id));
    await writeRouteStops(tx, id, input);

    // Labor: keep actual hours for workers that stay on the job.
    const existing = await tx.select().from(jobLabor).where(eq(jobLabor.jobId, id));
    const keep = new Set(input.labor.map((l) => l.employeeId));
    const toRemove = existing.filter((e) => !keep.has(e.employeeId)).map((e) => e.id);
    if (toRemove.length) await tx.delete(jobLabor).where(inArray(jobLabor.id, toRemove));
    for (const l of input.labor) {
      const prev = existing.find((e) => e.employeeId === l.employeeId);
      if (prev) {
        await tx.update(jobLabor).set({ estHours: l.estHours }).where(eq(jobLabor.id, prev.id));
      } else {
        await tx.insert(jobLabor).values({ jobId: id, employeeId: l.employeeId, hourlyRate: rates.get(l.employeeId)!, estHours: l.estHours });
      }
    }

    // Expenses: upsert by id so receipt attachments survive edits.
    const ids = input.expenseIds ?? [];
    const prevExp = await tx.select({ id: jobExpenses.id }).from(jobExpenses).where(eq(jobExpenses.jobId, id));
    const keptIds = new Set(ids.filter(Boolean) as string[]);
    const removeExp = prevExp.filter((p) => !keptIds.has(p.id)).map((p) => p.id);
    if (removeExp.length) await tx.delete(jobExpenses).where(inArray(jobExpenses.id, removeExp));
    for (let i = 0; i < input.expenses.length; i++) {
      const e = input.expenses[i];
      const eid = ids[i];
      const values = { category: e.category as never, description: e.description, amount: e.amount };
      if (eid && prevExp.some((p) => p.id === eid)) {
        await tx.update(jobExpenses).set(values).where(and(eq(jobExpenses.id, eid), eq(jobExpenses.jobId, id)));
      } else {
        await tx.insert(jobExpenses).values({ jobId: id, ...values });
      }
    }
  });
  await syncJobToCalendar(id);
}

export async function setJobStatus(id: string, status: JobStatus, lostReason?: string | null) {
  const settings = await getSettings();
  const row = await fetchOne(id);
  if (!row) throw new UserError("Job not found");
  if (row.status === status) {
    if (isLost(status) && lostReason !== undefined) await db.update(jobs).set({ lostReason }).where(eq(jobs.id, id));
    return;
  }
  const patch: Partial<typeof jobs.$inferInsert> = { status };
  if (isBooked(status) && !row.bookedAt) patch.bookedAt = new Date();
  patch.lostReason = isLost(status) ? (lostReason ?? row.lostReason) : null;
  if (status === "COMPLETED") {
    patch.completedAt = new Date();
    patch.estimateSnapshot = jobFinancials({ ...toCalc(row), status: "SCHEDULED" }, { laborRate: settings.defaultLaborRate, includeWear: true }).estimate;
    if (row.finalPrice === null) patch.finalPrice = row.quotedPrice;
  } else if (row.status === "COMPLETED") {
    patch.completedAt = null;
    patch.estimateSnapshot = null;
  }
  await db.update(jobs).set(patch).where(eq(jobs.id, id));
  await syncJobToCalendar(id);
}

/** Re-copy the job's vehicle rates from the current vehicle settings. */
export async function refreshVehicleRates(id: string) {
  const settings = await getSettings();
  await db.transaction(async (tx) => {
    const [j] = await tx.select({ vehicleId: jobs.vehicleId }).from(jobs).where(eq(jobs.id, id)).limit(1);
    if (!j) throw new UserError("Job not found");
    const snap = await vehicleSnapshot(tx, j.vehicleId, settings.defaultVehicleId);
    const fuel = await fuelFields({ fuelPrice: null, fuelPriceSource: null });
    await tx.update(jobs).set({ ...snap, ...fuel }).where(eq(jobs.id, id));
  });
}

export async function completeJob(raw: CompleteJobInput & { dumpRecordIds?: (string | null)[]; expenseIds?: (string | null)[] }) {
  const input = completeJobSchema.parse(raw);
  const settings = await getSettings();
  const row = await fetchOne(input.jobId);
  if (!row) throw new UserError("Job not found");
  if (row.status === "CANCELLED" || row.status === "NOT_BOOKED") {
    throw new UserError("This job is cancelled. Change its status before completing it.");
  }

  // Freeze the estimate as it stood before actuals were entered.
  const estimate =
    row.status === "COMPLETED" && row.estimateSnapshot
      ? row.estimateSnapshot
      : jobFinancials({ ...toCalc(row), status: "SCHEDULED" }, { laborRate: settings.defaultLaborRate, includeWear: true }).estimate;

  await db.transaction(async (tx) => {
    // Dump receipts — upsert by id so receipt photos survive.
    const dumpIds = raw.dumpRecordIds ?? [];
    const keepDump = new Set(dumpIds.filter(Boolean) as string[]);
    const removeDump = row.dumpRecords.filter((d) => !keepDump.has(d.id)).map((d) => d.id);
    if (removeDump.length) await tx.delete(dumpRecords).where(inArray(dumpRecords.id, removeDump));
    for (let i = 0; i < input.dumpRecords.length; i++) {
      const d = input.dumpRecords[i];
      const did = dumpIds[i];
      const values = {
        facilityId: d.facilityId,
        facilityName: d.facilityName,
        fee: d.fee,
        weightLbs: d.weightLbs ?? null,
        loads: d.loads,
      };
      if (did && row.dumpRecords.some((x) => x.id === did)) {
        await tx.update(dumpRecords).set(values).where(eq(dumpRecords.id, did));
      } else {
        await tx.insert(dumpRecords).values({ jobId: row.id, ...values });
      }
    }

    // Labor actual hours
    const rates = await employeeRates(tx, input.labor.map((l) => l.employeeId));
    for (const l of input.labor) {
      const prev = row.labor.find((x) => x.employeeId === l.employeeId);
      if (prev) await tx.update(jobLabor).set({ actualHours: l.actualHours }).where(eq(jobLabor.id, prev.id));
      else
        await tx.insert(jobLabor).values({
          jobId: row.id,
          employeeId: l.employeeId,
          hourlyRate: rates.get(l.employeeId)!,
          estHours: 0,
          actualHours: l.actualHours,
        });
    }
    const keepLabor = new Set(input.labor.map((l) => l.employeeId));
    const dropLabor = row.labor.filter((l) => !keepLabor.has(l.employeeId)).map((l) => l.id);
    if (dropLabor.length && input.labor.length) await tx.delete(jobLabor).where(inArray(jobLabor.id, dropLabor));

    // Additional expenses
    const expIds = raw.expenseIds ?? [];
    const keepExp = new Set(expIds.filter(Boolean) as string[]);
    const removeExp = row.expenses.filter((e) => !keepExp.has(e.id)).map((e) => e.id);
    if (removeExp.length) await tx.delete(jobExpenses).where(inArray(jobExpenses.id, removeExp));
    for (let i = 0; i < input.expenses.length; i++) {
      const e = input.expenses[i];
      const eid = expIds[i];
      const values = { category: e.category as never, description: e.description, amount: e.amount };
      if (eid && row.expenses.some((x) => x.id === eid)) await tx.update(jobExpenses).set(values).where(eq(jobExpenses.id, eid));
      else await tx.insert(jobExpenses).values({ jobId: row.id, ...values });
    }

    await tx
      .update(jobs)
      .set({
        status: "COMPLETED",
        completedAt: row.completedAt ?? new Date(),
        finalPrice: input.finalPrice,
        actualMiles: input.actualMiles,
        paymentMethod: input.paymentMethod as never,
        paymentStatus: input.paid ? "PAID" : row.deposit > 0 ? "DEPOSIT_PAID" : "NOT_PAID",
        ...(input.fuelPrice != null && input.fuelPrice !== row.fuelPrice ? { fuelPrice: input.fuelPrice, fuelPriceSource: "Manual (price paid)" } : {}),
        bookedAt: row.bookedAt ?? new Date(),
        estimateSnapshot: estimate,
      })
      .where(eq(jobs.id, row.id));
  });

  await syncJobToCalendar(row.id);
  const after = await fetchOne(row.id);
  return jobFinancials(toCalc(after!), calcOpts(settings));
}

export async function deleteJob(id: string) {
  const [j] = await db.select({ gcalEventId: jobs.gcalEventId }).from(jobs).where(eq(jobs.id, id)).limit(1);
  if (!j) return;
  if (j.gcalEventId) await deleteCalendarEvent(j.gcalEventId).catch(() => undefined);
  await db.delete(jobs).where(eq(jobs.id, id));
}

export async function addDumpRecord(v: {
  jobId: string;
  facilityId: string | null;
  facilityName: string | null;
  fee: number;
  weightLbs?: number | null;
  loads: number;
  notes: string | null;
}) {
  const [r] = await db
    .insert(dumpRecords)
    .values({ ...v, weightLbs: v.weightLbs ?? null })
    .returning({ id: dumpRecords.id });
  return r.id;
}

export async function deleteDumpRecord(id: string) {
  await db.delete(dumpRecords).where(eq(dumpRecords.id, id));
}

export async function addJobExpense(v: { jobId: string; category: string; description: string; amount: number }) {
  const [r] = await db
    .insert(jobExpenses)
    .values({ ...v, category: v.category as never })
    .returning({ id: jobExpenses.id });
  return r.id;
}

export async function deleteJobExpense(id: string) {
  await db.delete(jobExpenses).where(eq(jobExpenses.id, id));
}
