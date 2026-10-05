"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Plus } from "lucide-react";
import { changePassword } from "@/app/actions/auth";
import {
  createUser,
  disconnectGoogleCalendar,
  saveBusinessSettings,
  saveCalendarSettings,
  saveDumpFacility,
  saveEmployee,
  saveJobDefaults,
  saveLeadSource,
  saveVehicle,
  setUserActive,
} from "@/app/actions/settings";
import type { ActionResult } from "@/lib/action";
import { AddressInput } from "./AddressInput";
import { ErrorBanner, Field, NumInput, Segmented, Select, Toggle } from "./form";
import { cx } from "./ui";

function useSaver() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [ok, setOk] = useState(false);
  function save<T>(fn: () => Promise<ActionResult<T>>, after?: (d: T) => void) {
    setErr(null);
    setOk(false);
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setErr(r.error);
        setFe(r.fieldErrors ?? {});
        return;
      }
      setFe({});
      setOk(true);
      after?.(r.data);
      setTimeout(() => setOk(false), 2500);
    });
  }
  return { pending, err, fe, ok, save };
}

function SaveButton({ pending, ok, label = "Save" }: { pending: boolean; ok: boolean; label?: string }) {
  return (
    <button className={cx("btn w-full font-extrabold text-bear-950", ok ? "bg-brand-300" : "bg-brand-500 hover:bg-brand-400")} disabled={pending}>
      {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : ok ? <Check className="h-5 w-5" /> : null}
      {ok ? "Saved" : label}
    </button>
  );
}

// ───────────── Business ─────────────

