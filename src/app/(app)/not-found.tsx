import Link from "@/components/Link";

export default function NotFound() {
  return (
    <div className="card mt-6 space-y-3 p-6 text-center">
      <div className="text-lg font-bold">Not found</div>
      <p className="text-sm text-stone-500">That job or record doesn&apos;t exist (it may have been deleted).</p>
      <Link href="/" className="btn-primary w-full">
        Back to dashboard
      </Link>
    </div>
  );
}
