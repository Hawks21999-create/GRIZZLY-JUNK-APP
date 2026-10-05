import { JobForm } from "@/components/JobForm";
import { newJobInitial } from "@/lib/job-form-initial";
import { PageHeader } from "@/components/ui";
import { isValidYmd, toHm, todayYmd } from "@/lib/tz";
import { getCustomer } from "@/server/customers";
import { getJobFormOptions } from "@/server/settings";

export const metadata = { title: "New Job" };

export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ date?: string; customer?: string }> }) {
  const sp = await searchParams;
  const options = await getJobFormOptions();
  const today = todayYmd(options.settings.timezone);
  const date = sp.date && isValidYmd(sp.date) ? sp.date : today;
  let prefill = {};
  if (sp.customer && /^[0-9a-f-]{36}$/i.test(sp.customer)) {
    const c = await getCustomer(sp.customer);
    if (c) {
      prefill = {
        customerId: c.id,
        customer: { name: c.name, phone: c.phone ?? "", email: c.email ?? "" },
        address: c.address ?? "",
        city: c.city,
        state: c.state,
        zip: c.zip,
        lat: c.lat,
        lng: c.lng,
        leadSourceId: options.leadSources.find((l) => l.name === "Repeat Customer")?.id ?? c.leadSourceId,
      };
    }
  }
  const initial = newJobInitial(options, today, { date, ...prefill }, toHm(new Date(), options.settings.timezone));
  // put a known customer address into the route
  if ("address" in prefill && initial.address) {
    initial.stops = initial.stops.map((s) => (s.type === "CUSTOMER" ? { ...s, address: initial.address, lat: initial.lat, lng: initial.lng } : s));
  }
  return (
    <div>
      <PageHeader title="New Job" subtitle="Book it, see the profit, add it to the calendar." />
      {!options.vehicles.length ? (
        <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Add your vehicle in Settings first so fuel and vehicle costs can be calculated.</div>
      ) : null}
      <JobForm initial={initial} options={options} />
    </div>
  );
}
