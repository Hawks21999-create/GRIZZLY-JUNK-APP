/**
 * Google Maps Platform client (server side only — the API key never reaches
 * the browser). Uses:
 *   • Places API (New)  — address autocomplete + place details
 *   • Geocoding API     — address → lat/lng
 *   • Routes API        — driving distance for each leg of a multi-stop route
 *
 * Pure functions with an injectable `fetch` so they can be unit tested.
 */

export const METERS_PER_MILE = 1609.344;

export type Fetcher = typeof fetch;

export type AddressSuggestion = { placeId: string; main: string; secondary: string; full: string };

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

/** Cumming, GA — default search bias when the business address isn't set yet. */
export const DEFAULT_BIAS = { lat: 34.2073, lng: -84.1402 };
/** Places API (New) allows a bias circle of at most 50 km. */
const BIAS_RADIUS_M = 50000;

const stripUsa = (t: string) => t.replace(/,\s*(USA|United States)$/i, "");

export type RouteWaypoint = { address: string; lat?: number | null; lng?: number | null };

export type RouteResult = {
  /** legs[i] = miles from waypoint i to waypoint i+1 */
  legsMiles: number[];
  totalMiles: number;
  durationMinutes: number;
};

export class MapsError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

/** Minimum characters before we ask Google for suggestions. */
export const ADDRESS_MIN_CHARS = 3;

