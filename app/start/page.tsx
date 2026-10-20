import Link from "next/link";

export const metadata = { title: "Start · Paperbridge" };

const OPTIONS = [
  { title: "Add documents", note: "Upload invoices or a bank statement, and we'll read them for you.", href: "/data" },
  { title: "Can I afford it?", note: "Check a purchase against your next 13 weeks of cash.", href: "/afford" },
  { title: "See my overview", note: "Your business at a glance.", href: "/dashboard" },
  { title: "Find financing", note: "See what banks could offer you.", href: "/financing" },
];

export default function StartPage() {
  return (
    <main className="mesh-bg flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-6 py-12">
        <h1 className="rise-in text-center text-[40px] font-semibold leading-tight tracking-[-0.015em] sm:text-[48px]">
          Where would you like to start today?
        </h1>
        <ul className="mt-16 grid gap-5 sm:grid-cols-2">
          {OPTIONS.map((o, i) => (
            <li key={o.href} className="rise-in" style={{ animationDelay: `${(i + 1) * 100}ms` }}>
              <Link
                href={o.href}
                className="group flex h-full min-h-[170px] flex-col justify-between rounded-3xl bg-white/70 p-7 transition-colors hover:bg-white"
              >
                <span>
                  <span className="block text-[24px] font-semibold tracking-tight">{o.title}</span>
                  <span className="mt-2 block text-[17px] leading-snug text-muted">{o.note}</span>
                </span>
                <span className="mt-4 text-[15px] text-accent group-hover:underline">Open →</span>
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/chat" className="rise-in mt-8 self-center text-[17px] text-accent hover:underline" style={{ animationDelay: "500ms" }}>
          Ask the copilot anything →
        </Link>
      </div>
    </main>
  );
}
