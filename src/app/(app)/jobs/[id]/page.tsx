import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { CalendarCheck, CalendarX, MapPin, MessageSquare, Navigation, Pencil, Phone } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/server";
import { JOB_TYPE_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, PRE_BOOKING_STATUSES } from "@/lib/constants";
import { splitMiles } from "@/lib/route-stops";
import { money, miles, pct } from "@/lib/format";
import { dialable, formatPhone } from "@/lib/phone";
import { fmtDate, fmtTime } from "@/lib/tz";
import { getJobDetail } from "@/server/jobs";
import { getDumpFacilities } from "@/server/settings";
import { CostLines, EstimateVsActual } from "@/components/FinancialSummary";
import {
  AttachmentsPanel,
  DeleteJobButton,
  DumpRecordsPanel,
  JobExpensesPanel,
  LeadActions,
  RefreshRatesButton,
  StatusButtons,
} from "@/components/JobActions";
import { Card, LeadStatusChip, Row, SectionTitle, StatusChip } from "@/components/ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = /^[0-9a-f-]{36}$/i.test(id) ? await getJobDetail(id) : null;
  return { title: d ? `${d.jobNumber} ${d.job.customer.name}` : "Job" };
}

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [d, facilities, user] = await Promise.all([getJobDetail(id), getDumpFacilities(), getCurrentUser()]);
  if (!d) notFound();
  const { job: j, financials: fin, settings: s } = d;
  const cur = s.currency;
  const tz = s.timezone;
  const fullAddress = [j.address, j.city && !j.address.includes(j.city) ? j.city : null].filter(Boolean).join(", ");
  const navQ = encodeURIComponent(j.lat != null && j.lng != null ? `${j.lat},${j.lng}` : fullAddress);
  const tel = dialable(j.customer.phone);
  const est = fin.estimate;
  const done = j.status === "COMPLETED" && fin.actual;
  const looseAttachments = d.attachments;
  const isAdmin = user?.role !== "EMPLOYEE";
  const b = fin.best;
  const isPreBooking = PRE_BOOKING_STATUSES.includes(j.status) || j.status === "ESTIMATE_SCHEDULED";
  const milesSplit = splitMiles(j.routeStops);
  const cityLabel = [j.city, j.state].filter(Boolean).join(", ");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/jobs" className="-ml-1 inline-flex min-h-9 items-center text-sm font-semibold text-brand-700">
            ‹ Jobs
          </Link>
          <div className="text-sm font-bold text-stone-500">{d.jobNumber}</div>
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{j.customer.name}</h1>
          <div className="mt-1">
            <StatusChip status={j.status} size="md" />
          </div>
        </div>
        <Link href={`/jobs/${j.id}/edit`} className="btn-secondary mt-8 shrink-0">
          <Pencil className="h-4 w-4" /> Edit
        </Link>
      </div>

      {/* Status / lead pipeline */}
      {isPreBooking ? <LeadActions jobId={j.id} status={j.status} /> : <StatusButtons jobId={j.id} status={j.status} />}
      {isPreBooking ? (
        <details className="px-1">
          <summary className="cursor-pointer text-sm font-semibold text-stone-500">All statuses…</summary>
          <div className="pt-2">
            <StatusButtons jobId={j.id} status={j.status} />
          </div>
        </details>
      ) : null}

      {/* FINANCIALS headline */}
      <section className={`overflow-hidden rounded-2xl ${b.profit >= 0 ? "bg-bear-900" : "bg-red-800"} text-white`}>
        <div className="flex items-end justify-between gap-3 px-4 pt-4">
          <div>
            <div className="text-[11px] font-bold tracking-wider text-white/60 uppercase">{done ? "Profit" : "Estimated profit"}</div>
            <div className={`tabular text-4xl font-black ${b.profit >= 0 ? "text-brand-400" : "text-white"}`}>{money(b.profit, cur)}</div>
          </div>
          <div className="pb-1 text-right">
            <div className="text-[11px] font-bold tracking-wider text-white/60 uppercase">Margin</div>
            <div className="tabular text-2xl font-extrabold">{pct(b.margin)}</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 border-t border-white/10 text-sm">
          <div className="px-4 py-2.5">
            <div className="text-[10px] font-bold tracking-wider text-white/50 uppercase">Customer price</div>
            <div className="tabular text-lg font-bold">{money(b.price, cur)}</div>
          </div>
          <div className="border-l border-white/10 px-4 py-2.5">
            <div className="text-[10px] font-bold tracking-wider text-white/50 uppercase">Total cost</div>
            <div className="tabular text-lg font-bold">{money(b.totalCost, cur)}</div>
          </div>
        </div>
        {done ? (
          <div className="grid grid-cols-3 border-t border-white/10 text-center text-xs">
            <div className="py-2">
              <div className="text-white/50">Estimated</div>
              <div className="tabular font-bold">{money(est.profit, cur)}</div>
            </div>
            <div className="border-l border-white/10 py-2">
              <div className="text-white/50">Actual</div>
              <div className="tabular font-bold">{money(fin.actual!.profit, cur)}</div>
            </div>
            <div className="border-l border-white/10 py-2">
              <div className="text-white/50">Difference</div>
              <div className={`tabular font-bold ${(fin.profitDifference ?? 0) >= 0 ? "text-brand-400" : "text-red-300"}`}>
                {(fin.profitDifference ?? 0) >= 0 ? "+" : "−"}
                {money(Math.abs(fin.profitDifference ?? 0), cur)}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* CUSTOMER */}
      <section>
        <SectionTitle>Customer</SectionTitle>
        <Card className="p-4">
          <div className="divide-y divide-stone-100 text-[15px]">
            <Row label="Name" value={<Link href={`/customers/${j.customerId}`} className="font-bold underline-offset-2 active:underline">{j.customer.name}</Link>} />
            <Row label="Phone" value={formatPhone(j.customer.phone) || "—"} />
            {j.customer.email ? <Row label="Email" value={<span className="break-all">{j.customer.email}</span>} /> : null}
            <Row label="Address" value={<span className="block max-w-[60vw] text-right sm:max-w-none">{j.address || "—"}</span>} />
            <Row label="City" value={cityLabel || "—"} strong />
          </div>
          {tel ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a href={`tel:${tel}`} className="btn-dark btn-xl">
                <Phone className="h-5 w-5" /> Call
              </a>
              <a href={`sms:${tel}`} className="btn-secondary btn-xl">
                <MessageSquare className="h-5 w-5" /> Text
              </a>
            </div>
          ) : null}
          {j.address ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <a href={`https://maps.apple.com/?daddr=${navQ}&dirflg=d`} className="btn-primary btn-xl">
                <Navigation className="h-5 w-5" /> Navigate
              </a>
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${navQ}&travelmode=driving`} className="btn-secondary btn-xl" target="_blank" rel="noreferrer">
                <MapPin className="h-5 w-5" /> Google Maps
              </a>
            </div>
          ) : null}
        </Card>
      </section>

      {/* LEAD */}
      <section>
        <SectionTitle>Lead</SectionTitle>
        <Card className="divide-y divide-stone-100 px-4 py-2 text-[15px]">
          <Row label="Source" value={j.leadSource?.name ?? "—"} strong />
          <Row label="Lead cost" value={money(j.leadCost, cur)} strong />
          <Row label="Status" value={<LeadStatusChip status={j.status} />} />
          <Row label="Came in" value={`${fmtDate(j.leadReceivedAt, tz, { weekday: true })} · ${fmtTime(j.leadReceivedAt, tz)}`} />
          {j.bookedAt ? <Row label="Booked" value={fmtDate(j.bookedAt, tz, { year: true })} /> : null}
          {j.lostReason && (j.status === "NOT_BOOKED" || j.status === "CANCELLED") ? <Row label="Lost reason" value={j.lostReason} tone="loss" /> : null}
        </Card>
      </section>

      {/* TRANSPORTATION */}
      <section>
        <SectionTitle>Transportation</SectionTitle>
        <Card className="divide-y divide-stone-100 px-4 py-2 text-[15px]">
          <Row
            label="Total miles"
            hint={milesSplit.oneWay !== null ? `${milesSplit.oneWay.toFixed(1)} one-way + ${milesSplit.returnMiles!.toFixed(1)} return${j.actualMiles !== null ? " (planned)" : ""}` : undefined}
            value={`${b.miles.toFixed(1)} mi`}
            strong
          />
          <Row label="Van MPG" value={j.mpg} />
          <Row label="Diesel price" hint={j.fuelPriceSource ?? undefined} value={`$${j.fuelPrice.toFixed(2)}/gal`} />
          <Row label="Gallons used" value={b.fuelGallons.toFixed(2)} />
          <Row label="Fuel cost" value={money(b.fuel, cur)} strong />
        </Card>
      </section>

      {/* JOB COSTS */}
      <section>
        <SectionTitle>Job Costs {done ? "" : "(estimated)"}</SectionTitle>
        <Card className="divide-y divide-stone-100 px-4 py-2 text-[15px]">
          <Row label="Lead" value={money(b.lead, cur)} />
          <Row label="Fuel" value={money(b.fuel, cur)} />
          <Row label="Dump" value={money(b.dump, cur)} />
          <Row label="Labor" hint={b.laborHours ? `${b.laborHours} worker-hours` : undefined} value={money(b.labor, cur)} />
          <Row label="Other" value={money(b.other, cur)} />
          {s.includeVehicleWear ? <Row label="Vehicle wear" hint="maintenance + depreciation" value={money(b.maintenance + b.depreciation, cur)} /> : null}
          <Row label="Total cost" value={money(b.totalCost, cur)} strong />
        </Card>
      </section>

      {/* FINANCIALS */}
      <section>
        <SectionTitle>Financials</SectionTitle>
        <Card className="divide-y divide-stone-100 px-4 py-2 text-[15px]">
          <Row label={done ? "Customer price" : "Quoted price"} value={money(b.price, cur)} strong />
          <Row label="Total cost" value={money(b.totalCost, cur)} />
          <Row label="Profit" value={money(b.profit, cur)} strong tone={b.profit >= 0 ? "profit" : "loss"} />
          <Row label="Profit margin" value={pct(b.margin)} strong tone={b.profit >= 0 ? "profit" : "loss"} />
          <Row label="Profit per labor hour" value={b.profitPerLaborHour !== null ? money(b.profitPerLaborHour, cur) : "—"} tone="muted" />
          <Row label="Profit per mile" value={b.profitPerMile !== null ? money(b.profitPerMile, cur) : "—"} tone="muted" />
        </Card>
      </section>

      {/* JOB */}
      <section>
        <SectionTitle>Job</SectionTitle>
        <Card className="divide-y divide-stone-100 px-4 py-2">
          <Row label="Date" value={fmtDate(j.scheduledStart, tz, { weekday: true, year: true })} />
          <Row label="Time" value={j.scheduledStart ? `${fmtTime(j.scheduledStart, tz)} · ${j.durationMinutes / 60}h` : "—"} />
          <Row label="Job type" value={JOB_TYPE_LABEL[j.jobType]} />
          <Row label="Quoted price" value={money(j.quotedPrice, cur)} strong />
          {j.finalPrice !== null && j.finalPrice !== j.quotedPrice ? <Row label="Final price" value={money(j.finalPrice, cur)} strong /> : null}
          <Row label="Deposit" value={money(j.deposit, cur)} />
          <Row label="Payment" value={`${PAYMENT_STATUS_LABEL[j.paymentStatus]}${j.paymentMethod ? ` · ${PAYMENT_METHOD_LABEL[j.paymentMethod]}` : ""}`} />
          <Row label="Crew" value={j.labor.length ? j.labor.map((l) => l.employee.name).join(", ") : `${j.workersCount} workers`} />
          {j.notes ? (
            <div className="py-2">
              <div className="text-stone-600">Notes</div>
              <div className="mt-1 whitespace-pre-wrap text-stone-900">{j.notes}</div>
            </div>
          ) : null}
        </Card>
      </section>

      {/* Financial summary */}
      {isAdmin ? (
        <section>
          <SectionTitle>{done ? "Detailed Cost Breakdown" : "Detailed Estimate"}</SectionTitle>
          <Card className="p-4">
            <CostLines b={fin.best} currency={cur} />
            <div className="mt-2 text-xs text-stone-500">
              Profit per labor hour {fin.best.profitPerLaborHour !== null ? money(fin.best.profitPerLaborHour, cur) : "—"} · Profit per
              mile {fin.best.profitPerMile !== null ? money(fin.best.profitPerMile, cur) : "—"} · Margin {pct(fin.best.margin)}
            </div>
          </Card>
        </section>
      ) : null}

      {done && isAdmin ? (
        <section>
          <SectionTitle>Estimated vs Actual</SectionTitle>
          <Card className="p-4">
            <EstimateVsActual est={est} act={fin.actual!} currency={cur} />
          </Card>
        </section>
      ) : null}

      {/* Route */}
      <section>
        <SectionTitle>Route</SectionTitle>
        <Card className="p-4">
          {j.routeStops.length ? (
            <ol className="space-y-1.5 text-sm">
              {j.routeStops.map((st, i) => (
                <li key={st.id} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">
                    <b>{i + 1}. {st.label}</b> <span className="text-stone-500">{st.address}</span>
                  </span>
                  <span className="tabular shrink-0 text-stone-600">{i > 0 && st.legMiles !== null ? `${st.legMiles.toFixed(1)} mi` : ""}</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="text-sm text-stone-500">No route saved.</div>
          )}
          <div className="mt-3 border-t border-stone-100 pt-2 text-sm">
            <Row label="Route miles" value={miles(j.routeMiles)} />
            {j.milesOverride !== null ? <Row label="Manual override" value={miles(j.milesOverride)} /> : null}
            {j.actualMiles !== null ? <Row label="Actual miles" value={miles(j.actualMiles)} strong /> : null}
          </div>
          {j.routeError ? <div className="mt-2 text-xs text-amber-700">Route note: {j.routeError}</div> : null}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
            <span>
              Rates: {j.mpg} mpg · ${j.fuelPrice}/gal · ${j.maintenancePerMile}/mi · ${j.depreciationPerMile}/mi
            </span>
            {j.status !== "COMPLETED" ? <RefreshRatesButton jobId={j.id} /> : null}
          </div>
        </Card>
      </section>

      {/* Dump */}
      <section>
        <SectionTitle>Dump Receipts</SectionTitle>
        <Card className="p-4">
          <DumpRecordsPanel
            jobId={j.id}
            records={j.dumpRecords.map((r) => ({ id: r.id, facilityName: r.facilityName, fee: r.fee, weightLbs: r.weightLbs, loads: r.loads }))}
            facilities={facilities.map((f) => ({ id: f.id, name: f.name, defaultFee: f.defaultFee }))}
            defaultFacilityId={j.dumpFacilityId ?? s.defaultDumpFacilityId}
            currency={cur}
          />
        </Card>
      </section>

      {/* Labor */}
      {j.labor.length ? (
        <section>
          <SectionTitle>Labor</SectionTitle>
          <Card className="divide-y divide-stone-100 px-4 py-2">
            {j.labor.map((l) => {
              const h = l.actualHours ?? l.estHours;
              return (
                <Row
                  key={l.id}
                  label={l.employee.name}
                  hint={`${h} h × ${money(l.hourlyRate, cur)}${l.actualHours === null ? " (est.)" : ""}`}
                  value={money(Math.round(h * l.hourlyRate * 100) / 100, cur)}
                />
              );
            })}
          </Card>
        </section>
      ) : null}

      {/* Other costs */}
      <section>
        <SectionTitle>Other Job Costs</SectionTitle>
        <Card className="p-4">
          <JobExpensesPanel jobId={j.id} expenses={j.expenses.map((x) => ({ id: x.id, category: x.category, description: x.description, amount: x.amount }))} currency={cur} />
        </Card>
      </section>

      {/* Attachments */}
      <section>
        <SectionTitle>Receipts &amp; Photos</SectionTitle>
        <Card className="p-4">
          <AttachmentsPanel jobId={j.id} items={looseAttachments.map((a) => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType }))} />
        </Card>
      </section>

      {/* Calendar sync */}
      {s.gcalEnabled && s.gcalRefreshTokenEnc ? (
        <div className="flex items-center gap-2 px-1 text-xs text-stone-500">
          {j.gcalSyncError ? (
            <>
              <CalendarX className="h-4 w-4 text-red-500" /> Google Calendar sync failed: {j.gcalSyncError}
            </>
          ) : j.gcalEventId ? (
            <>
              <CalendarCheck className="h-4 w-4 text-emerald-600" /> On Google Calendar
            </>
          ) : (
            <>Not on Google Calendar (only scheduled jobs are synced)</>
          )}
        </div>
      ) : null}

      {isAdmin ? <DeleteJobButton jobId={j.id} label={d.jobNumber} /> : null}
    </div>
  );
}
