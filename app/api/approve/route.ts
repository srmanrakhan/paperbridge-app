import { decideAction } from "@/lib/actions";
import { friendlyError } from "@/lib/errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/approve  { action_id: uuid, decision: "approved" | "rejected" }
// Owner click on a drafted action. Nothing is sent: approving only records the decision.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { action_id?: unknown; decision?: unknown } | null;
  const { action_id, decision } = body ?? {};
  if (typeof action_id !== "string" || !UUID.test(action_id) || (decision !== "approved" && decision !== "rejected")) {
    return Response.json({ error: "That draft couldn't be found." }, { status: 400 });
  }

  try {
    const result = await decideAction(action_id, decision);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ action: result.action });
  } catch (err) {
    console.error("approve failed", err);
    return Response.json({ error: friendlyError(err) }, { status: 500 });
  }
}
