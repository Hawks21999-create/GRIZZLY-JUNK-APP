import { BarChart3, ClipboardList, LogOut, MapPinned, Megaphone, PhoneIncoming, Receipt, Settings, Users } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth/server";
import { ListLink, PageHeader } from "@/components/ui";

export const metadata = { title: "More" };

export default async function MorePage() {
  const user = await getCurrentUser();
  const admin = user?.role !== "EMPLOYEE";
  const items = [
    { href: "/leads", label: "Leads", desc: "Every lead: source, cost, city, status, revenue & profit", icon: PhoneIncoming, show: true },
    { href: "/customers", label: "Customers", desc: "Customer list and lifetime value", icon: Users, show: true },
    { href: "/jobs", label: "Job History & Search", desc: "Search by customer, phone, address, date or job #", icon: ClipboardList, show: true },
    { href: "/expenses", label: "Expenses", desc: "Business (overhead) expenses & receipts", icon: Receipt, show: admin },
    { href: "/marketing", label: "Lead Source Performance", desc: "Which lead sources actually make money", icon: Megaphone, show: admin },
    { href: "/cities", label: "City Performance", desc: "Cumming vs Dawsonville and every other city", icon: MapPinned, show: admin },
    { href: "/reports", label: "Reports", desc: "Revenue, costs and profit by period", icon: BarChart3, show: admin },
    { href: "/settings", label: "Settings", desc: "Business, vehicle, workers, integrations", icon: Settings, show: admin },
  ];
  return (
    <div className="space-y-4">
      <PageHeader title="More" subtitle={user ? `Signed in as ${user.name}` : undefined} />
      <div className="card divide-y divide-stone-100 overflow-hidden">
        {items
          .filter((i) => i.show)
          .map(({ href, label, desc, icon: Icon }) => (
            <ListLink key={href} href={href}>
              <div className="flex items-center gap-3">
                <Icon className="h-6 w-6 shrink-0 text-brand-600" />
                <div className="min-w-0">
                  <div className="font-semibold">{label}</div>
                  <div className="truncate text-sm text-stone-500">{desc}</div>
                </div>
              </div>
            </ListLink>
          ))}
      </div>
      <form action={logout}>
        <button className="btn-secondary w-full">
          <LogOut className="h-5 w-5" /> Sign out
        </button>
      </form>
    </div>
  );
}
