import { logAction } from "@/lib/actions";
import { friendlyError } from "@/lib/errors";
import { getScore } from "@/lib/financeCore";
import { MAX_ROWS, parseInvoiceRow } from "@/lib/importRows";
import { addInvoices, getProfile, type NewInvoice } from "@/lib/workspace";

// POST /api/data/invoices { source: "form" | "csv" | "ksef-xml", invoices: NewInvoice[] }
// -> { added, new_buyers, skipped, score_before, score_after }
const SOURCES = ["form", "csv", "ksef-xml"] as const;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { source?: unknown; invoices?: unknown } | null;
  const source = SOURCES.find((s) => s === body?.source);
  if (!source || !Array.isArray(body?.invoices) || body.invoices.length === 0) {
    return Response.json({ error: "Add at least one invoice." }, { status: 400 });
  }
  if (body.invoices.length > MAX_ROWS) return Response.json({ error: `Import up to ${MAX_ROWS} invoices at a time.` }, { status: 400 });

  try {
    const before = await getProfile();
    const rows: NewInvoice[] = [];
    for (const [i, raw] of body.invoices.entries()) {
      const row = parseInvoiceRow(raw, before.as_of, `Row ${i + 1}`);
      if (typeof row === "string") return Response.json({ error: row }, { status: 400 });
      rows.push(row);
    }
    if (rows.some((r) => r.buyer_id && !before.buyers.some((b) => b.id === r.buyer_id))) {
      return Response.json({ error: "That buyer no longer exists. Reload the page." }, { status: 400 });
    }

    const scoreBefore = await getScore(before);
    const result = await addInvoices(rows);
    const scoreAfter = await getScore(await getProfile());
    await logAction(
      "data_import",
      {
        source,
        invoices: result.invoices.map((i) => i.number),
        new_buyers: result.new_buyers.map((b) => b.name),
        skipped: result.skipped,
        score_before: scoreBefore.score,
        score_after: scoreAfter.score,
      },
      "logged",
    );
    return Response.json({
      added: result.invoices.length,
      new_buyers: result.new_buyers.length,
      skipped: result.skipped,
      score_before: scoreBefore.score,
      score_after: scoreAfter.score,
    });
  } catch (err) {
    console.error("data import failed", err);
    return Response.json({ error: friendlyError(err) }, { status: 500 });
  }
}
