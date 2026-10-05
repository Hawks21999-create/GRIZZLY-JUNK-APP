import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { apiUser, jsonError } from "@/lib/api";

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await apiUser();
  if (u instanceof NextResponse) return u;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return jsonError("Not found", 404);
  const [a] = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
  if (!a) return jsonError("Not found", 404);
  return new NextResponse(new Uint8Array(a.data), {
    headers: {
      "Content-Type": a.mimeType,
      "Content-Length": String(a.data.length),
      "Content-Disposition": `inline; filename="${a.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await apiUser();
  if (u instanceof NextResponse) return u;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return jsonError("Not found", 404);
  const [a] = await db.delete(attachments).where(eq(attachments.id, id)).returning({ jobId: attachments.jobId });
  if (a?.jobId) revalidatePath(`/jobs/${a.jobId}`);
  revalidatePath("/expenses");
  return NextResponse.json({ ok: true });
}
