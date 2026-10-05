import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { attachments, businessExpenses } from "@/db/schema";
import { ExpenseForm } from "@/components/ExpenseForm";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/server";
import { getLeadSources } from "@/server/settings";

export const metadata = { title: "Edit Expense" };

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [e] = await db.select().from(businessExpenses).where(eq(businessExpenses.id, id));
  if (!e) notFound();
  const [sources, files] = await Promise.all([
    getLeadSources(),
    db.select({ id: attachments.id, fileName: attachments.fileName, mimeType: attachments.mimeType }).from(attachments).where(eq(attachments.businessExpenseId, id)),
  ]);
  return (
    <div>
      <PageHeader title="Edit Expense" back="/expenses" />
      <ExpenseForm
        id={id}
        initial={{
          date: e.date,
          vendor: e.vendor ?? "",
          category: e.category,
          description: e.description ?? "",
          amount: e.amount,
          leadSourceId: e.leadSourceId,
          coveredByJobCosts: e.coveredByJobCosts,
        }}
        leadSources={sources.map((l) => ({ id: l.id, name: l.name }))}
        attachments={files}
      />
    </div>
  );
}
