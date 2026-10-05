"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { dumpFacilities, employees, leadSources, settings, users, vehicles } from "@/db/schema";
import { run, type ActionResult } from "@/lib/action";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import { requireAdmin } from "@/lib/auth/server";
import { UserError } from "@/lib/errors";
import {
  businessSettingsSchema,
  dumpFacilitySchema,
  employeeSchema,
  jobDefaultsSchema,
  leadSourceSchema,
  vehicleSchema,
} from "@/lib/validation";
import { disconnectCalendar } from "@/server/gcal";

const done = () => revalidatePath("/settings", "layout");

export async function saveBusinessSettings(p: z.input<typeof businessSettingsSchema>): Promise<ActionResult> {
  return run(async () => {
    await requireAdmin();
    const v = businessSettingsSchema.parse(p);
    await db.update(settings).set({ ...v, businessLat: v.businessLat ?? null, businessLng: v.businessLng ?? null }).where(eq(settings.id, 1));
    done();
    return undefined;
  });
}

export async function saveJobDefaults(p: z.input<typeof jobDefaultsSchema>): Promise<ActionResult> {
  return run(async () => {
    await requireAdmin();
    const v = jobDefaultsSchema.parse(p);
    await db.update(settings).set(v).where(eq(settings.id, 1));
    done();
    return undefined;
  });
}

export async function saveVehicle(p: z.input<typeof vehicleSchema>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    await requireAdmin();
    const { id, ...v } = vehicleSchema.parse(p);
    let vid = id;
    if (id) await db.update(vehicles).set(v).where(eq(vehicles.id, id));
    else vid = (await db.insert(vehicles).values(v).returning({ id: vehicles.id }))[0].id;
    const [s] = await db.select({ d: settings.defaultVehicleId }).from(settings).where(eq(settings.id, 1));
    if (!s?.d && vid) await db.update(settings).set({ defaultVehicleId: vid }).where(eq(settings.id, 1));
    done();
    return { id: vid! };
  });
}

export async function saveEmployee(p: z.input<typeof employeeSchema>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    await requireAdmin();
    const { id, ...v } = employeeSchema.parse(p);
    if (id) {
      await db.update(employees).set(v).where(eq(employees.id, id));
      done();
      return { id };
    }
    const [row] = await db.insert(employees).values(v).returning({ id: employees.id });
    done();
    return { id: row.id };
  });
}

export async function saveDumpFacility(p: z.input<typeof dumpFacilitySchema>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    await requireAdmin();
    const { id, ...v } = dumpFacilitySchema.parse(p);
    const values = { ...v, lat: v.lat ?? null, lng: v.lng ?? null };
    if (id) {
      await db.update(dumpFacilities).set(values).where(eq(dumpFacilities.id, id));
      done();
      return { id };
    }
    const [row] = await db.insert(dumpFacilities).values(values).returning({ id: dumpFacilities.id });
    const [s] = await db.select({ d: settings.defaultDumpFacilityId }).from(settings).where(eq(settings.id, 1));
    if (!s?.d) await db.update(settings).set({ defaultDumpFacilityId: row.id }).where(eq(settings.id, 1));
    done();
    return { id: row.id };
  });
}

export async function saveLeadSource(p: z.input<typeof leadSourceSchema>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    await requireAdmin();
    const { id, ...v } = leadSourceSchema.parse(p);
    const clash = await db.select({ id: leadSources.id }).from(leadSources).where(eq(leadSources.name, v.name)).limit(1);
    if (clash[0] && clash[0].id !== id) throw new UserError("A lead source with that name already exists.");
    if (id) {
      await db.update(leadSources).set(v).where(eq(leadSources.id, id));
      done();
      return { id };
    }
    const [row] = await db.insert(leadSources).values({ ...v, sortOrder: 100 }).returning({ id: leadSources.id });
    done();
    return { id: row.id };
  });
}

export async function saveCalendarSettings(p: { gcalEnabled: boolean; gcalCalendarId: string }): Promise<ActionResult> {
  return run(async () => {
    await requireAdmin();
    const v = z
      .object({ gcalEnabled: z.boolean(), gcalCalendarId: z.string().trim().min(1).max(200) })
      .parse(p);
    await db.update(settings).set(v).where(eq(settings.id, 1));
    done();
    return undefined;
  });
}

export async function disconnectGoogleCalendar(): Promise<ActionResult> {
  return run(async () => {
    await requireAdmin();
    await disconnectCalendar();
    done();
    return undefined;
  });
}

const newUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  role: z.enum(["ADMIN", "EMPLOYEE"]),
  password: z.string().max(200),
});

export async function createUser(p: z.input<typeof newUserSchema>): Promise<ActionResult> {
  return run(async () => {
    const me = await requireAdmin();
    if (me.role !== "OWNER") throw new UserError("Only the owner can add users.");
    const v = newUserSchema.parse(p);
    const problem = passwordProblems(v.password);
    if (problem) throw new UserError(problem);
    const exists = await db.select({ id: users.id }).from(users).where(eq(users.email, v.email)).limit(1);
    if (exists.length) throw new UserError("A user with that email already exists.");
    await db.insert(users).values({ name: v.name, email: v.email, role: v.role, passwordHash: await hashPassword(v.password) });
    done();
    return undefined;
  });
}

export async function setUserActive(id: string, active: boolean): Promise<ActionResult> {
  return run(async () => {
    const me = await requireAdmin();
    if (me.role !== "OWNER") throw new UserError("Only the owner can change users.");
    if (id === me.id) throw new UserError("You can't deactivate your own account.");
    const [u] = await db.select().from(users).where(eq(users.id, z.string().uuid().parse(id)));
    if (!u) throw new UserError("User not found");
    await db.update(users).set({ active, sessionVersion: u.sessionVersion + 1 }).where(eq(users.id, id));
    done();
    return undefined;
  });
}
