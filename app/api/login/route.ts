import { logAction } from "@/lib/actions";
import { friendlyError } from "@/lib/errors";
import { getProfile, resetDemoData } from "@/lib/workspace";

// POST /api/login { method: "password" | "ksef" } -> demo sign-in. There is no real authentication:
// any click signs in, and every sign-in starts from the basic demo data (settings stay).
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { method?: unknown } | null;
  const method = body?.method === "ksef" ? "ksef" : "password";
  try {
    await resetDemoData();
    const profile = await getProfile();
    const counts = { invoices: profile.invoices.length, payments: profile.payments.length };
    await logAction("login", { method, demo: true, ...counts }, "logged");
    return Response.json(counts);
  } catch (err) {
    console.error("login failed", err);
    return Response.json({ error: friendlyError(err) }, { status: 500 });
  }
}
