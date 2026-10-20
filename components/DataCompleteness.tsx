import Link from "next/link";
import { Check } from "@/components/Check";
import { completenessPct, DATA_ITEMS } from "@/lib/completeness";

// "Improve your score accuracy": a checklist of data to add. compact = the printed Passport.
export function DataCompleteness({ compact = false }: { compact?: boolean }) {
  const pct = completenessPct();
  const missing = DATA_ITEMS.filter((i) => !i.added).length;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={compact ? "text-[15px] font-semibold" : "text-[32px] font-semibold tracking-tight"}>Improve your score accuracy</h2>
        <p className={`tabular ${compact ? "text-muted" : "text-[17px] text-muted"}`}>
          Data completeness <span className="font-semibold text-ink">{pct}%</span>
        </p>
      </div>
      {!compact && <p className="mt-1 text-[17px] text-muted">The more your Passport covers, the more precise your score. {missing} items to add.</p>}
      <div
        className={`overflow-hidden rounded-full bg-line ${compact ? "mt-2 h-1" : "mt-5 h-1.5"}`}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Data completeness"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <ul className={compact ? "mt-2" : "mt-6 border-t border-line"}>
        {DATA_ITEMS.map((i) => (
          <li key={i.id} className={`flex items-baseline justify-between gap-4 border-b border-line ${compact ? "py-1.5" : "py-4"}`}>
            <div className="min-w-0">
              <p className={compact ? "" : "text-[17px]"}>
                {compact ? i.title : <Link href="/data" className="hover:underline">{i.title}</Link>}
              </p>
              <p className={compact ? "text-[11px] text-muted" : "text-[15px] text-muted"}>{i.reason}</p>
            </div>
            {i.added ? (
              <span className={`flex shrink-0 items-center gap-1.5 text-good ${compact ? "" : "text-[15px]"}`}>
                <Check />
                Added
              </span>
            ) : compact ? (
              <span className="shrink-0 text-muted">Missing</span>
            ) : (
              <span className="flex shrink-0 items-baseline gap-4 text-[15px]">
                <span className="text-muted">Missing</span>
                <Link href="/data" className="text-accent hover:underline">
                  Add data →
                </Link>
              </span>
            )}
          </li>
        ))}
      </ul>
      {compact && (
        <p className="no-print mt-2 text-[11px]">
          <Link href="/data" className="text-accent hover:underline">
            Add the missing data →
          </Link>
        </p>
      )}
    </div>
  );
}
