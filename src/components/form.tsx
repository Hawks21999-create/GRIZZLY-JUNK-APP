"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "./ui";

/** Parse user-typed money/number text. Returns null for empty. */
export function parseNum(s: string): number | null {
  const t = s.replace(/[$,\s]/g, "");
  if (t === "" || t === ".") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function Field({
  label,
  error,
  hint,
  children,
  className,
}: {
  label?: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label ? <div className="label">{label}</div> : null}
      {children}
      {error ? <div className="mt-1 text-sm font-medium text-red-600">{error}</div> : null}
      {!error && hint ? <div className="mt-1 text-xs text-stone-500">{hint}</div> : null}
    </div>
  );
}

type NumInputProps = {
  value: number | null;
  onChange: (n: number | null) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  decimals?: boolean;
  id?: string;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
};

/**
 * Numeric text input that shows the decimal keypad on iPhone and keeps the
 * text the user typed (so "12." doesn't jump to "12").
 */
export function NumInput({ value, onChange, prefix, suffix, placeholder, decimals = true, id, className, ariaLabel, disabled }: NumInputProps) {
  const [text, setText] = useState(value === null || value === undefined ? "" : String(value));
  useEffect(() => {
    const current = parseNum(text);
    if (current !== value) setText(value === null || value === undefined ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className={cx("relative", className)}>
      {prefix ? (
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center font-semibold text-stone-400">{prefix}</span>
      ) : null}
      <input
        id={id}
        aria-label={ariaLabel}
        disabled={disabled}
        className={cx("input tabular", prefix && "pl-7", suffix && "pr-12")}
        inputMode={decimals ? "decimal" : "numeric"}
        enterKeyHint="next"
        placeholder={placeholder ?? "0"}
        value={text}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const raw = e.target.value.replace(decimals ? /[^\d.,$]/g : /[^\d]/g, "");
          setText(raw);
          onChange(parseNum(raw));
        }}
      />
      {suffix ? (
        <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm font-semibold text-stone-400">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  id,
  ariaLabel,
}: {
  value: T | "" | null;
  onChange: (v: T | "") => void;
  options: { value: T; label: string }[];
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        aria-label={ariaLabel}
        className="input appearance-none pr-10"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value as T | "")}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-5 w-5 -translate-y-1/2 text-stone-400" />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
}: {
  value: T | null;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  size?: "sm" | "md";
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "rounded-xl px-3.5 font-semibold ring-1 transition active:scale-95",
              size === "md" ? "min-h-11 text-sm" : "min-h-9 text-xs",
              active ? "bg-bear-900 text-white ring-bear-900" : "bg-white text-stone-700 ring-stone-300",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; hint?: React.ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-12 cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="block font-semibold text-stone-800">{label}</span>
        {hint ? <span className="block text-xs text-stone-500">{hint}</span> : null}
      </span>
      <span className="relative inline-flex shrink-0">
        <input id={id} type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-8 w-14 rounded-full bg-stone-300 transition peer-checked:bg-emerald-600" />
        <span className="absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition peer-checked:translate-x-6" />
      </span>
    </label>
  );
}

export function ErrorBanner({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">
      {error}
    </div>
  );
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
