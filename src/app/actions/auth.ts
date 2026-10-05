"use server";

import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/auth/password";
import { endSession, requireUser, startSession } from "@/lib/auth/server";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
  next: z.string().max(500).optional(),
});

export type LoginState = { error?: string; email?: string } | undefined;

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
    next: form.get("next") || undefined,
  });
  if (!parsed.success) return { error: "Enter your email and password.", email: String(form.get("email") ?? "").slice(0, 200) };
  const { email, password, next } = parsed.data;

  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (u?.lockedUntil && u.lockedUntil > new Date()) {
    const mins = Math.ceil((u.lockedUntil.getTime() - Date.now()) / 60000);
    return { error: `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`, email };
  }
  const ok = await verifyPassword(password, u?.active ? u.passwordHash : null);
  if (!u || !ok) {
    if (u) {
      const failed = u.failedLogins + 1;
      await db
        .update(users)
        .set({
          failedLogins: failed >= MAX_FAILED ? 0 : failed,
          lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60000) : null,
        })
        .where(eq(users.id, u.id));
    }
    return { error: "Incorrect email or password.", email };
  }
  await db.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, u.id));
  await startSession(u);
  // Only allow same-site relative redirects
  const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  redirect(dest);
}

export async function logout() {
  await endSession();
  redirect("/login");
}

/** Signs out every device (bumps the session version). */
export async function logoutEverywhere() {
  const u = await requireUser();
  await db.update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, u.id));
  await endSession();
  redirect("/login");
}

export async function changePassword(_prev: { error?: string; ok?: boolean } | undefined, form: FormData) {
  const u = await requireUser();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (next !== confirm) return { error: "New passwords don't match." };
  const problem = passwordProblems(next);
  if (problem) return { error: problem };
  const [row] = await db.select().from(users).where(eq(users.id, u.id)).limit(1);
  if (!row || !(await verifyPassword(current, row.passwordHash))) return { error: "Current password is incorrect." };
  const [updated] = await db
    .update(users)
    .set({ passwordHash: await hashPassword(next), sessionVersion: row.sessionVersion + 1 })
    .where(eq(users.id, u.id))
    .returning();
  await startSession(updated); // stay signed in here, sign out other devices
  return { ok: true };
}
