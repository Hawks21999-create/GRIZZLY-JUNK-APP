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
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
};

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

const r1 = (n: number) => Math.round(n * 10) / 10;

export async function autocomplete(
  key: string,
  input: string,
  opts: { sessionToken?: string; biasLat?: number | null; biasLng?: number | null } = {},
  f: Fetcher = fetch,
): Promise<AddressSuggestion[]> {
  const body: Record<string, unknown> = {
    input,
    includedRegionCodes: ["us"],
    sessionToken: opts.sessionToken,
  };
  if (opts.biasLat != null && opts.biasLng != null) {
    body.locationBias = {
      circle: { center: { latitude: opts.biasLat, longitude: opts.biasLng }, radius: 50000 },
    };
  }
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
      secondary: p.structuredFormat?.secondaryText?.text ?? "",
      full: p.text?.text ?? "",
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
    city: get("locality") ?? get("postal_town") ?? get("sublocality") ?? get("administrative_area_level_3"),
    state: get("administrative_area_level_1", true),
    zip: get("postal_code"),
  };
}

export async function placeDetails(key: string, placeId: string, sessionToken?: string, f: Fetcher = fetch): Promise<ResolvedAddress> {
  const qs = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : "";
  const res = await f(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}${qs}`, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "formattedAddress,location,addressComponents" },
  });
  const data = (await res.json()) as {
    formattedAddress?: string;
    location?: { latitude: number; longitude: number };
    addressComponents?: AddrComponent[];
    error?: { message: string };
  };
  if (!res.ok) throw new MapsError(data.error?.message ?? `Place lookup failed (${res.status})`, res.status);
  const parts = parseAddressComponents(data.addressComponents ?? []);
  return {
    formatted: (data.formattedAddress ?? "").replace(/, USA$/, ""),
    ...parts,
    lat: data.location?.latitude ?? null,
    lng: data.location?.longitude ?? null,
  };
}

export async function geocode(key: string, address: string, f: Fetcher = fetch): Promise<ResolvedAddress | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=us&key=${encodeURIComponent(key)}`;
  const res = await f(url);
  const data = (await res.json()) as {
    status: string;
    error_message?: string;
    results?: { formatted_address: string; geometry: { location: { lat: number; lng: number } }; address_components: AddrComponent[] }[];
  };
  if (data.status === "ZERO_RESULTS") return null;
  if (!res.ok || data.status !== "OK" || !data.results?.length) {
    throw new MapsError(data.error_message ?? `Geocoding failed (${data.status})`, res.status);
  }
  const top = data.results[0];
  return {
    formatted: top.formatted_address.replace(/, USA$/, ""),
    ...parseAddressComponents(top.address_components),
    lat: top.geometry.location.lat,
    lng: top.geometry.location.lng,
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
