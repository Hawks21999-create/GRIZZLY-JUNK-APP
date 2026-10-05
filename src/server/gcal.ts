import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs, settings as settingsTable } from "@/db/schema";
import { CALENDAR_SYNC_STATUSES, JOB_TYPE_LABEL, STATUS_LABEL, formatJobNumber } from "@/lib/constants";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { buildEventBody } from "@/lib/gcal-event";
import { getSettings } from "./settings";

/**
 * Google Calendar integration (OAuth 2.0, Calendar API v3, plain REST).
 *
 * Credentials (environment variables — never in code or the database):
 *   GOOGLE_CLIENT_ID       OAuth client ID (type "Web application")
 *   GOOGLE_CLIENT_SECRET   OAuth client secret
 *   APP_URL                Public base URL; redirect URI is APP_URL + /api/google/calendar/callback
 *
 * The OAuth refresh token obtained when the owner clicks "Connect Google
 * Calendar" is stored AES-256-GCM encrypted (APP_ENCRYPTION_KEY) in settings.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_API = "https://www.googleapis.com/calendar/v3";
export const GCAL_SCOPES = ["https://www.googleapis.com/auth/calendar.events", "openid", "email"];

export function gcalConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.APP_URL);
}

export function redirectUri(): string {
  return `${process.env.APP_URL!.replace(/\/$/, "")}/api/google/calendar/callback`;
}

export function authorizationUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GCAL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${p}`;
}

export async function exchangeCode(code: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const data = (await res.json()) as { refresh_token?: string; id_token?: string; error?: string; error_description?: string };
  if (!res.ok) throw new Error(data.error_description || data.error || `Token exchange failed (${res.status})`);
  if (!data.refresh_token) {
    throw new Error("Google did not return a refresh token. Remove the app's access at myaccount.google.com/permissions and connect again.");
  }
  let email: string | null = null;
  if (data.id_token) {
    try {
      const payload = JSON.parse(Buffer.from(data.id_token.split(".")[1], "base64url").toString("utf8"));
      email = typeof payload.email === "string" ? payload.email : null;
    } catch {
      /* ignore */
    }
  }
  await db
    .update(settingsTable)
    .set({ gcalRefreshTokenEnc: encryptSecret(data.refresh_token), gcalConnectedEmail: email, gcalEnabled: true })
    .where(eq(settingsTable.id, 1));
  accessTokenCache = null;
}

export async function disconnectCalendar() {
  const s = await getSettings();
  if (s.gcalRefreshTokenEnc) {
    try {
      const token = decryptSecret(s.gcalRefreshTokenEnc);
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" });
    } catch {
      /* best effort */
    }
  }
  await db
    .update(settingsTable)
    .set({ gcalRefreshTokenEnc: null, gcalConnectedEmail: null, gcalEnabled: false })
    .where(eq(settingsTable.id, 1));
  accessTokenCache = null;
}

let accessTokenCache: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string | null> {
  if (!gcalConfigured()) return null;
  const s = await getSettings();
  if (!s.gcalEnabled || !s.gcalRefreshTokenEnc) return null;
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now() + 60_000) return accessTokenCache.token;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: decryptSecret(s.gcalRefreshTokenEnc),
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`Google Calendar auth failed: ${data.error_description || data.error || res.status}. Reconnect in Settings.`);
  }
  accessTokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

async function calFetch(path: string, init: RequestInit & { token: string }) {
  return fetch(`${CAL_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${init.token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

/**
 * Create / update / delete the Google Calendar event for a job so it mirrors
 * the job's schedule. Never throws — failures are recorded on the job.
 */
export async function syncJobToCalendar(jobId: string): Promise<void> {
  try {
    const token = await accessToken();
    if (!token) return;
    const s = await getSettings();
    const job = await db.query.jobs.findFirst({ where: eq(jobs.id, jobId), with: { customer: true } });
    if (!job) return;
    const calId = encodeURIComponent(s.gcalCalendarId || "primary");
    const shouldExist = Boolean(job.scheduledStart) && CALENDAR_SYNC_STATUSES.includes(job.status);

    if (!shouldExist) {
      if (job.gcalEventId) {
        const r = await calFetch(`/calendars/${calId}/events/${encodeURIComponent(job.gcalEventId)}`, { method: "DELETE", token });
        if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error(`Delete failed (${r.status})`);
        await db.update(jobs).set({ gcalEventId: null, gcalSyncError: null, gcalSyncedAt: new Date() }).where(eq(jobs.id, jobId));
      }
      return;
    }

    const body = buildEventBody({
      jobNumber: formatJobNumber(job.jobNumber, s.jobNumberPrefix),
      customerName: job.customer.name,
      phone: job.customer.phone,
      address: [job.address, job.city, job.state, job.zip].filter(Boolean).join(", ").replace(/, ([A-Z]{2}), (\d{5})/, ", $1 $2"),
      quotedPrice: job.quotedPrice,
      jobType: JOB_TYPE_LABEL[job.jobType],
      status: STATUS_LABEL[job.status],
      notes: job.notes,
      start: job.scheduledStart!,
      durationMinutes: job.durationMinutes,
      timezone: s.timezone,
      appUrl: process.env.APP_URL,
      jobId: job.id,
    });

    let eventId = job.gcalEventId;
    if (eventId) {
      const r = await calFetch(`/calendars/${calId}/events/${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        token,
        body: JSON.stringify(body),
      });
      if (r.status === 404 || r.status === 410) eventId = null; // deleted in Google → recreate
      else if (!r.ok) throw new Error(`Update failed (${r.status}): ${await r.text()}`);
    }
    if (!eventId) {
      const r = await calFetch(`/calendars/${calId}/events`, { method: "POST", token, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`Create failed (${r.status}): ${await r.text()}`);
      eventId = ((await r.json()) as { id: string }).id;
    }
    await db.update(jobs).set({ gcalEventId: eventId, gcalSyncError: null, gcalSyncedAt: new Date() }).where(eq(jobs.id, jobId));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[gcal] sync failed", jobId, msg);
    await db
      .update(jobs)
      .set({ gcalSyncError: msg.slice(0, 500) })
      .where(eq(jobs.id, jobId))
      .catch(() => undefined);
  }
}

export async function deleteCalendarEvent(eventId: string) {
  const token = await accessToken();
  if (!token) return;
  const s = await getSettings();
  await calFetch(`/calendars/${encodeURIComponent(s.gcalCalendarId || "primary")}/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    token,
  });
}
