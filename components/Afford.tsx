"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Affordability } from "@/lib/affordability";
import { num, pln } from "@/lib/format";
import { CashChart } from "@/components/CashChart";

const VERDICT_STYLE = {
  yes: { dot: "bg-good", label: "You can afford it" },
  tight: { dot: "bg-warning", label: "Tight" },
  not_from_cash: { dot: "bg-warning", label: "Needs financing" },
} as const;

const CHIPS = [
  { name: "Printing press", price: 200_000 },
  { name: "Delivery van", price: 120_000 },
  { name: "Laptop", price: 6_000 },
];

const digits = (s: string) => s.replace(/[^\d]/g, "");
const grouped = (s: string) => (digits(s) ? num(Number(digits(s))) : "");

export function Afford({ initialAsset, initialPrice, autoRun }: { initialAsset: string; initialPrice: number; autoRun: boolean }) {
  const [asset, setAsset] = useState(initialAsset);
  const [price, setPrice] = useState(grouped(String(initialPrice)));
  const [extra, setExtra] = useState("");
  const [result, setResult] = useState<Affordability | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  const run = useCallback(async (a: string, p: string, e: string) => {
    setBusy(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ asset: a, price: digits(p), log: "1" });
      if (digits(e)) qs.set("extra", digits(e));
      const res = await fetch(`/api/afford?${qs}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't run the forecast. Please try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!autoRun || ran.current) return;
    ran.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- runs the requested forecast once on arrival
    run(initialAsset, String(initialPrice), "");
  }, [autoRun, initialAsset, initialPrice, run]);

  const financeHref = result ? `/financing?asset=${encodeURIComponent(result.asset.name)}&price=${result.asset.price_pln}` : "#";

  return (
    <>
      <section className="mx-auto max-w-3xl px-6 pb-10 pt-20 text-center">
        <p className="text-[15px] text-muted">Investment check</p>
        <h1 className="mt-2 text-[44px] font-semibold leading-tight tracking-[-0.015em] sm:text-[56px]">Can I afford it?</h1>
        <p className="mx-auto mt-4 max-w-xl text-[21px] leading-snug text-muted">
          Tell us what you want to buy. We check it against your invoices, payments and cash.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(asset.trim() || "Investment", price, extra);
          }}
          className="mx-auto mt-10 flex max-w-2xl flex-col gap-3 sm:flex-row"
        >
          <input
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            aria-label="What do you want to buy"
            placeholder="What to buy"
            maxLength={60}
            className="min-w-0 flex-1 rounded-full bg-mist px-5 py-3 text-[17px] outline-none"
          />
          <div className="flex items-center rounded-full bg-mist px-5 py-3 sm:w-40">
            <input
              value={price}
              onChange={(e) => setPrice(grouped(e.target.value))}
              inputMode="numeric"
              aria-label="Price in zł"
              placeholder="Price"
              className="tabular min-w-0 flex-1 bg-transparent text-[17px] outline-none"
            />
            <span className="text-[15px] text-muted">zł</span>
          </div>
          <div className="flex items-center rounded-full bg-mist px-5 py-3 sm:w-56">
            <input
              value={extra}
              onChange={(e) => setExtra(grouped(e.target.value))}
              inputMode="numeric"
              aria-label="Expected extra revenue per month in zł, optional"
              placeholder="Extra revenue / month"
              className="tabular min-w-0 flex-1 bg-transparent text-[17px] outline-none"
            />
            <span className="text-[15px] text-muted">zł</span>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-accent px-7 py-3 text-[17px] text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? "Checking…" : "Check"}
          </button>
        </form>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {CHIPS.map((c) => (
            <button
              key={c.name}
              type="button"
              disabled={busy}
              onClick={() => {
                setAsset(c.name);
                setPrice(num(c.price));
                run(c.name, String(c.price), extra);
              }}
              className="rounded-full bg-mist px-4 py-2 text-[15px] transition-colors hover:bg-line disabled:opacity-50"
            >
              {c.name}, {pln(c.price)}
            </button>
          ))}
        </div>
        {error && <p className="mt-4 text-[15px] text-muted">{error}</p>}
      </section>

      {result && <Result r={result} financeHref={financeHref} />}
    </>
  );
}

function Result({ r, financeHref }: { r: Affordability; financeHref: string }) {
  const v = VERDICT_STYLE[r.verdict];
  return (
    <>
      <section className="mx-auto max-w-2xl px-6 pb-12 text-center">
        <p className="inline-flex items-center gap-2 text-[15px] text-muted">
          <span className={`h-2 w-2 rounded-full ${v.dot}`} aria-hidden />
          {v.label}
        </p>
        <h2 className="mt-3 text-[32px] font-semibold leading-tight tracking-tight sm:text-[40px]">{r.headline}</h2>
        <p className="mt-4 text-[17px] leading-relaxed text-muted">{r.explanation}</p>
      </section>

      <section className="bg-mist">
        <div className="mx-auto max-w-4xl px-6 py-14">
          <h2 className="text-[28px] font-semibold tracking-tight">Your cash, next 13 weeks</h2>
          <p className="mt-1 text-[17px] text-muted">In zł. From your open invoices, how each buyer usually pays, and your costs.</p>
          <div className="mt-6 rounded-2xl bg-white p-4 sm:p-6">
            <CashChart
              series={[
                { label: "Without purchase", values: r.without, color: "#1d1d1f" },
                { label: "With purchase", values: r.with_cash, color: "#0071e3" },
                {
                  label: `Buffer ${num(r.buffer_pln)}`,
                  values: r.weeks.map(() => r.buffer_pln),
                  color: "#86868b",
                  dash: "6 5",
                  width: 1.5,
                },
              ]}
            />
          </div>
        </div>
      </section>

      {(r.options.length > 0 || r.show_financing) && (
        <section className="mx-auto max-w-3xl px-6 py-16">
          {r.options.length > 0 && (
            <>
              <h2 className="text-[28px] font-semibold tracking-tight">Your options</h2>
              <ul className="mt-6 border-t border-line">
                {r.options.map((o) => (
                  <li key={o.key} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line py-5">
                    <div className="min-w-0 max-w-md">
                      <p className="text-[19px] font-semibold">{o.title}</p>
                      <p className="text-[15px] text-muted">{o.note}</p>
                    </div>
                    <div className="text-right">
                      <p className="tabular text-[21px] font-semibold">{pln(o.covers_pln)}</p>
                      <p className="text-[13px] text-muted">{o.key === "chase" ? "freed" : "covered"}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {r.show_financing && (
            <div className="mt-10 flex flex-wrap items-center gap-5">
              <Link href={financeHref} className="rounded-full bg-accent px-7 py-3 text-[17px] text-white transition-colors hover:bg-accent-hover">
                Find financing
              </Link>
              {r.overdue_pln > 0 && (
                <Link href="/chat?buyer=all" className="text-[17px] text-accent hover:underline">
                  Chase late buyers first
                </Link>
              )}
            </div>
          )}
        </section>
      )}
    </>
  );
}
