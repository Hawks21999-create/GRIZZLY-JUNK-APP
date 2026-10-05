"use server";

import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { customers, jobs } from "@/db/schema";
import { run, type ActionResult } from "@/lib/action";
import { requireAdmin, requireUser } from "@/lib/auth/server";
import { UserError } from "@/lib/errors";
import { phoneDigits } from "@/lib/phone";
import { customerSchema } from "@/lib/validation";
import { findDuplicateCustomer } from "@/server/customers";

export async function saveCustomer(id: string | null, payload: z.input<typeof customerSchema>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    await requireUser();
    const v = customerSchema.parse(payload);
    const values = {
      ...v,
      phoneDigits: phoneDigits(v.phone),
      emailLower: v.email?.toLowerCase() ?? null,
      lat: v.lat ?? null,
      lng: v.lng ?? null,
    };
    if (id) {
      z.string().uuid().parse(id);
      await db.update(customers).set(values).where(eq(customers.id, id));
      revalidatePath("/customers", "layout");
      return { id };
    }
    const dup = await findDuplicateCustomer(v);
    if (dup) throw new UserError(`${dup.name} already has this phone/email. Open their record instead of creating a duplicate.`);
    const [c] = await db.insert(customers).values(values).returning({ id: customers.id });
    revalidatePath("/customers", "layout");
    return { id: c.id };
  });
}

export async function deleteCustomer(id: string): Promise<ActionResult> {
  return run(async () => {
    await requireAdmin();
    z.string().uuid().parse(id);
    const [{ n }] = await db.select({ n: count() }).from(jobs).where(eq(jobs.customerId, id));
    if (n > 0) throw new UserError(`This customer has ${n} job${n === 1 ? "" : "s"}. Delete or reassign the jobs first so job history is kept.`);
    await db.delete(customers).where(eq(customers.id, id));
    revalidatePath("/customers", "layout");
    return undefined;
  });
}
