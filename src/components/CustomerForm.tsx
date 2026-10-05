"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { deleteCustomer, saveCustomer } from "@/app/actions/customers";
import { AddressInput } from "./AddressInput";
import { ErrorBanner, Field, Select } from "./form";

export type CustomerFormValues = {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  leadSourceId: string | null;
  notes: string;
};

export function CustomerForm({
  id,
  initial,
  leadSources,
  mapsEnabled,
  canDelete,
}: {
  id: string | null;
  initial: CustomerFormValues;
  leadSources: { id: string; name: string }[];
  mapsEnabled: boolean;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = <K extends keyof CustomerFormValues>(k: K, v: CustomerFormValues[K]) => setF((p) => ({ ...p, [k]: v }));

  return (
    <form
      className="card space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        start(async () => {
          const r = await saveCustomer(id, {
            ...f,
            phone: f.phone || null,
            email: f.email || null,
            address: f.address || null,
            notes: f.notes || null,
          });
          if (!r.ok) {
            setErr(r.error);
            setFe(r.fieldErrors ?? {});
            return;
          }
          window.location.assign(`/customers/${r.data.id}`);
        });
      }}
    >
      <ErrorBanner error={err} />
      <Field label="Name" error={fe.name}>
        <input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} autoCapitalize="words" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Phone" error={fe.phone}>
          <input className="input" type="tel" inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Email" error={fe.email}>
          <input className="input" type="email" inputMode="email" autoCapitalize="none" value={f.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
      </div>
      <Field label="Address">
        <AddressInput
          value={f.address}
          mapsEnabled={mapsEnabled}
          onChange={(t) => setF((p) => ({ ...p, address: t, lat: null, lng: null }))}
          onResolved={(a) => setF((p) => ({ ...p, address: a.formatted, city: a.city, state: a.state, zip: a.zip, lat: a.lat, lng: a.lng }))}
        />
      </Field>
      {!mapsEnabled ? (
        <div className="grid grid-cols-3 gap-2">
          <input className="input" placeholder="City" value={f.city ?? ""} onChange={(e) => set("city", e.target.value || null)} />
          <input className="input" placeholder="State" value={f.state ?? ""} onChange={(e) => set("state", e.target.value || null)} />
          <input className="input" placeholder="ZIP" value={f.zip ?? ""} onChange={(e) => set("zip", e.target.value || null)} />
        </div>
      ) : null}
      <Field label="Lead source">
        <Select value={f.leadSourceId} onChange={(v) => set("leadSourceId", v || null)} placeholder="Unknown" options={leadSources.map((l) => ({ value: l.id, label: l.name }))} />
      </Field>
      <Field label="Customer notes">
        <textarea className="input min-h-24" value={f.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <button className="btn-primary btn-xl w-full" disabled={pending}>
        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null} Save customer
      </button>
      {id && canDelete ? (
        <button
          type="button"
          className="btn-ghost w-full text-red-600"
          onClick={() => {
            if (!confirm("Delete this customer? Only possible when they have no jobs.")) return;
            start(async () => {
              const r = await deleteCustomer(id);
              if (!r.ok) return setErr(r.error);
              window.location.assign("/customers");
            });
          }}
        >
          <Trash2 className="h-5 w-5" /> Delete customer
        </button>
      ) : null}
    </form>
  );
}
