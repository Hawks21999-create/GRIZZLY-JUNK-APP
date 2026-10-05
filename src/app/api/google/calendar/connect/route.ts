import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { authorizationUrl, gcalConfigured } from "@/server/gcal";

export async function GET() {
  const u = await getCurrentUser();
  if (!u || u.role === "EMPLOYEE") return NextResponse.redirect(new URL("/login", process.env.APP_URL ?? "http://localhost:3000"));
  if (!gcalConfigured()) {
    return NextResponse.redirect(new URL("/settings/integrations?gcal=not_configured", process.env.APP_URL ?? "http://localhost:3000"));
  }
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authorizationUrl(state));
  res.cookies.set("gjr_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/google/calendar",
    maxAge: 600,
  });
  return res;
}
