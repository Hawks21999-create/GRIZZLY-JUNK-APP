import "server-only";
import { ZodError } from "zod";
import { fieldErrors } from "./validation";
import { isUserError } from "./errors";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Normalizes thrown errors into a safe result for the client (no stack traces / internals). */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof ZodError) {
      const fe = fieldErrors(err);
      return { ok: false, error: Object.values(fe)[0] ?? "Please check the form", fieldErrors: fe };
    }
    // Next.js redirect()/notFound() must propagate
    if (err && typeof err === "object" && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_")) {
      throw err;
    }
    if (isUserError(err) || (err instanceof Error && err.message === "Not authorized")) {
      return { ok: false, error: err.message };
    }
    console.error("[action]", err);
    return { ok: false, error: "Something went wrong saving that. Please try again." };
  }
}
