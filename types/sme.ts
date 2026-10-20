// Contract between Paperbridge and finance-core.
// Proposed minimal version; replace with the agreed JSON from Wojciech when it lands.
// Dates are ISO strings (YYYY-MM-DD). Amounts are gross PLN.

export type Company = {
  id: string;
  name: string;
  nip: string;
  city: string;
  industry: string;
  address?: string;
  annual_revenue_pln: number;
  cash_balance_pln: number;
  monthly_costs_pln: number;
  // Monthly sales totals from the KSeF sales register, oldest first (month = YYYY-MM).
  monthly_revenue?: { month: string; amount_pln: number }[];
};

export type Buyer = {
  id: string;
  name: string;
  nip: string;
  email: string;
  payment_terms_days: number;
};

export type InvoiceStatus = "paid" | "open";

export type Invoice = {
  id: string;
  number: string;
  ksef_number?: string;
  buyer_id: string;
  issue_date: string;
  due_date: string;
  amount_pln: number;
  status: InvoiceStatus;
};

// Incoming bank payment from a buyer, matched to an invoice.
export type Payment = {
  id: string;
  invoice_id: string;
  buyer_id: string;
  date: string;
  amount_pln: number;
};

export type SmeProfile = {
  as_of: string;
  company: Company;
  buyers: Buyer[];
  invoices: Invoice[];
  payments: Payment[];
};

// ---- finance-core responses ----

export type ScoreBand = "red" | "amber" | "green";

export type ScoreReason = {
  code: string;
  text: string;
  impact: number; // points added to (+) or taken from (-) the score
};

// One of the five parts the score is built from. The parts add up to the score.
export type ScoreComponent = {
  code: string;
  label: string;
  points: number;
  max_points: number;
};

export type Score = {
  score: number; // 0-100
  band: ScoreBand; // red 0-40, amber 40-70, green 70-100
  reasons: ScoreReason[]; // most important first
  cash_runway_weeks: number;
  components?: ScoreComponent[];
};

export type OverdueInvoice = {
  invoice_id: string;
  number: string;
  amount_pln: number;
  due_date: string;
  days_late: number;
};

export type BuyerReceivables = {
  buyer_id: string;
  buyer_name: string;
  email: string;
  open_pln: number;
  overdue_pln: number;
  max_days_late: number;
  overdue_invoices: OverdueInvoice[];
};

export type Receivables = {
  as_of: string;
  total_open_pln: number;
  total_overdue_pln: number;
  buyers: BuyerReceivables[]; // sorted by overdue_pln, highest first
};

export type FinancingPack = {
  as_of: string;
  company: Pick<Company, "name" | "nip" | "city" | "industry" | "annual_revenue_pln">;
  score: Pick<Score, "score" | "band" | "reasons" | "components">;
  cash: { balance_pln: number; runway_weeks: number };
  receivables: { open_pln: number; overdue_pln: number; overdue_30_plus_pln: number };
  top_buyers: { name: string; share_of_open_pct: number; pays_on_time: boolean }[];
  ask: { product: string; amount_pln: number; purpose: string };
  strengths: string[];
  risks: string[];
};
