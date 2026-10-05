"use server";

import { z } from "zod";
import { JOB_STATUSES } from "@/lib/constants";
import { run, type ActionResult } from "@/lib/action";
import { requireAdmin, requireUser } from "@/lib/auth/server";
import type { JobFinancials } from "@/lib/calc";
import {
  completeJobSchema,
  dumpRecordSchema,
  jobExpenseSchema,
  jobInputSchema,
  type CompleteJobInput,
  type JobInput,
} from "@/lib/validation";
import * as jobsSvc from "@/server/jobs";
import type { JobStatus } from "@/db/schema";

const idSchema = z.string().uuid();
const idList = z.array(z.string().uuid().nullable()).max(50).optional();

function revalidateJob(id?: string) {
  // Every page is dynamic (no server cache) and Next's client cache for
  // dynamic pages is 0s, so only the job's own pages need revalidating —
  // the server action response then carries the fresh page inline.
  // Pages are fully dynamic; the client refreshes itself after each action.
  void id;
}

export async function saveJob(
  id: string | null,
  payload: JobInput & { expenseIds?: (string | null)[] },
): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const user = await requireUser();
    const input = jobInputSchema.parse(payload);
    if (id) {
      idSchema.parse(id);
      await jobsSvc.updateJob(id, { ...input, expenseIds: idList.parse(payload.expenseIds) });
      revalidateJob(id);
      return { id };
    }
    const newId = await jobsSvc.createJob(input, user);
    revalidateJob(newId);
    return { id: newId };
  });
}

export async function setJobStatus(id: string, status: JobStatus, lostReason?: string | null): Promise<ActionResult> {
  return run(async () => {
    await requireUser();
    idSchema.parse(id);
    z.enum(JOB_STATUSES as [JobStatus, ...JobStatus[]]).parse(status);
    const reason = lostReason === undefined ? undefined : z.string().trim().max(300).nullable().parse(lostReason) || null;
    await jobsSvc.setJobStatus(id, status, reason);
    revalidateJob(id);
    return undefined;
  });
}

export async function deleteJob(id: string): Promise<ActionResult> {
  return run(async () => {
    await requireAdmin();
    idSchema.parse(id);
    await jobsSvc.deleteJob(id);
    revalidateJob();
    return undefined;
  });
}

export async function completeJob(
  payload: CompleteJobInput & { dumpRecordIds?: (string | null)[]; expenseIds?: (string | null)[] },
): Promise<ActionResult<JobFinancials>> {
  return run(async () => {
    await requireUser();
    completeJobSchema.parse(payload);
    const fin = await jobsSvc.completeJob({
      ...payload,
      dumpRecordIds: idList.parse(payload.dumpRecordIds),
      expenseIds: idList.parse(payload.expenseIds),
    });
    revalidateJob(payload.jobId);
    return fin;
  });
}

export async function refreshVehicleRates(id: string): Promise<ActionResult> {
  return run(async () => {
    await requireUser();
    await jobsSvc.refreshVehicleRates(idSchema.parse(id));
    revalidateJob(id);
    return undefined;
  });
}

export async function addDumpRecord(payload: z.input<typeof dumpRecordSchema>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    await requireUser();
    const v = dumpRecordSchema.parse(payload);
    const id = await jobsSvc.addDumpRecord(v);
    revalidateJob(v.jobId);
    return { id };
  });
}

export async function deleteDumpRecord(jobId: string, id: string): Promise<ActionResult> {
  return run(async () => {
    await requireUser();
    await jobsSvc.deleteDumpRecord(idSchema.parse(id));
    revalidateJob(jobId);
    return undefined;
  });
}

export async function addJobExpense(payload: z.input<typeof jobExpenseSchema>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    await requireUser();
    const v = jobExpenseSchema.parse(payload);
    const id = await jobsSvc.addJobExpense(v);
    revalidateJob(v.jobId);
    return { id };
  });
}

export async function deleteJobExpense(jobId: string, id: string): Promise<ActionResult> {
  return run(async () => {
    await requireUser();
    await jobsSvc.deleteJobExpense(idSchema.parse(id));
    revalidateJob(jobId);
    return undefined;
  });
}
