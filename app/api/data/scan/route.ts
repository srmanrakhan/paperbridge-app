import { logAction } from "@/lib/actions";
import { friendlyError } from "@/lib/errors";
import { getReceivables, getScore } from "@/lib/financeCore";
import { shortName } from "@/lib/format";
import type { BankLine } from "@/lib/importParse";
import { MAX_ROWS, parseBankLine, parseInvoiceRow } from "@/lib/importRows";
import { applyPlan, getProfile, planImport, saveImport, type ImportPlan, type NewInvoice } from "@/lib/workspace";
import type { SmeProfile } from "@/types/sme";

// POST /api/data/scan { invoices: ImportRow[], payments: BankLine[], files: string[], confirm?: true }
// Without confirm: "Here's what we found" (new invoices, matched payments, before -> after). Nothing is saved.
// With confirm: saves the same plan, logs it, and returns one short confirmation line.

async function figures(profile: SmeProfile) {
  const [score, receivables] = await Promise.all([getScore(profile), getReceivables(profile)]);
  return { score: score.score, runway_weeks: score.cash_runway_weeks, overdue_pln: receivables.total_overdue_pln };
}

function describe(plan: ImportPlan, profile: SmeProfile) {
  const buyerName = (id: string) => [...profile.buyers, ...plan.new_buyers].find((b) => b.id === id)?.name ?? "";
  return {
    invoices: plan.invoices.map((i) => ({
      number: i.number,
      buyer: buyerName(i.buyer_id),
      new_buyer: plan.new_buyers.some((b) => b.id === i.buyer_id),
      amount_pln: i.amount_pln,
      due_date: i.due_date,
      paid: i.status === "paid",
    })),
    payments: [
      ...plan.matched.map(({ line, invoice }) => ({
        counterparty: line.counterparty || buyerName(invoice.buyer_id),
        amount_pln: line.amount_pln,
        date: line.date,
        invoice_number: invoice.number as string | null,
      })),
      ...plan.unmatched.map((line) => ({ counterparty: line.counterparty, amount_pln: line.amount_pln, date: line.date, invoice_number: null })),
    ],
    skipped: plan.skipped,
  };
}

function confirmation(plan: ImportPlan, profile: SmeProfile, after: { runway_weeks: number; score: number }, before: { runway_weeks: number }) {
  const parts: string[] = [];
  const n = plan.invoices.length;
  if (n) parts.push(`${n} new ${n === 1 ? "invoice" : "invoices"} added`);
  if (plan.matched.length === 1) {
    const buyer = profile.buyers.find((b) => b.id === plan.matched[0].invoice.buyer_id);
    parts.push(`${buyer ? `${shortName(buyer.name)}'s` : "the"} payment is matched`);
  } else if (plan.matched.length > 1) {
    parts.push(`${plan.matched.length} payments are matched`);
  }
  const outcome = after.runway_weeks !== before.runway_weeks ? `your runway is now ${after.runway_weeks} weeks` : `your score is ${after.score}`;
  if (!parts.length) return "Done. Everything in these files was already on file.";
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")}, ${parts.at(-1)}` : parts[0];
  return `Done. ${list.charAt(0).toUpperCase()}${list.slice(1)} and ${outcome}.`;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const rawInvoices = Array.isArray(body?.invoices) ? body.invoices : [];
  const rawPayments = Array.isArray(body?.payments) ? body.payments : [];
  const files = Array.isArray(body?.files) ? body.files.filter((f): f is string => typeof f === "string").slice(0, 20) : [];
  if (rawInvoices.length + rawPayments.length === 0) return Response.json({ error: "We found nothing to add in these files." }, { status: 400 });
  if (rawInvoices.length + rawPayments.length > MAX_ROWS) return Response.json({ error: `Add up to ${MAX_ROWS} rows at a time.` }, { status: 400 });

  try {
    const profile = await getProfile();
    const rows: NewInvoice[] = [];
    for (const [i, raw] of rawInvoices.entries()) {
      const row = parseInvoiceRow(raw, profile.as_of, `Invoice ${i + 1}`);
      if (typeof row === "string") return Response.json({ error: row }, { status: 400 });
      rows.push(row);
    }
    const lines: BankLine[] = [];
    for (const [i, raw] of rawPayments.entries()) {
      const line = parseBankLine(raw, profile.as_of, `Payment ${i + 1}`);
      if (typeof line === "string") return Response.json({ error: line }, { status: 400 });
      lines.push(line);
    }

    const plan = planImport(profile, rows, lines);
    const [before, after] = await Promise.all([figures(profile), figures(applyPlan(profile, plan))]);
    const impact = {
      score: { before: before.score, after: after.score },
      runway_weeks: { before: before.runway_weeks, after: after.runway_weeks },
      overdue_pln: { before: before.overdue_pln, after: after.overdue_pln },
    };
    const found = describe(plan, profile);
    if (body?.confirm !== true) return Response.json({ ...found, impact });

    await saveImport(plan);
    const message = confirmation(plan, profile, after, before);
    await logAction(
      "document_scan",
      {
        files,
        invoices: plan.invoices.map((i) => i.number),
        new_buyers: plan.new_buyers.map((b) => b.name),
        payments_matched: plan.matched.map(({ line, invoice }) => ({ amount_pln: line.amount_pln, invoice: invoice.number })),
        payments_unmatched: plan.unmatched.length,
        skipped: plan.skipped,
        impact,
      },
      "approved",
    );
    return Response.json({ ...found, impact, message });
  } catch (err) {
    console.error("document scan failed", err);
    return Response.json({ error: friendlyError(err) }, { status: 500 });
  }
}
