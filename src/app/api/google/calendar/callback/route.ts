import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { exchangeCode } from "@/server/gcal";

export async function GET(req: NextRequest) {
  const base = process.env.APP_URL ?? req.nextUrl.origin;
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/settings/integrations?${q}`, base));
    res.cookies.delete({ name: "gjr_oauth_state", path: "/api/google/calendar" });
    return res;
  };
  const u = await getCurrentUser();
  if (!u || u.role === "EMPLOYEE") return NextResponse.redirect(new URL("/login", base));
  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return back(`gcal=error&msg=${encodeURIComponent(sp.get("error")!)}`);
  const state = sp.get("state");
  const expected = req.cookies.get("gjr_oauth_state")?.value;
  if (!state || !expected || state !== expected) return back("gcal=error&msg=state_mismatch");
  const code = sp.get("code");
  if (!code) return back("gcal=error&msg=no_code");
  try {
    await exchangeCode(code);
    return back("gcal=connected");
  } catch (e) {
    return back(`gcal=error&msg=${encodeURIComponent(e instanceof Error ? e.message : "failed")}`);
  }
}
