import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, MODEL } from "@/lib/anthropic";
import { logAction, type AgentAction } from "@/lib/actions";
import { computeAffordability, DEFAULT_ASSET } from "@/lib/affordability";
import { isDemoAI, runDemoAgent } from "@/lib/demoAgent";
import { getFinancingPack, getReceivables, getScore } from "@/lib/financeCore";
import { buildReminder, type ReminderTone } from "@/lib/reminder";
import { getProfile, getSettings, type Settings } from "@/lib/workspace";
import type { SmeProfile } from "@/types/sme";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ToolCallSummary = { name: string; action_id: string; status: AgentAction["status"]; error?: string };

// Streamed to the browser as NDJSON, one event per line.
export type AgentEvent =
  | { type: "step"; label: string } // progress line, e.g. "Reading invoices…"
  | { type: "text"; delta: string } // answer text, as it is generated
  | { type: "tool"; call: ToolCallSummary }
  | { type: "draft"; action: AgentAction } // a reminder waiting for Approve / Reject
  | { type: "link"; href: string; label: string } // a follow-up screen, e.g. the full affordability analysis
  | { type: "done" }
  | { type: "error"; message: string }; // one friendly line

export type Emit = (event: AgentEvent) => void;

export type AgentDeps = {
  client?: Pick<Anthropic, "beta">;
  log?: typeof logAction;
  settings?: Settings;
};

const MAX_TOOL_ROUNDS = 8;

const SYSTEM_PROMPT = `You are Paperbridge, a finance copilot for the owner of a small Polish B2B company.

Rules:
- Answer only from tool data. Call a tool before stating any number; never estimate or invent figures.
- Cite the numbers (PLN amounts, days late, score) that support each point.
- Keep answers short: a few sentences or a short list. The owner reads them on screen during a busy day.
- Write plain text: no headings, bold or tables. Use "- " for list items.
- You cannot send, pay or move anything. draft_reminder only creates a draft; the owner approves or rejects it with a button.
  After drafting, say the draft is waiting for their approval. Never say a reminder was sent.
- Draft reminders only for buyers with overdue invoices, and only when the owner asks for reminders.
- If the data can't answer the question, say so.`;

