/**
 * Diesel price lookups (pure, injectable fetch → unit-testable).
 *
 * 1. Local stations — Google Places API (New) Nearby Search returns posted
 *    fuel prices for gas stations ("fuelOptions"). We take the median diesel
 *    price of stations near the business address. Uses GOOGLE_MAPS_API_KEY.
 * 2. Regional fallback — U.S. EIA weekly retail diesel price for the Lower
 *    Atlantic region (PADD 1C, which includes Georgia). Free key: EIA_API_KEY.
 */

export type DieselQuote = { price: number; source: string; detail: string; sampleSize: number | null };
type Fetcher = typeof fetch;

type Money = { currencyCode?: string; units?: string | number; nanos?: number };
type FuelPrice = { type?: string; price?: Money; updateTime?: string };

export function moneyToNumber(m: Money | undefined): number | null {
  if (!m) return null;
  const units = Number(m.units ?? 0);
  const nanos = Number(m.nanos ?? 0);
  const n = units + nanos / 1e9;
  return Number.isFinite(n) ? n : null;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const plausible = (p: number) => p >= 1.5 && p <= 9;

export async function googleLocalDiesel(
  key: string,
  lat: number,
  lng: number,
  opts: { radiusMeters?: number; maxAgeDays?: number; now?: Date } = {},
  f: Fetcher = fetch,
): Promise<DieselQuote | null> {
  const res = await f("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.displayName,places.fuelOptions",
    },
    body: JSON.stringify({
      includedTypes: ["gas_station"],
      maxResultCount: 20,
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: opts.radiusMeters ?? 16000 } },
    }),
  });
  const data = (await res.json()) as {
    places?: { displayName?: { text?: string }; fuelOptions?: { fuelPrices?: FuelPrice[] } }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(data.error?.message ?? `Places fuel lookup failed (${res.status})`);
  const now = (opts.now ?? new Date()).getTime();
  const maxAge = (opts.maxAgeDays ?? 7) * 86400000;
  const prices: number[] = [];
  for (const p of data.places ?? []) {
    const d = p.fuelOptions?.fuelPrices?.find((x) => x.type === "DIESEL");
    if (!d) continue;
    if (d.updateTime && now - new Date(d.updateTime).getTime() > maxAge) continue;
    const n = moneyToNumber(d.price);
    if (n !== null && plausible(n)) prices.push(n);
  }
  const m = median(prices);
  if (m === null) return null;
  return {
    price: Math.round(m * 1000) / 1000,
    source: "Local stations (Google)",
    detail: `Median of ${prices.length} nearby station${prices.length === 1 ? "" : "s"}`,
    sampleSize: prices.length,
  };
}

/** EIA weekly retail No. 2 diesel, Lower Atlantic (PADD 1C — includes Georgia). */
export const EIA_SERIES = "EMD_EPD2D_PTE_R1Z_DPG";

export async function eiaRegionalDiesel(apiKey: string, f: Fetcher = fetch): Promise<DieselQuote | null> {
  const p = new URLSearchParams({
    api_key: apiKey,
    frequency: "weekly",
    "data[0]": "value",
    "facets[series][]": EIA_SERIES,
    "sort[0][column]": "period",
    "sort[0][direction]": "desc",
    length: "1",
  });
  const res = await f(`https://api.eia.gov/v2/petroleum/pri/gnd/data/?${p}`);
  const data = (await res.json()) as { response?: { data?: { period: string; value: number | string }[] }; error?: string };
  if (!res.ok) throw new Error(data.error ?? `EIA lookup failed (${res.status})`);
  const row = data.response?.data?.[0];
  const n = row ? Number(row.value) : NaN;
  if (!row || !plausible(n)) return null;
  return { price: Math.round(n * 1000) / 1000, source: "EIA weekly (Lower Atlantic)", detail: `Week of ${row.period}`, sampleSize: null };
}
