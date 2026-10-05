import { NextResponse, type NextRequest } from "next/server";
import { apiUser, jsonError } from "@/lib/api";
import { autocomplete } from "@/lib/maps-google";
import { getSettings } from "@/server/settings";

export async function GET(req: NextRequest) {
  const u = await apiUser();
  if (u instanceof NextResponse) return u;
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return jsonError("Google Maps is not configured (GOOGLE_MAPS_API_KEY).", 501);
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 200);
  const session = (req.nextUrl.searchParams.get("session") ?? "").slice(0, 100) || undefined;
  if (q.length < 3) return NextResponse.json({ suggestions: [] });
  try {
    const s = await getSettings();
    const suggestions = await autocomplete(key, q, { sessionToken: session, biasLat: s.businessLat, biasLng: s.businessLng });
    return NextResponse.json({ suggestions });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Autocomplete failed", 502);
  }
}