const NO_INPUT = { type: "object" as const, properties: {}, required: [], additionalProperties: false };

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "get_score",
    description:
      "Get the company's financial health score (0-100; red 0-40, amber 40-70, green 70-100), the reasons behind it, and how many weeks the cash lasts.",
    input_schema: NO_INPUT,
    strict: true,
  },
  {
    name: "get_receivables",
    description:
      "Get money owed to the company: open and overdue totals, and per buyer the overdue invoices with amounts, due dates and days late. Use buyer_id from here for draft_reminder.",
    input_schema: NO_INPUT,
    strict: true,
  },
  {
    name: "draft_reminder",
    description:
      "Draft a payment reminder email to one buyer for all their overdue invoices. Saves a draft for the owner to approve. Does NOT send anything.",
    input_schema: {
      type: "object",
      properties: { buyer_id: { type: "string", description: "Buyer id from get_receivables, e.g. b1" } },
      required: ["buyer_id"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "check_affordability",
    description:
      "Check whether the company can afford an investment: 13-week cash forecast with and without it, verdict, payback period and funding options (cash, bank loan, EU grant, chasing late buyers).",
    input_schema: {
      type: "object",
      properties: {
        asset_name: { type: "string", description: "What the owner wants to buy, e.g. printing press" },
        price_pln: { type: "number", description: "Price in PLN" },
      },
      required: ["asset_name", "price_pln"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "build_financing_pack",
    description:
      "Build the bank-ready financing pack: company facts, score, cash, receivables, top buyers, the financing ask, strengths and risks.",
    input_schema: NO_INPUT,
    strict: true,
  },
];

class ToolError extends Error {}

const DRAFTS_OFF = "Drafting is turned off in Settings. Ask the owner to turn on reminder drafts.";

async function draftReminder(profile: SmeProfile, buyerId: string, tone: ReminderTone) {
  const receivables = await getReceivables(profile);
  const buyer = receivables.buyers.find((b) => b.buyer_id === buyerId);
  if (!buyer) throw new ToolError(`Unknown buyer_id "${buyerId}"`);
  if (buyer.overdue_invoices.length === 0) throw new ToolError(`${buyer.buyer_name} has no overdue invoices`);

  const { subject, body } = buildReminder({
    tone,
    company: profile.company.name,
    buyer: buyer.buyer_name,
    invoices: buyer.overdue_invoices,
  });

  return {
    buyer_id: buyer.buyer_id,
    buyer_name: buyer.buyer_name,
    to: buyer.email,
    subject,
    body,
    tone,
    overdue_pln: buyer.overdue_pln,
    invoices: buyer.overdue_invoices.map((i) => i.number),
  };
}

// Runs one tool, logs it to agent_actions and reports progress. Returns the result the model sees.
export async function runTool(
  block: Anthropic.Beta.BetaToolUseBlock,
  profile: SmeProfile,
  settings: Settings,
  log: typeof logAction,
  emit: Emit,
): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
  const input = (block.input ?? {}) as Record<string, unknown>;
  try {
    let result: unknown;
    let action: AgentAction;
    switch (block.name) {
      case "get_score":
        emit({ type: "step", label: "Checking your health score…" });
        result = await getScore(profile);
        action = await log("get_score", { input, result }, "logged");
        break;
      case "get_receivables":
        emit({ type: "step", label: "Reading invoices…" });
        result = await getReceivables(profile);
        emit({ type: "step", label: "Checking payments…" });
        action = await log("get_receivables", { input, result }, "logged");
        break;
      case "check_affordability": {
        const price = Number(input.price_pln);
        if (!Number.isFinite(price) || price <= 0) throw new ToolError("price_pln must be a positive number");
        const name = typeof input.asset_name === "string" && input.asset_name ? input.asset_name : DEFAULT_ASSET.name;
        emit({ type: "step", label: "Forecasting your cash for 13 weeks…" });
        const a = computeAffordability(profile, { name, price_pln: price }, settings.safety_buffer_weeks);
        // The model gets the numbers it needs, not the full weekly series.
        result = {
          asset: a.asset,
          verdict: a.verdict,
          headline: a.headline,
          explanation: a.explanation,
          safety_buffer_pln: a.buffer_pln,
          lowest_cash_without_purchase_pln: a.min_without,
          lowest_cash_if_paid_from_cash_pln: a.min_with_cash,
          ...(a.short_pln > 0 ? { shortfall_if_paid_from_cash_pln: a.short_pln } : {}),
          loan: a.loan,
          options: a.options,
        };
        action = await log("check_affordability", { input, result }, "logged");
        emit({ type: "link", href: `/afford?asset=${encodeURIComponent(a.asset.name)}&price=${a.asset.price_pln}`, label: "See the forecast and funding options" });
        break;
      }
      case "build_financing_pack":
        emit({ type: "step", label: "Building the financing pack…" });
        result = await getFinancingPack(profile);
        action = await log("build_financing_pack", { input, result }, "logged");
        break;
      case "draft_reminder": {
        if (!settings.drafts_enabled) throw new ToolError(DRAFTS_OFF);
        if (typeof input.buyer_id !== "string") throw new ToolError("buyer_id must be a string");
        const name = profile.buyers.find((b) => b.id === input.buyer_id)?.name;
        emit({ type: "step", label: name ? `Drafting reminder to ${name}…` : "Drafting reminder…" });
        const draft = await draftReminder(profile, input.buyer_id, settings.reminder_tone);
        action = await log("draft_reminder", { input, ...draft }, "drafted");
        emit({ type: "draft", action });
        result = {
          action_id: action.id,
          status: "drafted",
          to: draft.to,
          subject: draft.subject,
          overdue_pln: draft.overdue_pln,
          note: "Draft saved. Not sent. Waiting for the owner to approve or reject.",
        };
        break;
      }
      default:
        throw new ToolError(`Unknown tool "${block.name}"`);
    }
    emit({ type: "tool", call: { name: block.name, action_id: action.id, status: action.status } });
    return { type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) };
  } catch (err) {
    if (!(err instanceof ToolError)) throw err; // infrastructure failures (DB, finance-core) abort the request
    const action = await log(block.name, { input, error: err.message }, "logged");
    emit({ type: "tool", call: { name: block.name, action_id: action.id, status: action.status, error: err.message } });
    return { type: "tool_result", tool_use_id: block.id, content: err.message, is_error: true };
  }
}

// One copilot turn: streams progress steps and answer text through `emit`, ends with "done".
// Errors are thrown; the route turns them into one friendly "error" event.
export async function runAgent(history: ChatTurn[], emit: Emit, deps: AgentDeps = {}): Promise<void> {
  // No API key (and no injected client): scripted demo answers computed from the same data and tools.
  if (!deps.client && isDemoAI()) return runDemoAgent(history, emit, deps.log ?? logAction);
  const client = deps.client ?? getAnthropic();
  const log = deps.log ?? logAction;
  emit({ type: "step", label: "Thinking…" });
  const profile = await getProfile();
  const settings = deps.settings ?? (await getSettings(profile));
  // With drafts off the model doesn't even see the tool; runTool refuses it as well.
  const tools = settings.drafts_enabled ? TOOLS : TOOLS.filter((t) => t.name !== "draft_reminder");
  const permissions = [
    settings.drafts_enabled
      ? `Owner settings: reminder drafts are on, tone "${settings.reminder_tone}". Suggest reminders only for buyers ${settings.remind_after_days}+ days late.`
      : "Owner settings: reminder drafts are OFF. If asked for a reminder, say drafting is turned off in Settings.",
    settings.financing_enabled
      ? `Warn the owner when cash lasts under ${settings.cash_warning_weeks} weeks.`
      : "Do not suggest loans or financing unless the owner asks for them.",
  ].join("\n");

  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((t) => ({ role: t.role, content: t.content }));
  let wroteText = false;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    let roundStarted = false;
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      system: `${SYSTEM_PROMPT}\n\nCompany: ${profile.company.name}. Data as of ${profile.as_of}.\n${permissions}`,
      tools,
      messages,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    stream.on("text", (delta) => {
      // Separate text from an earlier round with a blank line.
      if (!roundStarted && wroteText) emit({ type: "text", delta: "\n\n" });
      roundStarted = true;
      wroteText = true;
      emit({ type: "text", delta });
    });
    const response = await stream.finalMessage();

    if (response.stop_reason === "refusal") {
      if (!wroteText) emit({ type: "text", delta: "Sorry, I can't help with that request." });
      break;
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
    );
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

    if (round === MAX_TOOL_ROUNDS) {
      emit({ type: "text", delta: "I stopped after too many steps. Please ask again more specifically." });
      break;
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const block of toolUses) {
      results.push(await runTool(block, profile, settings, log, emit));
    }
    messages.push({ role: "user", content: results });
    emit({ type: "step", label: "Writing the answer…" });
  }

  emit({ type: "done" });
}
