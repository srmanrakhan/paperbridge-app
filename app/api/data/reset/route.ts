import { logAction } from "@/lib/actions";
import { friendlyError } from "@/lib/errors";
import { resetDemoData } from "@/lib/workspace";

// POST /api/data/reset { confirm: true } -> back to the imported demo company. Settings and the action log stay.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { confirm?: unknown } | null;
  if (body?.confirm !== true) return Response.json({ error: "Confirm the reset first." }, { status: 400 });
  try {
    await resetDemoData();
    await logAction("reset_demo_data", {}, "logged");
    return Response.json({ ok: true });
  } catch (err) {
    console.error("reset failed", err);
    return Response.json({ error: friendlyError(err) }, { status: 500 });
  }
}
