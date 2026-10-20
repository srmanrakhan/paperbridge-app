import { mkdirSync, writeFileSync } from "node:fs";
import { actionStore, listActions } from "../lib/actions";

// Exports the agent_actions log (tool calls and owner decisions) as evidence/execution-log.json.
async function main() {
  const store = actionStore();
  if (store === "memory") console.warn("Supabase is not configured: the in-memory log is empty in a separate process.");
  const actions = (await listActions(10_000)).reverse();
  mkdirSync("evidence", { recursive: true });
  writeFileSync("evidence/execution-log.json", JSON.stringify({ exported_at: new Date().toISOString(), store, actions }, null, 2));
  console.log(`Exported ${actions.length} actions to evidence/execution-log.json`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
