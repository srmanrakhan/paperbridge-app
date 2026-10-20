import { logAction } from "@/lib/actions";
import { friendlyError } from "@/lib/errors";
import { getScore } from "@/lib/financeCore";
import { previewKeyFigures, saveKeyFigures } from "@/lib/workspace";

// POST /api/data/figures { cash_balance_pln, monthly_costs_pln, preview?: true }
// preview: the score and runway these figures would give, nothing saved. Otherwise saves them.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const cash = Number(body?.cash_balance_pln);
  const costs = Number(body?.monthly_costs_pln);
  if (!Number.isFinite(cash) || cash < 0 || cash > 1_000_000_000) {
    return Response.json({ error: "Enter a bank balance of 0 PLN or more." }, { status: 400 });
  }
  if (!Number.isFinite(costs) || costs <= 0 || costs > 1_000_000_000) {
    return Response.json({ error: "Enter monthly fixed costs above 0 PLN." }, { status: 400 });
  }
  const figures = { cash_balance_pln: Math.round(cash), monthly_costs_pln: Math.round(costs) };

  try {
    const score = await getScore(await previewKeyFigures(figures));
    const result = { score: score.score, band: score.band, cash_runway_weeks: score.cash_runway_weeks };
    if (body?.preview === true) return Response.json(result);
    await saveKeyFigures(figures);
    await logAction("key_figures", { ...figures, score_after: score.score }, "logged");
    return Response.json(result);
  } catch (err) {
    console.error("key figures failed", err);
    return Response.json({ error: friendlyError(err) }, { status: 500 });
  }
}
