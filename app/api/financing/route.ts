import { logAction } from "@/lib/actions";
import { friendlyError } from "@/lib/errors";
import { getScore } from "@/lib/financeCore";
import { BANKS, buildOffers, SHARED_FIELDS } from "@/lib/offers";
import { getProfile, getSettings } from "@/lib/workspace";

// POST /api/financing { asset, price, consent: true } -> demo bank offers + one EU grant match.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { asset?: unknown; price?: unknown; consent?: unknown } | null;
  const price = Number(body?.price);
  if (body?.consent !== true) return Response.json({ error: "Share the Passport first to see offers." }, { status: 400 });
  if (!Number.isFinite(price) || price < 1000 || price > 50_000_000) {
    return Response.json({ error: "Enter a price between 1,000 and 50,000,000 PLN." }, { status: 400 });
  }
  try {
    const profile = await getProfile();
    const [score, settings] = await Promise.all([getScore(profile), getSettings(profile)]);
    const recipients = BANKS.filter((b) => settings.banks[b.id]).map((b) => b.name);
    if (recipients.length === 0) {
      return Response.json({ error: "No bank may see your Passport. Allow at least one in Settings." }, { status: 400 });
    }
    await logAction(
      "passport_shared",
      { asset: String(body?.asset ?? "Investment").slice(0, 60), price_pln: price, shared: SHARED_FIELDS, recipients, demo: true },
      "approved",
    );
    return Response.json({ ...buildOffers(price, score, settings.banks), price_pln: price });
  } catch (err) {
    console.error("financing failed", err);
    return Response.json({ error: friendlyError(err) }, { status: 500 });
  }
}
