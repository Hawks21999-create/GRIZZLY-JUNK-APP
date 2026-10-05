import type { JobExpenseCategory, JobStatus, JobType, PaymentMethod, PaymentStatus } from "@/db/schema";
import type { JobFormOptions } from "@/server/settings";
import { businessStop, customerStop, dumpStop, type Stop } from "./route-stops";

export type JobFormInitial = {
  id?: string;
  customerId: string | null;
  customer: { name: string; phone: string; email: string };
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  date: string;
  time: string;
  durationMinutes: number;
  jobType: JobType;
  status: JobStatus;
  quotedPrice: number | null;
  deposit: number | null;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  leadSourceId: string | null;
  leadCost: number | null;
  workersCount: number;
  estLaborHours: number | null;
  labor: { employeeId: string; estHours: number | null; hourlyRate?: number }[];
  vehicleId: string | null;
  vehicleRates?: { mpg: number; fuelPrice: number; maintenancePerMile: number; depreciationPerMile: number };
  dumpFacilityId: string | null;
  estDumpCost: number | null;
  stops: Stop[];
  milesOverride: number | null;
  expenses: { id: string | null; category: JobExpenseCategory; description: string; amount: number | null }[];
  notes: string;
  /** Diesel price for this job ($/gal) and where it came from. */
  fuelPrice: number | null;
  fuelPriceSource: string | null;
  /** True when the price was typed in by hand (keeps it from following today's price). */
  fuelOverride: boolean;
  leadReceivedDate: string;
  leadReceivedTime: string;
  lostReason: string | null;
};

/** Build initial form state for a brand new job. */
export function newJobInitial(
  o: JobFormOptions,
  today: string,
  prefill?: Partial<JobFormInitial>,
  nowHm = "09:00",
): JobFormInitial {
  const st = o.settings;
  const dump = o.dumpFacilities.find((d) => d.id === st.defaultDumpFacilityId) ?? o.dumpFacilities[0];
  const stops: Stop[] = [businessStop(st.businessAddress, st.businessLat, st.businessLng), customerStop("", null, null)];
  if (st.defaultIncludeDump) stops.push(dumpStop(dump));
  stops.push(businessStop(st.businessAddress, st.businessLat, st.businessLng));
  const workers = o.employees.slice(0, Math.min(st.defaultWorkers, o.employees.length));
  return {
    customerId: null,
    customer: { name: "", phone: "", email: "" },
    address: "",
    city: null,
    state: null,
    zip: null,
    lat: null,
    lng: null,
    date: today,
    time: "09:00",
    durationMinutes: st.defaultJobDuration,
    jobType: "OTHER",
    status: "SCHEDULED",
    quotedPrice: null,
    deposit: null,
    paymentStatus: "NOT_PAID",
    paymentMethod: null,
    leadSourceId: null,
    leadCost: null,
    workersCount: st.defaultWorkers,
    estLaborHours: Math.round((st.defaultJobDuration / 60) * 100) / 100,
    labor: workers.map((w) => ({ employeeId: w.id, estHours: Math.round((st.defaultJobDuration / 60) * 100) / 100 })),
    vehicleId: st.defaultVehicleId ?? o.vehicles[0]?.id ?? null,
    dumpFacilityId: dump?.id ?? null,
    estDumpCost: dump && dump.defaultFee > 0 ? dump.defaultFee : st.defaultDumpCost,
    stops,
    milesOverride: null,
    expenses: [],
    notes: "",
    fuelPrice: o.diesel.price,
    fuelPriceSource: o.diesel.label,
    fuelOverride: false,
    leadReceivedDate: today,
    leadReceivedTime: nowHm,
    lostReason: null,
    ...prefill,
  };
}
