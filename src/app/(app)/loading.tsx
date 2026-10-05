import { PawMark } from "@/components/Logo";

export default function Loading() {
  return (
    <div className="space-y-3 pt-2" aria-busy="true">
      <div className="flex items-center gap-2 text-sm font-semibold text-stone-400">
        <PawMark className="h-5 w-5 animate-pulse" /> Loading…
      </div>
      <div className="h-28 animate-pulse rounded-2xl bg-stone-200" />
      <div className="h-20 animate-pulse rounded-2xl bg-stone-200" />
      <div className="h-20 animate-pulse rounded-2xl bg-stone-200" />
    </div>
  );
}
