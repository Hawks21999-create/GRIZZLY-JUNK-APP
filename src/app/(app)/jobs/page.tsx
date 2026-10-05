import Link from "@/components/Link";
import { Plus, Search } from "lucide-react";
import type { JobStatus } from "@/db/schema";
import { jobFinancials } from "@/lib/calc";
import { JOB_STATUSES, STATUS_LABEL } from "@/lib/constants";
import { isValidYmd, utcRangeForDays } from "@/lib/tz";
import { searchJobs } from "@/server/jobs";
import { calcOpts, getSettings } from "@/server/settings";
import { JobCard, toCardData } from "@/components/JobCard";
import { Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Jobs" };

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const q = (sp.q ?? "").slice(0, 100);
  const status = (JOB_STATUSES as string[]).includes(sp.status ?? "") ? (sp.status as JobStatus) : "ALL";
  const from = sp.from && isValidYmd(sp.from) ? sp.from : "";
  const to = sp.to && isValidYmd(sp.to) ? sp.to : "";
  const range = from || to ? utcRangeForDays(from || "2000-01-01", to || "2100-01-01", s.timezone) : null;
  const rows = await searchJobs(q, { status, from: range?.start, to: range?.end });

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ ...(q && { q }), ...(status !== "ALL" && { status }), ...(from && { from }), ...(to && { to }), ...over });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/jobs?${p}`;
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Jobs"
        subtitle="Search all job history"
        action={
          <Link href="/jobs/new" className="btn-primary">
            <Plus className="h-5 w-5" /> New
          </Link>
        }
      />
      <form className="space-y-2" action="/jobs">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-stone-400" />
          <input name="q" defaultValue={q} className="input pl-10" placeholder="Customer, phone, address, or GJR-0001" type="search" enterKeyHint="search" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="date" name="from" defaultValue={from} className="input" aria-label="From date" />
          <input type="date" name="to" defaultValue={to} className="input" aria-label="To date" />
        </div>
        {status !== "ALL" ? <input type="hidden" name="status" value={status} /> : null}
        <button className="btn-dark w-full" type="submit">Search</button>
      </form>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {(["ALL", ...JOB_STATUSES] as const).map((st) => (
          <Link
            key={st}
            href={qs({ status: st === "ALL" ? "" : st })}
            className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold ring-1 ${status === st ? "bg-bear-900 text-white ring-bear-900" : "bg-white text-stone-700 ring-stone-300"}`}
          >
            {st === "ALL" ? "All" : STATUS_LABEL[st]}
          </Link>
        ))}
      </div>
      <div className="text-sm text-stone-500">{rows.length === 200 ? "Showing first 200 matches" : `${rows.length} job${rows.length === 1 ? "" : "s"}`}</div>
      {rows.length ? (
        <div className="space-y-2.5">
          {rows.map((j) => (
            <JobCard key={j.id} j={toCardData(j, jobFinancials(j.calc, calcOpts(s)), s.jobNumberPrefix)} tz={s.timezone} currency={s.currency} showDate />
          ))}
        </div>
      ) : (
        <Empty title="No jobs found">Try a different search.</Empty>
      )}
    </div>
  );
}
