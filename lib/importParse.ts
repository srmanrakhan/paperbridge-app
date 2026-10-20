// Turns an uploaded invoice file into rows for /api/data/invoices. Runs in the browser.
// CSV: number, buyer_name, buyer_nip, amount_pln, issue_date, due_date, paid_date (comma or semicolon separated).
// XML: a KSeF FA(3) e-invoice; Podmiot2 is the buyer, Fa holds the number, dates and gross total.

export type ImportRow = {
  number?: string;
  buyer_name: string;
  buyer_nip?: string;
  amount_pln: number;
  issue_date: string;
  due_date: string;
  paid_date?: string;
};

// An incoming payment from a bank statement.
export type BankLine = {
  date: string;
  amount_pln: number;
  counterparty: string;
  nip?: string;
  title: string;
  invoice_number?: string; // the invoice this pays, when the document names it
  ksef_number?: string;
};

// "Zapłata za FV/2026/09/0002 KSeF 5431651667-20260901-6938EA6120FD-C8" -> both references.
const KSEF_NUMBER = /\b\d{10}-\d{8}-[0-9A-F]{12}-[0-9A-F]{2}\b/i;
const INVOICE_NUMBER = /\b[A-Z]{1,4}\/\d{4}\/\d{1,2}\/\d+\b/i;
export function referencesIn(text: string): { invoice_number?: string; ksef_number?: string } {
  return { invoice_number: text.match(INVOICE_NUMBER)?.[0], ksef_number: text.match(KSEF_NUMBER)?.[0] };
}

export type ParseResult = { rows: ImportRow[]; payments?: BankLine[]; error?: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// "12 300,50" or "12300.50" -> 12300.5
function amount(s: string): number {
  const t = s.replace(/[\s ]|PLN|zł/gi, "");
  return Number(t.includes(",") && !t.includes(".") ? t.replace(",", ".") : t.replace(/,/g, ""));
}

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && quoted && line[i + 1] === '"') {
      cur += '"';
      i++;
    } else if (c === '"') quoted = !quoted;
    else if (c === sep && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

// Polish or English bank export headers -> our fields.
type BankField = "date" | "amount_pln" | "counterparty" | "nip" | "title";
const BANK_COLUMNS: Record<BankField, string[]> = {
  date: ["data operacji", "data", "date", "booking date", "booking_date"],
  amount_pln: ["kwota", "amount"],
  counterparty: ["kontrahent", "nadawca", "counterparty", "payer", "counterparty_name"],
  nip: ["nip kontrahenta", "nip", "counterparty nip", "counterparty_nip"],
  title: ["tytuł", "tytul", "tytuł operacji", "title", "description"],
};

// finance-core's bank_transactions export (id, account_id, booking_date, amount, ...) keeps amounts in grosze.
const isFinanceCoreExport = (head: string[]) => head.includes("booking_date") && head.includes("account_id");

// Bank statement CSV: only incoming payments (positive amounts) are kept; outgoing ones are already in the balance.
function parseBankCsv(lines: string[], sep: string, head: string[]): ParseResult {
  const col = (field: BankField) => head.findIndex((h) => BANK_COLUMNS[field].includes(h));
  if (col("amount_pln") < 0 || col("date") < 0) return { rows: [], error: "This bank statement needs a date and an amount column." };
  const grosze = isFinanceCoreExport(head);
  const payments: BankLine[] = [];
  for (const [n, line] of lines.slice(1).entries()) {
    const cells = splitLine(line, sep);
    const get = (field: BankField) => (col(field) >= 0 ? cells[col(field)] ?? "" : "");
    const raw = amount(get("amount_pln"));
    if (!Number.isFinite(raw)) return { rows: [], error: `Row ${n + 2}: the amount isn't a number.` };
    const amt = grosze ? raw / 100 : raw;
    if (amt <= 0) continue;
    const date = get("date").slice(0, 10);
    if (!ISO.test(date)) return { rows: [], error: `Row ${n + 2}: dates must look like 2026-10-15.` };
    const title = get("title");
    payments.push({
      date,
      amount_pln: Math.round(amt * 100) / 100,
      counterparty: get("counterparty"),
      nip: get("nip").replace(/\D/g, "") || undefined,
      title,
      ...referencesIn(title),
    });
  }
  if (!payments.length) return { rows: [], error: "No incoming payments in this statement." };
  return { rows: [], payments };
}

export function parseCsv(text: string): ParseResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], error: "The file has no rows." };
  const sep = lines[0].split(";").length > lines[0].split(",").length ? ";" : ",";
  const head = splitLine(lines[0], sep).map((h) => h.toLowerCase());
  if (!head.includes("buyer_name") && head.some((h) => BANK_COLUMNS.amount_pln.includes(h))) return parseBankCsv(lines, sep, head);
  const col = (name: string) => head.indexOf(name);
  if (["buyer_name", "amount_pln", "issue_date"].every((c) => col(c) < 0)) {
    return { rows: [], error: "We don't recognise this CSV. Use a bank statement (date, amount, counterparty) or the invoice CSV template." };
  }
  for (const required of ["buyer_name", "amount_pln", "issue_date"]) {
    if (col(required) < 0) return { rows: [], error: `Missing the "${required}" column. Start from the example CSV.` };
  }

  const rows: ImportRow[] = [];
  for (const [n, line] of lines.slice(1).entries()) {
    const cells = splitLine(line, sep);
    const get = (name: string) => (col(name) >= 0 ? cells[col(name)] ?? "" : "");
    const row: ImportRow = {
      number: get("number") || undefined,
      buyer_name: get("buyer_name"),
      buyer_nip: get("buyer_nip").replace(/\D/g, "") || undefined,
      amount_pln: amount(get("amount_pln")),
      issue_date: get("issue_date"),
      due_date: get("due_date") || (ISO.test(get("issue_date")) ? addDays(get("issue_date"), 30) : ""),
      paid_date: get("paid_date") || undefined,
    };
    const problem = check(row);
    if (problem) return { rows: [], error: `Row ${n + 2}: ${problem}` };
    rows.push(row);
  }
  return { rows };
}

