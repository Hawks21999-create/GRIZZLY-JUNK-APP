import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";
import { BrandLogo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  return (
    <div className="pt-safe flex min-h-dvh flex-col bg-bear-900 px-5">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo size="lg" />
          <div className="mt-4 h-1 w-16 rounded-full bg-brand-500" />
        </div>
        <LoginForm next={next} />
        <p className="mt-6 text-center text-sm text-stone-400">
          New here?{" "}
          <a href="/signup" className="font-semibold text-brand-400">
            Create an account
          </a>
        </p>
        <p className="mt-2 text-center text-xs text-stone-500">Accounts are approved by the owner.</p>
      </div>
    </div>
  );
}
