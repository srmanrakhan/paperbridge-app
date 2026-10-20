import { actionStore } from "@/lib/actions";
import { AppError } from "@/lib/errors";
import { getDemoCompany } from "@/lib/financeCore";
import { companyName } from "@/lib/format";
import type { BankLine } from "@/lib/importParse";
import { BANKS, type BankId } from "@/lib/offers";
import type { ReminderTone } from "@/lib/reminder";
import { getSupabase } from "@/lib/supabase";
import type { Buyer, Invoice, Payment, SmeProfile } from "@/types/sme";

// The owner's workspace: settings, plus payments simulated during the demo.
// Kept in the app_state table (one row), or in memory locally without Supabase, like the action log.

export type { ReminderTone };

export type Settings = {
  company_name: string;
  nip: string;
  industry: string;
  logo: string; // small PNG data URL, or "" for none
  reminder_tone: ReminderTone;
  // Reading data is always on and sending always needs the owner's click, so neither is a setting.
  drafts_enabled: boolean;
  financing_enabled: boolean;
  remind_after_days: number; // 7-60
  cash_warning_weeks: number; // 2-12
  safety_buffer_weeks: number; // 1-12, weeks of costs "Can I afford it?" wants to keep in the bank
  banks: Record<BankId, boolean>; // which demo banks may see the Passport
};

export const DEFAULT_THRESHOLDS = { remind_after_days: 30, cash_warning_weeks: 6, safety_buffer_weeks: 2 };

export type SimulatedPayment = { invoice_id: string; date: string };

// What the owner added or changed on /data, applied on top of the imported demo company.
export type DataEdits = {
  buyers: Buyer[];
  invoices: Invoice[];
  payments: Payment[];
  bank_payments: Payment[]; // from scanned bank statements; each settles an invoice and adds to cash
  cash_balance_pln?: number;
  monthly_costs_pln?: number;
};

export type SyncSource = "ksef" | "bank";

type Workspace = {
  settings: Partial<Settings>;
  simulated_payments: SimulatedPayment[];
  data: DataEdits;
  synced: Partial<Record<SyncSource, string>>; // ISO timestamp of the last sync
};

const KEY = "workspace";
const EMPTY_DATA: DataEdits = { buyers: [], invoices: [], payments: [], bank_payments: [] };
const EMPTY: Workspace = { settings: {}, simulated_payments: [], data: EMPTY_DATA, synced: {} };

const memory = ((globalThis as { __paperbridgeWorkspace?: { value: Workspace } }).__paperbridgeWorkspace ??= {
  value: structuredClone(EMPTY),
});

// Fills fields added after a workspace was first saved.
function withDefaults(stored: Partial<Workspace> | undefined): Workspace {
  const value = { ...structuredClone(EMPTY), ...structuredClone(stored) };
  value.data = { ...structuredClone(EMPTY_DATA), ...value.data };
  return value;
}

async function load(): Promise<Workspace> {
  if (actionStore() === "memory") return withDefaults(memory.value);
  const { data, error } = await getSupabase().from("app_state").select("value").eq("key", KEY).maybeSingle();
  if (error) {
    // Missing table or a blip: show the plain demo rather than a broken page.
    console.error("app_state select failed:", error.message);
    return structuredClone(EMPTY);
  }
  return withDefaults(data?.value as Partial<Workspace> | undefined);
}

async function save(value: Workspace): Promise<void> {
  if (actionStore() === "memory") {
    memory.value = structuredClone(value);
    return;
  }
  const { error } = await getSupabase()
    .from("app_state")
    .upsert({ key: KEY, value, updated_at: new Date().toISOString() });
  if (error) {
    console.error("app_state upsert failed:", error.message);
    throw new AppError("Couldn't save. Run supabase/schema.sql to create the app_state table, then try again.");
  }
}

export async function getSettings(base?: SmeProfile): Promise<Settings> {
  const { settings } = await load();
  const profile = base ?? (await getDemoCompany());
  return {
    company_name: settings.company_name || profile.company.name,
    nip: settings.nip || profile.company.nip,
    industry: settings.industry || profile.company.industry,
    logo: settings.logo ?? "",
    reminder_tone: settings.reminder_tone ?? "friendly",
    drafts_enabled: settings.drafts_enabled ?? true,
    financing_enabled: settings.financing_enabled ?? true,
    remind_after_days: settings.remind_after_days ?? DEFAULT_THRESHOLDS.remind_after_days,
    cash_warning_weeks: settings.cash_warning_weeks ?? DEFAULT_THRESHOLDS.cash_warning_weeks,
    safety_buffer_weeks: settings.safety_buffer_weeks ?? DEFAULT_THRESHOLDS.safety_buffer_weeks,
    banks: { ...Object.fromEntries(BANKS.map((b) => [b.id, true])), ...settings.banks } as Record<BankId, boolean>,
  };
}

export async function saveSettings(next: Settings): Promise<Settings> {
  const ws = await load();
  ws.settings = next;
  await save(ws);
  return next;
}

