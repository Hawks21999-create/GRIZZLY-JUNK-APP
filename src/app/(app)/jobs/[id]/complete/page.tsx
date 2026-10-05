import { notFound } from "next/navigation";
import { CompleteJobForm, type CompleteInitial } from "@/components/CompleteJobForm";
import { PageHeader } from "@/components/ui";
import { estimatedMiles } from "@/lib/calc";
import { getJobDetail, toCalc } from "@/server/jobs";
import { getDumpFacilities, getEmployees } from "@/server/settings";

export const metadata = { title: "Complete Job" };

export default async function CompletePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [d, facilities, employees] = await Promise.all([getJobDetail(id), getDumpFacilities(), getEmployees()]);
  if (!d) notFound();
  const j = d.job;
  const calc = toCalc(j);
  const defaultFacility = j.dumpFacilityId ?? d.settings.defaultDumpFacilityId;

  const init: CompleteInitial = {
    jobId: j.id,
    jobNumber: d.jobNumber,
    customerName: j.customer.name,
    finalPrice: j.finalPrice ?? j.quotedPrice,
    actualMiles: j.actualMiles ?? estimatedMiles(j),
    dump: j.dumpRecords.length
      ? j.dumpRecords.map((r) => ({ id: r.id, facilityId: r.facilityId, fee: r.fee, weightLbs: r.weightLbs, loads: r.loads }))
      : [{ id: null, facilityId: defaultFacility, fee: j.estDumpCost || null, weightLbs: null, loads: 1 }],
    labor: j.labor.length
      ? j.labor.map((l) => ({ employeeId: l.employeeId, name: l.employee.name, hourlyRate: l.hourlyRate, hours: l.actualHours ?? l.estHours }))
      : employees.slice(0, j.workersCount).map((e) => ({ employeeId: e.id, name: e.name, hourlyRate: e.hourlyCost, hours: j.estLaborHours })),
    expenses: j.expenses.map((x) => ({ id: x.id, category: x.category, description: x.description, amount: x.amount })),
    paymentMethod: j.paymentMethod,
    paid: j.paymentStatus === "PAID" || j.status !== "COMPLETED",
    calcBase: calc,
    estimatedProfit: d.financials.estimate.profit,
    defaultLaborRate: d.settings.defaultLaborRate,
    includeWear: d.settings.includeVehicleWear,
    fuelPrice: j.fuelPrice,
  };

  return (
    <div>
      <PageHeader title="Complete Job" subtitle={`${d.jobNumber} · ${j.customer.name}`} back={`/jobs/${j.id}`} />
      <CompleteJobForm
        init={init}
        facilities={facilities.map((f) => ({ id: f.id, name: f.name, defaultFee: f.defaultFee }))}
        employees={employees.map((e) => ({ id: e.id, name: e.name, hourlyCost: e.hourlyCost }))}
        currency={d.settings.currency}
      />
    </div>
  );
}
