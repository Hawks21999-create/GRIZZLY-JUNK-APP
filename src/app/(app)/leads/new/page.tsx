import { JobForm } from "@/components/JobForm";
import { PageHeader } from "@/components/ui";
import { newJobInitial } from "@/lib/job-form-initial";
import { toHm, todayYmd } from "@/lib/tz";
import { getJobFormOptions } from "@/server/settings";

export const metadata = { title: "New Lead" };

export default async function NewLeadPage() {
  const options = await getJobFormOptions();
  const tz = options.settings.timezone;
  const today = todayYmd(tz);
  // A lead is the start of a job record: no date yet, status New Lead.
  const initial = newJobInitial(options, today, { status: "LEAD", date: "", time: "" }, toHm(new Date(), tz));
  return (
    <div>
      <PageHeader title="New Lead" subtitle="Name, address, source, cost — then estimate and book it." />
      <JobForm initial={initial} options={options} mode="lead" />
    </div>
  );
}
