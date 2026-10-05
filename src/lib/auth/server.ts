import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, signSession, verifySession } from "./jwt";

export type CurrentUser = { id: string; name: string; email: string; role: "OWNER" | "ADMIN" | "EMPLOYEE" };

/** Reads and fully validates the session (signature + user still active + session version). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const payload = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  const [u] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      active: users.active,
      sessionVersion: users.sessionVersion,
    })
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);
  if (!u || !u.active || u.sessionVersion !== payload.sv) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role };
});

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

/** Owner/Admin only — employees can't change settings or see company finances. */
export async function requireAdmin(): Promise<CurrentUser> {
  const u = await requireUser();
  if (u.role === "EMPLOYEE") throw new Error("Not authorized");
  return u;
}

export async function startSession(user: { id: string; sessionVersion: number; role: string }) {
  const token = await signSession({ sub: user.id, sv: user.sessionVersion, role: user.role });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
