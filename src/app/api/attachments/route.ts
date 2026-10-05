import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { apiUser, jsonError } from "@/lib/api";

const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(req: NextRequest) {
  const u = await apiUser();
  if (u instanceof NextResponse) return u;
  const form = await req.formData().catch(() => null);
  if (!form) return jsonError("Invalid upload");
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("No file");
  if (file.size > MAX_BYTES) return jsonError("File is larger than 6 MB");
  if (!ALLOWED.includes(file.type)) return jsonError("Only photos (JPG, PNG, WebP, HEIC) or PDF receipts are allowed");

  const link: Record<string, string | null> = { jobId: null, dumpRecordId: null, jobExpenseId: null, businessExpenseId: null };
  for (const k of Object.keys(link)) {
    const v = form.get(k);
    if (typeof v === "string" && v) {
      if (!UUID.test(v)) return jsonError(`Invalid ${k}`);
      link[k] = v;
    }
  }
  if (!link.jobId && !link.businessExpenseId) return jsonError("Attach the file to a job or an expense");

  const buf = Buffer.from(await file.arrayBuffer());
  // Basic magic-number check so the declared type matches the content
  const sig = buf.subarray(0, 12).toString("hex");
  const looksOk =
    (file.type === "image/jpeg" && sig.startsWith("ffd8ff")) ||
    (file.type === "image/png" && sig.startsWith("89504e47")) ||
    (file.type === "image/webp" && buf.subarray(8, 12).toString() === "WEBP") ||
    ((file.type === "image/heic" || file.type === "image/heif") && buf.subarray(4, 8).toString() === "ftyp") ||
    (file.type === "application/pdf" && buf.subarray(0, 4).toString() === "%PDF");
  if (!looksOk) return jsonError("File content doesn't match its type");

  const name = (file.name || "receipt").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  try {
    const [row] = await db
      .insert(attachments)
      .values({ fileName: name, mimeType: file.type, sizeBytes: buf.length, data: buf, ...link })
      .returning({ id: attachments.id });
    if (link.jobId) revalidatePath(`/jobs/${link.jobId}`);
    if (link.businessExpenseId) revalidatePath(`/expenses`);
    return NextResponse.json({ id: row.id });
  } catch {
    return jsonError("Could not save the file (does the job/expense still exist?)", 400);
  }
}
