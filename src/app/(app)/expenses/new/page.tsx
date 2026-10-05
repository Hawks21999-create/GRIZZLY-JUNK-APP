import { ExpenseForm } from "@/components/ExpenseForm";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/server";
import { todayYmd } from "@/lib/tz";
import { getLeadSources, getSettings } from "@/server/settings";

export const metadata = { title: "New Expense" };

export default async function NewExpensePage() {
  await requireAdmin();
  const [s, sources] = await Promise.all([getSettings(), getLeadSources()]);
  return (
    <div>
      <PageHeader title="New Business Expense" back="/expenses" subtitle="Overhead not tied to one job" />
      <ExpenseForm
        id={null}
        initial={{ date: todayYmd(s.timezone), vendor: "", category: "OTHER", description: "", amount: null, leadSourceId: null, coveredByJobCosts: false }}
        leadSources={sources.map((l) => ({ id: l.id, name: l.name }))}
      />
    </div>
  );
}
