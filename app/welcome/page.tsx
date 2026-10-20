import { connection } from "next/server";
import { Suspense } from "react";
import { Welcome } from "@/components/Welcome";
import { DEMO_USER } from "@/lib/demoUser";
import { companyName } from "@/lib/format";
import { getProfile } from "@/lib/workspace";

export const metadata = { title: "Welcome · Paperbridge" };

export default function WelcomePage() {
  return (
    <main className="mesh-bg flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <Suspense fallback={null}>
        <LoadedWelcome />
      </Suspense>
    </main>
  );
}

async function LoadedWelcome() {
  await connection();
  const profile = await getProfile();
  return (
    <Welcome
      firstName={DEMO_USER.first_name}
      company={companyName(profile.company.name)}
      invoices={profile.invoices.length}
      payments={profile.payments.length}
    />
  );
}
