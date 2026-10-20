import { connection } from "next/server";
import { Suspense } from "react";
import { Financing } from "@/components/Financing";

export const metadata = { title: "Find financing · Paperbridge" };

export default function FinancingPage({ searchParams }: PageProps<"/financing">) {
  return (
    <main className="flex-1">
      <Suspense fallback={<p className="px-6 pt-32 text-center text-[17px] text-muted">Loading…</p>}>
        <Inner searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Inner({ searchParams }: Pick<PageProps<"/financing">, "searchParams">) {
  await connection();
  const { asset, price } = await searchParams;
  const p = Number(typeof price === "string" ? price : "");
  return (
    <Financing
      asset={typeof asset === "string" && asset ? asset.slice(0, 60) : "Printing press"}
      price={Number.isFinite(p) && p >= 1000 ? p : 200000}
    />
  );
}
