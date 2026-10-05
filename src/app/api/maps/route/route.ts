import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiUser, jsonError } from "@/lib/api";
import { computeRoute } from "@/lib/maps-google";
import { getSettings } from "@/server/settings";

const bodySchema = z.object({
  stops: z
    .array(
      z.object({
        address: z.string().trim().min(3).max(300),
        lat: z.number().min(-90).max(90).nullable().optional(),
        lng: z.number().min(-180).max(180).nullable().optional(),
      }),
    )
    .min(2)
    .max(25),
});

export async function POST(req: NextRequest) {
  const u = await apiUser();
  if (u instanceof NextResponse) return u;
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return jsonError("Google Maps is not configured — enter miles manually or add GOOGLE_MAPS_API_KEY.", 501);
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Every stop needs an address.");
  try {
    const s = await getSettings();
    const result = await computeRoute(key, parsed.data.stops, { avoidTolls: s.avoidTolls, avoidHighways: s.avoidHighways });
    return NextResponse.json(result);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Route failed", 502);
  }
}
