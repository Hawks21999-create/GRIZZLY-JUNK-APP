import Link from "@/components/Link";
import { requireUser } from "@/lib/auth/server";
import { BottomNav, SideNav } from "@/components/Nav";
import { Wordmark } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64 lg:shrink-0 lg:flex-col lg:bg-bear-900 lg:p-5">
        <Link href="/" className="mb-8 block">
          <Wordmark />
        </Link>
        <SideNav />
        <div className="mt-auto truncate text-xs text-stone-500">Signed in as {user.name}</div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="pt-safe sticky top-0 z-30 border-b-2 border-brand-500 bg-bear-900 lg:hidden">
          <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
            <Link href="/" aria-label="Dashboard">
              <Wordmark />
            </Link>
            <Link href="/jobs" className="rounded-lg px-3 py-2 text-sm font-semibold text-stone-300 active:bg-white/10">
              Search
            </Link>
          </div>
        </header>
        <main className="pb-nav mx-auto max-w-3xl px-4 pt-4 lg:max-w-5xl lg:px-8 lg:pt-8 lg:pb-12">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
