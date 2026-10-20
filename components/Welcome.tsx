"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const SYNC_START_MS = 700; // after the greeting has faded in
const SYNC_MS = 1800;
const LEAVE_MS = 3200;

export function Welcome({ firstName, company, invoices, payments }: { firstName: string; company: string; invoices: number; payments: number }) {
  const router = useRouter();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    router.prefetch("/start");
    let frame = 0;
    const start = performance.now() + SYNC_START_MS;
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / SYNC_MS));
      setProgress(1 - Math.pow(1 - t, 3)); // ease out
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const leave = setTimeout(() => router.push("/start"), LEAVE_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(leave);
    };
  }, [router]);

  const done = progress >= 1;
  return (
    <>
      <h1 className="rise-in text-[48px] font-semibold leading-tight tracking-[-0.015em] sm:text-[64px]">Welcome back, {firstName}.</h1>
      <p className="rise-in mt-2 text-[24px] text-muted" style={{ animationDelay: "150ms" }}>
        {company}
      </p>
      <p className="rise-in tabular mt-10 text-[17px] text-muted" style={{ animationDelay: "500ms" }} aria-live="polite">
        {done ? "Up to date:" : "Syncing KSeF and bank…"} {Math.round(progress * invoices)} invoices, {Math.round(progress * payments)} payments
      </p>
      <div className="rise-in mt-4 h-1 w-48 overflow-hidden rounded-full bg-mist" style={{ animationDelay: "500ms" }}>
        <div className="h-full rounded-full bg-accent" style={{ width: `${progress * 100}%` }} />
      </div>
      <Link href="/start" className="rise-in mt-16text-[15px] text-accent hover:underline" style={{ animationDelay: "800ms" }}>
        Skip
      </Link>
    </>
  );
}
