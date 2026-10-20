import type { FinancingPack, Receivables, Score, SmeProfile } from "@/types/sme";
import { DEMO_PROFILE } from "@/lib/mockData";
import { pln } from "@/lib/format";
import { AppError } from "@/lib/errors";

// Client for Wojciech's finance-core API.
// Mock mode (FINANCE_CORE_URL empty): returns demo data from lib/mockData.ts.
// Real mode: GET /demo-company, POST /score, POST /receivables, POST /financing-pack.

export function isMockMode(): boolean {
  return !process.env.FINANCE_CORE_URL;
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const base = process.env.FINANCE_CORE_URL!.replace(/\/$/, "");
  try {
    const res = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  } catch (err) {
    console.error(`finance-core ${path} failed:`, err);
    throw new AppError("Couldn't load your finance data. Please try again.");
  }
}

export async function getDemoCompany(): Promise<SmeProfile> {
  if (isMockMode()) return structuredClone(DEMO_PROFILE);
  return call<SmeProfile>("/demo-company");
}

export async function getScore(profile: SmeProfile): Promise<Score> {
  if (isMockMode()) return mockScore(profile);
  return call<Score>("/score", profile);
}

export async function getReceivables(profile: SmeProfile): Promise<Receivables> {
  if (isMockMode()) return mockReceivables(profile);
  return call<Receivables>("/receivables", profile);
}

export async function getFinancingPack(profile: SmeProfile): Promise<FinancingPack> {
  if (isMockMode()) return mockFinancingPack(profile);
  return call<FinancingPack>("/financing-pack", profile);
}

// ---- mock implementations ----

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function mockReceivables(profile: SmeProfile): Receivables {
  const open = profile.invoices.filter((i) => i.status === "open");

  const buyers = profile.buyers
    .map((b) => {
      const buyerOpen = open.filter((i) => i.buyer_id === b.id);
      const overdue = buyerOpen
        .map((i) => ({
          invoice_id: i.id,
          number: i.number,
          amount_pln: i.amount_pln,
          due_date: i.due_date,
          days_late: daysBetween(i.due_date, profile.as_of),
        }))
        .filter((i) => i.days_late > 0)
        .sort((a, b) => b.days_late - a.days_late);
      return {
        buyer_id: b.id,
        buyer_name: b.name,
        email: b.email,
        open_pln: round2(buyerOpen.reduce((s, i) => s + i.amount_pln, 0)),
        overdue_pln: round2(overdue.reduce((s, i) => s + i.amount_pln, 0)),
        max_days_late: overdue[0]?.days_late ?? 0,
        overdue_invoices: overdue,
      };
    })
    .filter((b) => b.open_pln > 0)
    .sort((a, b) => b.overdue_pln - a.overdue_pln);

  return {
    as_of: profile.as_of,
    total_open_pln: round2(buyers.reduce((s, b) => s + b.open_pln, 0)),
    total_overdue_pln: round2(buyers.reduce((s, b) => s + b.overdue_pln, 0)),
    buyers,
  };
}

const clamp = (n: number) => Math.max(0, Math.min(20, n));

