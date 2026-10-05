"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions/auth";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, undefined);
  return (
    <form action={action} className="card space-y-4 p-5">
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" defaultValue={state?.email ?? ""} key={state?.email ?? ""} autoComplete="username" inputMode="email" required className="input" autoCapitalize="none" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      {state?.error ? (
        <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {state.error}
        </div>
      ) : null}
      <button type="submit" disabled={pending} className="btn-primary btn-xl w-full">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
