import { BrandLogo } from "@/components/Logo";

/** Splash shown while the app first loads (e.g. opening from the home screen). */
export default function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bear-900">
      <BrandLogo size="lg" />
      <div className="h-1 w-24 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-brand-500" />
      </div>
    </div>
  );
}
