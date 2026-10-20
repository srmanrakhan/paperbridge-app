import { connection } from "next/server";
import { Suspense } from "react";
import { Afford } from "@/components/Afford";

export const metadata = { title: "Can I afford it? · Paperbridge" };

export default function AffordPage({ searchParams }: PageProps<"/afford">) {
  return (
    <main className="flex-1">
      <Suspense fallback={<p className="px-6 pt-32 text-center text-[17px] text-muted">Loading…</p>}>
        <Inner searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Inner({ searchParams }: Pick<PageProps<"/afford">, "searchParams">) {
  await connection();
  const { asset, price } = await searchParams;
  const p = Number(typeof price === "string" ? price : "");
  return (
    <Afford
      initialAsset={typeof asset === "string" && asset ? asset.slice(0, 60) : "Printing press"}
      initialPrice={Number.isFinite(p) && p > 0 ? p : 200000}
      autoRun={typeof price === "string"}
    />
  );
}
