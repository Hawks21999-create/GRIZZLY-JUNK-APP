import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { Mail, MessageSquare, Navigation, Pencil, Phone, Plus } from "lucide-react";
import { eq } from "drizzle-orm";
import { jobs } from "@/db/schema";
import { jobFinancials, marginPct } from "@/lib/calc";
import { money0, pct } from "@/lib/format";
import { dialable, formatPhone } from "@/lib/phone";
import { fmtDate } from "@/lib/tz";
import { getCustomer } from "@/server/customers";
import { loadJobsForCalc } from "@/server/jobs";
import { calcOpts, getSettings } from "@/server/settings";
import { JobCard, toCardData } from "@/components/JobCard";
import { Card, SectionTitle, Stat, profitTone } from "@/components/ui";

export const metadata = { title: "Customer" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [c, s] = await Promise.all([getCustomer(id), getSettings()]);
  if (!c) notFound();
  const history = await loadJobsForCalc(eq(jobs.customerId, id), "desc");
  const tel = dialable(c.phone);
  const st = c.stats;
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/customers" className="-ml-1 inline-flex min-h-9 items-center text-sm font-semibold text-brand-700">
            ‹ Customers
          </Link>
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{c.name}</h1>
          <div className="text-sm text-stone-500">{c.leadSourceName ? `Source: ${c.leadSourceName}` : "No lead source"}</div>
        </div>
        <Link href={`/customers/${id}/edit`} className="btn-secondary mt-8 shrink-0">
          <Pencil className="h-4 w-4" /> Edit
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tel ? (
          <>
            <a href={`tel:${tel}`} className="btn-dark btn-xl">
              <Phone className="h-5 w-5" /> Call
            </a>
            <a href={`sms:${tel}`} className="btn-secondary btn-xl">
              <MessageSquare className="h-5 w-5" /> Text
            </a>
          </>
        ) : null}
        {c.email ? (
          <a href={`mailto:${c.email}`} className="btn-secondary btn-xl">
            <Mail className="h-5 w-5" /> Email
          </a>
        ) : null}
        {c.address ? (
          <a href={`https://maps.apple.com/?daddr=${encodeURIComponent(c.address)}&dirflg=d`} className="btn-secondary btn-xl">
            <Navigation className="h-5 w-5" /> Navigate
          </a>
        ) : null}
      </div>

      <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
        <Stat label="Lifetime Revenue" value={money0(st.lifetimeRevenue, s.currency)} />
        <Stat label="Lifetime Profit" value={money0(st.lifetimeProfit, s.currency)} tone={profitTone(st.lifetimeProfit)} sub={pct(marginPct(st.lifetimeProfit, st.lifetimeRevenue))} />
        <Stat label="Jobs" value={st.jobCount} sub={`${st.completedCount} completed`} />
        <Stat label="Last Job" value={<span className="text-base">{st.lastJobAt ? fmtDate(st.lastJobAt, s.timezone, { year: true }) : "—"}</span>} />
      </Card>

      <Card className="space-y-1 p-4 text-sm">
        <div>
          <b>Phone:</b> {formatPhone(c.phone) || "—"}
        </div>
        <div>
          <b>Email:</b> {c.email || "—"}
        </div>
        <div>
          <b>Address:</b> {c.address || "—"}
        </div>
        {c.notes ? <div className="pt-2 whitespace-pre-wrap text-stone-700">{c.notes}</div> : null}
      </Card>

      <Link href={`/jobs/new?customer=${id}`} className="btn-primary btn-xl w-full">
        <Plus className="h-5 w-5" /> Book another job for {c.name.split(" ")[0]}
      </Link>

      <section>
        <SectionTitle>Job History</SectionTitle>
        <div className="space-y-2.5">
          {history.length ? (
            history.map((j) => (
              <JobCard key={j.id} j={toCardData(j, jobFinancials(j.calc, calcOpts(s)), s.jobNumberPrefix)} tz={s.timezone} currency={s.currency} showDate />
            ))
          ) : (
            <div className="text-sm text-stone-500">No jobs yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}
