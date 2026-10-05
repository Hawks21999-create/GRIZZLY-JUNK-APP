/** Normalize a city for grouping: " cumming , ga " → "Cumming, GA". */
export function cityKey(city: string | null | undefined, state?: string | null): string | null {
  const c = (city ?? "").trim().replace(/\s+/g, " ").replace(/,\s*[A-Za-z]{2}$/, "");
  if (!c) return null;
  const title = c
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
  const st = (state ?? "").trim().toUpperCase() || "GA";
  return `${title}, ${st}`;
}

/** Best-effort city from a free-text address like "123 Main St, Cumming, GA 30040". */
export function cityFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) return parts[parts.length - 2];
  if (parts.length === 2 && /^[A-Z]{2}\s*\d{5}/.test(parts[1])) return null;
  return parts.length === 2 ? parts[1].replace(/\s+[A-Z]{2}(\s+\d{5})?$/, "") || null : null;
}

/** Cities the owner wants pinned in city reports. */
export const FOCUS_CITIES = ["Cumming, GA", "Dawsonville, GA"];
