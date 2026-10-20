// Loads the finance-core demo company into Supabase. Safe to re-run (upserts by id).
// Run: npm run seed            (needs SUPABASE_URL and SUPABASE_ANON_KEY in .env.local)
//      npm run seed -- --reset (also clears agent_actions, for a fresh demo run)
import { getDemoCompany, getScore, isMockMode } from "@/lib/financeCore";
import { getSupabase } from "@/lib/supabase";

async function upsert(table: string, rows: object[]) {
  const { error } = await getSupabase().from(table).upsert(rows);
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`  ${table}: ${rows.length} rows`);
}

async function main() {
  const db = getSupabase();
  console.log(`Finance-core mode: ${isMockMode() ? "mock" : "real"}`);

  const profile = await getDemoCompany();
  const companyId = profile.company.id;
  console.log(`Seeding ${profile.company.name}...`);

  await upsert("companies", [profile.company]);
  await upsert("buyers", profile.buyers.map((b) => ({ ...b, company_id: companyId })));
  await upsert("invoices", profile.invoices.map((i) => ({ ...i, company_id: companyId })));
  await upsert("payments", profile.payments.map((p) => ({ ...p, company_id: companyId })));

  const score = await getScore(profile);
  const { error } = await db.from("scores").insert({
    company_id: companyId,
    score: score.score,
    band: score.band,
    reasons: score.reasons,
    cash_runway_weeks: score.cash_runway_weeks,
  });
  if (error) throw new Error(`scores: ${error.message}`);
  console.log(`  scores: 1 row (score ${score.score}, ${score.band})`);

  if (process.argv.includes("--reset")) {
    const { error } = await db.from("agent_actions").delete().not("id", "is", null);
    if (error) throw new Error(`agent_actions: ${error.message}`);
    console.log("  agent_actions: cleared");
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
