import Link from "@/components/Link";
import { Plus, Search } from "lucide-react";
import { money0 } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { fmtDate } from "@/lib/tz";
import { listCustomers } from "@/server/customers";
import { getSettings } from "@/server/settings";
import { Empty, ListLink, PageHeader } from "@/components/ui";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string }> }) {
  const { q = "", sort = "recent" } = await searchParams;
  const [s, rows] = await Promise.all([getSettings(), listCustomers(q.slice(0, 100))]);
  const sorted =
    sort === "revenue"
      ? [...rows].sort((a, b) => b.stats.lifetimeRevenue - a.stats.lifetimeRevenue)
      : sort === "name"
        ? [...rows].sort((a, b) => a.name.localeCompare(b.name))
        : [...rows].sort((a, b) => (b.stats.lastJobAt?.getTime() ?? 0) - (a.stats.lastJobAt?.getTime() ?? 0));
  return (
    <div className="space-y-4">
      <PageHeader
        title="Customers"
        subtitle={`${rows.length} customer${rows.length === 1 ? "" : "s"}`}
        action={
          <Link href="/customers/new" className="btn-primary">
            <Plus className="h-5 w-5" /> Add
          </Link>
        }
      />
      <form action="/customers" className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-stone-400" />
        <input name="q" defaultValue={q} type="search" enterKeyHint="search" className="input pl-10" placeholder="Name, phone, email, address" />
        <input type="hidden" name="sort" value={sort} />
      </form>
      <div className="flex gap-2 text-sm">
        {[
          ["recent", "Last job"],
          ["revenue", "Top revenue"],
          ["name", "A–Z"],
        ].map(([k, label]) => (
          <Link
            key={k}
            href={`/customers?sort=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`rounded-full px-3.5 py-2 font-semibold ring-1 ${sort === k ? "bg-bear-900 text-white ring-bear-900" : "bg-white text-stone-700 ring-stone-300"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      {sorted.length ? (
        <div className="card divide-y divide-stone-100 overflow-hidden">
          {sorted.map((c) => (
            <ListLink
              key={c.id}
              href={`/customers/${c.id}`}
              right={
                <div className="text-right">
                  <div className="tabular font-bold">{money0(c.stats.lifetimeRevenue, s.currency)}</div>
                  <div className="text-xs text-stone-500">
                    {c.stats.jobCount} job{c.stats.jobCount === 1 ? "" : "s"}
                  </div>
                </div>
              }
            >
              <div className="truncate font-bold">{c.name}</div>
              <div className="truncate text-sm text-stone-500">
                {[formatPhone(c.phone), c.city].filter(Boolean).join(" · ") || "No contact info"}
              </div>
              <div className="text-xs text-stone-400">Last job: {c.stats.lastJobAt ? fmtDate(c.stats.lastJobAt, s.timezone, { year: true }) : "—"}</div>
            </ListLink>
          ))}
        </div>
      ) : (
        <Empty title="No customers found" />
      )}
    </div>
  );
}
