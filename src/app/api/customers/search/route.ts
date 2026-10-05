import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/api";
import { findDuplicateCustomer, searchCustomers } from "@/server/customers";

export async function GET(req: NextRequest) {
  const u = await apiUser();
  if (u instanceof NextResponse) return u;
  const sp = req.nextUrl.searchParams;
  const phone = sp.get("phone")?.slice(0, 40);
  const email = sp.get("email")?.slice(0, 200);
  if (phone || email) {
    const m = await findDuplicateCustomer({ phone, email });
    return NextResponse.json({
      match: m && { id: m.id, name: m.name, phone: m.phone, email: m.email, address: m.address, city: m.city, state: m.state, zip: m.zip, lat: m.lat, lng: m.lng, leadSourceId: m.leadSourceId },
    });
  }
  const q = (sp.get("q") ?? "").slice(0, 100);
  return NextResponse.json({ customers: await searchCustomers(q) });
}