// The demo company with the owner's data edits, settings and simulated payments applied.
// Every screen and the agent read the company through this.
export async function getProfile(): Promise<SmeProfile> {
  const [profile, ws] = await Promise.all([getDemoCompany(), load()]);
  applyData(profile, ws.data);
  if (ws.settings.company_name) profile.company.name = ws.settings.company_name;
  if (ws.settings.nip) profile.company.nip = ws.settings.nip;
  if (ws.settings.industry) profile.company.industry = ws.settings.industry;
  for (const p of ws.simulated_payments) {
    const invoice = profile.invoices.find((i) => i.id === p.invoice_id);
    if (!invoice || invoice.status === "paid") continue;
    invoice.status = "paid";
    profile.payments.push({
      id: `sim-${invoice.id}`,
      invoice_id: invoice.id,
      buyer_id: invoice.buyer_id,
      date: p.date,
      amount_pln: invoice.amount_pln,
    });
    profile.company.cash_balance_pln += invoice.amount_pln;
  }
  return profile;
}

// The next payment the demo will simulate: the largest overdue invoice.
export function nextSimulatedInvoice(profile: SmeProfile): Invoice | undefined {
  return profile.invoices
    .filter((i) => i.status === "open" && i.due_date < profile.as_of)
    .sort((a, b) => b.amount_pln - a.amount_pln)[0];
}

export async function recordSimulatedPayment(invoice: Invoice, date: string): Promise<void> {
  const ws = await load();
  ws.simulated_payments.push({ invoice_id: invoice.id, date });
  await save(ws);
}

// ---- owner data (/data) ----

function applyData(profile: SmeProfile, data: DataEdits) {
  const { company } = profile;
  profile.buyers.push(...data.buyers);
  profile.invoices.push(...data.invoices);
  profile.payments.push(...data.payments);
  // New invoices count as sales in the month they were issued, if that month is in the 12-month window.
  for (const i of data.invoices) {
    const month = company.monthly_revenue?.find((m) => m.month === i.issue_date.slice(0, 7));
    if (!month) continue;
    month.amount_pln += i.amount_pln;
    company.annual_revenue_pln += i.amount_pln;
  }
  if (data.cash_balance_pln !== undefined) company.cash_balance_pln = data.cash_balance_pln;
  if (data.monthly_costs_pln !== undefined) company.monthly_costs_pln = data.monthly_costs_pln;
  // Matched bank payments settle their invoice and land in the balance (after any edited balance).
  for (const p of data.bank_payments) {
    const invoice = profile.invoices.find((i) => i.id === p.invoice_id);
    if (!invoice || invoice.status === "paid") continue;
    invoice.status = "paid";
    profile.payments.push(p);
    company.cash_balance_pln += p.amount_pln;
  }
}

export type NewInvoice = {
  buyer_id?: string; // an existing buyer, or
  buyer_name?: string; // a buyer matched by NIP or name, created if new
  buyer_nip?: string;
  number?: string;
  amount_pln: number;
  issue_date: string;
  due_date: string;
  paid_date?: string;
};

// What an import would add. Pure: nothing is saved, so the same plan serves the preview and the save.
export type ImportPlan = {
  new_buyers: Buyer[];
  invoices: Invoice[];
  payments: Payment[]; // for invoices imported as already paid
  bank_payments: Payment[]; // bank statement lines matched to an open invoice
  matched: { line: BankLine; invoice: Invoice }[];
  unmatched: BankLine[];
  skipped: number; // invoice numbers already on file
};

const sameName = (a: string, b: string) => companyName(a).toLowerCase() === companyName(b).toLowerCase();

// A payment matches an open invoice with the exact amount, found by the KSeF number or invoice number
// (named on the document or in the transfer title), or else by the payer (NIP or name), oldest due date first.
function matchPayment(line: BankLine, open: Invoice[], buyers: Buyer[]): Invoice | undefined {
  const exact = open.filter((i) => Math.abs(i.amount_pln - line.amount_pln) < 0.01);
  const text = `${line.title} ${line.invoice_number ?? ""} ${line.ksef_number ?? ""}`.toUpperCase();
  const byNumber = exact.find((i) => (i.ksef_number && text.includes(i.ksef_number.toUpperCase())) || text.includes(i.number.toUpperCase()));
  if (byNumber) return byNumber;
  const payer = buyers.find((b) => (line.nip && b.nip === line.nip) || (line.counterparty && sameName(b.name, line.counterparty)));
  if (!payer) return undefined;
  return exact.filter((i) => i.buyer_id === payer.id).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
}

