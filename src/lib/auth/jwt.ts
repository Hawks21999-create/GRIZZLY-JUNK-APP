/**
 * Session token helpers. Edge-runtime safe (used by middleware) — no Node APIs.
 */
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "gjr_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days — the owner lives on their phone

export type SessionPayload = { sub: string; sv: number; role: string };

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET is missing or shorter than 32 characters.");
  return new TextEncoder().encode(s);
}

export async function signSession(p: SessionPayload): Promise<string> {
  return new SignJWT({ sv: p.sv, role: p.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .setIssuer("grizzly-junk-removal")
    .sign(secret());
}

export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: "grizzly-junk-removal", algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.sv !== "number") return null;
    return { sub: payload.sub, sv: payload.sv, role: String(payload.role ?? "") };
  } catch {
    return null;
  }
}