/** Turn a Google error into a short message the person can act on. */
export function friendlyMapsError(e: unknown): { message: string; status: number } {
  const status = e instanceof MapsError ? (e.status ?? 502) : 502;
  const raw = e instanceof Error ? e.message : "";
  if (status === 429 || /quota|RESOURCE_EXHAUSTED|rate/i.test(raw)) {
    return { message: "Address suggestions are busy right now — keep typing the address.", status: 429 };
  }
  if (status === 403 || status === 401 || /API key|not authorized|PERMISSION_DENIED|has not been used|disabled/i.test(raw)) {
    return { message: "Address suggestions are off (Google Maps key problem) — type the address.", status: 503 };
  }
  return { message: "Couldn't load address suggestions — type the address.", status: 502 };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export async function autocomplete(
  key: string,
  input: string,
  opts: { sessionToken?: string; biasLat?: number | null; biasLng?: number | null } = {},
  f: Fetcher = fetch,
): Promise<AddressSuggestion[]> {
  // Bias (not restrict) toward the service area: nearby North Georgia
  // addresses rank first, but any U.S. address can still be found.
  const biasLat = opts.biasLat ?? DEFAULT_BIAS.lat;
  const biasLng = opts.biasLng ?? DEFAULT_BIAS.lng;
  const body: Record<string, unknown> = {
    input,
    includedRegionCodes: ["us"],
    regionCode: "us",
    languageCode: "en",
    sessionToken: opts.sessionToken,
    locationBias: { circle: { center: { latitude: biasLat, longitude: biasLng }, radius: BIAS_RADIUS_M } },
  };
  const res = await f("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as {
    suggestions?: {
      placePrediction?: {
        placeId: string;
        text?: { text: string };
        structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
      };
    }[];
    error?: { message: string };
  };
  if (!res.ok) throw new MapsError(data.error?.message ?? `Autocomplete failed (${res.status})`, res.status);
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
    .map((p) => ({
      placeId: p.placeId,
      main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      secondary: stripUsa(p.structuredFormat?.secondaryText?.text ?? ""),
      full: stripUsa(p.text?.text ?? ""),
    }));
}

type AddrComponent = { longText?: string; shortText?: string; long_name?: string; short_name?: string; types: string[] };

export function parseAddressComponents(components: AddrComponent[]) {
  const get = (type: string, short = false) => {
    const c = components.find((x) => x.types.includes(type));
    if (!c) return null;
    return (short ? (c.shortText ?? c.short_name) : (c.longText ?? c.long_name)) ?? null;
  };
  const num = get("street_number");
  const route = get("route");
  return {
    street: [num, route].filter(Boolean).join(" ") || null,
    streetNumber: num,
    streetName: route,
    city: get("locality") ?? get("postal_town") ?? get("sublocality") ?? get("administrative_area_level_3"),
    state: get("administrative_area_level_1", true),
    zip: get("postal_code"),
  };
}

export async function placeDetails(key: string, placeId: string, sessionToken?: string, f: Fetcher = fetch): Promise<ResolvedAddress> {
  const qs = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : "";
  const res = await f(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}${qs}`, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "id,formattedAddress,location,addressComponents" },
  });
  const data = (await res.json()) as {
    id?: string;
    formattedAddress?: string;
    location?: { latitude: number; longitude: number };
    addressComponents?: AddrComponent[];
    error?: { message: string };
  };
  if (!res.ok) throw new MapsError(data.error?.message ?? `Place lookup failed (${res.status})`, res.status);
  const parts = parseAddressComponents(data.addressComponents ?? []);
  return {
    formatted: stripUsa(data.formattedAddress ?? ""),
    ...parts,
    lat: data.location?.latitude ?? null,
    lng: data.location?.longitude ?? null,
    placeId: data.id ?? placeId,
  };
}

export async function geocode(key: string, address: string, f: Fetcher = fetch): Promise<ResolvedAddress | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=us&key=${encodeURIComponent(key)}`;
  const res = await f(url);
  const data = (await res.json()) as {
    status: string;
    error_message?: string;
    results?: {
      place_id?: string;
      formatted_address: string;
      geometry: { location: { lat: number; lng: number } };
      address_components: AddrComponent[];
    }[];
  };
  if (data.status === "ZERO_RESULTS") return null;
  if (!res.ok || data.status !== "OK" || !data.results?.length) {
    throw new MapsError(data.error_message ?? `Geocoding failed (${data.status})`, res.status);
  }
  const top = data.results[0];
  return {
    formatted: stripUsa(top.formatted_address),
    ...parseAddressComponents(top.address_components),
    lat: top.geometry.location.lat,
    lng: top.geometry.location.lng,
    placeId: top.place_id ?? null,
  };
}

function waypoint(w: RouteWaypoint) {
  if (w.lat != null && w.lng != null) return { location: { latLng: { latitude: w.lat, longitude: w.lng } } };
  return { address: w.address };
}

/** Driving distance for an ordered list of stops (2–25). */
export async function computeRoute(
  key: string,
  stops: RouteWaypoint[],
  opts: { avoidTolls?: boolean; avoidHighways?: boolean } = {},
  f: Fetcher = fetch,
): Promise<RouteResult> {
  if (stops.length < 2) throw new MapsError("A route needs at least two stops");
  if (stops.length > 25) throw new MapsError("A route can have at most 25 stops");
  const body = {
    origin: waypoint(stops[0]),
    destination: waypoint(stops[stops.length - 1]),
    intermediates: stops.slice(1, -1).map(waypoint),
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_UNAWARE",
    routeModifiers: { avoidTolls: Boolean(opts.avoidTolls), avoidHighways: Boolean(opts.avoidHighways) },
    units: "IMPERIAL",
  };
  const res = await f("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.legs.distanceMeters",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as {
    routes?: { distanceMeters?: number; duration?: string; legs?: { distanceMeters?: number }[] }[];
    error?: { message: string };
  };
  if (!res.ok) throw new MapsError(data.error?.message ?? `Route failed (${res.status})`, res.status);
  const route = data.routes?.[0];
  if (!route?.legs?.length) throw new MapsError("No driving route found between these stops. Check the addresses.");
  // Round each leg to 0.1 mi and total = sum of rounded legs so the numbers on screen always add up.
  const legsMiles = route.legs.map((l) => r1((l.distanceMeters ?? 0) / METERS_PER_MILE));
  const totalMiles = r1(legsMiles.reduce((a, b) => a + b, 0));
  const seconds = Number((route.duration ?? "0s").replace("s", "")) || 0;
  return { legsMiles, totalMiles, durationMinutes: Math.round(seconds / 60) };
}
