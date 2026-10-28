import { NextResponse, type NextRequest } from "next/server";
import { apiUser, jsonError } from "@/lib/api";
import { ADDRESS_MIN_CHARS, autocomplete, friendlyMapsError } from "@/lib/maps-google";
import { getSettings } from "@/server/settings";

export async function GET(req: NextRequest) {
  const u = await apiUser();
  if (u instanceof NextResponse) return u;
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return jsonError("Address suggestions aren't set up yet — type the address.", 501);
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 200);
  const session = (req.nextUrl.searchParams.get("session") ?? "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 100) || undefined;
  if (q.length < ADDRESS_MIN_CHARS) return NextResponse.json({ suggestions: [] });
  try {
    const s = await getSettings();
    const suggestions = await autocomplete(key, q, { sessionToken: session, biasLat: s.businessLat, biasLng: s.businessLng });
    return NextResponse.json({ suggestions });
  } catch (e) {
    console.error("[maps/autocomplete]", e instanceof Error ? e.message : e);
    const f = friendlyMapsError(e);
    return jsonError(f.message, f.status);
  }
}