export function BusinessForm({
  initial,
  mapsEnabled,
}: {
  initial: {
    businessName: string;
    businessPhone: string | null;
    businessEmail: string | null;
    businessAddress: string | null;
    businessLat: number | null;
    businessLng: number | null;
    timezone: string;
    currency: string;
    jobNumberPrefix: string;
  };
  mapsEnabled: boolean;
}) {
  const [f, setF] = useState({ ...initial, businessPhone: initial.businessPhone ?? "", businessEmail: initial.businessEmail ?? "", businessAddress: initial.businessAddress ?? "" });
  const s = useSaver();
  return (
    <form
      className="card space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        s.save(() => saveBusinessSettings({ ...f, businessPhone: f.businessPhone || null, businessEmail: f.businessEmail || null, businessAddress: f.businessAddress || null }));
      }}
    >
      <ErrorBanner error={s.err} />
      <Field label="Business name" error={s.fe.businessName}>
        <input className="input" value={f.businessName} onChange={(e) => setF({ ...f, businessName: e.target.value })} />
      </Field>
      <Field label="Business (starting) address" hint="Every route starts and ends here. Pick from the suggestions so the location is exact.">
        <AddressInput
          value={f.businessAddress}
          mapsEnabled={mapsEnabled}
          onChange={(t) => setF({ ...f, businessAddress: t, businessLat: null, businessLng: null })}
          onResolved={(a) => setF({ ...f, businessAddress: a.formatted, businessLat: a.lat, businessLng: a.lng })}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Phone" error={s.fe.businessPhone}>
          <input className="input" type="tel" value={f.businessPhone} onChange={(e) => setF({ ...f, businessPhone: e.target.value })} />
        </Field>
        <Field label="Email" error={s.fe.businessEmail}>
          <input className="input" type="email" value={f.businessEmail} onChange={(e) => setF({ ...f, businessEmail: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Currency" error={s.fe.currency}>
          <input className="input uppercase" maxLength={3} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Job # prefix" error={s.fe.jobNumberPrefix}>
          <input className="input uppercase" maxLength={5} value={f.jobNumberPrefix} onChange={(e) => setF({ ...f, jobNumberPrefix: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Time zone" error={s.fe.timezone}>
          <Select
            value={f.timezone}
            onChange={(v) => v && setF({ ...f, timezone: v })}
            options={["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles"].map((z) => ({ value: z, label: z.replace("America/", "").replace("_", " ") }))}
          />
        </Field>
      </div>
      <SaveButton pending={s.pending} ok={s.ok} />
    </form>
  );
}

// ───────────── Job defaults & mileage ─────────────

export function DefaultsForm({
  initial,
  vehicles,
  facilities,
}: {
  initial: {
    defaultVehicleId: string | null;
    defaultDumpFacilityId: string | null;
    defaultDumpCost: number;
    defaultLaborRate: number;
    defaultJobDuration: number;
    defaultWorkers: number;
    defaultIncludeDump: boolean;
    avoidTolls: boolean;
    avoidHighways: boolean;
    includeVehicleWear: boolean;
    fuelPriceAuto: boolean;
  };
  vehicles: { id: string; name: string }[];
  facilities: { id: string; name: string }[];
}) {
  const [f, setF] = useState(initial);
  const s = useSaver();
  return (
    <form
      className="card space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        s.save(() => saveJobDefaults(f));
      }}
    >
      <ErrorBanner error={s.err} />
      <Field label="Default vehicle">
        <Select value={f.defaultVehicleId} onChange={(v) => setF({ ...f, defaultVehicleId: v || null })} placeholder="None" options={vehicles.map((v) => ({ value: v.id, label: v.name }))} />
      </Field>
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <Field label="Default dump facility">
          <Select value={f.defaultDumpFacilityId} onChange={(v) => setF({ ...f, defaultDumpFacilityId: v || null })} placeholder="None" options={facilities.map((v) => ({ value: v.id, label: v.name }))} />
        </Field>
        <Field label="Est. dump cost">
          <NumInput value={f.defaultDumpCost} onChange={(n) => setF({ ...f, defaultDumpCost: n ?? 0 })} prefix="$" />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Default labor rate" hint="Used when no workers are picked">
          <NumInput value={f.defaultLaborRate} onChange={(n) => setF({ ...f, defaultLaborRate: n ?? 0 })} prefix="$" suffix="/h" />
        </Field>
        <Field label="Default duration">
          <NumInput value={f.defaultJobDuration / 60} onChange={(n) => setF({ ...f, defaultJobDuration: Math.round((n ?? 2) * 60) })} suffix="hrs" />
        </Field>
        <Field label="Default crew size">
          <NumInput value={f.defaultWorkers} decimals={false} onChange={(n) => setF({ ...f, defaultWorkers: n ?? 0 })} />
        </Field>
      </div>
      <div className="divide-y divide-stone-100 rounded-xl bg-stone-50 px-3 ring-1 ring-stone-200">
        <div className="py-2 text-xs font-bold tracking-wider text-stone-500 uppercase">Mileage calculation</div>
        <Toggle
          checked={f.defaultIncludeDump}
          onChange={(v) => setF({ ...f, defaultIncludeDump: v })}
          label="Include a dump run in the default route"
          hint="Off: Start → Customer → Return. On: Start → Customer → Dump → Return"
        />
        <Toggle checked={f.avoidTolls} onChange={(v) => setF({ ...f, avoidTolls: v })} label="Avoid tolls" />
        <Toggle checked={f.avoidHighways} onChange={(v) => setF({ ...f, avoidHighways: v })} label="Avoid highways" />
      </div>
      <div className="divide-y divide-stone-100 rounded-xl bg-stone-50 px-3 ring-1 ring-stone-200">
        <div className="py-2 text-xs font-bold tracking-wider text-stone-500 uppercase">Fuel &amp; job cost</div>
        <Toggle
          checked={f.fuelPriceAuto}
          onChange={(v) => setF({ ...f, fuelPriceAuto: v })}
          label="Look up the current diesel price automatically"
          hint="Off: always use the manual price from Settings → Vehicles. You can still override the price on any job."
        />
        <Toggle
          checked={f.includeVehicleWear}
          onChange={(v) => setF({ ...f, includeVehicleWear: v })}
          label="Add vehicle maintenance & depreciation to job cost"
          hint="Off (default): Total Job Cost = Lead + Fuel + Dump + Labor + Other. On: also adds the per-mile maintenance and depreciation from your vehicle."
        />
      </div>
      <SaveButton pending={s.pending} ok={s.ok} />
    </form>
  );
}

// ───────────── Vehicles ─────────────

type VehicleRow = {
  id: string | null;
  name: string;
  fuelType: "DIESEL" | "GASOLINE" | "ELECTRIC" | "OTHER";
  mpg: number | null;
  fuelPrice: number | null;
  maintenancePerMile: number | null;
  depreciationPerMile: number | null;
  active: boolean;
};

export function VehicleEditor({ vehicles }: { vehicles: VehicleRow[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(vehicles.length ? null : "new");
  const blank: VehicleRow = { id: null, name: "", fuelType: "DIESEL", mpg: null, fuelPrice: null, maintenancePerMile: null, depreciationPerMile: null, active: true };
  return (
    <div className="space-y-3">
      {vehicles.map((v) =>
        editing === v.id ? (
          <VehicleForm key={v.id} initial={v} onDone={() => setEditing(null)} />
        ) : (
          <button key={v.id} type="button" onClick={() => setEditing(v.id)} className="card flex w-full items-center gap-3 p-4 text-left active:bg-stone-50">
            <div className="min-w-0 flex-1">
              <div className="font-bold">
                {v.name} {!v.active ? <span className="text-xs text-stone-400">(inactive)</span> : null}
              </div>
              <div className="tabular text-sm text-stone-500">
                {v.mpg} mpg · ${v.fuelPrice?.toFixed(3)}/gal · ${v.maintenancePerMile}/mi maint · ${v.depreciationPerMile}/mi depr
              </div>
            </div>
            <Pencil className="h-4 w-4 text-stone-400" />
          </button>
        ),
      )}
      {editing === "new" ? (
        <VehicleForm initial={blank} onDone={() => setEditing(null)} />
      ) : (
        <button type="button" className="btn-secondary w-full" onClick={() => setEditing("new")}>
          <Plus className="h-5 w-5" /> Add vehicle
        </button>
      )}
    </div>
  );
}

function VehicleForm({ initial, onDone }: { initial: VehicleRow; onDone: () => void }) {
  const [f, setF] = useState(initial);
  const s = useSaver();
  const cpm = (f.mpg ? (f.fuelPrice ?? 0) / f.mpg : 0) + (f.maintenancePerMile ?? 0) + (f.depreciationPerMile ?? 0);
  return (
    <form
      className="card space-y-3 p-4 ring-2 ring-brand-500"
      onSubmit={(e) => {
        e.preventDefault();
        s.save(
          () =>
            saveVehicle({
              ...f,
              mpg: f.mpg ?? 0,
              fuelPrice: f.fuelPrice ?? 0,
              maintenancePerMile: f.maintenancePerMile ?? 0,
              depreciationPerMile: f.depreciationPerMile ?? 0,
            }),
          onDone,
        );
      }}
    >
      <ErrorBanner error={s.err} />
      <Field label="Vehicle name" error={s.fe.name}>
        <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="2019 Mercedes-Benz Sprinter 2500 Diesel" />
      </Field>
      <Field label="Fuel type">
        <Segmented
          value={f.fuelType}
          onChange={(v) => setF({ ...f, fuelType: v })}
          options={[
            { value: "DIESEL", label: "Diesel" },
            { value: "GASOLINE", label: "Gasoline" },
            { value: "ELECTRIC", label: "Electric" },
            { value: "OTHER", label: "Other" },
          ]}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Average MPG" error={s.fe.mpg}>
          <NumInput value={f.mpg} onChange={(n) => setF({ ...f, mpg: n })} suffix="mpg" />
        </Field>
        <Field label="Current fuel price" error={s.fe.fuelPrice}>
          <NumInput value={f.fuelPrice} onChange={(n) => setF({ ...f, fuelPrice: n })} prefix="$" suffix="/gal" />
        </Field>
        <Field label="Maintenance cost / mile" error={s.fe.maintenancePerMile}>
          <NumInput value={f.maintenancePerMile} onChange={(n) => setF({ ...f, maintenancePerMile: n })} prefix="$" />
        </Field>
        <Field label="Depreciation cost / mile" error={s.fe.depreciationPerMile}>
          <NumInput value={f.depreciationPerMile} onChange={(n) => setF({ ...f, depreciationPerMile: n })} prefix="$" />
        </Field>
      </div>
      <div className="rounded-xl bg-stone-50 px-3 py-2 text-sm">
        Total vehicle cost: <b className="tabular">${cpm.toFixed(3)} per mile</b>
      </div>
      <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active" />
      <p className="text-xs text-stone-500">
        New jobs use these rates. Existing jobs keep the rates they were booked with (tap &quot;Use current vehicle rates&quot; on a job to update it).
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-secondary" onClick={onDone}>
          Cancel
        </button>
        <SaveButton pending={s.pending} ok={s.ok} />
      </div>
    </form>
  );
}

// ───────────── Simple list editors (workers, dump facilities, lead sources) ─────────────

export function EmployeeEditor({ employees }: { employees: { id: string; name: string; phone: string | null; hourlyCost: number; active: boolean }[] }) {
  return (
    <ListEditor
      items={employees.map((e) => ({ id: e.id, title: e.name, subtitle: `$${e.hourlyCost.toFixed(2)}/hour${e.phone ? ` · ${e.phone}` : ""}`, active: e.active, raw: e }))}
      addLabel="Add worker"
      renderForm={(raw, done) => <EmployeeForm initial={raw ?? { id: null, name: "", phone: "", hourlyCost: 18, active: true }} onDone={done} />}
    />
  );
}

function EmployeeForm({ initial, onDone }: { initial: { id: string | null; name: string; phone: string | null; hourlyCost: number; active: boolean }; onDone: () => void }) {
  const [f, setF] = useState({ ...initial, phone: initial.phone ?? "" });
  const s = useSaver();
  return (
    <form
      className="card space-y-3 p-4 ring-2 ring-brand-500"
      onSubmit={(e) => {
        e.preventDefault();
        s.save(() => saveEmployee({ ...f, phone: f.phone || null }), onDone);
      }}
    >
      <ErrorBanner error={s.err} />
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <Field label="Name" error={s.fe.name}>
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Hourly cost" error={s.fe.hourlyCost} hint="Wage + payroll costs">
          <NumInput value={f.hourlyCost} onChange={(n) => setF({ ...f, hourlyCost: n ?? 0 })} prefix="$" />
        </Field>
      </div>
      <Field label="Phone" error={s.fe.phone}>
        <input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      </Field>
      <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active" />
      <FormButtons pending={s.pending} ok={s.ok} onCancel={onDone} />
    </form>
  );
}

export function DumpEditor({ facilities, mapsEnabled }: { facilities: { id: string; name: string; address: string | null; lat: number | null; lng: number | null; defaultFee: number; active: boolean }[]; mapsEnabled: boolean }) {
  return (
    <ListEditor
      items={facilities.map((d) => ({ id: d.id, title: d.name, subtitle: `${d.address ?? "No address"} · typical $${d.defaultFee}`, active: d.active, raw: d }))}
      addLabel="Add dump facility"
      renderForm={(raw, done) => (
        <DumpForm initial={raw ?? { id: null, name: "", address: "", lat: null, lng: null, defaultFee: 0, active: true }} onDone={done} mapsEnabled={mapsEnabled} />
      )}
    />
  );
}

function DumpForm({
  initial,
  onDone,
  mapsEnabled,
}: {
  initial: { id: string | null; name: string; address: string | null; lat: number | null; lng: number | null; defaultFee: number; active: boolean };
  onDone: () => void;
  mapsEnabled: boolean;
}) {
  const [f, setF] = useState({ ...initial, address: initial.address ?? "" });
  const s = useSaver();
  return (
    <form
      className="card space-y-3 p-4 ring-2 ring-brand-500"
      onSubmit={(e) => {
        e.preventDefault();
        s.save(() => saveDumpFacility({ ...f, address: f.address || null }), onDone);
      }}
    >
      <ErrorBanner error={s.err} />
      <Field label="Facility name" error={s.fe.name}>
        <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. County Transfer Station" />
      </Field>
      <Field label="Address" hint="Needed for automatic dump mileage">
        <AddressInput
          value={f.address}
          mapsEnabled={mapsEnabled}
          onChange={(t) => setF({ ...f, address: t, lat: null, lng: null })}
          onResolved={(a) => setF({ ...f, address: a.formatted, lat: a.lat, lng: a.lng })}
        />
      </Field>
      <Field label="Typical fee per load" error={s.fe.defaultFee}>
        <NumInput value={f.defaultFee} onChange={(n) => setF({ ...f, defaultFee: n ?? 0 })} prefix="$" />
      </Field>
      <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active" />
      <FormButtons pending={s.pending} ok={s.ok} onCancel={onDone} />
    </form>
  );
}

export function LeadSourceEditor({ sources }: { sources: { id: string; name: string; active: boolean }[] }) {
  return (
    <ListEditor
      items={sources.map((l) => ({ id: l.id, title: l.name, subtitle: l.active ? "" : "Hidden from new jobs", active: l.active, raw: l }))}
      addLabel="Add lead source"
      renderForm={(raw, done) => <LeadSourceForm initial={raw ?? { id: null, name: "", active: true }} onDone={done} />}
    />
  );
}

function LeadSourceForm({ initial, onDone }: { initial: { id: string | null; name: string; active: boolean }; onDone: () => void }) {
  const [f, setF] = useState(initial);
  const s = useSaver();
  return (
    <form
      className="card space-y-3 p-4 ring-2 ring-brand-500"
      onSubmit={(e) => {
        e.preventDefault();
        s.save(() => saveLeadSource(f), onDone);
      }}
    >
      <ErrorBanner error={s.err} />
      <Field label="Name" error={s.fe.name}>
        <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
      <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Show on new jobs" />
      <FormButtons pending={s.pending} ok={s.ok} onCancel={onDone} />
    </form>
  );
}

function ListEditor<T>({
  items,
  addLabel,
  renderForm,
}: {
  items: { id: string; title: string; subtitle: string; active: boolean; raw: T }[];
  addLabel: string;
  renderForm: (raw: T | null, done: () => void) => React.ReactNode;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <div className="card divide-y divide-stone-100 overflow-hidden">
        {items.map((it) =>
          editing === it.id ? (
            <div key={it.id} className="p-2">
              {renderForm(it.raw, () => setEditing(null))}
            </div>
          ) : (
            <button key={it.id} type="button" onClick={() => setEditing(it.id)} className={cx("flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-stone-50", !it.active && "opacity-50")}>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{it.title}</div>
                {it.subtitle ? <div className="truncate text-sm text-stone-500">{it.subtitle}</div> : null}
              </div>
              <Pencil className="h-4 w-4 shrink-0 text-stone-400" />
            </button>
          ),
        )}
      </div>
      {editing === "new" ? (
        renderForm(null, () => setEditing(null))
      ) : (
        <button type="button" className="btn-secondary w-full" onClick={() => setEditing("new")}>
          <Plus className="h-5 w-5" /> {addLabel}
        </button>
      )}
    </div>
  );
}

function FormButtons({ pending, ok, onCancel }: { pending: boolean; ok: boolean; onCancel: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" className="btn-secondary" onClick={onCancel}>
        Cancel
      </button>
      <SaveButton pending={pending} ok={ok} />
    </div>
  );
}

// ───────────── Integrations ─────────────

export function CalendarSettingsForm({ enabled, calendarId, connected }: { enabled: boolean; calendarId: string; connected: boolean }) {
  const [f, setF] = useState({ gcalEnabled: enabled, gcalCalendarId: calendarId });
  const s = useSaver();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        s.save(() => saveCalendarSettings(f));
      }}
    >
      <ErrorBanner error={s.err} />
      <Toggle checked={f.gcalEnabled} onChange={(v) => setF({ ...f, gcalEnabled: v })} label="Sync jobs to Google Calendar" />
      <Field label="Calendar ID" hint='"primary" = your main calendar. To use a separate calendar, paste its ID from Google Calendar → Settings → Integrate calendar.'>
        <input className="input" value={f.gcalCalendarId} onChange={(e) => setF({ ...f, gcalCalendarId: e.target.value })} />
      </Field>
      <SaveButton pending={s.pending} ok={s.ok} />
      {connected ? (
        <button
          type="button"
          className="btn-ghost w-full text-red-600"
          onClick={() => confirm("Disconnect Google Calendar? Existing events stay in Google.") && s.save(() => disconnectGoogleCalendar())}
        >
          Disconnect Google Calendar
        </button>
      ) : null}
    </form>
  );
}

// ───────────── Users & account ─────────────

export function UsersEditor({ users, meId, isOwner }: { users: { id: string; name: string; email: string; role: string; active: boolean; lastLoginAt: string | null }[]; meId: string; isOwner: boolean }) {
  const [f, setF] = useState({ name: "", email: "", role: "EMPLOYEE" as "ADMIN" | "EMPLOYEE", password: "" });
  const [adding, setAdding] = useState(false);
  const s = useSaver();
  return (
    <div className="space-y-3">
      <div className="card divide-y divide-stone-100">
        {users.map((u) => (
          <div key={u.id} className={cx("flex items-center gap-3 px-4 py-3", !u.active && "opacity-50")}>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">
                {u.name} <span className="text-xs font-bold text-stone-400">{u.role}</span>
              </div>
              <div className="truncate text-sm text-stone-500">{u.email}</div>
            </div>
            {isOwner && u.id !== meId ? (
              <button type="button" className="btn-ghost min-h-10 text-sm" onClick={() => s.save(() => setUserActive(u.id, !u.active))}>
                {u.active ? "Deactivate" : "Activate"}
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <ErrorBanner error={s.err} />
      {isOwner ? (
        adding ? (
          <form
            className="card space-y-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              s.save(() => createUser(f), () => {
                setAdding(false);
                setF({ name: "", email: "", role: "EMPLOYEE", password: "" });
              });
            }}
          >
            <Field label="Name">
              <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className="input" type="email" autoCapitalize="none" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </Field>
            <Field label="Role" hint="Employees can view and work jobs but can't see company finances, expenses or settings.">
              <Segmented value={f.role} onChange={(v) => setF({ ...f, role: v })} options={[{ value: "EMPLOYEE", label: "Employee" }, { value: "ADMIN", label: "Admin" }]} />
            </Field>
            <Field label="Temporary password" hint="10+ characters with letters and numbers">
              <input className="input" type="text" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            </Field>
            <FormButtons pending={s.pending} ok={s.ok} onCancel={() => setAdding(false)} />
          </form>
        ) : (
          <button type="button" className="btn-secondary w-full" onClick={() => setAdding(true)}>
            <Plus className="h-5 w-5" /> Add user
          </button>
        )
      ) : null}
    </div>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);
  return (
    <form action={action} className="card space-y-3 p-4">
      <ErrorBanner error={state?.error} />
      {state?.ok ? <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">Password changed. Other devices were signed out.</div> : null}
      <Field label="Current password">
        <input className="input" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="New password" hint="10+ characters with letters and numbers">
        <input className="input" name="next" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm new password">
        <input className="input" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null} Change password
      </button>
    </form>
  );
}

export function DieselRefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn-secondary shrink-0"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await fetch("/api/fuel/diesel?refresh=1");
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Refresh
    </button>
  );
}
