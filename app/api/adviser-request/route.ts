import { logAction } from "@/lib/actions";
import { friendlyError } from "@/lib/errors";

const TIMES = ["Morning", "Afternoon", "Evening"];

// POST /api/adviser-request { topic, name, phone, time } -> owner click on "Discuss with an adviser". Demo only: nothing is sent to anyone.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const name = str(body?.name, 80);
  const phone = str(body?.phone, 30);
  const time = str(body?.time, 20);
  const topic = str(body?.topic, 80);
  if (!name) return Response.json({ error: "Please enter your name." }, { status: 400 });
  if (!/^[+\d][\d\s()-]{6,}$/.test(phone)) return Response.json({ error: "Please enter a phone number we can call." }, { status: 400 });
  if (!TIMES.includes(time)) return Response.json({ error: "Please choose a preferred time." }, { status: 400 });
  try {
    await logAction("adviser_requested", { topic, name, phone, preferred_time: time, demo: true, note: "Demo request. Nothing was sent to an adviser." }, "logged");
    return Response.json({ ok: true });
  } catch (err) {
    console.error("adviser-request failed", err);
    return Response.json({ error: friendlyError(err) }, { status: 500 });
  }
}
