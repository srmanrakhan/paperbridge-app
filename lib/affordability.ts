import type { SmeProfile } from "@/types/sme";
import { pln } from "@/lib/format";

// "Can I afford this?": a 13-week cash forecast with and without an investment, computed from the
// company's own invoices and payments. Demo model: transparent and simple on purpose.

export const WEEKS = 13;
export const DEFAULT_ASSET = { name: "Printing press", price_pln: 200_000 };
export const DEFAULT_BUFFER_WEEKS = 2;
const SMALL_IMPACT = 0.1; // a purchase that lowers the lowest cash point by less than this is "no big change"

const LOAN_RATE = 0.094; // indicative annual rate used for the loan options
const LOAN_MONTHS = 60;
const OWN_SHARE = 0.2; // owner pays 20% from cash, the bank lends the rest
const GRANT_SHARE = 0.3; // EU grant covers up to 30% of the price, paid back after the purchase
const NEW_SALES_LAG_WEEKS = 6; // sales invoiced from now on arrive about 6 weeks later
const DAY_MS = 86_400_000;

// The owner's own estimate. Never invented: without it there is no extra revenue and no payback.
export type AssetInput = { name: string; price_pln: number; extra_revenue_per_month_pln?: number };

export type Option = {
  key: "loan" | "small_loan" | "grant" | "chase";
  title: string;
  covers_pln: number; // how much of the price (or of the gap) this option frees or covers
  note: string;
};

export type Affordability = {
  as_of: string;
  asset: { name: string; price_pln: number; extra_revenue_per_month_pln: number };
  weeks: number[]; // 0..13
  without: number[]; // cash balance per week, no purchase
  with_cash: number[]; // pay the full price from cash today
  with_loan: number[]; // 20% own cash, rest on a bank loan
  buffer_pln: number; // safety buffer: weeks of costs from Settings
  buffer_weeks: number;
  min_without: number;
  min_with_cash: number;
  min_week: number; // week of the lowest point when paying cash
  tight_week: number | null; // first week cash is below the buffer when paying cash
  short_pln: number; // worst gap below zero when paying cash (0 when cash stays positive)
  shortfall_cash_pln: number; // price minus today's cash (0 when cash covers the price)
  overdue_pln: number;
  loan: { amount_pln: number; own_cash_pln: number; monthly_payment_pln: number; rate_pct: number; months: number };
  payback_months: number | null; // only when the owner gave an expected extra revenue
  verdict: "yes" | "tight" | "not_from_cash";
  headline: string;
  explanation: string;
  show_financing: boolean;
  options: Option[];
};

export const annuity = (principal: number, annualRate: number, months: number) => {
  const r = annualRate / 12;
  return Math.round((principal * r) / (1 - Math.pow(1 + r, -months)));
};

const weekOf = (asOf: string, date: string) => Math.max(1, Math.min(WEEKS, Math.ceil((Date.parse(date) - Date.parse(asOf)) / DAY_MS / 7)));

const when = (week: number) => (week <= 0 ? "right away" : `in week ${week}`);

