import Link from "next/link";

export const metadata = { title: "Paperbridge · Know what your business can afford" };

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24 pt-20 text-center">
      <p className="text-[17px] font-semibold text-muted">Paperbridge</p>
      <h1 className="mt-3 max-w-4xl text-[44px] font-semibold leading-[1.07] tracking-[-0.015em] sm:text-[64px]">
        Know what your business can afford. Get funded in days.
      </h1>
      <p className="mt-5 max-w-xl text-[21px] leading-snug text-muted">
        Paperbridge reads your e-invoices and bank data, tells you what you can afford, and brings you bank offers.
      </p>
      <div className="mt-12 flex flex-col items-center gap-4">
        <Link href="/login" className="rounded-full bg-accent px-8 py-3.5 text-[17px] text-white transition-colors hover:bg-accent-hover">
          Sign in
        </Link>
        <p className="text-[14px] text-faint">Demo company. Read-only access. Nothing is sent without your approval.</p>
      </div>
    </main>
  );
}
