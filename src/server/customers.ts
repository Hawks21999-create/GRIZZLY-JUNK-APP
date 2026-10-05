import "server-only";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, jobs, leadSources } from "@/db/schema";
import { phoneDigits } from "@/lib/phone";
import { jobFinancials } from "@/lib/calc";
import { loadJobsForCalc } from "./jobs";
import { calcOpts, getSettings } from "./settings";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CustomerMatchInput = {
  customerId?: string | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  lat?: number | null;
  lng?: number | null;
  leadSourceId?: string | null;
};

/** Find an existing customer by exact phone digits, then by email. */
export async function findDuplicateCustomer(
  q: { phone?: string | null; email?: string | null },
  tx: Tx | typeof db = db,
) {
  const digits = phoneDigits(q.phone);
  if (digits && digits.length >= 10) {
    const [m] = await tx.select().from(customers).where(eq(customers.phoneDigits, digits)).limit(1);
    if (m) return m;
  }
  if (q.email) {
    const [m] = await tx
      .select()
      .from(customers)
      .where(eq(customers.emailLower, q.email.trim().toLowerCase()))
      .limit(1);
    if (m) return m;
  }
  return null;
}

/**
 * Connects a job to an existing customer instead of creating duplicates.
 * Fills in any missing contact details on the existing record.
 */
export async function resolveCustomer(tx: Tx, input: CustomerMatchInput): Promise<string> {
  let existing = input.customerId
    ? (await tx.select().from(customers).where(eq(customers.id, input.customerId)).limit(1))[0]
    : undefined;
  if (input.customerId && !existing) throw new Error("Selected customer no longer exists");
  if (!existing) existing = (await findDuplicateCustomer(input, tx)) ?? undefined;

  const digits = phoneDigits(input.phone);
  if (existing) {
    const patch: Partial<typeof customers.$inferInsert> = {};
    if (!existing.phone && input.phone) {
      patch.phone = input.phone;
      patch.phoneDigits = digits;
    }
    if (!existing.email && input.email) {
      patch.email = input.email;
      patch.emailLower = input.email.toLowerCase();
    }
    if (!existing.address && input.address) {
      Object.assign(patch, {
        address: input.address,
        city: input.city ?? null,
        state: input.state ?? null,
        zip: input.zip ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
      });
    }
    if (!existing.leadSourceId && input.leadSourceId) patch.leadSourceId = input.leadSourceId;
    if (Object.keys(patch).length) await tx.update(customers).set(patch).where(eq(customers.id, existing.id));
    return existing.id;
  }

  const [created] = await tx
    .insert(customers)
    .values({
      name: input.name,
      phone: input.phone ?? null,
      phoneDigits: digits,
      email: input.email ?? null,
      emailLower: input.email?.toLowerCase() ?? null,
      address: input.address ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      zip: input.zip ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      leadSourceId: input.leadSourceId ?? null,
    })
    .returning({ id: customers.id });
  return created.id;
}

export async function searchCustomers(q: string, limit = 8) {
  const term = q.trim();
  if (!term) return [];
  const digits = term.replace(/\D/g, "");
  const conds = [ilike(customers.name, `%${term}%`), ilike(customers.email, `%${term}%`), ilike(customers.address, `%${term}%`)];
  if (digits.length >= 3) conds.push(ilike(customers.phoneDigits, `%${digits}%`));
  return db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      email: customers.email,
      address: customers.address,
      city: customers.city,
      state: customers.state,
      zip: customers.zip,
      lat: customers.lat,
      lng: customers.lng,
      leadSourceId: customers.leadSourceId,
    })
    .from(customers)
    .where(or(...conds))
    .orderBy(desc(customers.updatedAt))
    .limit(limit);
}

export type CustomerStats = {
  jobCount: number;
  completedCount: number;
  lifetimeRevenue: number;
  lifetimeProfit: number;
  lastJobAt: Date | null;
};

/** Lifetime stats computed from completed jobs (actual numbers). */
export async function customerStats(customerIds: string[]): Promise<Map<string, CustomerStats>> {
  const out = new Map<string, CustomerStats>();
  if (!customerIds.length) return out;
  const settings = await getSettings();
  const rows = await loadJobsForCalc(inArray(jobs.customerId, customerIds));
  for (const id of customerIds) {
    out.set(id, { jobCount: 0, completedCount: 0, lifetimeRevenue: 0, lifetimeProfit: 0, lastJobAt: null });
  }
  for (const j of rows) {
    const s = out.get(j.customerId)!;
    if (j.status !== "CANCELLED" && j.status !== "NOT_BOOKED") s.jobCount += 1;
    const when = j.scheduledStart ?? j.createdAt;
    if (j.status === "COMPLETED") {
      const f = jobFinancials(j.calc, calcOpts(settings));
      s.completedCount += 1;
      s.lifetimeRevenue = Math.round((s.lifetimeRevenue + f.best.price) * 100) / 100;
      s.lifetimeProfit = Math.round((s.lifetimeProfit + f.best.profit) * 100) / 100;
    }
    if (j.status !== "CANCELLED" && j.status !== "NOT_BOOKED" && (!s.lastJobAt || when > s.lastJobAt)) {
      s.lastJobAt = when;
    }
  }
  return out;
}

export async function listCustomers(q?: string) {
  const term = q?.trim();
  const where = term
    ? or(
        ilike(customers.name, `%${term}%`),
        ilike(customers.email, `%${term}%`),
        ilike(customers.address, `%${term}%`),
        term.replace(/\D/g, "").length >= 3
          ? ilike(customers.phoneDigits, `%${term.replace(/\D/g, "")}%`)
          : sql`false`,
      )
    : undefined;
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      email: customers.email,
      address: customers.address,
      city: customers.city,
      leadSource: leadSources.name,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .leftJoin(leadSources, eq(leadSources.id, customers.leadSourceId))
    .where(where)
    .orderBy(desc(customers.updatedAt))
    .limit(term ? 100 : 300);
  const stats = await customerStats(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, stats: stats.get(r.id)! }));
}

export async function getCustomer(id: string) {
  const [c] = await db
    .select({ customer: customers, leadSourceName: leadSources.name })
    .from(customers)
    .leftJoin(leadSources, eq(leadSources.id, customers.leadSourceId))
    .where(eq(customers.id, id))
    .limit(1);
  if (!c) return null;
  const stats = (await customerStats([id])).get(id)!;
  return { ...c.customer, leadSourceName: c.leadSourceName, stats };
}

