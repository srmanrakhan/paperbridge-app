// Builds lib/hydromatProfile.json (the mock-mode demo company) from finance-core's data/demo_amber.json.
// Usage: node scripts/hydromat-profile.mjs [path/to/demo_amber.json]
// Amounts in the source are grosze; the app uses PLN. Only sales invoices are kept: all open ones plus
// everything issued since SINCE, so the file stays small while scores and buyer history stay realistic.
import { readFileSync, writeFileSync } from "node:fs";

const src = process.argv[2] ?? "../finance-core/data/demo_amber.json";
const SINCE = "2026-01-01";
const d = JSON.parse(readFileSync(src, "utf8"));
const pln = (g) => Math.round(g) / 100;
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);

const sales = d.invoices.filter((i) => i.direction === "sales" && i.kind === "invoice");
const credited = new Map();
for (const c of d.invoices.filter((i) => i.kind !== "invoice" && i.corrects_invoice_id)) {
  credited.set(c.corrects_invoice_id, (credited.get(c.corrects_invoice_id) ?? 0) + c.gross_amount);
}

// Customer payments name their invoice in the transfer title ("Zapłata za FV/... KSeF ...").
const paid = new Map(); // invoice number -> { date, amount (grosze) }
for (const t of d.bank_transactions) {
  if (t.category !== "customer_payment") continue;
  const n = t.description.match(/FV\/\d{4}\/\d{2}\/\d+/)?.[0];
  if (!n) continue;
  const p = paid.get(n) ?? { date: t.booking_date, amount: 0 };
  p.amount += t.amount;
  if (t.booking_date > p.date) p.date = t.booking_date;
  paid.set(n, p);
}

const invoices = [];
const payments = [];
for (const i of sales) {
  const due = i.gross_amount - (credited.get(i.id) ?? 0);
  const p = paid.get(i.id);
  const isPaid = p && p.amount >= due - 1;
  if (isPaid ? i.issue_date < SINCE : false) continue;
  invoices.push({
    id: i.id,
    number: i.id,
    ksef_number: i.ksef_number,
    buyer_id: i.counterparty_id,
    issue_date: i.issue_date,
    due_date: i.due_date,
    amount_pln: pln(due),
    status: isPaid ? "paid" : "open",
  });
  if (isPaid) payments.push({ id: `p-${i.id}`, invoice_id: i.id, buyer_id: i.counterparty_id, date: p.date, amount_pln: pln(due) });
}

const used = new Set(invoices.map((i) => i.buyer_id));
const buyers = d.counterparties
  .filter((c) => c.role === "buyer" && used.has(c.id))
  .map((c) => ({ id: c.id, name: c.name, nip: c.nip, email: `faktury@${slug(c.name)}.example`, payment_terms_days: c.payment_terms_days }));

const cash = d.bank_accounts.reduce((s, a) => s + a.opening_balance, 0) + d.bank_transactions.filter((t) => t.booking_date <= d.as_of).reduce((s, t) => s + t.amount, 0);
const asOfMonth = d.as_of.slice(0, 7);
const revenueByMonth = new Map();
for (const i of sales) revenueByMonth.set(i.issue_date.slice(0, 7), (revenueByMonth.get(i.issue_date.slice(0, 7)) ?? 0) + i.gross_amount);
const months = [...revenueByMonth.keys()].filter((m) => m < asOfMonth).sort().slice(-12);
const monthly_revenue = months.map((m) => ({ month: m, amount_pln: pln(revenueByMonth.get(m)) }));
// Costs: money out over the last 3 full months, per month.
const costMonths = months.slice(-3);
const out = d.bank_transactions.filter((t) => t.amount < 0 && costMonths.includes(t.booking_date.slice(0, 7))).reduce((s, t) => s - t.amount, 0);

const profile = {
  as_of: d.as_of,
  company: {
    id: "c1",
    name: d.company.name,
    nip: d.company.nip,
    city: d.company.city,
    industry: "Technical wholesale",
    address: `${d.company.city}, Polska`,
    annual_revenue_pln: pln(months.reduce((s, m) => s + revenueByMonth.get(m), 0)),
    cash_balance_pln: pln(cash),
    monthly_costs_pln: pln(out / costMonths.length),
    monthly_revenue,
  },
  buyers,
  invoices,
  payments,
};
writeFileSync("lib/hydromatProfile.json", JSON.stringify(profile));
console.log(`${buyers.length} buyers, ${invoices.length} invoices (${invoices.filter((i) => i.status === "open").length} open), ${payments.length} payments, cash ${profile.company.cash_balance_pln}, costs/month ${profile.company.monthly_costs_pln}`);
