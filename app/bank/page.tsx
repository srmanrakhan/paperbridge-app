import { headers } from "next/headers";
import { connection } from "next/server";
import QRCode from "qrcode";
import { Suspense } from "react";
import { Check } from "@/components/Check";
import { DataCompleteness } from "@/components/DataCompleteness";
import { TrustPoints } from "@/components/TrustPoints";
import { PrintButton } from "@/components/PrintButton";
import { getFinancingPack, getReceivables } from "@/lib/financeCore";
import { BAND_LABEL, BAND_TEXT, longDate, pln, shortMonth } from "@/lib/format";
import { passportFacts } from "@/lib/passport";
import { getProfile, getSettings } from "@/lib/workspace";

export const metadata = { title: "Passport · Paperbridge" };

export default function PassportPage() {
  return (
    <main className="print-surface flex-1 bg-mist px-4 py-10 sm:px-6">
      <Suspense fallback={<p className="pt-24 text-center text-[17px] text-muted">Building your Passport…</p>}>
        <Passport />
      </Suspense>
    </main>
  );
}

async function Passport() {
  await connection();
  const profile = await getProfile();
  const [pack, receivables, settings] = await Promise.all([getFinancingPack(profile), getReceivables(profile), getSettings(profile)]);
  const facts = passportFacts(profile, receivables);
  const { company, score, ask } = pack;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const verifyUrl = `${proto}://${host}/bank?v=${facts.verificationCode}`;
  const qr = await QRCode.toString(verifyUrl, { type: "svg", margin: 0, color: { dark: "#1d1d1f", light: "#ffffff" } });

  const maxMonth = Math.max(...facts.revenue.map((m) => m.amount_pln), 1);
  const revenueTotal = facts.revenue.reduce((s, m) => s + m.amount_pln, 0);
  const openTotal = facts.ageing.reduce((s, b) => s + b.amount_pln, 0);

  return (
    <>
      <div className="no-print mx-auto mb-6 flex max-w-[210mm] items-center justify-between gap-4">
        <p className="text-[14px] text-muted">A4 document. Share it with your bank as a PDF.</p>
        <PrintButton />
      </div>

      <article className="print-sheet mx-auto min-h-[297mm] max-w-[210mm] bg-white px-6 py-10 text-[13px] leading-normal sm:px-[16mm] sm:py-[14mm]">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-start gap-5">
            {settings.logo && (
              // eslint-disable-next-line @next/next/no-img-element -- a small data URL from Settings
              <img src={settings.logo} alt={`${company.name} logo`} className="h-16 w-16 shrink-0 object-contain" />
            )}
            <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Paperbridge Passport</p>
            <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.01em]">{company.name}</h1>
            <p className="mt-1 text-muted">
              NIP {formatNip(company.nip)} · {profile.company.address ?? company.city}
            </p>
            <p className="text-muted">{company.industry}</p>
            </div>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-right">
            <dt className="text-muted">Issue date</dt>
            <dd>{longDate(pack.as_of)}</dd>
            <dt className="text-muted">Document ID</dt>
            <dd className="tabular">{facts.documentId}</dd>
          </dl>
        </header>

        {/* Verification */}
        <section className="avoid-break mt-6 flex items-center justify-between gap-6 border-y border-line py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-good text-white">
              <Check className="h-3 w-3" />
            </span>
            <div>
              <p className="text-[14px] font-semibold">
                Verified from {profile.invoices.length} KSeF e-invoices and {profile.payments.length} bank payments
              </p>
              <p className="text-muted">
                Verification code <span className="tabular font-semibold text-ink">{facts.verificationCode}</span> · data as of{" "}
                {longDate(profile.as_of)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <p className="hidden text-right text-[11px] leading-tight text-muted sm:block">
              Scan to open
              <br />
              this Passport
            </p>
            <div className="h-16 w-16 [&>svg]:h-full [&>svg]:w-full" role="img" aria-label={`QR code linking to ${verifyUrl}`} dangerouslySetInnerHTML={{ __html: qr }} />
          </div>
        </section>

        {/* The ask */}
        <section className="avoid-break mt-8">
          <p className="text-muted">Financing request</p>
          <p className="tabular mt-1 text-[44px] font-semibold leading-none tracking-[-0.02em]">{pln(ask.amount_pln)}</p>
          <p className="mt-2 text-[15px]">{ask.product}</p>
          <p className="text-muted">{ask.purpose}.</p>
        </section>

        {/* Key figures */}
        <section className="avoid-break mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-5 sm:grid-cols-4">
          <Figure label="Revenue, 12 months" value={pln(company.annual_revenue_pln)} />
          <Figure label="Average days to get paid" value={facts.avgDaysToPaid === null ? "No data" : `${facts.avgDaysToPaid} days`} />
          <Figure label="Overdue share" value={`${facts.overdueSharePct}%`} note={`${pln(receivables.total_overdue_pln)} of ${pln(receivables.total_open_pln)}`} />
          <Figure label="Cash runway" value={`${pack.cash.runway_weeks} weeks`} note={`${pln(pack.cash.balance_pln)} in the bank`} />
        </section>

        {/* Score */}
        <section className="avoid-break mt-8 grid gap-6 border-t border-line pt-5 sm:grid-cols-[150px_1fr]">
          <div>
            <p className="text-muted">Health score</p>
            <p className="mt-1 flex items-baseline gap-1">
              <span className={`tabular text-[44px] font-semibold leading-none tracking-[-0.02em] ${BAND_TEXT[score.band]}`}>{score.score}</span>
              <span className="text-muted">/ 100</span>
            </p>
            <p className="mt-1">{BAND_LABEL[score.band]}</p>
          </div>
          {score.components && (
            <ul className="space-y-2.5">
              {score.components.map((c) => (
                <li key={c.code} className="grid grid-cols-[150px_1fr_52px] items-center gap-3">
                  <span>{c.label}</span>
                  <span className="h-1 overflow-hidden rounded-full bg-line">
                    <span className="block h-full rounded-full bg-ink" style={{ width: `${(c.points / c.max_points) * 100}%` }} />
                  </span>
                  <span className="tabular text-right text-muted">
                    {c.points} / {c.max_points}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Ageing and concentration */}
        <section className="avoid-break mt-8 grid gap-8 border-t border-line pt-5 sm:grid-cols-2">
          <div>
            <h2 className="text-[15px] font-semibold">Receivables ageing</h2>
            <table className="mt-2 w-full">
              <thead className="text-left text-[11px] uppercase tracking-[0.06em] text-muted">
                <tr>
                  <th className="py-1.5 font-normal">Bucket</th>
                  <th className="py-1.5 text-right font-normal">Invoices</th>
                  <th className="py-1.5 text-right font-normal">Amount</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {facts.ageing.map((b) => (
                  <tr key={b.label} className="border-t border-line">
                    <td className="py-1.5">{b.label}</td>
                    <td className="py-1.5 text-right text-muted">{b.invoices}</td>
                    <td className="py-1.5 text-right">{pln(b.amount_pln)}</td>
                  </tr>
                ))}
                <tr className="border-t border-ink/20 font-semibold">
                  <td className="py-1.5">Open receivables</td>
                  <td className="py-1.5 text-right">{facts.ageing.reduce((s, b) => s + b.invoices, 0)}</td>
                  <td className="py-1.5 text-right">{pln(openTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <h2 className="text-[15px] font-semibold">Top buyers</h2>
            <p className="text-[11px] text-muted">Share of invoiced sales since {longDate(facts.firstInvoice)}</p>
            <ul className="mt-2">
              {facts.topBuyers.slice(0, 5).map((b) => (
                <li key={b.name} className="border-t border-line py-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate">{b.name}</span>
                    <span className="tabular shrink-0">{Math.round(b.share_pct)}%</span>
                  </div>
                  <span className="mt-1 block h-0.5 rounded-full bg-line">
                    <span className="block h-full rounded-full bg-muted" style={{ width: `${b.share_pct}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Monthly revenue */}
        {facts.revenue.length > 0 && (
          <section className="avoid-break mt-8 border-t border-line pt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[15px] font-semibold">Monthly revenue</h2>
              <p className="tabular text-muted">
                {pln(revenueTotal)} over {facts.revenue.length} months · average {pln(Math.round(revenueTotal / facts.revenue.length))}
              </p>
            </div>
            <div className="mt-4 flex h-28 items-end justify-between gap-1" role="img" aria-label="Monthly revenue bar chart">
              {facts.revenue.map((m, i) => {
                const last = i === facts.revenue.length - 1;
                return (
                  <div key={m.month} className="group flex h-full flex-1 flex-col items-center justify-end" title={`${shortMonth(m.month)} ${m.month.slice(0, 4)}: ${pln(m.amount_pln)}`}>
                    {last && <span className="tabular mb-1 text-[10px] text-muted">{Math.round(m.amount_pln / 1000)}k</span>}
                    <span
                      className={`w-2.5 rounded-t-[4px] transition-colors group-hover:bg-accent ${last ? "bg-ink" : "bg-ink/35"}`}
                      style={{ height: `${(m.amount_pln / maxMonth) * 100}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-1.5 flex justify-between gap-1 border-t border-line pt-1.5">
              {facts.revenue.map((m) => (
                <span key={m.month} className="flex-1 text-center text-[10px] text-muted">
                  {shortMonth(m.month)}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Data completeness */}
        <section className="avoid-break mt-8 border-t border-line pt-5">
          <DataCompleteness compact />
        </section>

        {/* Invoice history */}
        <section className="mt-8 border-t border-line pt-5">
          <h2 className="text-[15px] font-semibold">Invoice history</h2>
          <table className="mt-2 w-full">
            <thead className="text-left text-[11px] uppercase tracking-[0.06em] text-muted">
              <tr>
                <th className="py-1.5 font-normal">Date</th>
                <th className="py-1.5 font-normal">Invoice</th>
                <th className="py-1.5 font-normal">Buyer</th>
                <th className="py-1.5 text-right font-normal">Amount</th>
                <th className="py-1.5 pl-4 text-right font-normal">Status</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {facts.invoices.map((i) => (
                <tr key={i.id} className="avoid-break border-t border-line">
                  <td className="whitespace-nowrap py-1.5 pr-3">{longDate(i.issue_date)}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-muted">{i.number}</td>
                  <td className="py-1.5 pr-3">{i.buyer_name}</td>
                  <td className="whitespace-nowrap py-1.5 text-right">{pln(i.amount_pln)}</td>
                  <td className="whitespace-nowrap py-1.5 pl-4 text-right">
                    {i.status === "paid" ? (
                      <span className="text-muted">Paid</span>
                    ) : i.status === "overdue" ? (
                      <span className="text-critical">{i.days_late} days late</span>
                    ) : (
                      <span className="text-muted">Not yet due</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <TrustPoints variant="passport" />

        {/* Footer */}
        <footer className="avoid-break mt-8 border-t border-line pt-5 text-[11px] leading-relaxed text-muted">
          <p>
            <span className="font-semibold text-ink">Data sources.</span> Sales e-invoices from KSeF, the Polish National e-Invoice
            System; incoming payments from the company bank account statement; monthly revenue from KSeF sales register totals.
          </p>
          <p className="mt-2">
            <span className="font-semibold text-ink">Method.</span> Each bank payment is matched to its invoice by amount and
            invoice number. Days late are counted from the invoice due date to the data date; average days to get paid runs from
            issue date to payment date. Cash runway is the bank balance divided by average weekly costs. The health score adds
            five parts worth 20 points each: buyers paying on time, cash runway, overdue receivables, buyer concentration and
            revenue trend.
          </p>
          <p className="mt-3 text-ink">Generated by Paperbridge; figures computed, not estimated by AI.</p>
          <p className="mt-1">Demo data. Fictional company.</p>
        </footer>
      </article>
    </>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <p className="text-muted">{label}</p>
      <p className="tabular mt-0.5 text-[20px] font-semibold tracking-tight">{value}</p>
      {note && <p className="tabular text-[11px] text-muted">{note}</p>}
    </div>
  );
}

// 6790000001 -> 679-000-00-01
function formatNip(nip: string) {
  return /^\d{10}$/.test(nip) ? `${nip.slice(0, 3)}-${nip.slice(3, 6)}-${nip.slice(6, 8)}-${nip.slice(8)}` : nip;
}
