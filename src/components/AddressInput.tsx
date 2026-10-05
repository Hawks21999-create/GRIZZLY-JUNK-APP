"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { useDebounced } from "./form";

export type ResolvedAddress = {
  formatted: string;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
};

type Suggestion = { placeId: string; main: string; secondary: string; full: string };

function newSessionToken() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2);
}

/**
 * Address field with Google Places autocomplete (proxied through our server so
 * the API key stays secret). Works as a plain text field when Maps isn't set up.
 */
export function AddressInput({
  value,
  onChange,
  onResolved,
  mapsEnabled,
  placeholder = "Start typing the address…",
  id,
}: {
  value: string;
  onChange: (text: string) => void;
  onResolved: (a: ResolvedAddress) => void;
  mapsEnabled: boolean;
  placeholder?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const session = useRef(newSessionToken());
  const typed = useRef(false);
  const q = useDebounced(value, 250);

  useEffect(() => {
    if (!mapsEnabled || !typed.current || q.trim().length < 4) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/maps/autocomplete?q=${encodeURIComponent(q)}&session=${session.current}`, { signal: ctrl.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Address lookup failed");
        setItems(d.suggestions ?? []);
        setErr(null);
        setOpen(true);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setErr(e.message);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [q, mapsEnabled]);

  async function pick(s: Suggestion) {
    setOpen(false);
    typed.current = false;
    onChange(s.full);
    try {
      const r = await fetch(`/api/maps/place?id=${encodeURIComponent(s.placeId)}&session=${session.current}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      onResolved(d.place);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't look up that address");
    } finally {
      session.current = newSessionToken();
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <MapPin className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-stone-400" />
        <input
          id={id}
          className="input pl-10"
          value={value}
          placeholder={placeholder}
          autoComplete="street-address"
          enterKeyHint="done"
          onChange={(e) => {
            typed.current = true;
            onChange(e.target.value);
          }}
          onFocus={() => items.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
        />
        {loading ? <Loader2 className="absolute top-1/2 right-3 h-5 w-5 -translate-y-1/2 animate-spin text-stone-400" /> : null}
      </div>
      {open && items.length > 0 ? (
        <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/10">
          {items.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                className="block min-h-12 w-full px-4 py-2.5 text-left active:bg-stone-100"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
              >
                <div className="font-semibold text-stone-900">{s.main}</div>
                <div className="text-sm text-stone-500">{s.secondary}</div>
              </button>
            </li>
          ))}
          <li className="px-4 py-1.5 text-right text-[10px] text-stone-400">powered by Google</li>
        </ul>
      ) : null}
      {err ? <div className="mt-1 text-xs text-amber-700">{err}</div> : null}
    </div>
  );
}