export function planImport(profile: SmeProfile, rows: NewInvoice[], lines: BankLine[] = []): ImportPlan {
  let skipped = 0;
  const buyers = [...profile.buyers];
  const numbers = new Set(profile.invoices.map((i) => i.number));
  const added: Invoice[] = [];
  const newBuyers: Buyer[] = [];
  const payments: Payment[] = [];
  let seq = profile.invoices.length;
  const stamp = Date.now().toString(36);

  for (const row of rows) {
    let number = row.number?.trim();
    if (number && numbers.has(number)) {
      skipped++; // already imported
      continue;
    }
    const nip = row.buyer_nip?.replace(/\D/g, "");
    const name = row.buyer_name?.trim();
    let buyer = row.buyer_id
      ? buyers.find((b) => b.id === row.buyer_id)
      : buyers.find((b) => (nip && b.nip === nip) || (name && b.name.toLowerCase() === name.toLowerCase()));
    if (!buyer) {
      if (!name) throw new AppError("Each invoice needs a buyer.");
      const slug = name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "buyer";
      buyer = { id: `nb${stamp}${newBuyers.length}`, name, nip: nip ?? "", email: `faktury@${slug}.example`, payment_terms_days: 30 };
      buyers.push(buyer);
      newBuyers.push(buyer);
    }

    if (!number) {
      do number = `FV/${row.issue_date.slice(0, 4)}/${row.issue_date.slice(5, 7)}/${String(++seq).padStart(3, "0")}`;
      while (numbers.has(number));
    }
    numbers.add(number);
    const invoice: Invoice = {
      id: `ni${stamp}${added.length}`,
      number,
      buyer_id: buyer.id,
      issue_date: row.issue_date,
      due_date: row.due_date,
      amount_pln: Math.round(row.amount_pln * 100) / 100,
      status: row.paid_date ? "paid" : "open",
    };
    added.push(invoice);
    if (row.paid_date) {
      payments.push({ id: `np-${invoice.id}`, invoice_id: invoice.id, buyer_id: buyer.id, date: row.paid_date, amount_pln: invoice.amount_pln });
    }
  }

  const open = [...profile.invoices, ...added].filter((i) => i.status === "open");
  const matched: ImportPlan["matched"] = [];
  const unmatched: BankLine[] = [];
  for (const line of lines) {
    const invoice = matchPayment(line, open, buyers);
    if (!invoice) {
      unmatched.push(line);
      continue;
    }
    open.splice(open.indexOf(invoice), 1); // one payment per invoice
    matched.push({ line, invoice });
  }
  const bankPayments = matched.map(({ line, invoice }, n) => ({
    id: `bank-${stamp}${n}`,
    invoice_id: invoice.id,
    buyer_id: invoice.buyer_id,
    date: line.date,
    amount_pln: line.amount_pln,
  }));

  return { new_buyers: newBuyers, invoices: added, payments, bank_payments: bankPayments, matched, unmatched, skipped };
}

// The profile with a plan applied, for the "before → after" preview.
export function applyPlan(profile: SmeProfile, plan: ImportPlan): SmeProfile {
  const next = structuredClone(profile);
  applyData(next, { buyers: plan.new_buyers, invoices: plan.invoices, payments: plan.payments, bank_payments: plan.bank_payments });
  return next;
}

export async function saveImport(plan: ImportPlan): Promise<void> {
  const ws = await load();
  ws.data.buyers.push(...plan.new_buyers);
  ws.data.invoices.push(...plan.invoices);
  ws.data.payments.push(...plan.payments);
  ws.data.bank_payments.push(...plan.bank_payments);
  await save(ws);
}

// Adds invoices (from the form, a CSV or a KSeF XML). Invoice numbers already on file are skipped.
export async function addInvoices(rows: NewInvoice[]): Promise<ImportPlan> {
  const plan = planImport(await getProfile(), rows);
  await saveImport(plan);
  return plan;
}

export type KeyFigures = { cash_balance_pln: number; monthly_costs_pln: number };

// Base figures before simulated and scanned payments, so those still add to the balance afterwards.
export async function saveKeyFigures(next: KeyFigures): Promise<void> {
  const ws = await load();
  const profile = await getProfile();
  const simulated = profile.payments.filter((p) => /^(sim|bank)-/.test(p.id)).reduce((s, p) => s + p.amount_pln, 0);
  ws.data.cash_balance_pln = next.cash_balance_pln - simulated;
  ws.data.monthly_costs_pln = next.monthly_costs_pln;
  await save(ws);
}

// The profile as it would be with these figures; used for the live preview before saving.
export async function previewKeyFigures(next: KeyFigures): Promise<SmeProfile> {
  const profile = await getProfile();
  profile.company.cash_balance_pln = next.cash_balance_pln;
  profile.company.monthly_costs_pln = next.monthly_costs_pln;
  return profile;
}

export async function getSyncTimes(): Promise<Workspace["synced"]> {
  return (await load()).synced;
}

export async function recordSync(source: SyncSource): Promise<string> {
  const ws = await load();
  const at = new Date().toISOString();
  ws.synced[source] = at;
  await save(ws);
  return at;
}

// "Reset demo data" and every sign-in: back to the imported demo company. Settings stay; the action log is evidence and stays too.
export async function resetDemoData(): Promise<void> {
  const ws = await load();
  ws.data = structuredClone(EMPTY_DATA);
  ws.simulated_payments = [];
  ws.synced = { ksef: new Date().toISOString(), bank: new Date().toISOString() };
  await save(ws);
}
