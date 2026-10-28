"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { BadgeCheck, Loader2, MapPin, X } from "lucide-react";
import { cx } from "./ui";

export type ResolvedAddress = {
  formatted: string;
  street: string | null;
  streetNumber: string | null;
  streetName: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
};

type Suggestion = { placeId: string; main: string; secondary: string; full: string };

/** Start searching after this many characters (matches the server). */
const MIN_CHARS = 3;
/** Wait this long after the last keystroke before asking Google. */
const DEBOUNCE_MS = 250;

function newSessionToken() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2);
}

/**
 * Address field with Google-Maps-style suggestions as you type.
 *
 * • Requests go through our server (/api/maps/*) so the Google key stays secret.
 * • Debounced (250 ms), stale responses ignored, in-flight requests cancelled.
 * • ↑/↓ to move, Enter to pick, Esc or tap outside to close.
 * • Picking a suggestion fills the standardized address and returns
 *   street/city/state/ZIP/lat/lng/Place ID through `onResolved`.
 * • If Maps isn't set up or Google fails, it's still a normal text field.
 */
export function AddressInput({
  value,
  onChange,
  onResolved,
  mapsEnabled,
  placeholder = "Start typing the address…",
  id,
  verified,
  onCommit,
}: {
  value: string;
  onChange: (text: string) => void;
  onResolved: (a: ResolvedAddress) => void;
  mapsEnabled: boolean;
  placeholder?: string;
  id?: string;
  /** Show the "verified" check (the address came from a picked suggestion). */
  verified?: boolean;
  /** Called on blur when the person typed an address without picking a suggestion. */
  onCommit?: (text: string) => void;
}) {
  const autoId = useId();
  const inputId = id ?? `addr-${autoId}`;
  const listId = `${inputId}-list`;

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [searchedFor, setSearchedFor] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const session = useRef(newSessionToken());
  const typed = useRef(false);
  const reqId = useRef(0);
  const ctrlRef = useRef<AbortController | null>(null);
  const committed = useRef<string | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setActive(-1);
  }, []);

  // ── Fetch suggestions (debounced, cancel stale) ─────────────────────────
  useEffect(() => {
    if (!mapsEnabled || !typed.current) return;
    const q = value.trim();
    if (q.length < MIN_CHARS) {
      ctrlRef.current?.abort();
      setItems([]);
      setSearchedFor(null);
      setLoading(false);
      setOpen(false);
      return;
    }
    const t = setTimeout(() => {
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      const mine = ++reqId.current;
      setLoading(true);
      fetch(`/api/maps/autocomplete?q=${encodeURIComponent(q)}&session=${session.current}`, { signal: ctrl.signal })
        .then(async (r) => {
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.error || "Couldn't load address suggestions — type the address.");
          return (d.suggestions ?? []) as Suggestion[];
        })
        .then((list) => {
          if (mine !== reqId.current) return; // a newer search already started
          setItems(list);
          setSearchedFor(q);
          setActive(-1);
          setErr(null);
          if (typed.current && document.activeElement === inputRef.current) setOpen(true);
        })
        .catch((e: unknown) => {
          if (mine !== reqId.current || (e instanceof DOMException && e.name === "AbortError")) return;
          setItems([]);
          setOpen(false);
          setErr(
            typeof navigator !== "undefined" && navigator.onLine === false
              ? "You're offline — type the address."
              : e instanceof Error
                ? e.message
                : "Couldn't load address suggestions — type the address.",
          );
        })
        .finally(() => {
          if (mine === reqId.current) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value, mapsEnabled]);

  // Cancel anything in flight on unmount.
  useEffect(() => () => ctrlRef.current?.abort(), []);

  // ── Close when tapping/clicking anywhere else ───────────────────────────
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, close]);

  // Keep the highlighted row visible while arrowing through a long list.
  useEffect(() => {
    if (active < 0) return;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  async function pick(s: Suggestion) {
    typed.current = false;
    reqId.current++; // ignore any search still in flight
    ctrlRef.current?.abort();
    setLoading(false);
    close();
    setItems([]);
    setSearchedFor(null);
    onChange(s.full);
    setResolving(true);
    try {
      const r = await fetch(`/api/maps/place?id=${encodeURIComponent(s.placeId)}&session=${session.current}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.place) throw new Error(d.error || "Couldn't verify that address — it was kept as shown.");
      setErr(null);
      onResolved({ ...d.place, placeId: d.place.placeId ?? s.placeId });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't verify that address — it was kept as shown.");
    } finally {
      setResolving(false);
      session.current = newSessionToken(); // one billing session per picked address
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const showing = open && items.length > 0;
    if (e.key === "ArrowDown") {
      if (!items.length) return;
      e.preventDefault();
      setOpen(true);
      setActive((i) => (showing ? (i + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      if (!showing) return;
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (showing && active >= 0) {
        e.preventDefault(); // don't submit the form
        void pick(items[active]);
      } else if (showing) {
        e.preventDefault();
        close();
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    } else if (e.key === "Tab") {
      close();
    }
  }

  function onFocus() {
    if (items.length && typed.current) setOpen(true);
    // On phones, lift the field toward the top so the keyboard doesn't cover
    // the suggestions.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setTimeout(() => inputRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 300);
    }
  }

  const noResults = open && !loading && searchedFor !== null && items.length === 0;
  const showList = open && (items.length > 0 || noResults);
  const busy = loading || resolving;

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <MapPin className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-stone-400" />
        <input
          ref={inputRef}
          id={inputId}
          className={cx("input scroll-mt-24 pl-10", (busy || verified || value) && "pr-16")}
          value={value}
          placeholder={placeholder}
          // "off" keeps Safari's contact autofill from covering our suggestions.
          autoComplete={mapsEnabled ? "off" : "street-address"}
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          role={mapsEnabled ? "combobox" : undefined}
          aria-autocomplete={mapsEnabled ? "list" : undefined}
          aria-expanded={mapsEnabled ? showList : undefined}
          aria-controls={mapsEnabled ? listId : undefined}
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(e) => {
            typed.current = true;
            setErr(null);
            onChange(e.target.value);
          }}
          onKeyDown={mapsEnabled ? onKeyDown : undefined}
          onFocus={mapsEnabled ? onFocus : undefined}
          onBlur={(e) => {
            setTimeout(close, 150);
            const text = e.currentTarget.value;
            if (typed.current && onCommit && text !== committed.current) {
              committed.current = text;
              onCommit(text);
            }
          }}
        />
        <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin text-stone-400" aria-label="Looking up addresses" />
          ) : verified ? (
            <BadgeCheck className="h-5 w-5 text-brand-600" aria-label="Verified address" />
          ) : null}
          {value && !busy ? (
            <button
              type="button"
              aria-label="Clear address"
              className="grid h-8 w-8 place-items-center rounded-full text-stone-400 active:bg-stone-100"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                typed.current = true;
                setErr(null);
                onChange("");
                inputRef.current?.focus();
              }}
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {showList ? (
        <div
          className="absolute inset-x-0 z-50 mt-1 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-black/10"
          // Keep focus in the input while tapping inside the list.
          onMouseDown={(e) => e.preventDefault()}
        >
          <ul id={listId} role="listbox" aria-label="Address suggestions" className="max-h-[min(20rem,45vh)] overflow-y-auto overscroll-contain">
            {items.map((s, i) => (
              <li
                key={s.placeId}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={cx(
                  "flex min-h-12 cursor-pointer items-start gap-3 border-b border-stone-100 px-3 py-2.5 last:border-b-0",
                  i === active ? "bg-brand-50" : "active:bg-stone-100 lg:hover:bg-stone-50",
                )}
                onMouseEnter={() => setActive(i)}
                onClick={() => void pick(s)}
              >
                <MapPin className={cx("mt-0.5 h-4 w-4 shrink-0", i === active ? "text-brand-600" : "text-stone-400")} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-stone-900">{s.main}</span>
                  {s.secondary ? <span className="block truncate text-sm text-stone-500">{s.secondary}</span> : null}
                </span>
              </li>
            ))}
            {noResults ? (
              <li className="px-4 py-3 text-sm text-stone-500" role="presentation">
                No matching addresses. Keep typing, or enter the address yourself.
              </li>
            ) : null}
          </ul>
          <div className="border-t border-stone-100 px-3 py-1 text-right text-[10px] text-stone-400">powered by Google</div>
        </div>
      ) : null}

      {err ? (
        <div className="mt-1 text-xs text-amber-700" role="status">
          {err}
        </div>
      ) : null}
    </div>
  );
}
