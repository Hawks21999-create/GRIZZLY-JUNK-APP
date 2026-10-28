import Link from "@/components/Link";

export const metadata = { title: "Owner only" };

export default function NoAccess() {
  return (
    <div className="card mt-6 space-y-3 p-6 text-center">
      <div className="text-lg font-bold">This page is for the owner/admin</div>
      <p className="text-sm text-stone-500">Ask the owner if you need access to finances, reports or settings.</p>
      <Link href="/" className="btn-primary w-full">
        Back to dashboard
      </Link>
    </div>
  );
}
