"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const denied = error.message === "Not authorized";
  return (
    <div className="card mt-6 space-y-3 p-6 text-center">
      <div className="text-lg font-bold">{denied ? "This page is for the owner/admin" : "Something went wrong"}</div>
      <p className="text-sm text-stone-500">{denied ? "Ask the owner if you need access." : "Your data is safe. Try again — if it keeps happening, check the server logs."}</p>
      {!denied ? (
        <button className="btn-primary w-full" onClick={reset}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
