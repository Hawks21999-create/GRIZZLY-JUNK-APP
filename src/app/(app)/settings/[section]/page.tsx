import { notFound } from "next/navigation";
import { asc } from "drizzle-orm";
import { CheckCircle2, XCircle } from "lucide-react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { logoutEverywhere } from "@/app/actions/auth";
import { requireAdmin } from "@/lib/auth/server";
import { gcalConfigured, redirectUri } from "@/server/gcal";
import { dieselLabel, getCurrentDiesel } from "@/server/fuel";
import { getDumpFacilities, getEmployees, getLeadSources, getSettings, getVehicles } from "@/server/settings";
import {
  BusinessForm,
  CalendarSettingsForm,
  DieselRefreshButton,
  ChangePasswordForm,
  DefaultsForm,
  DumpEditor,
  EmployeeEditor,
  LeadSourceEditor,
  UsersEditor,
  VehicleEditor,
} from "@/components/SettingsForms";
import { Card, PageHeader } from "@/components/ui";
import { SETTINGS_SECTIONS } from "@/components/settings-sections";

export default async function SettingsSection({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ gcal?: string; msg?: string }> }) {
  const me = await requireAdmin();
  const { section } = await params;
  const sp = await searchParams;
  const meta = SETTINGS_SECTIONS.find((s) => s.key === section);
  if (!meta) notFound();
  const s = await getSettings();
  const mapsEnabled = Boolean(process.env.GOOGLE_MAPS_API_KEY);

  let body: React.ReactNode = null;
  switch (section) {
    case "business":
      body = (
        <BusinessForm
          mapsEnabled={mapsEnabled}
          initial={{
            businessName: s.businessName,
            businessPhone: s.businessPhone,
            businessEmail: s.businessEmail,
            businessAddress: s.businessAddress,
            businessLat: s.businessLat,
            businessLng: s.businessLng,
            timezone: s.timezone,
            currency: s.currency,
            jobNumberPrefix: s.jobNumberPrefix,
          }}
        />
      );
      break;
    case "vehicles": {
      const v = await getVehicles(true);
      const diesel = await getCurrentDiesel();
      body = (
        <div className="space-y-3">
          <Card className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="text-[11px] font-bold tracking-wide text-stone-500 uppercase">Current diesel price</div>
              <div className="tabular text-2xl font-black">${diesel.price.toFixed(2)}/gallon</div>
              <div className="truncate text-xs text-stone-500">{dieselLabel(diesel)}</div>
            </div>
            <DieselRefreshButton />
          </Card>
          <p className="px-1 text-xs text-stone-500">
            {s.fuelPriceAuto
              ? "Looked up automatically (nearby stations via Google, or the EIA weekly regional average) and cached for 6 hours. The fuel price below is your manual fallback."
              : "Automatic lookup is off (Settings → Job Defaults). The fuel price below is used for new jobs."}{" "}
            Each job stores the diesel price it used, so changing it never alters past jobs.
          </p>
          <VehicleEditor vehicles={v.map((x) => ({ id: x.id, name: x.name, fuelType: x.fuelType, mpg: x.mpg, fuelPrice: x.fuelPrice, maintenancePerMile: x.maintenancePerMile, depreciationPerMile: x.depreciationPerMile, active: x.active }))} />
        </div>
      );
      break;
    }
    case "workers": {
      const e = await getEmployees(true);
      body = <EmployeeEditor employees={e.map((x) => ({ id: x.id, name: x.name, phone: x.phone, hourlyCost: x.hourlyCost, active: x.active }))} />;
      break;
    }
    case "dump": {
      const d = await getDumpFacilities(true);
      body = <DumpEditor mapsEnabled={mapsEnabled} facilities={d.map((x) => ({ id: x.id, name: x.name, address: x.address, lat: x.lat, lng: x.lng, defaultFee: x.defaultFee, active: x.active }))} />;
      break;
    }
    case "defaults": {
      const [v, d] = await Promise.all([getVehicles(), getDumpFacilities()]);
      body = (
        <DefaultsForm
          vehicles={v.map((x) => ({ id: x.id, name: x.name }))}
          facilities={d.map((x) => ({ id: x.id, name: x.name }))}
          initial={{
            defaultVehicleId: s.defaultVehicleId,
            defaultDumpFacilityId: s.defaultDumpFacilityId,
            defaultDumpCost: s.defaultDumpCost,
            defaultLaborRate: s.defaultLaborRate,
            defaultJobDuration: s.defaultJobDuration,
            defaultWorkers: s.defaultWorkers,
            defaultIncludeDump: s.defaultIncludeDump,
            avoidTolls: s.avoidTolls,
            avoidHighways: s.avoidHighways,
            includeVehicleWear: s.includeVehicleWear,
            fuelPriceAuto: s.fuelPriceAuto,
          }}
        />
      );
      break;
    }
    case "lead-sources": {
      const l = await getLeadSources(true);
      body = <LeadSourceEditor sources={l.map((x) => ({ id: x.id, name: x.name, active: x.active }))} />;
      break;
    }
    case "integrations": {
      const gcalReady = gcalConfigured();
      const connected = Boolean(s.gcalRefreshTokenEnc);
      body = (
        <div className="space-y-4">
          <Card className="space-y-2 p-4">
            <div className="flex items-center gap-2 font-bold">
              {mapsEnabled ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-red-500" />}
              Google Maps (address search &amp; mileage)
            </div>
            <p className="text-sm text-stone-600">
              {mapsEnabled
                ? "Connected. Addresses autocomplete and route miles are calculated automatically."
                : "Not configured. Set the GOOGLE_MAPS_API_KEY environment variable on the server (see README → Google Maps setup) and restart. Until then you can type miles manually."}
            </p>
            {!s.businessAddress ? <p className="text-sm font-semibold text-amber-700">Set your business address in Settings → Business so routes have a starting point.</p> : null}
          </Card>
          <Card className="space-y-3 p-4">
            <div className="flex items-center gap-2 font-bold">
              {connected ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-stone-400" />}
              Google Calendar
            </div>
            {sp.gcal === "connected" ? <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Google Calendar connected.</div> : null}
            {sp.gcal === "error" ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">Couldn&apos;t connect: {sp.msg?.slice(0, 200)}</div> : null}
            {sp.gcal === "not_configured" || !gcalReady ? (
              <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Calendar sync needs <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> and <code>APP_URL</code> environment variables. Add this exact
                redirect URI to your Google OAuth client: <code className="break-all">{process.env.APP_URL ? redirectUri() : "<APP_URL>/api/google/calendar/callback"}</code>
              </div>
            ) : null}
            {connected ? (
              <p className="text-sm text-stone-600">
                Connected as <b>{s.gcalConnectedEmail ?? "Google account"}</b>. Scheduled jobs create events titled &quot;Grizzly Junk Removal - Customer - $Price&quot; and update when
                the job changes.
              </p>
            ) : gcalReady ? (
              <a href="/api/google/calendar/connect" className="btn-primary w-full">
                Connect Google Calendar
              </a>
            ) : null}
            {connected ? <CalendarSettingsForm enabled={s.gcalEnabled} calendarId={s.gcalCalendarId} connected={connected} /> : null}
          </Card>
        </div>
      );
      break;
    }
    case "users": {
      const u = await db.select().from(users).orderBy(asc(users.createdAt));
      body = (
        <UsersEditor
          meId={me.id}
          isOwner={me.role === "OWNER"}
          users={u.map((x) => ({ id: x.id, name: x.name, email: x.email, role: x.role, active: x.active, lastLoginAt: x.lastLoginAt?.toISOString() ?? null }))}
        />
      );
      break;
    }
    case "account":
      body = (
        <div className="space-y-4">
          <Card className="p-4 text-sm">
            Signed in as <b>{me.name}</b> ({me.email}) · {me.role}
          </Card>
          <ChangePasswordForm />
          <form action={logoutEverywhere}>
            <button className="btn-secondary w-full">Sign out on all devices</button>
          </form>
        </div>
      );
      break;
  }

  return (
    <div className="space-y-4">
      <PageHeader title={meta.label} subtitle={meta.desc} back="/settings" />
      {body}
    </div>
  );
}
