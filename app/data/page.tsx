import { connection } from "next/server";
import { Suspense } from "react";
import { DataInput } from "@/components/DataInput";
import { getScore } from "@/lib/financeCore";
import { getProfile, getSyncTimes } from "@/lib/workspace";

export const metadata = { title: "Data · Paperbridge" };

export default function DataPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 pb-24 pt-16">
      <h1 className="text-[40px] font-semibold leading-tight tracking-[-0.01em]">Data</h1>
      <p className="mt-2 text-[19px] text-muted">Where your numbers come from. Every change updates your score, overview and Passport.</p>
      <Suspense fallback={<p className="mt-12 text-[17px] text-muted">Loading your data…</p>}>
        <LoadedData />
      </Suspense>
    </main>
  );
}

async function LoadedData() {
  await connection();
  const [profile, synced] = await Promise.all([getProfile(), getSyncTimes()]);
  const score = await getScore(profile);
  const open = profile.invoices.filter((i) => i.status === "open").length;
  return (
    <DataInput
      asOf={profile.as_of}
      buyers={profile.buyers.map((b) => ({ id: b.id, name: b.name, terms: b.payment_terms_days }))}
      counts={{ invoices: profile.invoices.length, open, payments: profile.payments.length }}
      figures={{ cash_balance_pln: profile.company.cash_balance_pln, monthly_costs_pln: profile.company.monthly_costs_pln }}
      score={{ score: score.score, band: score.band, cash_runway_weeks: score.cash_runway_weeks }}
      synced={synced}
    />
  );
}
