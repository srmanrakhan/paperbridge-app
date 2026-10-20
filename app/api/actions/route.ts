import { connection } from "next/server";
import { actionStore, listActions } from "@/lib/actions";
import { isDemoAI } from "@/lib/demoAgent";
import { friendlyError } from "@/lib/errors";

// GET /api/actions -> latest agent_actions rows, newest first (the action log).
export async function GET() {
  await connection();
  try {
    return Response.json({ actions: await listActions(), store: actionStore(), demo_ai: isDemoAI() });
  } catch (err) {
    console.error("actions failed", err);
    return Response.json({ error: friendlyError(err) }, { status: 500 });
  }
}
