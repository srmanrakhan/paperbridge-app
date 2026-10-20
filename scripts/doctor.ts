// Checks that the copilot can run: env keys, Anthropic key, Supabase tables and seed data.
// Run: npm run doctor   (prints which keys are set, never their values)
import { existsSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "@/lib/anthropic";
import { getDemoCompany, isMockMode } from "@/lib/financeCore";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

let problems = 0;
const ok = (msg: string) => console.log(`  OK    ${msg}`);
const bad = (msg: string, fix: string) => {
  problems++;
  console.log(`  FAIL  ${msg}\n        -> ${fix}`);
};

async function main() {
  console.log("Environment");
  if (existsSync(".env.local")) ok(".env.local exists");
  else bad(".env.local is missing", "Copy-Item .env.example .env.local, then fill in the keys");
  for (const key of ["ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_ANON_KEY"]) {
    if (process.env[key]) ok(`${key} is set`);
    else bad(`${key} is empty`, "add it to .env.local (see README > Setup)");
  }
  console.log(`  INFO  finance-core: ${isMockMode() ? "mock data (FINANCE_CORE_URL empty)" : process.env.FINANCE_CORE_URL}`);

  console.log("\nAnthropic");
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      await new Anthropic().models.retrieve(MODEL);
      ok(`key works, ${MODEL} is available`);
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) bad("key was rejected", "create a new key at console.anthropic.com");
      else if (err instanceof Anthropic.NotFoundError) bad(`${MODEL} is not available to this key`, "check the key's workspace");
      else bad("could not reach the API", err instanceof Error ? err.message : String(err));
    }
  } else {
    console.log("  SKIP  no key");
  }

  console.log("\nSupabase");
  if (isSupabaseConfigured()) {
    const db = getSupabase();
    for (const table of ["companies", "buyers", "invoices", "payments", "scores", "agent_actions"]) {
      const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
      if (error) bad(`table ${table}: ${error.message}`, "run supabase/schema.sql in the Supabase SQL Editor");
      else if (count === 0 && table !== "agent_actions") bad(`table ${table} is empty`, "npm run seed");
      else ok(`table ${table}: ${count} rows`);
    }
  } else {
    console.log("  SKIP  not configured (the dev server uses a temporary in-memory log)");
  }

  console.log("\nFinance data");
  try {
    const profile = await getDemoCompany();
    ok(`${profile.company.name}: ${profile.invoices.length} invoices`);
  } catch {
    bad("could not load the demo company", "check FINANCE_CORE_URL or leave it empty for mock data");
  }

  console.log(problems === 0 ? "\nAll good. Start with: npm run dev" : `\n${problems} problem(s) to fix.`);
  process.exit(problems === 0 ? 0 : 1);
}

main();
