import { createHash } from "node:crypto";
import type { Receivables, SmeProfile } from "@/types/sme";

// Plain facts for the Passport, computed from the imported invoices and payments.
// The score and the financing ask come from finance-core; everything here is arithmetic on the data.

const DAY_MS = 24 * 60 * 60 * 1000;
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

export type InvoiceRow = {
  id: string;
  number: string;
  issue_date: string;
  buyer_name: string;
  amount_pln: number;
  status: "paid" | "overdue" | "open";
  days_late: number;
};

export type AgeingBucket = { label: string; amount_pln: number; invoices: number };

export function passportFacts(profile: SmeProfile, receivables: Receivables) {
  const buyerName = new Map(profile.buyers.map((b) => [b.id, b.name]));

  // Fingerprint of the exact data the Passport was built from: changes if any invoice or payment changes.
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        profile.company.nip,
        profile.as_of,
        profile.invoices.map((i) => [i.number, i.amount_pln, i.status]),
        profile.payments.map((p) => [p.invoice_id, p.date, p.amount_pln]),
      ]),
    )
    .digest("hex")
    .toUpperCase();
  const verificationCode = `${fingerprint.slice(0, 4)}-${fingerprint.slice(4, 8)}`;
  const documentId = `PBP-${profile.as_of.replaceAll("-", "")}-${profile.company.nip.slice(-4)}`;

  const issueDate = new Map(profile.invoices.map((i) => [i.id, i.issue_date]));
  const waits = profile.payments.flatMap((p) => (issueDate.has(p.invoice_id) ? [days(issueDate.get(p.invoice_id)!, p.date)] : []));
  const avgDaysToPaid = waits.length ? Math.round(waits.reduce((s, n) => s + n, 0) / waits.length) : null;

  const overdueSharePct = receivables.total_open_pln > 0 ? Math.round((receivables.total_overdue_pln / receivables.total_open_pln) * 100) : 0;

  const invoices: InvoiceRow[] = profile.invoices
    .map((i) => {
      const late = days(i.due_date, profile.as_of);
      return {
        id: i.id,
        number: i.number,
        issue_date: i.issue_date,
        buyer_name: buyerName.get(i.buyer_id) ?? i.buyer_id,
        amount_pln: i.amount_pln,
        status: i.status === "paid" ? ("paid" as const) : late > 0 ? ("overdue" as const) : ("open" as const),
        days_late: Math.max(0, late),
      };
    })
    .sort((a, b) => b.issue_date.localeCompare(a.issue_date));

  const unpaid = invoices.filter((i) => i.status !== "paid");
  const bucket = (label: string, test: (i: InvoiceRow) => boolean): AgeingBucket => {
    const rows = unpaid.filter(test);
    return { label, amount_pln: rows.reduce((s, i) => s + i.amount_pln, 0), invoices: rows.length };
  };
  const ageing = [
    bucket("Not yet due", (i) => i.status === "open"),
    bucket("0–30 days late", (i) => i.status === "overdue" && i.days_late <= 30),
    bucket("31–60 days late", (i) => i.status === "overdue" && i.days_late > 30 && i.days_late <= 60),
    bucket("60+ days late", (i) => i.status === "overdue" && i.days_late > 60),
  ];

  const sales = new Map<string, number>();
  for (const i of profile.invoices) sales.set(i.buyer_id, (sales.get(i.buyer_id) ?? 0) + i.amount_pln);
  const totalSales = [...sales.values()].reduce((s, n) => s + n, 0);
  const topBuyers = [...sales.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, amount]) => ({
      name: buyerName.get(id) ?? id,
      amount_pln: amount,
      share_pct: totalSales > 0 ? (amount / totalSales) * 100 : 0,
    }));
  const firstInvoice = invoices.at(-1)?.issue_date ?? profile.as_of;

  return {
    verificationCode,
    documentId,
    avgDaysToPaid,
    overdueSharePct,
    invoices,
    ageing,
    topBuyers,
    totalSales,
    firstInvoice,
    revenue: profile.company.monthly_revenue ?? [],
  };
}
