"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionStore, AgentAction } from "@/lib/actions";
import type { AgentEvent, ChatTurn, ToolCallSummary } from "@/lib/agent";
import { BAND_TEXT, pln } from "@/lib/format";
import type { Score } from "@/types/sme";
import { AnimatedScore } from "@/components/AnimatedScore";
import { Check } from "@/components/Check";
import { StatusPill } from "@/components/StatusPill";

type Draft = AgentAction & { deciding?: boolean; error?: string };

type UserMessage = { id: number; role: "user"; content: string };
type AssistantMessage = {
  id: number;
  role: "assistant";
  text: string;
  steps: string[];
  tool_calls: ToolCallSummary[];
  drafts: Draft[];
  links: { href: string; label: string }[];
  state: "working" | "done" | "error";
  error?: string;
};
// A bank payment that arrived during the chat (demo simulation).
type PaymentMessage = {
  id: number;
  role: "payment";
  buyer_name: string;
  invoice_number: string;
  amount_pln: number;
  score_before: number;
  score_after: number;
};
type Message = UserMessage | AssistantMessage | PaymentMessage;

type SimulatedPayment = { buyer_name: string; invoice_number: string; amount_pln: number };

const SUGGESTIONS = [
  "How healthy is my business?",
  "Who owes me money?",
  "Draft reminders for buyers 30+ days late",
  "Prepare a financing pack for my bank",
  "Can I afford a printing press for 200,000 PLN?",
];

const ACTION_LABEL: Record<string, string> = {
  get_score: "Read health score",
  get_receivables: "Read receivables",
  draft_reminder: "Drafted reminder",
  build_financing_pack: "Built financing pack",
  check_affordability: "Checked affordability",
  passport_shared: "Passport shared with banks",
  offer_accepted: "Offer accepted",
  adviser_requested: "Adviser callback requested",
  approval: "Owner decision",
  payment_matched: "Payment matched",
  settings: "Settings saved",
  import: "Imported from KSeF",
};

const OFFLINE = "Couldn't reach the copilot. Check your connection and try again.";
const THINKING = "Thinking…";
const WRITING = "Writing the answer…";

let nextId = 1;