// Stand-in for finance-core's scoring: five parts worth 20 points each.
// The demo profile scores 55: 5 + 10 + 10 + 10 + 20.
function mockScore(profile: SmeProfile): Score {
  const rec = mockReceivables(profile);
  const { company } = profile;

  const late30 = rec.buyers.filter((b) => b.max_days_late >= 30).length;
  const runway = company.cash_balance_pln / ((company.monthly_costs_pln * 12) / 52);
  const runwayWeeks = Math.floor(runway);
  const overdueShare = rec.total_open_pln > 0 ? rec.total_overdue_pln / rec.total_open_pln : 0;

  const sales = new Map<string, number>();
  for (const i of profile.invoices) sales.set(i.buyer_id, (sales.get(i.buyer_id) ?? 0) + i.amount_pln);
  const totalSales = [...sales.values()].reduce((s, n) => s + n, 0);
  const [topId, topSales] = [...sales.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  const topShare = totalSales > 0 ? (topSales / totalSales) * 100 : 0;
  const topName = profile.buyers.find((b) => b.id === topId)?.name ?? "One buyer";

  const months = (company.monthly_revenue ?? []).map((m) => m.amount_pln);
  const recent = months.slice(-6).reduce((s, n) => s + n, 0);
  const earlier = months.slice(-12, -6).reduce((s, n) => s + n, 0);
  const growing = months.length < 12 || recent >= earlier;

  const components = [
    { code: "payment_behaviour", label: "Buyers paying on time", points: clamp(20 - 5 * late30), max_points: 20 },
    { code: "cash_runway", label: "Cash runway", points: clamp(20 - Math.round(Math.max(0, 12 - runway) * (10 / 7))), max_points: 20 },
    { code: "overdue_share", label: "Overdue receivables", points: clamp(20 - Math.round(overdueShare * 13)), max_points: 20 },
    { code: "concentration", label: "Buyer concentration", points: clamp(20 - Math.round(Math.max(0, topShare - 20) * 0.65)), max_points: 20 },
    { code: "revenue_trend", label: "Revenue trend", points: growing ? 20 : 14, max_points: 20 },
  ];
  const lost = (code: string) => {
    const c = components.find((x) => x.code === code)!;
    return c.points - c.max_points;
  };

  const lateText = late30 === 0 ? "No buyers pay 30+ days late" : `${late30} ${late30 === 1 ? "buyer pays" : "buyers pay"} 30+ days late`;
  const reasons = [
    { code: "late_buyers", text: `${lateText}; cash lasts ${runwayWeeks} weeks`, impact: lost("payment_behaviour") + lost("cash_runway") },
    { code: "overdue_share", text: `${Math.round(overdueShare * 100)}% of open receivables are overdue`, impact: lost("overdue_share") },
    { code: "concentration", text: `${topName} accounts for ${Math.round(topShare)}% of sales`, impact: lost("concentration") },
    { code: "revenue_trend", text: "Revenue fell over the last 6 months", impact: lost("revenue_trend") },
  ]
    .filter((r) => r.impact < 0)
    .sort((a, b) => a.impact - b.impact);

  const score = components.reduce((s, c) => s + c.points, 0);
  return {
    score,
    band: score < 40 ? "red" : score < 70 ? "amber" : "green",
    reasons,
    cash_runway_weeks: runwayWeeks,
    components,
  };
}

function mockFinancingPack(profile: SmeProfile): FinancingPack {
  const rec = mockReceivables(profile);
  const score = mockScore(profile);
  const { company } = profile;
  const overdue30 = rec.buyers
    .flatMap((b) => b.overdue_invoices)
    .filter((i) => i.days_late >= 30)
    .reduce((s, i) => s + i.amount_pln, 0);

  const topBuyers = [...rec.buyers]
    .sort((a, b) => b.open_pln - a.open_pln)
    .slice(0, 3)
    .map((b) => ({
      name: b.buyer_name,
      share_of_open_pct: Math.round((b.open_pln / rec.total_open_pln) * 100),
      pays_on_time: b.max_days_late === 0,
    }));

  return {
    as_of: profile.as_of,
    company: {
      name: company.name,
      nip: company.nip,
      city: company.city,
      industry: company.industry,
      annual_revenue_pln: company.annual_revenue_pln,
    },
    score: { score: score.score, band: score.band, reasons: score.reasons, components: score.components },
    cash: { balance_pln: company.cash_balance_pln, runway_weeks: score.cash_runway_weeks },
    receivables: {
      open_pln: rec.total_open_pln,
      overdue_pln: rec.total_overdue_pln,
      overdue_30_plus_pln: round2(overdue30),
    },
    top_buyers: topBuyers,
    ask: {
      product: "Revolving working-capital credit line",
      amount_pln: 120_000,
      purpose: "Bridge late buyer payments while overdue invoices are collected",
    },
    strengths: [
      `Revenue of ${pln(company.annual_revenue_pln)} in the last 12 months`,
      "3 of 6 buyers pay on time or within 10 days",
      "All sales are invoiced as KSeF e-invoices",
    ],
    risks: score.reasons.map((r) => r.text),
  };
}
