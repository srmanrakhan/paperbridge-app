import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DataCompleteness } from "@/components/DataCompleteness";
import { DEMO_USER } from "@/lib/demoUser";
import { getReceivables, getScore } from "@/lib/financeCore";
import { BAND_LABEL, BAND_LINE, BAND_TEXT, longDate, pln, shortMonth, shortName } from "@/lib/format";
import { getProfile, getSettings } from "@/lib/workspace";
import type { BuyerReceivables, Score, SmeProfile } from "@/types/sme";

export const metadata = { title: "Overview · Paperbridge" };

export default function DashboardPage() {
  return (
    <main className="flex-1">
      <Suspense fallback={<p className="px-6 pt-32 text-center text-[17px] text-muted">Loading your overview…</p>}>
        <Dashboard />
      </Suspense>
    </main>
  );
}

async function Dashboard() {
  await connection();
  const profile = await getProfile();
  const [score, receivables, settings] = await Promise.all([getScore(profile), getReceivables(profile), getSettings(profile)]);
  const remindAfter = settings.remind_after_days;
  const late = receivables.buyers.filter((b) => b.overdue_pln > 0).sort((a, b) => b.max_days_late - a.max_days_late);
  // One rule everywhere on this page: a buyer needs a follow-up once they are past the threshold in Settings.
  const followUp = late.filter((b) => b.max_days_late >= remindAfter);
  const briefing = buildBriefing({
    profile,
    late,
    followUp,
    score,
    remindAfter,
    canDraft: settings.drafts_enabled,
    warnWeeks: settings.cash_warning_weeks,
    suggestFinancing: settings.financing_enabled,
  });

  return (
    <>
      <section className="mx-auto grid max-w-[1200px] gap-16 px-6 pt-16 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-20 lg:pt-20">
        <div aria-label="AI briefing">
          <div className="rise-in">
            <h1 className="text-[40px] font-semibold leading-tight tracking-[-0.015em] sm:text-[48px]">
              {greeting()}, {DEMO_USER.first_name}.
            </h1>
            <p className="mt-3 max-w-xl text-[21px] leading-snug text-muted">{briefing.summary}</p>
          </div>
          <ul className="mt-10 border-t border-line">
            {briefing.items.map((item, i) => (
              <li
                key={item.href + item.title}
                className="rise-in flex items-center justify-between gap-6 border-b border-line py-5"
                style={{ animationDelay: `${(i + 1) * 150}ms` }}
              >
                <div className="min-w-0">
                  <p className="text-[17px] font-semibold">{item.title}</p>
                  <p className="mt-0.5 text-[15px] text-muted">{item.context}</p>
                </div>
                <Link href={item.href} className="shrink-0 whitespace-nowrap text-[15px] text-accent hover:underline">
                  {item.cta} →
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <aside className="rise-in self-start rounded-3xl bg-mist p-8 sm:p-10" style={{ animationDelay: "300ms" }} aria-label="Health score">
          <p className="text-[15px] text-muted">Health score</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className={`tabular text-[96px] font-semibold leading-none tracking-[-0.03em] ${BAND_TEXT[score.band]}`}>{score.score}</span>
            <span className="text-[17px] text-muted">/ 100</span>
          </p>
          <Gauge score={score.score} />
          <p className="mt-6 text-[21px] font-semibold leading-snug">{BAND_LINE[score.band]}</p>
          {score.reasons.length > 0 && (
            <ul className="mt-6 border-t border-line">
              {score.reasons.slice(0, 3).map((r) => (
                <li key={r.code} className="flex items-baseline justify-between gap-4 border-b border-line py-3 text-[14px]">
                  <span className="text-muted">{r.text}</span>
                  <span className="tabular shrink-0 text-faint">{r.impact} pts</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-[13px] text-faint">As of {longDate(profile.as_of)}</p>
          <Link href="/chat" className="mt-6 inline-block text-[15px] text-accent hover:underline">
            Ask the copilot →
          </Link>
        </aside>
      </section>

      <section className="mt-24 bg-mist">
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-10 px-6 py-16 text-center sm:grid-cols-3">
          <KeyNumber label="Cash covers" value={`${score.cash_runway_weeks} weeks`} note={`${pln(profile.company.cash_balance_pln)} in the bank`} />
          <KeyNumber label="Owed to you" value={pln(receivables.total_open_pln)} note={`${pln(receivables.total_overdue_pln)} of it past due`} />
          <KeyNumber
            label="Buyers to follow up"
            value={String(followUp.length)}
            note={`${pln(followUp.reduce((s, b) => s + b.overdue_pln, 0))}, ${remindAfter}+ days past due`}
          />
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-6 pt-24">
        <div className="max-w-3xl">
          <DataCompleteness />
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-6 py-24">
        <h2 className="text-[32px] font-semibold tracking-tight">Who owes you</h2>
        <p className="mt-1 text-[17px] text-muted">Buyers past their due date, longest wait first.</p>
        {late.length === 0 ? (
          <div className="mt-8 border-t border-line pt-6">
            <p className="text-[17px] text-muted">Everyone is within terms. Nothing to follow up.</p>
          </div>
        ) : (
          <ul className="mt-8 border-t border-line">
            {late.map((b) => (
              <li key={b.buyer_id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line py-5">
                <div className="min-w-0">
                  <p className="text-[17px]">{b.buyer_name}</p>
                  <p className="tabular text-[15px] text-muted">
                    {pln(b.overdue_pln)} · {b.max_days_late} days past due
                  </p>
                </div>
                {settings.drafts_enabled && followUp.includes(b) && (
                  <Link href={`/chat?buyer=${b.buyer_id}`} className="shrink-0 text-[15px] text-accent hover:underline">
                    Draft reminder
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// "Good morning" by the owner's clock in Poland, not the server's.
function greeting() {
  const hour = Number(new Date().toLocaleString("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Warsaw" }));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

type BriefingItem = { title: string; context: string; cta: string; href: string };

// Something going well, from the revenue history. Honest: only says "up" when it is.
function goodNews(profile: SmeProfile, late: BuyerReceivables[]): { headline: string; item: BriefingItem } {
  const months = profile.company.monthly_revenue ?? [];
  const recent = months.slice(-6).reduce((s, m) => s + m.amount_pln, 0);
  const earlier = months.slice(-12, -6).reduce((s, m) => s + m.amount_pln, 0);
  const growth = earlier > 0 ? Math.round(((recent - earlier) / earlier) * 100) : 0;
  const best = [...months].sort((a, b) => b.amount_pln - a.amount_pln)[0];
  if (months.length >= 12 && growth >= 3) {
    return {
      headline: `Revenue is up ${growth}% on the six months before`,
      item: {
        title: `Revenue is up ${growth}% over six months`,
        context: best ? `${shortMonth(best.month)} was your strongest month at ${pln(best.amount_pln)}.` : "Sales are growing steadily.",
        cta: "See Passport",
        href: "/bank",
      },
    };
  }
  const onTime = profile.buyers.length - late.length;
  return {
    headline: `${onTime} of ${profile.buyers.length} buyers are paying on time`,
    item: {
      title: `${onTime} of ${profile.buyers.length} buyers pay on time`,
      context: "Most of your customers are reliable.",
      cta: "See Passport",
      href: "/bank",
    },
  };
}

// Three rows: what is going well first, then what to look at.
function buildBriefing({
  profile,
  late,
  followUp,
  score,
  remindAfter,
  canDraft,
  warnWeeks,
  suggestFinancing,
}: {
  profile: SmeProfile;
  late: BuyerReceivables[];
  followUp: BuyerReceivables[]; // late buyers past the Settings threshold, longest wait first
  score: Score;
  remindAfter: number;
  canDraft: boolean;
  warnWeeks: number;
  suggestFinancing: boolean;
}): { summary: string; items: BriefingItem[] } {
  const weeks = score.cash_runway_weeks;
  const followUps = followUp.reduce((s, b) => s + b.overdue_invoices.length, 0);
  const good = goodNews(profile, late);
  const items: BriefingItem[] = [good.item];

  const top = followUp[0];
  if (top) {
    const n = top.overdue_invoices.length;
    const others = followUp.length - 1;
    items.push({
      title: `${shortName(top.buyer_name)} is ${top.max_days_late} days late`,
      context:
        `${pln(top.overdue_pln)} on ${n} ${n === 1 ? "invoice" : "invoices"}. ` +
        (others > 0
          ? `${others} more ${others === 1 ? "buyer" : "buyers"} past ${remindAfter} days after that.`
          : canDraft
            ? "A friendly reminder is ready to draft."
            : "Reminder drafts are off in Settings."),
      cta: canDraft ? "Review draft" : "Ask the copilot",
      href: canDraft ? `/chat?buyer=${top.buyer_id}` : "/chat",
    });
  }
  if (weeks < warnWeeks && suggestFinancing) {
    items.push({
      title: `Cash covers ${weeks} weeks`,
      context: "A small credit line would give you more room. Banks can make an offer on your Passport.",
      cta: "See offers",
      href: "/financing",
    });
  } else {
    items.push({
      title: "Thinking about a new printing press?",
      context: "See your cash for the next 13 weeks before you commit.",
      cta: "Check affordability",
      href: "/afford",
    });
  }

  const look = followUps > 0 ? `${followUps} ${followUps === 1 ? "invoice needs" : "invoices need"} a follow-up.` : "Nothing needs a follow-up today.";
  return { summary: `${good.headline}, and cash covers ${weeks} weeks. ${look}`, items: items.slice(0, 3) };
}

function KeyNumber({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <p className="text-[15px] text-muted">{label}</p>
      <p className="tabular mt-1 text-[40px] font-semibold leading-tight tracking-tight">{value}</p>
      <p className="mt-1 text-[14px] text-muted">{note}</p>
    </div>
  );
}

// Three bands with a marker at the score. Labels carry the meaning, not colour alone; colours stay soft.
function Gauge({ score }: { score: number }) {
  return (
    <div className="mt-6" role="img" aria-label={`Score ${score} out of 100, ${BAND_LABEL[score < 40 ? "red" : score < 70 ? "amber" : "green"]}`}>
      <div className="relative flex h-1.5 gap-1">
        <span className="h-full rounded-full bg-critical/40" style={{ width: "40%" }} />
        <span className="h-full rounded-full bg-warning/50" style={{ width: "30%" }} />
        <span className="h-full rounded-full bg-good/50" style={{ width: "30%" }} />
        <span className="absolute -top-1.5 w-0.5 rounded-full bg-ink" style={{ left: `${score}%`, height: 18 }} />
      </div>
      <div className="mt-2 flex text-[12px] text-faint">
        <span style={{ width: "40%" }}>Needs care</span>
        <span style={{ width: "30%" }}>Steady</span>
        <span style={{ width: "30%" }}>Healthy</span>
      </div>
    </div>
  );
}
