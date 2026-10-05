import { NextResponse, type NextRequest } from "next/server";
import { apiUser, jsonError } from "@/lib/api";
import { geocode, placeDetails } from "@/lib/maps-google";

/** GET ?id=<placeId>&session=…  or  ?address=<free text> */
export async function GET(req: NextRequest) {
  const u = await apiUser();
  if (u instanceof NextResponse) return u;
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return jsonError("Google Maps is not configured (GOOGLE_MAPS_API_KEY).", 501);
  const id = req.nextUrl.searchParams.get("id");
  const address = req.nextUrl.searchParams.get("address");
  try {
    if (id) {
      if (!/^[A-Za-z0-9_-]{10,300}$/.test(id)) return jsonError("Invalid place id");
      const session = req.nextUrl.searchParams.get("session")?.slice(0, 100) || undefined;
      return NextResponse.json({ place: await placeDetails(key, id, session) });
    }
    if (address && address.trim().length >= 3) {
      const place = await geocode(key, address.trim().slice(0, 300));
      if (!place) return jsonError("Address not found", 404);
      return NextResponse.json({ place });
    }
    return jsonError("Provide id or address");
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Lookup failed", 502);
  }
}
