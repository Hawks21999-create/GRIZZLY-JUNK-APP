import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/api";
import { dieselLabel, getCurrentDiesel } from "@/server/fuel";

export async function GET(req: NextRequest) {
  const u = await apiUser();
  if (u instanceof NextResponse) return u;
  const d = await getCurrentDiesel({ force: req.nextUrl.searchParams.get("refresh") === "1" });
  return NextResponse.json({ ...d, label: dieselLabel(d) });
}
