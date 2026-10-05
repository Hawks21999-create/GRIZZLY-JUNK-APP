import Link from "@/components/Link";
import { and, desc, gte, lte } from "drizzle-orm";
import { Paperclip, Plus } from "lucide-react";
import { db } from "@/db";
import { attachments, businessExpenses } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/server";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/constants";
import { money } from "@/lib/format";
import { fmtYmd, periodDays, type PeriodKey } from "@/lib/tz";
import { getLeadSources, getSettings } from "@/server/settings";
import { PeriodPicker } from "@/components/PeriodPicker";
import { Card, Empty, ListLink, PageHeader, SectionTitle } from "@/components/ui";
import { isNotNull } from "drizzle-orm";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const s = await getSettings();
  const key = (["today", "week", "month", "last_month", "year", "custom"].includes(sp.period ?? "") ? sp.period : "month") as PeriodKey;
  const p = periodDays(key, s.timezone, { from: sp.from, to: sp.to });
  const [rows, sources, withFiles] = await Promise.all([
    db
      .select()
      .from(businessExpenses)
      .where(and(gte(businessExpenses.date, p.from), lte(businessExpenses.date, p.to)))
      .orderBy(desc(businessExpenses.date), desc(businessExpenses.createdAt)),
    getLeadSources(true),
    db.selectDistinct({ id: attachments.businessExpenseId }).from(attachments).where(isNotNull(attachments.businessExpenseId)),
  ]);
  const hasFile = new Set(withFiles.map((w) => w.id));
  const srcName = new Map(sources.map((x) => [x.id, x.name]));
  const counted = rows.filter((r) => !r.coveredByJobCosts);
  const covered = rows.filter((r) => r.coveredByJobCosts);
  const total = (xs: typeof rows) => Math.round(xs.reduce((a, r) => a + r.amount, 0) * 100) / 100;
  const byCat = new Map<string, number>();
  for (const r of counted) byCat.set(r.category, Math.round(((byCat.get(r.category) ?? 0) + r.amount) * 100) / 100);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Business Expenses"
        subtitle="Overhead not tied to a single job"
        action={
          <Link href="/expenses/new" className="btn-primary">
            <Plus className="h-5 w-5" /> Add
          </Link>
        }
      />
      <PeriodPicker base="/expenses" current={key} from={p.from} to={p.to} />
      <Card className="grid grid-cols-2 gap-4 p-4">
        <div>
          <div className="text-[11px] font-bold tracking-wide text-stone-500 uppercase">Counted in profit</div>
          <div className="tabular text-2xl font-extrabold">{money(total(counted), s.currency)}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold tracking-wide text-stone-500 uppercase">Already in job costs</div>
          <div className="tabular text-2xl font-extrabold text-stone-400">{money(total(covered), s.currency)}</div>
          <div className="text-xs text-stone-500">not subtracted again</div>
        </div>
      </Card>
      {byCat.size ? (
        <Card className="p-4">
          {[...byCat.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([c, amt]) => (
              <div key={c} className="flex justify-between py-1 text-sm">
                <span className="text-stone-600">{EXPENSE_CATEGORY_LABEL[c as keyof typeof EXPENSE_CATEGORY_LABEL]}</span>
                <span className="tabular font-semibold">{money(amt, s.currency)}</span>
              </div>
            ))}
        </Card>
      ) : null}
      <section>
        <SectionTitle>
          {fmtYmd(p.from, { year: true })} – {fmtYmd(p.to, { year: true })}
        </SectionTitle>
        {rows.length ? (
          <div className="card divide-y divide-stone-100 overflow-hidden">
            {rows.map((r) => (
              <ListLink
                key={r.id}
                href={`/expenses/${r.id}`}
                right={
                  <div className={`tabular text-right font-bold ${r.coveredByJobCosts ? "text-stone-400" : ""}`}>
                    {money(r.amount, s.currency)}
                    {r.coveredByJobCosts ? <div className="text-[10px] font-semibold uppercase">in job costs</div> : null}
                  </div>
                }
              >
                <div className="flex items-center gap-1.5 truncate font-semibold">
                  {r.vendor || EXPENSE_CATEGORY_LABEL[r.category]}
                  {hasFile.has(r.id) ? <Paperclip className="h-3.5 w-3.5 text-stone-400" /> : null}
                </div>
                <div className="truncate text-sm text-stone-500">
                  {fmtYmd(r.date)} · {EXPENSE_CATEGORY_LABEL[r.category]}
                  {r.leadSourceId ? ` · ${srcName.get(r.leadSourceId)}` : ""}
                  {r.description ? ` · ${r.description}` : ""}
                </div>
              </ListLink>
            ))}
          </div>
        ) : (
          <Empty title="No expenses in this period" />
        )}
      </section>
      <p className="px-1 text-xs text-stone-500">
        Job-specific costs (dump receipts, tolls, rentals, labor) are entered on the job itself so each job shows its true profit. Don&apos;t enter them here too.
      </p>
    </div>
  );
}
