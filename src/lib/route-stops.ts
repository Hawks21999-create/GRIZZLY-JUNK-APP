import type { RouteStopType } from "@/db/schema";

export type Stop = {
  key: string;
  type: RouteStopType;
  label: string;
  address: string;
  lat: number | null;
  lng: number | null;
  legMiles: number | null;
  dumpFacilityId?: string | null;
};

export type DumpOption = { id: string; name: string; address: string | null; defaultFee: number };

let k = 0;
export const stopKey = () => `s${Date.now().toString(36)}${(k++).toString(36)}`;

export function businessStop(addr: string | null, lat: number | null, lng: number | null): Stop {
  return { key: stopKey(), type: "BUSINESS", label: "Business", address: addr ?? "", lat, lng, legMiles: null };
}
export function customerStop(addr: string, lat: number | null, lng: number | null, label = "Customer"): Stop {
  return { key: stopKey(), type: "CUSTOMER", label, address: addr, lat, lng, legMiles: null };
}
export function dumpStop(d: DumpOption | undefined): Stop {
  return {
    key: stopKey(),
    type: "DUMP",
    label: d ? d.name : "Dump",
    address: d?.address ?? "",
    lat: null,
    lng: null,
    legMiles: null,
    dumpFacilityId: d?.id ?? null,
  };
}

export function sumLegs(stops: Stop[]): number | null {
  if (stops.length < 2) return null;
  let t = 0;
  for (let i = 1; i < stops.length; i++) {
    const m = stops[i].legMiles;
    if (m === null || m === undefined) return null;
    t += m;
  }
  return Math.round(t * 10) / 10;
}


/**
 * Split route miles into "to the customer" (one-way) and "return" (everything
 * after the first customer stop, e.g. customer → dump → home).
 */
export function splitMiles(stops: Pick<Stop, "type" | "legMiles">[]): { oneWay: number | null; returnMiles: number | null; total: number | null } {
  const total = sumLegs(stops as Stop[]);
  const idx = stops.findIndex((s) => s.type === "CUSTOMER");
  if (total === null || idx < 1) return { oneWay: null, returnMiles: null, total };
  const oneWay = Math.round(stops.slice(1, idx + 1).reduce((a, s) => a + (s.legMiles ?? 0), 0) * 10) / 10;
  return { oneWay, returnMiles: Math.round((total - oneWay) * 10) / 10, total };
}
