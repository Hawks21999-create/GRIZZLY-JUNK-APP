"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { signup, type SignupState } from "@/app/actions/auth";

export function SignupForm() {
  const [state, action, pending] = useActionState<SignupState, FormData>(signup, undefined);

  if (state?.ok) {
    return (
      <div className="card space-y-3 p-6 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-brand-600" />
        <div className="text-lg font-extrabold">Request sent</div>
        <p className="text-sm text-stone-600">
          The owner needs to approve your account. You&apos;ll be able to sign in once they do.
        </p>
        <a href="/login" className="btn-primary w-full">
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="card space-y-4 p-5">
      <div>
        <div className="text-lg font-extrabold">Create an account</div>
        <p className="text-sm text-stone-500">The owner will approve it before you can sign in.</p>
      </div>
      <div>
        <label className="label" htmlFor="name">Your name</label>
        <input id="name" name="name" required autoComplete="name" className="input" defaultValue={state?.values?.name ?? ""} key={`n${state?.values?.name ?? ""}`} />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          className="input"
          defaultValue={state?.values?.email ?? ""}
          key={`e${state?.values?.email ?? ""}`}
        />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required autoComplete="new-password" className="input" />
        <div className="mt-1 text-xs text-stone-500">At least 10 characters, with letters and numbers.</div>
      </div>
      <div>
        <label className="label" htmlFor="confirm">Confirm password</label>
        <input id="confirm" name="confirm" type="password" required autoComplete="new-password" className="input" />
      </div>
      {/* Honeypot: hidden from people, bots fill it in */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      {state?.error ? (
        <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {state.error}
        </div>
      ) : null}
      <button type="submit" disabled={pending} className="btn-primary btn-xl w-full">
        {pending ? "Sending…" : "Request account"}
      </button>
    </form>
  );
}
