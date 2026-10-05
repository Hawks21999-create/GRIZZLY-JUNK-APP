"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "./ui";

/**
 * Official logo lives at /public/brand/logo.png (transparent PNG recommended).
 * It's always shown with object-contain so it is never stretched or distorted.
 * If the file is missing, a built-in fallback mark is shown instead.
 */
export const LOGO_SRC = "/brand/logo.png";

/** Fallback mark: a bear paw in a green badge. */
export function PawMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#1fcf57" />
      <g fill="#000000">
        <ellipse cx="32" cy="41" rx="13" ry="11" />
        <ellipse cx="16.5" cy="27" rx="5" ry="6.5" transform="rotate(-20 16.5 27)" />
        <ellipse cx="26" cy="19" rx="5" ry="7" transform="rotate(-6 26 19)" />
        <ellipse cx="38" cy="19" rx="5" ry="7" transform="rotate(6 38 19)" />
        <ellipse cx="47.5" cy="27" rx="5" ry="6.5" transform="rotate(20 47.5 27)" />
      </g>
    </svg>
  );
}

function FallbackWordmark({ large }: { large?: boolean }) {
  return (
    <div className={cx("flex items-center", large ? "flex-col gap-3 text-center" : "gap-2.5")}>
      <PawMark className={large ? "h-20 w-20" : "h-9 w-9"} />
      <div className="leading-none">
        <div className={cx("font-black tracking-wide text-white", large ? "text-2xl" : "text-[15px]")}>GRIZZLY</div>
        <div className={cx("font-bold tracking-[0.2em] text-brand-400", large ? "mt-1 text-xs" : "text-[10px]")}>JUNK REMOVAL</div>
      </div>
    </div>
  );
}

/**
 * Brand logo for dark (black) surfaces.
 *  size "sm" → header / sidebar (fits a 40px-tall bar)
 *  size "lg" → login / splash
 */
export function BrandLogo({ size = "sm", className }: { size?: "sm" | "lg"; className?: string }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // The image may fail before React hydrates (onError missed) — check once mounted.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  if (failed) return <FallbackWordmark large={size === "lg"} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={LOGO_SRC}
      alt="Grizzly Junk Removal"
      onError={() => setFailed(true)}
      className={cx("block w-auto object-contain", size === "lg" ? "max-h-40 max-w-[80vw]" : "h-10 max-w-[200px]", className)}
    />
  );
}

/** Backwards-compatible name used across the app. */
export function Wordmark() {
  return <BrandLogo size="sm" />;
}
