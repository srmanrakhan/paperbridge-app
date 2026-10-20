import type { BankLine } from "@/lib/importParse";
import type { NewInvoice } from "@/lib/workspace";

// Server-side checks for imported rows. Each returns the clean row, or a short message for the owner.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (v: unknown): v is string => typeof v === "string" && ISO.test(v) && !Number.isNaN(Date.parse(v));
const optString = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

export const MAX_ROWS = 500;

const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

export function parseInvoiceRow(raw: unknown, asOf: string, where: string): NewInvoice | string {
  const r = (raw ?? {}) as Record<string, unknown>;
  const amount = Number(r.amount_pln);
  if (!optString(r.buyer_id, 40) && !optString(r.buyer_name, 120)) return `${where}: choose a buyer.`;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return `${where}: enter an amount above 0 PLN.`;
  if (!validDate(r.issue_date) || !validDate(r.due_date)) return `${where}: dates must look like 2026-10-15.`;
  if (r.issue_date > asOf) return `${where}: the issue date can't be after the data date (${asOf}).`;
  if (r.due_date < r.issue_date) return `${where}: the due date is before the issue date.`;
  if (r.paid_date !== undefined && r.paid_date !== "" && !validDate(r.paid_date)) return `${where}: the paid date must look like 2026-10-15.`;
  return {
    buyer_id: optString(r.buyer_id, 40),
    buyer_name: optString(r.buyer_name, 120),
    buyer_nip: optString(r.buyer_nip, 20),
    number: optString(r.number, 40),
    amount_pln: amount,
    issue_date: r.issue_date,
    due_date: r.due_date,
    paid_date: validDate(r.paid_date) ? r.paid_date : undefined,
  };
}

export function parseBankLine(raw: unknown, asOf: string, where: string): BankLine | string {
  const r = (raw ?? {}) as Record<string, unknown>;
  const amount = Number(r.amount_pln);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return `${where}: the payment amount must be above 0 PLN.`;
  if (!validDate(r.date)) return `${where}: dates must look like 2026-10-15.`;
  // A statement can be a little newer than the data date (it arrives after the last sync); a month ahead is a typo.
  if (r.date > addDays(asOf, 31)) return `${where}: the payment date is more than a month after the data date (${asOf}).`;
  return {
    date: r.date,
    amount_pln: amount,
    counterparty: optString(r.counterparty, 120) ?? "",
    nip: optString(r.nip, 20)?.replace(/\D/g, ""),
    title: optString(r.title, 200) ?? "",
    invoice_number: optString(r.invoice_number, 40),
    ksef_number: optString(r.ksef_number, 60),
  };
}
