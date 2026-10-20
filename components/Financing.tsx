"use client";

import Link from "next/link";
import { useState } from "react";
import { pln } from "@/lib/format";
import { SHARED_FIELDS, type BankOffer, type GrantMatch } from "@/lib/offers";
import { Check } from "@/components/Check";

type Stage = "consent" | "loading" | "offers" | "requested";

const INPUT = "mt-1.5 block w-full rounded-xl bg-white px-4 py-3 text-[17px] outline-none ring-accent focus:ring-2";

const NOT_SHARED = ["Individual invoices and buyer e-mail addresses", "Your bank login or account numbers", "Anything not listed above"];

export function Financing({ asset, price }: { asset: string; price: number }) {
  const [stage, setStage] = useState<Stage>("consent");
  const [offers, setOffers] = useState<BankOffer[]>([]);
  const [grant, setGrant] = useState<GrantMatch | null>(null);
  const [topic, setTopic] = useState<string | null>(null); // what the adviser form is about; null while closed
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function share() {
    setStage("loading");
    setError(null);
    try {
      const res = await fetch("/api/financing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset, price, consent: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // A short pause so "banks are looking" reads as work, not a flash.
      await new Promise((r) => setTimeout(r, 1400));
      setOffers(data.offers);
      setGrant(data.grant);
      setStage("offers");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't reach the banks. Please try again.");
      setStage("consent");
    }
  }

  async function requestAdviser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy("adviser");
    setError(null);
    try {
      const res = await fetch("/api/adviser-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, name: form.get("name"), phone: form.get("phone"), time: form.get("time") }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't save your request. Please try again.");
      setStage("requested");
    } catch (err) {
      setError(err instanceof Error && !(err instanceof TypeError) ? err.message : "Couldn't save your request. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  if (stage === "consent" || stage === "loading") {
    const loading = stage === "loading";
    return (
      <section className="mx-auto max-w-2xl px-6 pb-24 pt-20">
        <p className="text-center text-[15px] text-muted">Step 1 of 2</p>
        <h1 className="mt-2 text-center text-[44px] font-semibold leading-tight tracking-[-0.015em]">Share your Passport</h1>
        <p className="mx-auto mt-4 max-w-lg text-center text-[21px] leading-snug text-muted">
          To get offers for your {asset.toLowerCase()} ({pln(price)}), banks need to see this. Only this.
        </p>

        <h2 className="mt-12 text-[19px] font-semibold">The banks will see</h2>
        <ul className="mt-3 border-t border-line">
          {SHARED_FIELDS.map((f) => (
            <li key={f} className="flex items-center gap-3 border-b border-line py-3.5 text-[17px]">
              <Check className="h-4 w-4 shrink-0 text-good" />
              {f}
            </li>
          ))}
        </ul>
        <h2 className="mt-8 text-[19px] font-semibold">The banks will not see</h2>
        <ul className="mt-3 border-t border-line">
          {NOT_SHARED.map((f) => (
            <li key={f} className="border-b border-line py-3.5 text-[17px] text-muted">
              {f}
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap items-center gap-5">
          <button
            onClick={share}
            disabled={loading}
            className="rounded-full bg-accent px-7 py-3 text-[17px] text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? "Banks are reviewing…" : "Share and see offers"}
          </button>
          <Link href="/bank" className="text-[17px] text-accent hover:underline">
            Preview the Passport
          </Link>
          <Link href="/afford" className="text-[17px] text-muted hover:underline">
            Cancel
          </Link>
        </div>
        <p className="mt-4 text-[13px] text-muted">This is a demo. The offers are examples and nothing is sent to a real bank.</p>
        <p className="mt-1 text-[13px] text-muted">Offers are indicative. Paperbridge doesn&apos;t give financial advice; talk to an adviser before signing.</p>
        {error && <p className="mt-4 text-[15px] text-muted">{error}</p>}
      </section>
    );
  }

  if (stage === "requested") {
    return (
      <section className="mx-auto max-w-2xl px-6 pb-24 pt-28 text-center">
        <p className="flex items-center justify-center gap-2 text-[15px] text-good">
          <Check />
          Request logged
        </p>
        <h1 className="mt-3 text-[44px] font-semibold leading-tight tracking-[-0.015em]">An independent financial adviser will contact you.</h1>
        <p className="mx-auto mt-4 max-w-lg text-[21px] leading-snug text-muted">
          They can walk you through {topic}. This is a demo: nothing was sent, and your request is in the activity log.
        </p>
        <div className="mt-10 flex justify-center gap-6">
          <Link href="/dashboard" className="rounded-full bg-accent px-7 py-3 text-[17px] text-white transition-colors hover:bg-accent-hover">
            Back to overview
          </Link>
          <Link href="/chat" className="self-center text-[17px] text-accent hover:underline">
            Open the copilot
          </Link>
        </div>
      </section>
    );
  }

  const cheapest = Math.min(...offers.map((o) => o.total_cost_pln));
  const lowestMonthly = Math.min(...offers.map((o) => o.monthly_payment_pln));
  const fastest = Math.min(...offers.map((o) => o.decision_days));
  const rows: { label: string; get: (o: BankOffer) => string }[] = [
    { label: "Amount", get: (o) => pln(o.amount_pln) },
    { label: "Interest rate", get: (o) => `${o.rate_pct.toFixed(1)}%` },
    { label: "Term", get: (o) => `${o.term_months / 12} years` },
    { label: "Monthly payment", get: (o) => pln(o.monthly_payment_pln) },
    { label: "Total cost", get: (o) => pln(o.total_cost_pln) },
    { label: "You put in", get: (o) => pln(o.own_contribution_pln) },
    { label: "Decision in", get: (o) => `${o.decision_days} days` },
  ];

  return (
    <section className="mx-auto max-w-5xl px-6 pb-24 pt-20">
      <p className="text-center text-[15px] text-muted">Step 2 of 2 · Demo offers</p>
      <h1 className="mt-2 text-center text-[44px] font-semibold leading-tight tracking-[-0.015em]">
        {offers.length} {offers.length === 1 ? "offer" : "offers"} for your {asset.toLowerCase()}.
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-center text-[21px] leading-snug text-muted">
        Compare them side by side. Total cost is interest and fees over the whole term.
      </p>

      <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
        {offers.map((o) => {
          const tags = [
            o.total_cost_pln === cheapest && "Lowest total cost",
            o.monthly_payment_pln === lowestMonthly && "Lowest monthly payment",
            o.decision_days === fastest && "Fastest decision",
          ].filter(Boolean) as string[];
          return (
            <div key={o.id} className="flex flex-col rounded-3xl bg-mist p-7">
              <p className="text-[13px] text-muted">{o.product}</p>
              <h2 className="text-[24px] font-semibold tracking-tight">{o.bank}</h2>
              <p className="mt-1 min-h-[2.5rem] text-[13px] text-good">{tags.join(" · ")}</p>
              <dl className="mt-3 flex-1">
                {rows.map((r) => (
                  <div key={r.label} className="flex items-baseline justify-between gap-3 border-b border-line py-2.5 last:border-0">
                    <dt className="text-[15px] text-muted">{r.label}</dt>
                    <dd className="tabular text-[17px] font-semibold">{r.get(o)}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-[13px] text-muted">{o.note}</p>
              <button
                onClick={() => setTopic(`${o.bank}'s offer`)}
                className="mt-5 rounded-full bg-accent px-6 py-2.5 text-[15px] text-white transition-colors hover:bg-accent-hover"
              >
                Discuss with an adviser
              </button>
            </div>
          );
        })}
      </div>

      {grant && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-6 rounded-3xl bg-mist p-7">
          <div className="min-w-0 max-w-xl">
            <p className="text-[13px] text-muted">EU grant match · {grant.fit_pct}% fit</p>
            <h2 className="text-[24px] font-semibold tracking-tight">{grant.name}</h2>
            <p className="mt-1 text-[15px] text-muted">{grant.programme}</p>
            <p className="mt-2 text-[15px]">
              Covers up to {grant.share_pct}% of the price, apply before {new Date(grant.deadline + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}. {grant.note}
            </p>
          </div>
          <div className="text-right">
            <p className="tabular text-[32px] font-semibold tracking-tight">{pln(grant.amount_pln)}</p>
            <button
              onClick={() => setTopic("the grant application")}
              className="mt-3 rounded-full bg-accent px-6 py-2.5 text-[15px] text-white transition-colors hover:bg-accent-hover"
            >
              Discuss with an adviser
            </button>
          </div>
        </div>
      )}

      {topic && (
        <form
          onSubmit={requestAdviser}
          className="mt-6 rounded-3xl bg-mist p-7"
          ref={(el) => el?.scrollIntoView({ block: "nearest", behavior: "smooth" })}
        >
          <h2 className="text-[24px] font-semibold tracking-tight">Talk to an adviser</h2>
          <p className="mt-1 text-[15px] text-muted">About {topic}. An independent adviser will call you; nothing is signed on this page.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-[14px] text-muted">Name</span>
              <input name="name" required autoComplete="name" defaultValue="Anna Wiśniewska" className={INPUT} />
            </label>
            <label className="block">
              <span className="text-[14px] text-muted">Phone</span>
              <input name="phone" type="tel" required autoComplete="tel" placeholder="+48 600 100 200" className={INPUT} />
            </label>
            <label className="block">
              <span className="text-[14px] text-muted">Preferred time</span>
              <select name="time" required defaultValue="Morning" className={INPUT}>
                <option>Morning</option>
                <option>Afternoon</option>
                <option>Evening</option>
              </select>
            </label>
          </div>
          <div className="mt-6 flex items-center gap-5">
            <button
              type="submit"
              disabled={busy !== null}
              className="rounded-full bg-accent px-6 py-2.5 text-[15px] text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {busy ? "Sending…" : "Request a call"}
            </button>
            <button type="button" onClick={() => setTopic(null)} className="text-[15px] text-muted hover:underline">
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && <p className="mt-4 text-center text-[15px] text-critical">{error}</p>}
      <p className="mx-auto mt-10 max-w-xl text-center text-[14px] text-muted">
        Offers are indicative. Paperbridge doesn&apos;t give financial advice; talk to an adviser before signing.
      </p>
    </section>
  );
}
