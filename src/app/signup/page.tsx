import { redirect } from "next/navigation";
import Link from "@/components/Link";
import { getCurrentUser } from "@/lib/auth/server";
import { BrandLogo } from "@/components/Logo";
import { SignupForm } from "./SignupForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create account" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="pt-safe flex min-h-dvh flex-col bg-bear-900 px-5">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandLogo size="lg" />
          <div className="mt-4 h-1 w-16 rounded-full bg-brand-500" />
        </div>
        <SignupForm />
        <p className="mt-6 text-center text-sm text-stone-400">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brand-400">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
