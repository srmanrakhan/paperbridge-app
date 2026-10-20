import { connection } from "next/server";
import { logAction } from "@/lib/actions";
import { computeAffordability, DEFAULT_ASSET } from "@/lib/affordability";
import { friendlyError } from "@/lib/errors";
import { getProfile, getSettings } from "@/lib/workspace";

// GET /api/afford?asset=Printing%20press&price=200000 -> 13-week forecast, verdict, payback and options.
export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const asset = (url.searchParams.get("asset") || DEFAULT_ASSET.name).slice(0, 60);
  const price = Number(url.searchParams.get("price") || DEFAULT_ASSET.price_pln);
  if (!Number.isFinite(price) || price < 1000 || price > 50_000_000) {
    return Response.json({ error: "Enter a price between 1 000 and 50 000 000 zł." }, { status: 400 });
  }
  const extraRaw = url.searchParams.get("extra");
  const extra = extraRaw ? Number(extraRaw) : 0;
  if (!Number.isFinite(extra) || extra < 0 || extra > 50_000_000) {
    return Response.json({ error: "Enter the extra revenue as an amount of 0 zł or more, or leave it empty." }, { status: 400 });
  }
  try {
    const profile = await getProfile();
    const settings = await getSettings(profile);
    const result = computeAffordability(profile, { name: asset, price_pln: price, extra_revenue_per_month_pln: extra }, settings.safety_buffer_weeks);
    if (url.searchParams.get("log") === "1") {
      await logAction("check_affordability", { input: { asset_name: asset, price_pln: price, extra_revenue_per_month_pln: extra }, verdict: result.verdict }, "logged");
    }
    return Response.json({ result, company: profile.company.name });
  } catch (err) {
    console.error("afford failed", err);
    return Response.json({ error: friendlyError(err) }, { status: 500 });
  }
}
