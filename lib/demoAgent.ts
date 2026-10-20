import type Anthropic from "@anthropic-ai/sdk";
import type { logAction } from "@/lib/actions";
import { DEFAULT_ASSET } from "@/lib/affordability";
import type { AgentEvent, ChatTurn, Emit } from "@/lib/agent";
import { getReceivables, getScore } from "@/lib/financeCore";
import { BAND_LINE, pln } from "@/lib/format";
import { getProfile, getSettings } from "@/lib/workspace";

// Copilot demo mode: with no ANTHROPIC_API_KEY the copilot answers with scripted text built from the same
// tools and the same data. Same events, same UI. Nothing here is invented: every number comes from a tool result.

export function isDemoAI(): boolean {
  return !process.env.ANTHROPIC_API_KEY;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Streams text a few words at a time so it looks like a live answer.
async function say(emit: Emit, text: string) {
  const parts = text.match(/\S+\s*/g) ?? [];
  for (let i = 0; i < parts.length; i += 2) {
    emit({ type: "text", delta: parts.slice(i, i + 2).join("") });
    await sleep(28);
  }
}

async function step(emit: Emit, label: string) {
  emit({ type: "step", label });
  await sleep(450);
}

function parsePrice(text: string): number | undefined {
  const k = text.match(/(\d+(?:[.,]\d+)?)\s*k\b/i);
  if (k) return Math.round(parseFloat(k[1].replace(",", ".")) * 1000);
  const n = text.match(/\d{1,3}(?:[ ,. ]\d{3})+|\d{4,}/);
  return n ? parseInt(n[0].replace(/\D/g, ""), 10) : undefined;
}

function parseAsset(text: string): string {
  const m = text.match(/\b(?:buy|buying|purchase|get|invest in|afford)\s+(?:a|an|the|new)?\s*([a-z][a-z -]{2,30}?)(?:\s+(?:for|costing|at|worth)\b|[?.,]|\s+\d|$)/i);
  const name = m?.[1]?.trim();
  if (name && !/^(it|this|that|something)$/i.test(name)) return name.charAt(0).toUpperCase() + name.slice(1);
  return DEFAULT_ASSET.name;
}

export async function runDemoAgent(history: ChatTurn[], emit: Emit, log: typeof logAction): Promise<void> {
  const { runTool } = await import("@/lib/agent");
  const question = history.at(-1)?.content ?? "";
  const q = question.toLowerCase();
  emit({ type: "step", label: "Thinking…" });
  await sleep(350);

  const profile = await getProfile();
  const settings = await getSettings(profile);
  let n = 0;
  const call = async (name: string, input: Record<string, unknown> = {}) => {
    const block = { type: "tool_use", id: `demo-${++n}`, name, input } as unknown as Anthropic.Beta.BetaToolUseBlock;
    const res = await runTool(block, profile, settings, log, emit);
    await sleep(300);
    return JSON.parse(typeof res.content === "string" && !res.is_error ? res.content : "{}");
  };

  const wantsAfford = /afford|invest|buy|purchase|press|machine|equipment|loan|fund/.test(q) && !/reminder|draft/.test(q);
  const wantsReminders = /remind|draft|chase|nudge|late buyers/.test(q);
  const wantsPack = /pack|passport|bank|financing pack/.test(q);
  const wantsOwed = /owe|overdue|receivable|unpaid|invoice/.test(q);

  if (wantsAfford) {
    const price = parsePrice(question) ?? DEFAULT_ASSET.price_pln;
    const asset = parseAsset(question);
    const r = await call("check_affordability", { asset_name: asset, price_pln: price });
    emit({ type: "step", label: "Writing the answer…" });
    await say(
      emit,
      `${r.headline} ${r.explanation}\n\n` +
        `Open the forecast below to see the 13-week cash line${r.verdict === "yes" ? "" : " and your options"}.`,
    );
  } else if (wantsReminders) {
    const rec = await getReceivables(profile);
    await call("get_receivables");
    const byName = rec.buyers.filter((b) => b.overdue_pln > 0 && q.includes(b.buyer_name.toLowerCase().split(" ")[0]));
    // "buyers 45+ days late" uses that number; otherwise the owner's threshold from Settings.
    const minDays = Number(q.match(/(\d+)\+?\s*days/)?.[1] ?? settings.remind_after_days);
    const targets = byName.length ? byName : rec.buyers.filter((b) => b.max_days_late >= minDays).slice(0, 3);
    emit({ type: "step", label: "Writing the answer…" });
    if (!targets.length) {
      await say(emit, `No buyer is ${minDays}+ days late at the moment, so there is nothing to remind anyone about.`);
    } else {
      for (const b of targets) await call("draft_reminder", { buyer_id: b.buyer_id });
      await say(
        emit,
        `I drafted ${targets.length} ${targets.length === 1 ? "reminder" : "reminders"} for ${pln(targets.reduce((s, b) => s + b.overdue_pln, 0))} of late invoices:\n` +
          targets.map((b) => `- ${b.buyer_name}: ${pln(b.overdue_pln)}, ${b.max_days_late} days late`).join("\n") +
          `\n\nNothing has been sent. Approve or reject each draft below.`,
      );
    }
  } else if (wantsPack) {
    await call("build_financing_pack");
    emit({ type: "step", label: "Writing the answer…" });
    const score = await getScore(profile);
    await say(
      emit,
      `Your Passport is ready. It shows a health score of ${score.score}, cash of ${pln(profile.company.cash_balance_pln)} lasting ${score.cash_runway_weeks} weeks, and your receivables. Nothing is shared with a bank until you agree.`,
    );
    emit({ type: "link", href: "/bank", label: "Open your Passport" });
  } else if (wantsOwed) {
    const rec = await getReceivables(profile);
    await call("get_receivables");
    emit({ type: "step", label: "Writing the answer…" });
    const late = rec.buyers.filter((b) => b.overdue_pln > 0);
    await say(
      emit,
      `Customers owe you ${pln(rec.total_open_pln)}, of which ${pln(rec.total_overdue_pln)} is overdue:\n` +
        late.map((b) => `- ${b.buyer_name}: ${pln(b.overdue_pln)}, ${b.max_days_late} days late`).join("\n") +
        `\n\nI can draft reminders for them. Just ask.`,
    );
  } else {
    const score = await getScore(profile);
    await call("get_score");
    emit({ type: "step", label: "Writing the answer…" });
    await say(
      emit,
      `Your health score is ${score.score} out of 100: ${BAND_LINE[score.band].charAt(0).toLowerCase()}${BAND_LINE[score.band].slice(1)} Cash covers ${score.cash_runway_weeks} weeks.\n` +
        score.reasons.slice(0, 3).map((r) => `- ${r.text} (${r.impact} points)`).join("\n") +
        `\n\nChasing late buyers is the quickest way to raise it. Planning an investment? Ask me if you can afford it.`,
    );
  }

  emit({ type: "done" } satisfies AgentEvent);
}
