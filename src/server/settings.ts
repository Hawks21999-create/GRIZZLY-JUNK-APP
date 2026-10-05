import "server-only";
import { asc, eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { dumpFacilities, employees, leadSources, settings, vehicles } from "@/db/schema";

export const getSettings = cache(async () => {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  if (row) return row;
  const [created] = await db.insert(settings).values({ id: 1 }).onConflictDoNothing().returning();
  if (created) return created;
  const [again] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  return again!;
});

export const getVehicles = cache(async (includeInactive = false) => {
  const rows = await db.select().from(vehicles).orderBy(asc(vehicles.name));
  return includeInactive ? rows : rows.filter((v) => v.active);
});

export const getEmployees = cache(async (includeInactive = false) => {
  const rows = await db.select().from(employees).orderBy(asc(employees.name));
  return includeInactive ? rows : rows.filter((e) => e.active);
});

export const getLeadSources = cache(async (includeInactive = false) => {
  const rows = await db.select().from(leadSources).orderBy(asc(leadSources.sortOrder), asc(leadSources.name));
  return includeInactive ? rows : rows.filter((l) => l.active);
});

export const getDumpFacilities = cache(async (includeInactive = false) => {
  const rows = await db.select().from(dumpFacilities).orderBy(asc(dumpFacilities.name));
  return includeInactive ? rows : rows.filter((d) => d.active);
});

/** Everything the job form needs, in one call. */
export async function getJobFormOptions() {
  const { getCurrentDiesel, dieselLabel } = await import("./fuel");
  const [s, v, e, l, d, diesel] = await Promise.all([
    getSettings(),
    getVehicles(),
    getEmployees(),
    getLeadSources(),
    getDumpFacilities(),
    getCurrentDiesel(),
  ]);
  return {
    settings: {
      timezone: s.timezone,
      currency: s.currency,
      businessAddress: s.businessAddress,
      businessLat: s.businessLat,
      businessLng: s.businessLng,
      defaultVehicleId: s.defaultVehicleId,
      defaultDumpFacilityId: s.defaultDumpFacilityId,
      defaultDumpCost: s.defaultDumpCost,
      defaultLaborRate: s.defaultLaborRate,
      defaultJobDuration: s.defaultJobDuration,
      defaultWorkers: s.defaultWorkers,
      defaultIncludeDump: s.defaultIncludeDump,
      includeVehicleWear: s.includeVehicleWear,
      timezoneLabel: s.timezone,
    },
    diesel: { price: diesel.price, label: dieselLabel(diesel), automatic: diesel.automatic, fetchedAt: diesel.fetchedAt?.toISOString() ?? null },
    vehicles: v.map((x) => ({
      id: x.id,
      name: x.name,
      mpg: x.mpg,
      fuelPrice: x.fuelPrice,
      maintenancePerMile: x.maintenancePerMile,
      depreciationPerMile: x.depreciationPerMile,
    })),
    employees: e.map((x) => ({ id: x.id, name: x.name, hourlyCost: x.hourlyCost })),
    leadSources: l.map((x) => ({ id: x.id, name: x.name })),
    dumpFacilities: d.map((x) => ({ id: x.id, name: x.name, address: x.address, defaultFee: x.defaultFee })),
    mapsEnabled: Boolean(process.env.GOOGLE_MAPS_API_KEY),
  };
}

export type JobFormOptions = Awaited<ReturnType<typeof getJobFormOptions>>;

/** Calculation options derived from Settings (labor fallback rate, vehicle-wear policy). */
export function calcOpts(s: { defaultLaborRate: number; includeVehicleWear: boolean }) {
  return { laborRate: s.defaultLaborRate, includeWear: s.includeVehicleWear };
}
