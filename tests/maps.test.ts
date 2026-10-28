import { describe, expect, it, vi } from "vitest";
import { autocomplete, computeRoute, DEFAULT_BIAS, friendlyMapsError, geocode, MapsError, parseAddressComponents, placeDetails } from "@/lib/maps-google";
import { buildEventBody } from "@/lib/gcal-event";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("Google Routes API client", () => {
  it("sends every stop in order and converts legs to miles", async () => {
    const f = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.origin).toEqual({ location: { latLng: { latitude: 34.2, longitude: -84.1 } } });
      expect(body.intermediates).toEqual([{ address: "123 Main St, Alpharetta, GA" }, { address: "Dump Rd, Cumming, GA" }]);
      expect(body.destination).toEqual({ address: "Cumming, GA 30040" });
      expect(body.travelMode).toBe("DRIVE");
      expect((init?.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe("KEY");
      // 16093.44 m = 10 mi, 12874.75 m ≈ 8 mi, 19312.13 m ≈ 12 mi
      return json({ routes: [{ distanceMeters: 48280, duration: "3600s", legs: [{ distanceMeters: 16093.44 }, { distanceMeters: 12874.75 }, { distanceMeters: 19312.13 }] }] });
    });
    const r = await computeRoute(
      "KEY",
      [
        { address: "Business", lat: 34.2, lng: -84.1 },
        { address: "123 Main St, Alpharetta, GA" },
        { address: "Dump Rd, Cumming, GA" },
        { address: "Cumming, GA 30040" },
      ],
      {},
      f as unknown as typeof fetch,
    );
    expect(r.legsMiles).toEqual([10, 8, 12]);
    expect(r.totalMiles).toBe(30);
    expect(r.durationMinutes).toBe(60);
  });

  it("surfaces API errors", async () => {
    const f = vi.fn(async () => json({ error: { message: "API key not valid" } }, 400));
    await expect(computeRoute("BAD", [{ address: "a b c" }, { address: "d e f" }], {}, f as unknown as typeof fetch)).rejects.toThrow("API key not valid");
  });

  it("rejects routes without legs", async () => {
    const f = vi.fn(async () => json({ routes: [] }));
    await expect(computeRoute("K", [{ address: "aaa" }, { address: "bbb" }], {}, f as unknown as typeof fetch)).rejects.toThrow(/No driving route/);
  });
});

