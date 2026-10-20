import { annuity } from "@/lib/affordability";
import type { Score } from "@/types/sme";

// Mock bank offers and one EU grant match. Fictional lenders, not real quotes: the UI labels them "Demo offers".

export type BankOffer = {
  id: string;
  bank_id: BankId;
  bank: string;
  product: string;
  amount_pln: number;
  rate_pct: number;
  term_months: number;
  monthly_payment_pln: number;
  total_cost_pln: number; // everything repaid minus the amount borrowed, plus fees
  fee_pln: number;
  own_contribution_pln: number;
  decision_days: number;
  note: string;
};

export type GrantMatch = {
  id: string;
  name: string;
  programme: string;
  amount_pln: number;
  share_pct: number;
  fit_pct: number;
  deadline: string;
  note: string;
};

// Demo banks the owner can allow to see the Passport (Settings > Banks).
export const BANKS = [
  { id: "wisla", name: "Wisła Bank (demo)" },
  { id: "nova", name: "Nova Kredyt (demo)" },
  { id: "krakow", name: "Kraków Capital (demo)" },
] as const;
export type BankId = (typeof BANKS)[number]["id"];

export type Offers ={ offers: BankOffer[]; grant: GrantMatch; demo: true };

// Offers only from the banks the owner allows in Settings (all by default).
export function buildOffers(price: number, score: Score, allowed?: Record<BankId, boolean>): Offers {
  // A better health score earns a slightly lower rate.
  const adj = score.band === "green" ? -0.6 : score.band === "amber" ? 0 : 1.2;
  const make = (
    id: string,
    bankId: BankId,
    product: string,
    ownShare: number,
    baseRate: number,
    term: number,
    feePct: number,
    days: number,
    note: string,
  ): BankOffer => {
    const amount = Math.round(price * (1 - ownShare));
    const rate = Math.round((baseRate + adj) * 10) / 10;
    const monthly = annuity(amount, rate / 100, term);
    const fee = Math.round(amount * feePct);
    return {
      id,
      bank_id: bankId,
      bank: BANKS.find((b) => b.id === bankId)!.name,
      product,
      amount_pln: amount,
      rate_pct: rate,
      term_months: term,
      monthly_payment_pln: monthly,
      total_cost_pln: Math.round(monthly * term - amount + fee),
      fee_pln: fee,
      own_contribution_pln: price - amount,
      decision_days: days,
      note,
    };
  };
  return {
    demo: true,
    offers: [
      make("o1", "wisla", "Equipment loan", 0.2, 9.4, 60, 0.01, 3, "Fastest decision. Machine is the collateral."),
      make("o2", "nova", "Investment loan", 0.1, 10.9, 84, 0.015, 5, "Lowest monthly payment, longest term."),
      make("o3", "krakow", "Machine leasing", 0.3, 8.7, 48, 0.005, 4, "Lowest total cost, higher own contribution."),
    ].filter((o) => allowed?.[o.bank_id] !== false),
    grant: {
      id: "g1",
      name: "SME Modernisation Grant",
      programme: "EU regional programme for small manufacturers (demo)",
      amount_pln: Math.round(price * 0.3),
      share_pct: 30,
      fit_pct: 88,
      deadline: "2026-12-15",
      note: "Paid after the purchase, so it needs a bank loan or leasing as a bridge.",
    },
  };
}

// What the bank sees once the owner consents. Logged as an owner decision.
export const SHARED_FIELDS = [
  "Company name, NIP, city and industry",
  "Health score and the reasons behind it",
  "Cash balance and how many weeks it lasts",
  "Open and overdue receivables (totals)",
  "Top 3 buyers by share, and whether they pay on time",
  "Revenue of the last 12 months",
];