export function Chat({ initialPrompt }: { initialPrompt?: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<AgentAction[] | null>(null);
  const [logStore, setLogStore] = useState<ActionStore | null>(null);
  const [demoAi, setDemoAi] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [score, setScore] = useState<Score | null>(null);
  const [canSimulate, setCanSimulate] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const approvedAny = messages.some((m) => m.role === "assistant" && m.drafts.some((d) => d.status === "approved"));
  const sentInitial = useRef(false);
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const refreshLog = useCallback(async () => {
    try {
      const res = await fetch("/api/actions", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLog(data.actions);
      setLogStore(data.store);
      setDemoAi(Boolean(data.demo_ai));
      setLogError(null);
    } catch (err) {
      setLogError(err instanceof Error && err.message ? err.message : "The action log is unavailable.");
    }
  }, []);

  const refreshScore = useCallback(async () => {
    try {
      const res = await fetch("/api/score", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setScore(data.score);
      setCanSimulate(data.can_simulate);
    } catch {
      // The score strip is extra; the chat works without it.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads once on mount; state is set after the fetch
    refreshLog();
    refreshScore();
  }, [refreshLog, refreshScore]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function patchAssistant(id: number, fn: (m: AssistantMessage) => AssistantMessage) {
    setMessages((ms) => ms.map((m) => (m.id === id && m.role === "assistant" ? fn(m) : m)));
  }

  function apply(id: number, event: AgentEvent) {
    patchAssistant(id, (m) => {
      switch (event.type) {
        case "step": {
          // "Writing the answer…" is only a placeholder until the next real step.
          const steps = m.steps.at(-1) === WRITING ? m.steps.slice(0, -1) : m.steps;
          return { ...m, steps: [...steps, event.label] };
        }
        case "text":
          return { ...m, text: m.text + event.delta };
        case "tool":
          return { ...m, tool_calls: [...m.tool_calls, event.call] };
        case "link":
          return { ...m, links: [...m.links, { href: event.href, label: event.label }] };
        case "draft":
          return { ...m, drafts: [...m.drafts, event.action] };
        case "done":
          return { ...m, state: "done" };
        case "error":
          return { ...m, state: "error", error: event.message };
      }
    });
    if (event.type === "tool") refreshLog();
  }

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || busy) return;

      const user: UserMessage = { id: nextId++, role: "user", content: question };
      const reply: AssistantMessage = { id: nextId++, role: "assistant", text: "", steps: [], tool_calls: [], drafts: [], links: [], state: "working" };
      // The API sees plain text turns only: finished answers, never failed ones.
      const history = [...messagesRef.current, user].flatMap<ChatTurn>((m) =>
        m.role === "user"
          ? [{ role: "user", content: m.content }]
          : m.role === "assistant" && m.state === "done" && m.text
            ? [{ role: "assistant", content: m.text }]
            : [],
      );
      setMessages((ms) => [...ms, user, reply]);
      setInput("");
      setBusy(true);

      let finished = false;
      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? OFFLINE);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newline;
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line) continue;
            const event = JSON.parse(line) as AgentEvent;
            if (event.type === "done" || event.type === "error") finished = true;
            apply(reply.id, event);
          }
        }
        if (!finished) throw new Error(OFFLINE);
      } catch (err) {
        const message = err instanceof Error && err.message && !(err instanceof TypeError) ? err.message : OFFLINE;
        patchAssistant(reply.id, (m) => ({ ...m, state: "error", error: message }));
      } finally {
        setBusy(false);
        refreshLog();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply/patchAssistant only use the setState updater
    [busy, refreshLog],
  );

  // Opened from "Draft reminder" on the overview: ask once, then drop ?buyer= so a refresh doesn't ask again.
  useEffect(() => {
    if (!initialPrompt || sentInitial.current) return;
    sentInitial.current = true;
    window.history.replaceState(null, "", "/chat");
    send(initialPrompt);
  }, [initialPrompt, send]);

  function patchDraft(id: string, patch: Partial<Draft>) {
    setMessages((ms) =>
      ms.map((m) =>
        m.role === "assistant" ? { ...m, drafts: m.drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)) } : m,
      ),
    );
  }

  async function decide(id: string, decision: "approved" | "rejected") {
    patchDraft(id, { deciding: true, error: undefined });
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action_id: id, decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't save your decision. Please try again.");
      patchDraft(id, { status: (data.action as AgentAction).status, deciding: false });
    } catch (err) {
      const message = err instanceof Error && !(err instanceof TypeError) ? err.message : OFFLINE;
      patchDraft(id, { deciding: false, error: message });
    } finally {
      refreshLog();
    }
  }

  async function simulatePayment() {
    setSimulating(true);
    setSimError(null);
    try {
      const res = await fetch("/api/simulate-payment", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't simulate the payment. Please try again.");
      const p = data.payment as SimulatedPayment;
      setMessages((ms) => [
        ...ms,
        {
          id: nextId++,
          role: "payment",
          buyer_name: p.buyer_name,
          invoice_number: p.invoice_number,
          amount_pln: p.amount_pln,
          score_before: data.score_before.score,
          score_after: data.score.score,
        },
      ]);
      setScore(data.score);
      setCanSimulate(data.can_simulate);
    } catch (err) {
      setSimError(err instanceof Error && !(err instanceof TypeError) ? err.message : OFFLINE);
    } finally {
      setSimulating(false);
      refreshLog();
    }
  }

  return (
    <div className="flex h-[calc(100dvh-49px)] min-h-[520px]">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-baseline gap-2 text-[14px] text-muted">
            Health score
            {demoAi && <span className="ml-2 text-[12px] text-faint">Demo mode</span>}
            {score ? (
              <AnimatedScore value={score.score} className={`text-[21px] font-semibold transition-colors ${BAND_TEXT[score.band]}`} />
            ) : (
              <span className="text-[21px] text-faint">–</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {simError && <span className="text-[13px] text-muted">{simError}</span>}
            <button
              onClick={simulatePayment}
              disabled={simulating || !canSimulate}
              className={`rounded-full px-4 py-1.5 text-[14px] transition-colors disabled:text-faint disabled:hover:bg-mist ${approvedAny && canSimulate ? "bg-accent text-white hover:bg-accent-hover" : "bg-mist text-ink hover:bg-line"}`}
            >
              {simulating ? "Matching payment…" : canSimulate ? "Simulate incoming payment" : "All overdue invoices paid"}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-8 px-6 pb-10 pt-6">
            {messages.length === 0 && (
              <div className="pt-[8vh] text-center">
                <h1 className="text-[40px] font-semibold leading-tight tracking-[-0.01em]">Ask your copilot.</h1>
                <p className="mx-auto mt-3 max-w-xl text-[19px] leading-snug text-muted">
                  It reads your invoices and payments, drafts reminders and builds your Passport. Nothing is sent without your
                  approval.
                </p>
                <div className="mt-10 flex flex-wrap justify-center gap-2.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-full bg-mist px-5 py-2.5 text-[15px] text-ink transition-colors hover:bg-line"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[80%] rounded-[22px] bg-mist px-5 py-3 text-[17px] leading-snug">{m.content}</p>
                </div>
              ) : m.role === "payment" ? (
                <PaymentNote key={m.id} message={m} />
              ) : (
                <AssistantReply key={m.id} message={m} onDecide={decide} />
              ),
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mx-auto w-full max-w-3xl px-6 pb-6 pt-2"
        >
          <div className="flex items-center gap-2 rounded-full bg-mist py-1.5 pl-5 pr-1.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about cash, late buyers or financing"
              maxLength={4000}
              aria-label="Message"
              className="min-w-0 flex-1 bg-transparent py-2 text-[17px] outline-none placeholder:text-faint"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="rounded-full bg-accent px-5 py-2 text-[15px] text-white transition-colors hover:bg-accent-hover disabled:bg-line disabled:text-faint"
            >
              Send
            </button>
          </div>
        </form>
      </section>

      <aside className="hidden w-80 shrink-0 flex-col border-l border-line lg:flex">
        <div className="px-6 pb-3 pt-5">
          <h2 className="text-[17px] font-semibold">Activity</h2>
          <p className="text-[13px] text-muted">Every tool call and every decision is recorded.</p>
          {logStore === "memory" && <p className="mt-2 text-[13px] text-faint">Local log. Connect Supabase to keep it.</p>}
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {logError && <p className="text-[13px] text-muted">{logError}</p>}
          {log && log.length === 0 && <p className="text-[13px] text-faint">Nothing yet.</p>}
          <ol>
            {log?.map((a) => (
              <li key={a.id} className="border-b border-line py-3 last:border-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[14px]">{ACTION_LABEL[a.type] ?? a.type}</span>
                  <time className="tabular text-[12px] text-faint">
                    {new Date(a.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </time>
                </div>
                {typeof a.payload.buyer_name === "string" && <p className="text-[13px] text-muted">{a.payload.buyer_name}</p>}
                {a.status !== "logged" && (
                  <div className="mt-0.5">
                    <StatusPill status={a.status} />
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}

function PaymentNote({ message: m }: { message: PaymentMessage }) {
  const delta = m.score_after - m.score_before;
  return (
    <div className="rounded-2xl bg-mist px-5 py-4">
      <p className="flex items-center gap-2 text-[13px] text-good">
        <Check />
        Payment received and matched
      </p>
      <p className="mt-1 text-[17px]">
        {pln(m.amount_pln)} from {m.buyer_name}, matched to {m.invoice_number}.
      </p>
      <p className="tabular mt-1 text-[15px] text-muted">
        Health score {m.score_before} → {m.score_after}
        {delta !== 0 && ` (${delta > 0 ? "+" : "−"}${Math.abs(delta)})`}
      </p>
    </div>
  );
}

function AssistantReply({
  message: m,
  onDecide,
}: {
  message: AssistantMessage;
  onDecide: (id: string, d: "approved" | "rejected") => void;
}) {
  const working = m.state === "working";
  const writing = working && m.text.length > 0;
  // Once the answer is in, the steps fold into one quiet line.
  const doneSteps = m.steps.filter((s) => s !== THINKING && s !== WRITING).map((s) => s.replace(/…$/, ""));
  return (
    <div className="space-y-4">
      {m.state === "done" && doneSteps.length > 0 && (
        <p className="flex items-start gap-2 text-[13px] text-faint">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {doneSteps.join(" · ")}
        </p>
      )}
      {working && m.steps.length > 0 && (
        <ul className="space-y-1.5">
          {m.steps.map((step, i) => {
            const current = !writing && i === m.steps.length - 1;
            return (
              <li key={i} className="flex items-center gap-2 text-[15px] text-muted">
                {current ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-line border-t-muted" aria-hidden />
                ) : (
                  <Check className="h-3.5 w-3.5 text-faint" />
                )}
                {step}
              </li>
            );
          })}
        </ul>
      )}

      {m.text && (
        <p className="whitespace-pre-wrap text-[17px] leading-relaxed">
          {m.text}
          {writing && <span className="ml-0.5 inline-block h-5 w-0.5 translate-y-1 animate-pulse bg-ink" aria-hidden />}
        </p>
      )}

      {m.drafts.map((d) => (
        <DraftCard key={d.id} draft={d} onDecide={onDecide} />
      ))}

      {m.state === "error" && <p className="rounded-2xl bg-mist px-5 py-4 text-[17px]">{m.error}</p>}

      {m.state === "done" &&
        m.links.map((l) => (
          <Link key={l.href} href={l.href} className="block text-[17px] text-accent hover:underline">
            {l.label}
          </Link>
        ))}
      {m.state === "done" && m.tool_calls.some((t) => t.name === "build_financing_pack") && !m.links.some((l) => l.href === "/bank") && (
        <Link href="/bank" className="inline-block text-[17px] text-accent hover:underline">
          Open your Passport
        </Link>
      )}
    </div>
  );
}

function DraftCard({ draft, onDecide }: { draft: Draft; onDecide: (id: string, d: "approved" | "rejected") => void }) {
  const p = draft.payload as { to?: string; subject?: string; body?: string };
  return (
    <div className="rounded-2xl bg-mist p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold uppercase tracking-wide text-muted">Draft reminder</span>
        <StatusPill status={draft.status} />
      </div>
      <p className="mt-3 text-[15px] text-muted">To {p.to}</p>
      <p className="mt-1 text-[19px] font-semibold leading-snug">{p.subject}</p>
      <div className="mt-4 whitespace-pre-wrap rounded-xl bg-white px-5 py-4 text-[15px] leading-relaxed">{p.body}</div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {draft.status === "drafted" ? (
          <>
            <button
              onClick={() => onDecide(draft.id, "approved")}
              disabled={draft.deciding}
              className="rounded-full bg-accent px-6 py-2 text-[15px] text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
            >
              Approve
            </button>
            <button
              onClick={() => onDecide(draft.id, "rejected")}
              disabled={draft.deciding}
              className="rounded-full bg-white px-6 py-2 text-[15px] text-ink transition-colors hover:bg-line disabled:opacity-40"
            >
              Reject
            </button>
            <span className="text-[13px] text-muted">Nothing is sent until you approve.</span>
          </>
        ) : (
          <span className="text-[15px] text-muted">
            {draft.status === "approved" ? "Approved by you. Logged." : "Rejected by you. Logged."}
          </span>
        )}
        {draft.error && <span className="text-[13px] text-muted">{draft.error}</span>}
      </div>
    </div>
  );
}
