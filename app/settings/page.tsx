import { connection } from "next/server";
import { Suspense } from "react";
import { SettingsForm, type ReminderSample } from "@/components/SettingsForm";
import { getReceivables } from "@/lib/financeCore";
import { getProfile, getSettings } from "@/lib/workspace";

export const metadata = { title: "Settings · Paperbridge" };

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 pb-24 pt-16">
      <h1 className="text-[40px] font-semibold leading-tight tracking-[-0.01em]">Settings</h1>
      <p className="mt-2 text-[19px] text-muted">Your company, and what the copilot is allowed to do. Changes save as you go.</p>
      <Suspense fallback={<p className="mt-12 text-[17px] text-muted">Loading settings…</p>}>
        <LoadedSettings />
      </Suspense>
    </main>
  );
}

async function LoadedSettings() {
  await connection();
  const profile = await getProfile();
  const [settings, receivables] = await Promise.all([getSettings(profile), getReceivables(profile)]);
  // The reminder preview uses the latest buyer that is actually late, so the sample reads true.
  const late = [...receivables.buyers].sort((a, b) => b.max_days_late - a.max_days_late)[0];
  const sample: ReminderSample = late?.overdue_invoices.length
    ? { buyer: late.buyer_name, invoices: late.overdue_invoices }
    : { buyer: "Sample Buyer Sp. z o.o.", invoices: [{ number: "FV/2026/09/001", amount_pln: 12_300, due_date: profile.as_of, days_late: 14 }] };
  return <SettingsForm initial={settings} sample={sample} />;
}
