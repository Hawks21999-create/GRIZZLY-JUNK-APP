"use client";

import { useEffect, useState } from "react";
import Link from "@/components/Link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Calendar,
  ClipboardList,
  LayoutDashboard,
  Megaphone,
  MapPinned,
  Menu,
  PhoneIncoming,
  Plus,
  Receipt,
  Settings,
  Users,
} from "lucide-react";
import { cx } from "./ui";

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

export function BottomNav() {
  const path = usePathname();
  const [sheet, setSheet] = useState(false);
  useEffect(() => setSheet(false), [path]);
  const item = (href: string, label: string, Icon: typeof Calendar, alsoActive: string[] = []) => {
    const active = path !== "/jobs/new" && (isActive(path, href) || alsoActive.some((a) => isActive(path, a)));
    return (
      <Link
        href={href}
        className={cx(
          "flex flex-1 flex-col items-center justify-center gap-0.5 pt-1 text-[11px] font-semibold",
          active ? "text-brand-400" : "text-stone-400",
        )}
        aria-current={active ? "page" : undefined}
      >
        <Icon className="h-6 w-6" strokeWidth={active ? 2.4 : 2} />
        {label}
      </Link>
    );
  };
  return (
    <>
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-bear-900/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <div className="mx-auto flex h-[var(--nav-h)] max-w-xl items-stretch">
        {item("/", "Dashboard", LayoutDashboard)}
        {item("/calendar", "Calendar", Calendar)}
        <div className="flex flex-1 items-start justify-center">
          <button
            type="button"
            onClick={() => setSheet((v) => !v)}
            aria-label="Add lead or job"
            aria-expanded={sheet}
            className="-mt-5 flex h-16 w-16 flex-col items-center justify-center rounded-full bg-brand-500 text-bear-950 shadow-lg ring-4 ring-bear-900 active:scale-95"
          >
            <Plus className={cx("h-7 w-7 transition", sheet && "rotate-45")} strokeWidth={3} />
            <span className="-mt-0.5 text-[10px] font-extrabold">ADD</span>
          </button>
        </div>
        {item("/customers", "Customers", Users)}
        {item("/more", "More", Menu, ["/jobs", "/leads", "/cities", "/expenses", "/reports", "/marketing", "/settings"])}
      </div>
    </nav>
      {sheet ? (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-[35] bg-black/50 lg:hidden" onClick={() => setSheet(false)} />
          <div className="fixed inset-x-3 z-[36] grid grid-cols-2 gap-2 rounded-2xl bg-white p-3 shadow-2xl lg:hidden" style={{ bottom: "calc(var(--nav-h) + var(--safe-bottom) + 20px)" }}>
            <Link href="/leads/new" className="flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-xl bg-bear-900 text-white active:scale-95">
              <PhoneIncoming className="h-7 w-7 text-brand-400" />
              <span className="text-base font-extrabold">New Lead</span>
              <span className="text-[11px] text-stone-400">Customer calling now</span>
            </Link>
            <Link href="/jobs/new" className="flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-xl bg-brand-500 text-bear-950 active:scale-95">
              <Plus className="h-7 w-7" strokeWidth={3} />
              <span className="text-base font-extrabold">New Job</span>
              <span className="text-[11px] text-bear-900/70">Schedule a booked job</span>
            </Link>
          </div>
        </>
      ) : null}
    </>
  );
}

const SIDE = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: PhoneIncoming },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/jobs", label: "Jobs", icon: ClipboardList },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/marketing", label: "Lead Sources", icon: Megaphone },
  { href: "/cities", label: "Cities", icon: MapPinned },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function SideNav() {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Link href="/leads/new" className="btn bg-white/10 text-white hover:bg-white/15">
          <PhoneIncoming className="h-4 w-4" /> Lead
        </Link>
        <Link href="/jobs/new" className="btn-primary">
          <Plus className="h-4 w-4" strokeWidth={3} /> Job
        </Link>
      </div>
      {SIDE.map(({ href, label, icon: Icon }) => {
        const active = isActive(path, href) && !(href === "/jobs" && path === "/jobs/new");
        return (
          <Link
            key={href}
            href={href}
            className={cx(
              "flex min-h-11 items-center gap-3 rounded-xl px-3 font-semibold",
              active ? "bg-white/10 text-brand-400" : "text-stone-300 hover:bg-white/5",
            )}
          >
            <Icon className="h-5 w-5" /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
