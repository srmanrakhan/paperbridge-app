// Prints every finance-core response so you can eyeball the data.
// Run: npm run check:finance-core   (mock mode unless FINANCE_CORE_URL is set)
import { getDemoCompany, getFinancingPack, getReceivables, getScore, isMockMode } from "@/lib/financeCore";

async function main() {
  console.log(`Mode: ${isMockMode() ? "mock" : `real (${process.env.FINANCE_CORE_URL})`}\n`);

  const profile = await getDemoCompany();
  console.log(`Company: ${profile.company.name}, ${profile.buyers.length} buyers, ${profile.invoices.length} invoices, ${profile.payments.length} payments\n`);

  console.log("== Score ==");
  console.log(JSON.stringify(await getScore(profile), null, 2));

  console.log("\n== Receivables ==");
  console.log(JSON.stringify(await getReceivables(profile), null, 2));

  console.log("\n== Financing pack ==");
  console.log(JSON.stringify(await getFinancingPack(profile), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