export function parseKsefXml(text: string): ParseResult {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return { rows: [], error: "This XML file can't be read." };
  const invoices = Array.from(doc.getElementsByTagNameNS("*", "Faktura"));
  if (!invoices.length) return { rows: [], error: "No KSeF invoice (Faktura) found in this file." };

  const rows: ImportRow[] = [];
  for (const f of invoices) {
    const first = (parent: Element | undefined, name: string) => parent?.getElementsByTagNameNS("*", name)[0];
    const text = (parent: Element | undefined, name: string) => first(parent, name)?.textContent?.trim() ?? "";
    const buyer = first(f, "Podmiot2");
    const fa = first(f, "Fa");
    const payment = first(fa, "Platnosc");
    const issue = text(fa, "P_1");
    const row: ImportRow = {
      number: text(fa, "P_2") || undefined,
      buyer_name: text(buyer, "Nazwa"),
      buyer_nip: text(buyer, "NIP") || undefined,
      amount_pln: amount(text(fa, "P_15")),
      issue_date: issue,
      due_date: text(payment, "Termin") || (ISO.test(issue) ? addDays(issue, 30) : ""),
      paid_date: text(payment, "Zaplacono") === "1" ? text(payment, "DataZaplaty") || undefined : undefined,
    };
    const problem = check(row);
    if (problem) return { rows: [], error: `${row.number ?? "Invoice"}: ${problem}` };
    rows.push(row);
  }
  return { rows };
}

function check(r: ImportRow): string | undefined {
  if (!r.buyer_name) return "the buyer name is missing.";
  if (!Number.isFinite(r.amount_pln) || r.amount_pln <= 0) return "the amount must be a number above 0.";
  if (!ISO.test(r.issue_date) || !ISO.test(r.due_date)) return "dates must look like 2026-10-15.";
  if (r.paid_date && !ISO.test(r.paid_date)) return "the paid date must look like 2026-10-15.";
}

// CSV and XML are read here in the browser; PDFs go to /api/data/extract.
export async function parseFile(file: File): Promise<ParseResult> {
  if (file.size > 2_000_000) return { rows: [], error: "The file is larger than 2 MB." };
  if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") return extractPdf(file);
  const text = await file.text();
  if (/\.xml$/i.test(file.name) || text.trimStart().startsWith("<")) return parseKsefXml(text);
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") return parseCsv(text);
  return { rows: [], error: "Use a PDF invoice, a KSeF .xml file or a .csv file." };
}

async function extractPdf(file: File): Promise<ParseResult> {
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch("/api/data/extract", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { rows: [], error: data.error ?? "Couldn't read this PDF." };
    if (data.kind === "payment") return { rows: [], payments: [data.payment as BankLine] };
    const problem = check(data.invoice);
    return problem ? { rows: [], error: `We read the PDF, but ${problem}` } : { rows: [data.invoice] };
  } catch {
    return { rows: [], error: "Couldn't reach Paperbridge. Check your connection." };
  }
}
