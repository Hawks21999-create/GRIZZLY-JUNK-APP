"use server";

import { and, count, eq, sql } from "drizzle-orm";
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
  if (u?.pending) {
    const okPending = await verifyPassword(password, u.passwordHash);
    return {
      error: okPending ? "Your account is waiting for the owner to approve it. Try again once they let you know." : "Incorrect email or password.",
      email,
    };
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

// ───────────── Self sign-up (owner must approve) ─────────────

const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
  password: z.string().max(200),
  confirm: z.string().max(200),
  website: z.string().max(0).optional(), // honeypot — real people leave it empty
});

export type SignupState = { error?: string; ok?: boolean; values?: { name: string; email: string } } | undefined;

const MAX_PENDING = 25;

export async function signup(_prev: SignupState, form: FormData): Promise<SignupState> {
  const raw = {
    name: String(form.get("name") ?? ""),
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
    confirm: String(form.get("confirm") ?? ""),
    website: String(form.get("website") ?? ""),
  };
  const values = { name: raw.name.slice(0, 120), email: raw.email.slice(0, 200) };
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    if (raw.website) return { ok: true }; // bot: pretend it worked
    return { error: parsed.error.issues[0]?.message ?? "Check the form", values };
  }
  const v = parsed.data;
  if (v.password !== v.confirm) return { error: "Passwords don't match.", values };
  const problem = passwordProblems(v.password);
  if (problem) return { error: problem, values };

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, v.email)).limit(1);
  if (existing) return { error: "An account with this email already exists. Try signing in.", values };
  const [{ n }] = await db.select({ n: count() }).from(users).where(and(eq(users.pending, true)));
  if (n >= MAX_PENDING) return { error: "Too many sign-ups are waiting for approval. Please contact the owner.", values };

  await db.insert(users).values({
    name: v.name,
    email: v.email,
    passwordHash: await hashPassword(v.password),
    role: "EMPLOYEE",
    active: false,
    pending: true,
  });
  return { ok: true };
}