describe("Places / Geocoding", () => {
  it("parses autocomplete suggestions", async () => {
    const f = vi.fn(async () =>
      json({ suggestions: [{ placePrediction: { placeId: "abc123", text: { text: "100 Main St, Cumming, GA, USA" }, structuredFormat: { mainText: { text: "100 Main St" }, secondaryText: { text: "Cumming, GA, USA" } } } }] }),
    );
    const s = await autocomplete("K", "100 main", { biasLat: 34.2, biasLng: -84.1 }, f as unknown as typeof fetch);
    expect(s).toEqual([{ placeId: "abc123", main: "100 Main St", secondary: "Cumming, GA", full: "100 Main St, Cumming, GA" }]);
  });

  it("biases toward the business location, and Cumming GA when it isn't set", async () => {
    const bodies: Record<string, unknown>[] = [];
    const f = vi.fn(async (_u: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return json({ suggestions: [] });
    });
    await autocomplete("K", "123 Bethelview", { biasLat: 34.3, biasLng: -84.0 }, f as unknown as typeof fetch);
    await autocomplete("K", "Market Pl Dawsonville", {}, f as unknown as typeof fetch);
    expect(bodies[0].locationBias).toEqual({ circle: { center: { latitude: 34.3, longitude: -84.0 }, radius: 50000 } });
    expect(bodies[1].locationBias).toEqual({ circle: { center: { latitude: DEFAULT_BIAS.lat, longitude: DEFAULT_BIAS.lng }, radius: 50000 } });
    // bias, not restriction — any U.S. address is still searchable
    expect(bodies[1].locationRestriction).toBeUndefined();
    expect(bodies[1].includedRegionCodes).toEqual(["us"]);
  });

  it("turns Google failures into short, friendly messages", () => {
    expect(friendlyMapsError(new MapsError("Quota exceeded", 429)).status).toBe(429);
    expect(friendlyMapsError(new MapsError("API key not valid. Please pass a valid API key.", 400)).message).toMatch(/key problem/);
    expect(friendlyMapsError(new Error("socket hang up")).message).toMatch(/type the address/);
  });

  it("parses place details into city/state/zip/lat/lng", async () => {
    const f = vi.fn(async () =>
      json({
        formattedAddress: "100 Main St, Cumming, GA 30040, USA",
        location: { latitude: 34.2, longitude: -84.14 },
        addressComponents: [
          { longText: "100", shortText: "100", types: ["street_number"] },
          { longText: "Main Street", shortText: "Main St", types: ["route"] },
          { longText: "Cumming", shortText: "Cumming", types: ["locality", "political"] },
          { longText: "Georgia", shortText: "GA", types: ["administrative_area_level_1"] },
          { longText: "30040", shortText: "30040", types: ["postal_code"] },
        ],
      }),
    );
    const p = await placeDetails("K", "abc123", undefined, f as unknown as typeof fetch);
    expect(p).toEqual({
      formatted: "100 Main St, Cumming, GA 30040",
      street: "100 Main Street",
      streetNumber: "100",
      streetName: "Main Street",
      city: "Cumming",
      state: "GA",
      zip: "30040",
      lat: 34.2,
      lng: -84.14,
      placeId: "abc123",
    });
  });

  it("geocodes and handles ZERO_RESULTS", async () => {
    const ok = vi.fn(async () =>
      json({ status: "OK", results: [{ place_id: "geo1", formatted_address: "Alpharetta, GA, USA", geometry: { location: { lat: 34.07, lng: -84.29 } }, address_components: [{ long_name: "Alpharetta", short_name: "Alpharetta", types: ["locality"] }] }] }),
    );
    const g = await geocode("K", "Alpharetta", ok as unknown as typeof fetch);
    expect(g?.city).toBe("Alpharetta");
    expect(g?.placeId).toBe("geo1");
    expect(g?.formatted).toBe("Alpharetta, GA");
    const none = vi.fn(async () => json({ status: "ZERO_RESULTS", results: [] }));
    expect(await geocode("K", "zzzz", none as unknown as typeof fetch)).toBeNull();
  });

  it("legacy component format", () => {
    expect(parseAddressComponents([{ long_name: "Roswell", short_name: "Roswell", types: ["locality"] }]).city).toBe("Roswell");
  });
});

describe("Google Calendar event", () => {
  it("uses the required title and description fields", () => {
    const e = buildEventBody({
      jobNumber: "GJR-0012",
      customerName: "Jane Smith",
      phone: "7705550123",
      address: "100 Main St, Cumming, GA 30040",
      quotedPrice: 650,
      jobType: "Garage Cleanout",
      status: "Scheduled",
      notes: "Gate code 1234",
      start: new Date("2026-10-05T13:00:00Z"),
      durationMinutes: 180,
      timezone: "America/New_York",
      jobId: "x",
    });
    expect(e.summary).toBe("Grizzly Junk Removal - Jane Smith - $650");
    expect(e.description).toContain("Customer: Jane Smith");
    expect(e.description).toContain("Phone: (770) 555-0123");
    expect(e.description).toContain("Address: 100 Main St, Cumming, GA 30040");
    expect(e.description).toContain("Quoted Price: $650");
    expect(e.description).toContain("Job Type: Garage Cleanout");
    expect(e.description).toContain("Notes: Gate code 1234");
    expect(e.end.dateTime).toBe("2026-10-05T16:00:00.000Z");
  });
});
