"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { businessExpenses } from "@/db/schema";
import { run, type ActionResult } from "@/lib/action";
import { requireAdmin } from "@/lib/auth/server";
import { businessExpenseSchema } from "@/lib/validation";

export async function saveExpense(id: string | null, payload: z.input<typeof businessExpenseSchema>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    await requireAdmin();
    const v = businessExpenseSchema.parse(payload);
    const values = { ...v, category: v.category as never, leadSourceId: v.category === "ADVERTISING" ? v.leadSourceId : null };
    if (id) {
      z.string().uuid().parse(id);
      await db.update(businessExpenses).set(values).where(eq(businessExpenses.id, id));
      revalidatePath("/expenses", "layout");
      return { id };
    }
    const [row] = await db.insert(businessExpenses).values(values).returning({ id: businessExpenses.id });
    revalidatePath("/expenses", "layout");
    return { id: row.id };
  });
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  return run(async () => {
    await requireAdmin();
    await db.delete(businessExpenses).where(eq(businessExpenses.id, z.string().uuid().parse(id)));
    revalidatePath("/expenses", "layout");
    return undefined;
  });
}
