import { logAction } from "@/lib/actions";
import { friendlyError } from "@/lib/errors";
import { getScore } from "@/lib/financeCore";
import { getProfile, nextSimulatedInvoice, recordSimulatedPayment } from "@/lib/workspace";

// POST /api/simulate-payment -> demo only: a bank payment arrives for the largest overdue invoice.
// The payment is matched to its invoice and the score is recomputed.
export async function POST() {
  try {
    const before = await getProfile();
    const invoice = nextSimulatedInvoice(before);
    if (!invoice) return Response.json({ error: "Every overdue invoice is already paid." }, { status: 409 });

    const scoreBefore = await getScore(before);
    await recordSimulatedPayment(invoice, before.as_of);
    const after = await getProfile();
    const scoreAfter = await getScore(after);

    const payment = {
      invoice_id: invoice.id,
      invoice_number: invoice.number,
      buyer_name: before.buyers.find((b) => b.id === invoice.buyer_id)?.name ?? invoice.buyer_id,
      amount_pln: invoice.amount_pln,
      date: before.as_of,
    };
    await logAction(
      "payment_matched",
      { ...payment, simulated: true, score_before: scoreBefore.score, score_after: scoreAfter.score },
      "logged",
    );
    return Response.json({
      payment,
      score_before: scoreBefore,
      score: scoreAfter,
      can_simulate: Boolean(nextSimulatedInvoice(after)),
    });
  } catch (err) {
    console.error("simulate-payment failed", err);
    return Response.json({ error: friendlyError(err) }, { status: 500 });
  }
}
