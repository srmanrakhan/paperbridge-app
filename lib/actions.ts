import { AppError } from "@/lib/errors";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

// Rows of the agent_actions table: every agent tool call and every owner decision.
export type ActionStatus = "drafted" | "approved" | "rejected" | "logged";

export type AgentAction = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: ActionStatus;
  created_at: string;
};

export type Decision = "approved" | "rejected";

export type DecideResult =
  | { ok: true; action: AgentAction }
  | { ok: false; status: 404 | 409; error: string };

// Where the log lives. Supabase when configured. Without Supabase, local development
// falls back to an in-memory log so the app can be tried before the database exists;
// production never does.
export type ActionStore = "supabase" | "memory";

export function actionStore(): ActionStore {
  if (isSupabaseConfigured()) return "supabase";
  return "memory";
}

const DB_ERROR = "Couldn't reach the action log database. Please try again.";

// Shared across route bundles in the dev server.
const memory: AgentAction[] = ((globalThis as { __paperbridgeActions?: AgentAction[] }).__paperbridgeActions ??= []);

export async function logAction(
  type: string,
  payload: Record<string, unknown>,
  status: ActionStatus,
): Promise<AgentAction> {
  if (actionStore() === "memory") {
    const row: AgentAction = { id: crypto.randomUUID(), type, payload, status, created_at: new Date().toISOString() };
    memory.push(row);
    return row;
  }
  const { data, error } = await getSupabase()
    .from("agent_actions")
    .insert({ type, payload, status })
    .select()
    .single();
  if (error) {
    console.error("agent_actions insert failed:", error.message);
    throw new AppError(DB_ERROR);
  }
  return data as AgentAction;
}

export async function listActions(limit = 30): Promise<AgentAction[]> {
  if (actionStore() === "memory") return [...memory].reverse().slice(0, limit);
  const { data, error } = await getSupabase()
    .from("agent_actions")
    .select()
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("agent_actions select failed:", error.message);
    throw new AppError(DB_ERROR);
  }
  return data as AgentAction[];
}

// Owner decision on a drafted action. Only a "drafted" row can change, so a draft
// can't be approved twice or flipped after a decision. The decision is also logged as its own row.
export async function decideAction(actionId: string, decision: Decision): Promise<DecideResult> {
  let action: AgentAction | undefined;
  let existingStatus: ActionStatus | undefined;

  if (actionStore() === "memory") {
    const row = memory.find((a) => a.id === actionId);
    existingStatus = row?.status;
    if (row?.status === "drafted") {
      row.status = decision;
      action = { ...row };
    }
  } else {
    const db = getSupabase();
    const { data, error } = await db
      .from("agent_actions")
      .update({ status: decision })
      .eq("id", actionId)
      .eq("status", "drafted")
      .select();
    if (error) {
      console.error("agent_actions update failed:", error.message);
      throw new AppError(DB_ERROR);
    }
    action = data?.[0] as AgentAction | undefined;
    if (!action) {
      const { data: existing } = await db.from("agent_actions").select("status").eq("id", actionId).maybeSingle();
      existingStatus = existing?.status;
    }
  }

  if (!action) {
    return existingStatus
      ? { ok: false, status: 409, error: `This draft was already ${existingStatus}.` }
      : { ok: false, status: 404, error: "This draft no longer exists." };
  }
  await logAction(
    "approval",
    { action_id: action.id, action_type: action.type, buyer_name: action.payload.buyer_name, decision },
    decision,
  );
  return { ok: true, action };
}