export function computeAffordability(profile: SmeProfile, asset: AssetInput, bufferWeeks = DEFAULT_BUFFER_WEEKS): Affordability {
  const { company, as_of } = profile;
  const price = Math.round(asset.price_pln);
  const extra = Math.max(0, Math.round(asset.extra_revenue_per_month_pln ?? 0));
  const weeklyCosts = (company.monthly_costs_pln * 12) / 52;

  const recent = (company.monthly_revenue ?? []).slice(-6).map((m) => m.amount_pln);
  const monthlySales = recent.length ? recent.reduce((s, n) => s + n, 0) / recent.length : company.annual_revenue_pln / 12;
  const weeklySales = (monthlySales * 12) / 52;

  // Typical lateness per buyer from paid history.
  const lateness = new Map<string, number[]>();
  for (const p of profile.payments) {
    const inv = profile.invoices.find((i) => i.id === p.invoice_id);
    if (!inv) continue;
    const late = Math.max(0, Math.round((Date.parse(p.date) - Date.parse(inv.due_date)) / DAY_MS));
    lateness.set(p.buyer_id, [...(lateness.get(p.buyer_id) ?? []), late]);
  }
  const avgLate = (buyerId: string) => {
    const l = lateness.get(buyerId) ?? [];
    return l.length ? l.reduce((s, n) => s + n, 0) / l.length : 0;
  };

  const inflow = () => {
    const w = new Array<number>(WEEKS + 1).fill(0);
    for (const inv of profile.invoices.filter((i) => i.status === "open")) {
      const overdue = inv.due_date < as_of;
      const week = overdue
        ? Math.min(WEEKS, 1 + 2 + Math.ceil(avgLate(inv.buyer_id) / 14))
        : weekOf(as_of, new Date(Date.parse(inv.due_date) + avgLate(inv.buyer_id) * DAY_MS).toISOString().slice(0, 10));
      w[week] += inv.amount_pln;
    }
    for (let k = NEW_SALES_LAG_WEEKS + 1; k <= WEEKS; k++) w[k] += weeklySales;
    return w;
  };

  const loanAmount = Math.round(price * (1 - OWN_SHARE));
  const monthly = annuity(loanAmount, LOAN_RATE, LOAN_MONTHS);

  const path = (scenario: "none" | "cash" | "loan") => {
    const w = inflow();
    const cash = [company.cash_balance_pln];
    // Week 0 purchase: everything on the day (cash) or the own share (loan).
    if (scenario === "cash") cash[0] -= price;
    if (scenario === "loan") cash[0] -= price - loanAmount;
    for (let k = 1; k <= WEEKS; k++) {
      let c = cash[k - 1] + w[k] - weeklyCosts;
      if (scenario !== "none" && k > 4) c += (extra * 12) / 52; // running from week 5
      if (scenario === "loan") c -= (monthly * 12) / 52;
      cash.push(Math.round(c));
    }
    cash[0] = Math.round(cash[0]);
    return cash;
  };

  const without = path("none");
  const withCash = path("cash");
  const withLoan = path("loan");
  const min = (a: number[]) => Math.min(...a);

  const buffer = Math.round(weeklyCosts * bufferWeeks);
  const overdueTotal = Math.round(
    profile.invoices.filter((i) => i.status === "open" && i.due_date < as_of).reduce((s, i) => s + i.amount_pln, 0),
  );
  const shortfall = Math.max(0, price - company.cash_balance_pln);
  const lowest = min(withCash);
  const minWeek = withCash.indexOf(lowest);
  const tightIdx = withCash.findIndex((c) => c < buffer);
  const tightWeek = tightIdx < 0 ? null : tightIdx;
  const gap = Math.max(0, buffer - lowest);

  let verdict: Affordability["verdict"];
  let headline: string;
  let explanation: string;
  const bufferNote = `${pln(buffer)}, ${bufferWeeks} weeks of costs`;
  const lowestWithout = min(without);
  // Judged against today's cash: a purchase under 10% of it changes little when cash is tight anyway.
  const smallImpact = lowestWithout < buffer && lowest > 0 && price < company.cash_balance_pln * SMALL_IMPACT;
  if (lowest >= buffer) {
    verdict = "yes";
    headline = "Yes, you can pay this from cash.";
    explanation = `Your cash never drops below ${pln(lowest)} (lowest point ${minWeek === 0 ? "today" : `in week ${minWeek}`}). That stays above your safety buffer of ${bufferNote}.`;
  } else if (smallImpact) {
    verdict = "yes";
    headline = "Yes, this won't change much.";
    explanation =
      `Your cash is tight either way: lowest point ${pln(lowestWithout)} without it, ${pln(lowest)} with it, against a safety buffer of ${bufferNote}.` +
      (overdueTotal > 0 ? ` Collecting your ${pln(overdueTotal)} of late invoices is the bigger lever.` : "");
  } else if (price <= company.cash_balance_pln) {
    verdict = "tight";
    headline = `You can, but it gets tight ${when(tightWeek ?? minWeek)}.`;
    explanation =
      `Paying ${pln(price)} from cash leaves ${pln(company.cash_balance_pln - price)} today. ` +
      (lowest > 0
        ? `The lowest point is ${pln(lowest)} (week ${minWeek}), below your safety buffer of ${bufferNote}.`
        : `On the forecast you would run short by up to ${pln(Math.max(1, -lowest))} in week ${minWeek}, against a safety buffer of ${bufferNote}.`) +
      (overdueTotal > 0 ? ` Collecting your ${pln(overdueTotal)} of late invoices first would ease it.` : "") +
      ` So would a small loan.`;
  } else {
    verdict = "not_from_cash";
    headline = "Not from cash alone.";
    explanation =
      `Paying ${pln(price)} from cash would run you out of money ${when(withCash.findIndex((c) => c <= 0))}, up to ${pln(Math.max(1, -lowest))} short at the worst point.` +
      ` A bank loan, an EU grant or collecting late invoices first can close that gap.`;
  }
  if (extra > 0) {
    explanation += ` At ${pln(extra)} extra revenue a month, it pays for itself in about ${Math.max(1, Math.round(price / extra))} months.`;
  }

  const options: Option[] = [];
  if (verdict === "tight") {
    const loanForGap = Math.ceil(gap / 1000) * 1000;
    if (overdueTotal > 0) {
      options.push({
        key: "chase",
        title: "Collect late invoices first",
        covers_pln: overdueTotal,
        note: "Paperbridge drafts the reminders; you approve each one.",
      });
    }
    options.push({
      key: "small_loan",
      title: "Small loan",
      covers_pln: loanForGap,
      note: `About ${pln(annuity(loanForGap, LOAN_RATE, LOAN_MONTHS))} a month for ${LOAN_MONTHS / 12} years at about ${(LOAN_RATE * 100).toFixed(1)}%. Keeps cash above your buffer.`,
    });
  } else if (verdict === "not_from_cash") {
    options.push({
      key: "loan",
      title: "Bank loan",
      covers_pln: loanAmount,
      note: `${pln(monthly)} a month for ${LOAN_MONTHS / 12} years at about ${(LOAN_RATE * 100).toFixed(1)}%. You put in ${pln(price - loanAmount)}.`,
    });
    options.push({
      key: "grant",
      title: "EU grant",
      covers_pln: Math.round(price * GRANT_SHARE),
      note: "SME modernisation grant, paid out after the purchase. You need a bridge until then.",
    });
    if (overdueTotal > 0) {
      options.push({
        key: "chase",
        title: "Collect late invoices first",
        covers_pln: overdueTotal,
        note: "Paperbridge drafts the reminders; you approve each one.",
      });
    }
  }

  return {
    as_of,
    asset: { name: asset.name, price_pln: price, extra_revenue_per_month_pln: extra },
    weeks: Array.from({ length: WEEKS + 1 }, (_, k) => k),
    without,
    with_cash: withCash,
    with_loan: withLoan,
    buffer_pln: buffer,
    buffer_weeks: bufferWeeks,
    min_without: min(without),
    min_with_cash: lowest,
    min_week: minWeek,
    tight_week: tightWeek,
    short_pln: lowest > 0 ? 0 : Math.max(1, -lowest),
    shortfall_cash_pln: shortfall,
    overdue_pln: overdueTotal,
    loan: { amount_pln: loanAmount, own_cash_pln: price - loanAmount, monthly_payment_pln: monthly, rate_pct: LOAN_RATE * 100, months: LOAN_MONTHS },
    payback_months: extra > 0 ? Math.max(1, Math.round(price / extra)) : null,
    verdict,
    headline,
    explanation,
    show_financing: verdict !== "yes",
    options,
  };
}
