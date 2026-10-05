import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { fuelPriceQuotes, vehicles } from "@/db/schema";
import { eiaRegionalDiesel, googleLocalDiesel, type DieselQuote } from "@/lib/fuel-price";
import { getSettings } from "./settings";

export type CurrentDiesel = {
  price: number;
  source: string;
  detail: string | null;
  fetchedAt: Date | null;
  automatic: boolean;
};

const CACHE_HOURS = 6;
let lastFailureAt = 0;

async function manualPrice(): Promise<CurrentDiesel> {
  const s = await getSettings();
  const id = s.defaultVehicleId;
  const [v] = id
    ? await db.select().from(vehicles).where(eq(vehicles.id, id)).limit(1)
    : await db.select().from(vehicles).where(eq(vehicles.active, true)).limit(1);
  return { price: v?.fuelPrice ?? 0, source: "Manual (Settings → Vehicles)", detail: null, fetchedAt: null, automatic: false };
}

/**
 * Current diesel price: cached automatic lookup (≤ 6 h old) → fresh lookup →
 * most recent automatic quote (≤ 7 days) → the manual price in Settings.
 */
export async function getCurrentDiesel(opts: { force?: boolean } = {}): Promise<CurrentDiesel> {
  const s = await getSettings();
  if (!s.fuelPriceAuto) return manualPrice();

  const since = new Date(Date.now() - CACHE_HOURS * 3600000);
  if (!opts.force) {
    const [cached] = await db
      .select()
      .from(fuelPriceQuotes)
      .where(and(eq(fuelPriceQuotes.fuelType, "DIESEL"), gte(fuelPriceQuotes.fetchedAt, since)))
      .orderBy(desc(fuelPriceQuotes.fetchedAt))
      .limit(1);
    if (cached) return { price: cached.price, source: cached.source, detail: cached.detail, fetchedAt: cached.fetchedAt, automatic: true };
  }

  // Don't retry a failing provider more than every 10 minutes
  if (opts.force || Date.now() - lastFailureAt > 10 * 60000) {
    let quote: DieselQuote | null = null;
    const errors: string[] = [];
    const gKey = process.env.GOOGLE_MAPS_API_KEY;
    if (gKey && s.businessLat != null && s.businessLng != null) {
      quote = await googleLocalDiesel(gKey, s.businessLat, s.businessLng).catch((e) => {
        errors.push(String(e.message ?? e));
        return null;
      });
    }
    const eiaKey = process.env.EIA_API_KEY;
    if (!quote && eiaKey) {
      quote = await eiaRegionalDiesel(eiaKey).catch((e) => {
        errors.push(String(e.message ?? e));
        return null;
      });
    }
    if (quote) {
      const [row] = await db
        .insert(fuelPriceQuotes)
        .values({ fuelType: "DIESEL", price: quote.price, source: quote.source, detail: quote.detail, sampleSize: quote.sampleSize })
        .returning();
      return { price: row.price, source: row.source, detail: row.detail, fetchedAt: row.fetchedAt, automatic: true };
    }
    lastFailureAt = Date.now();
    if (errors.length) console.warn("[fuel] diesel lookup failed:", errors.join(" | "));
  }

  // Fall back to the latest automatic quote from the past week, then manual
  const [recent] = await db
    .select()
    .from(fuelPriceQuotes)
    .where(and(eq(fuelPriceQuotes.fuelType, "DIESEL"), gte(fuelPriceQuotes.fetchedAt, new Date(Date.now() - 7 * 86400000))))
    .orderBy(desc(fuelPriceQuotes.fetchedAt))
    .limit(1);
  if (recent) return { price: recent.price, source: recent.source, detail: recent.detail, fetchedAt: recent.fetchedAt, automatic: true };
  const m = await manualPrice();
  return { ...m, detail: "Automatic price unavailable — using your manual price" };
}

export function dieselLabel(d: CurrentDiesel): string {
  return d.automatic ? `${d.source}${d.detail ? ` · ${d.detail}` : ""}` : d.source;
}
