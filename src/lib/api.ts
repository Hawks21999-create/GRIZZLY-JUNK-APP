import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUser } from "./auth/server";

export async function apiUser(): Promise<CurrentUser | NextResponse> {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return u;
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
