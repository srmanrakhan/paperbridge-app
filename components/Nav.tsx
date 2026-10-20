"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/afford", label: "Can I afford it?" },
  { href: "/chat", label: "Copilot" },
  { href: "/bank", label: "Passport" },
  { href: "/data", label: "Data" },
  { href: "/settings", label: "Settings" },
];

// Sign-in and welcome are full-screen moments, without the bar.
const BARE = ["/login", "/welcome"];

export function Nav() {
  const pathname = usePathname();
  if (BARE.includes(pathname)) return null;
  return (
    <header className="no-print sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur-md">
      <nav className="mx-auto flex h-12 max-w-[1200px] items-center justify-between gap-6 px-6">
        <Link href="/" className="text-[17px] font-semibold tracking-tight text-ink">
          Paperbridge
        </Link>
        <ul className="flex gap-7 text-[13px]">
          {LINKS.map((l) => {
            const active = pathname.startsWith(l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`transition-colors ${active ? "text-ink" : "text-muted hover:text-ink"}`}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
