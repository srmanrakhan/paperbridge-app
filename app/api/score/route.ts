import { connection } from "next/server";
import { friendlyError } from "@/lib/errors";
import { getScore } from "@/lib/financeCore";
import { getProfile, nextSimulatedInvoice } from "@/lib/workspace";

// GET /api/score -> the live score, and whether there is an overdue invoice left to "pay" in the demo.
export async function GET() {
  await connection();
  try {
    const profile = await getProfile();
    const score = await getScore(profile);
    return Response.json({ score, can_simulate: Boolean(nextSimulatedInvoice(profile)) });
  } catch (err) {
    console.error("score failed", err);
    return Response.json({ error: friendlyError(err) }, { status: 500 });
  }
}
