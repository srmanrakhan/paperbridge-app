"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DEMO_USER } from "@/lib/demoUser";

const INPUT = "mt-1.5 block w-full rounded-xl bg-mist px-4 py-3 text-[17px] outline-none ring-accent focus:ring-2";

// Demo sign-in: the fields are prefilled and any click signs in. Nothing is checked.
export function Login() {
  const router = useRouter();
  const [busy, setBusy] = useState<"password" | "ksef" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    router.prefetch("/welcome");
  }, [router]);

  async function signIn(method: "password" | "ksef") {
    setBusy(method);
    setError(null);
    try {
      const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't sign in. Please try again.");
      router.push("/welcome");
    } catch (err) {
      setError(err instanceof Error && !(err instanceof TypeError) ? err.message : "Couldn't reach Paperbridge. Check your connection.");
      setBusy(null);
    }
  }

  return (
    <div className="rise-in w-full max-w-[400px] rounded-3xl bg-white px-8 py-10 sm:px-10">
      <p className="text-center text-[24px] font-semibold tracking-tight">Paperbridge</p>
      <p className="mt-1 text-center text-[15px] text-muted">Sign in to your company.</p>
      <form
        className="mt-8 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          signIn("password");
        }}
      >
        <label className="block">
          <span className="text-[14px] text-muted">Email</span>
          <input type="email" defaultValue={DEMO_USER.email} autoComplete="off" className={INPUT} />
        </label>
        <label className="block">
          <span className="text-[14px] text-muted">Password</span>
          <input type="password" defaultValue={DEMO_USER.password} autoComplete="off" className={INPUT} />
        </label>
        <button
          type="submit"
          disabled={busy !== null}
          className="mt-2 w-full rounded-full bg-accent py-3 text-[17px] text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {busy === "password" ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <button
        type="button"
        onClick={() => signIn("ksef")}
        disabled={busy !== null}
        className="mt-3 w-full rounded-full bg-mist py-3 text-[17px] text-accent transition-colors hover:bg-line disabled:opacity-60"
      >
        {busy === "ksef" ? "Signing in…" : "Sign in with KSeF"}
      </button>
      {error && (
        <p role="alert" className="mt-4 text-center text-[15px] text-critical">
          {error}
        </p>
      )}
      <p className="mt-6 text-center text-[13px] text-faint">Demo account. Any click signs you in.</p>
    </div>
  );
}
