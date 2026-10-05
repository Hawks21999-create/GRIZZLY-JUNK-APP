import { notFound } from "next/navigation";
import { JobForm, type JobFormInitial } from "@/components/JobForm";
import { stopKey } from "@/lib/route-stops";
import { PageHeader } from "@/components/ui";
import { toHm, toYmd } from "@/lib/tz";
import { getJobDetail } from "@/server/jobs";
import { getJobFormOptions } from "@/server/settings";

export const metadata = { title: "Edit Job" };

export default async function EditJobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ book?: string }> }) {
  const { id } = await params;
  const { book } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [d, options] = await Promise.all([getJobDetail(id), getJobFormOptions()]);
  if (!d) notFound();
  const j = d.job;
  const tz = options.settings.timezone;
  const initial: JobFormInitial = {
    id: j.id,
    customerId: j.customerId,
    customer: { name: j.customer.name, phone: j.customer.phone ?? "", email: j.customer.email ?? "" },
    address: j.address,
    city: j.city,
    state: j.state,
    zip: j.zip,
    lat: j.lat,
    lng: j.lng,
    date: j.scheduledStart ? toYmd(j.scheduledStart, tz) : "",
    time: j.scheduledStart ? toHm(j.scheduledStart, tz) : "",
    durationMinutes: j.durationMinutes,
    jobType: j.jobType,
    status: j.status,
    quotedPrice: j.quotedPrice,
    deposit: j.deposit,
    paymentStatus: j.paymentStatus,
    paymentMethod: j.paymentMethod,
    leadSourceId: j.leadSourceId,
    leadCost: j.leadCost,
    workersCount: j.workersCount,
    estLaborHours: j.estLaborHours,
    labor: j.labor.map((l) => ({ employeeId: l.employeeId, estHours: l.estHours, hourlyRate: l.hourlyRate })),
    vehicleId: j.vehicleId,
    vehicleRates: { mpg: j.mpg, fuelPrice: j.fuelPrice, maintenancePerMile: j.maintenancePerMile, depreciationPerMile: j.depreciationPerMile },
    dumpFacilityId: j.dumpFacilityId,
    estDumpCost: j.estDumpCost,
    stops: j.routeStops.map((s) => ({
      key: stopKey(),
      type: s.type,
      label: s.label,
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      legMiles: s.legMiles,
      dumpFacilityId: s.type === "DUMP" ? (options.dumpFacilities.find((d) => d.name === s.label)?.id ?? null) : null,
    })),
    milesOverride: j.milesOverride,
    expenses: j.expenses.map((x) => ({ id: x.id, category: x.category, description: x.description, amount: x.amount })),
    notes: j.notes ?? "",
    fuelPrice: j.fuelPrice,
    fuelPriceSource: j.fuelPriceSource,
    fuelOverride: (j.fuelPriceSource ?? "").startsWith("Manual"),
    leadReceivedDate: toYmd(j.leadReceivedAt, tz),
    leadReceivedTime: toHm(j.leadReceivedAt, tz),
    lostReason: j.lostReason,
  };
  // "Book Job" from a lead: switch to Scheduled and suggest a date
  if (book === "1" && !["SCHEDULED", "ON_THE_WAY", "IN_PROGRESS", "COMPLETED"].includes(initial.status)) {
    initial.status = "SCHEDULED";
    if (!initial.date) {
      initial.date = toYmd(new Date(), tz);
      initial.time = "09:00";
    }
  }
  // employees no longer active but on this job still need to be selectable
  for (const l of j.labor) {
    if (!options.employees.some((e) => e.id === l.employeeId)) {
      options.employees.push({ id: l.employeeId, name: l.employee.name, hourlyCost: l.hourlyRate });
    }
  }
  return (
    <div>
      <PageHeader title={book === "1" ? `Book ${d.job.customer.name}` : `Edit ${d.jobNumber}`} subtitle={book === "1" ? "Set the date, time and price to book this lead" : undefined} back={`/jobs/${id}`} />
      <JobForm initial={initial} options={options} />
    </div>
  );
}
