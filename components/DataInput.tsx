"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check } from "@/components/Check";
import { DocumentScan } from "@/components/DocumentScan";
import { Spinner } from "@/components/Spinner";
import { BAND_LABEL, BAND_TEXT, longDate } from "@/lib/format";
import type { ScoreBand } from "@/types/sme";

type BuyerOption = { id: string; name: string; terms: number };
type Figures = { cash_balance_pln: number; monthly_costs_pln: number };
type ScoreView = { score: number; band: ScoreBand; cash_runway_weeks: number };
type Source = "ksef" | "bank";
type Message = { text: string; error?: boolean } | null;

const INPUT = "mt-1.5 block w-full rounded-xl bg-mist px-4 py-3 text-[17px] outline-none ring-accent focus:ring-2";
const PRIMARY =
  "rounded-full bg-accent px-6 py-2.5 text-[15px] text-white transition-colors hover:bg-accent-hover disabled:bg-line disabled:text-faint";

const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

async function post<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Couldn't reach Paperbridge. Check your connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data as T;
}

const scoreChange = (before: number, after: number) => (before === after ? `Score stays at ${after}.` : `Score ${before} → ${after}.`);

export function DataInput({
  asOf,
  buyers,
  counts,
  figures,
  score,
  synced,
}: {
  asOf: string;
  buyers: BuyerOption[];
  counts: { invoices: number; open: number; payments: number };
  figures: Figures;
  score: ScoreView;
  synced: Partial<Record<Source, string>>;
}) {
  const router = useRouter();
  // Lives here so it survives KeyFigures remounting after a save.
  const [figuresMessage, setFiguresMessage] = useState<Message>(null);
  return (
    <div className="mt-12 space-y-16">
      <p className="tabular text-[15px] text-muted" aria-live="polite">
        Health score <span className={`font-semibold ${BAND_TEXT[score.band]}`}>{score.score}</span> · {BAND_LABEL[score.band]} · cash covers{" "}
        {score.cash_runway_weeks} weeks
      </p>

      <DocumentScan onDone={() => router.refresh()} />

      <section>
        <h2 className="text-[24px] font-semibold tracking-tight">Connected sources</h2>
        <ul className="mt-4 border-t border-line">
          <SourceRow source="ksef" title="KSeF" note={`${counts.invoices} e-invoices, ${counts.open} open`} syncedAt={synced.ksef} asOf={asOf} />
          <SourceRow source="bank" title="Bank" note={`${counts.payments} incoming payments matched`} syncedAt={synced.bank} asOf={asOf} />
        </ul>
      </section>

      <AddInvoice asOf={asOf} buyers={buyers} onDone={() => router.refresh()} />
      {/* Keyed by the saved figures, so a refresh after an import or a reset starts the inputs fresh. */}
      <KeyFigures
        key={`${figures.cash_balance_pln}|${figures.monthly_costs_pln}`}
        initial={figures}
        current={score}
        message={figuresMessage}
        setMessage={setFiguresMessage}
        onDone={() => router.refresh()}
      />
      <Reset onDone={() => router.refresh()} />
    </div>
  );
}

// ---- Connected sources ----

function syncLabel(iso: string | undefined, asOf: string) {
  if (!iso) return `Last synced ${longDate(asOf)}`;
  const d = new Date(iso);
  const opts = { timeZone: "Europe/Warsaw" } as const;
  const time = d.toLocaleTimeString("en-GB", { ...opts, hour: "2-digit", minute: "2-digit" });
  const day = d.toLocaleDateString("en-GB", opts);
  return day === new Date().toLocaleDateString("en-GB", opts) ? `Last synced today, ${time}` : `Last synced ${longDate(iso)}, ${time}`;
}

function SourceRow({ source, title, note, syncedAt, asOf }: { source: Source; title: string; note: string; syncedAt?: string; asOf: string }) {
  const [state, setState] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [at, setAt] = useState(syncedAt);
  const [error, setError] = useState("");

  async function sync() {
    setState("syncing");
    setError("");
    try {
      // Let the spinner turn at least once, so the sync reads as work rather than a flicker.
      const [data] = await Promise.all([post<{ synced_at: string }>("/api/data/sync", { source }), new Promise((r) => setTimeout(r, 1100))]);
      setAt(data.synced_at);
      setState("done");
      setTimeout(() => setState((s) => (s === "done" ? "idle" : s)), 2400);
    } catch (err) {
      setError((err as Error).message);
      setState("error");
    }
  }

  return (
    <li className="flex items-center justify-between gap-6 border-b border-line py-5">
      <div className="min-w-0">
        <p className="text-[17px] font-semibold">{title}</p>
        <p className="mt-0.5 text-[15px] text-muted">
          <span className="text-good">Connected</span> · {note}
        </p>
        <p className="text-[13px] text-faint" suppressHydrationWarning>
          {state === "error" ? <span className="text-critical">{error}</span> : syncLabel(at, asOf)}
        </p>
      </div>
      <button
        type="button"
        onClick={sync}
        disabled={state === "syncing"}
        className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[15px] text-accent hover:underline disabled:no-underline"
      >
        {state === "syncing" ? (
          <>
            <Spinner /> <span className="text-muted">Syncing…</span>
          </>
        ) : state === "done" ? (
          <span className="rise-in flex items-center gap-1.5 text-good">
            <Check /> Up to date
          </span>
        ) : (
          "Sync now"
        )}
      </button>
    </li>
  );
}

// ---- Add invoice ----

const NEW_BUYER = "__new";

function AddInvoice({ asOf, buyers, onDone }: { asOf: string; buyers: BuyerOption[]; onDone: () => void }) {
  const [buyerId, setBuyerId] = useState(buyers[0]?.id ?? NEW_BUYER);
  const [newName, setNewName] = useState("");
  const [newNip, setNewNip] = useState("");
  const [amount, setAmount] = useState("");
  const [issue, setIssue] = useState(asOf);
  const [dueEdit, setDueEdit] = useState<string | null>(null); // null: follows the issue date plus the buyer's terms
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const terms = buyers.find((b) => b.id === buyerId)?.terms ?? 30;
  const due = dueEdit ?? (/^\d{4}-\d{2}-\d{2}$/.test(issue) ? addDays(issue, terms) : "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const isNew = buyerId === NEW_BUYER;
      const data = await post<{ score_before: number; score_after: number }>("/api/data/invoices", {
        source: "form",
        invoices: [
          {
            ...(isNew ? { buyer_name: newName, buyer_nip: newNip } : { buyer_id: buyerId }),
            amount_pln: Number(amount.replace(",", ".")),
            issue_date: issue,
            due_date: due,
          },
        ],
      });
      setMessage({ text: `Invoice added. ${scoreChange(data.score_before, data.score_after)}` });
      setAmount("");
      setNewName("");
      setNewNip("");
      setDueEdit(null);
      onDone();
    } catch (err) {
      setMessage({ text: (err as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }

  const ready = Number(amount.replace(",", ".")) > 0 && issue && due && (buyerId !== NEW_BUYER || newName.trim());

  return (
    <section>
      <h2 className="text-[24px] font-semibold tracking-tight">Add an invoice</h2>
      <p className="mt-1 text-[15px] text-muted">For a sale that isn&apos;t in KSeF yet.</p>
      <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-[14px] text-muted">Buyer</span>
          <select value={buyerId} onChange={(e) => setBuyerId(e.target.value)} className={INPUT}>
            {buyers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
            <option value={NEW_BUYER}>New buyer…</option>
          </select>
        </label>
        {buyerId === NEW_BUYER && (
          <>
            <label className="block">
              <span className="text-[14px] text-muted">Buyer name</span>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={120} className={INPUT} autoFocus />
            </label>
            <label className="block">
              <span className="text-[14px] text-muted">NIP (optional)</span>
              <input value={newNip} onChange={(e) => setNewNip(e.target.value)} inputMode="numeric" maxLength={13} className={INPUT} />
            </label>
          </>
        )}
        <label className="block sm:col-span-2">
          <span className="text-[14px] text-muted">Amount, gross PLN</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="12 300"
            className={`${INPUT} tabular`}
          />
        </label>
        <label className="block">
          <span className="text-[14px] text-muted">Issue date</span>
          <input type="date" value={issue} max={asOf} onChange={(e) => setIssue(e.target.value)} className={INPUT} />
        </label>
        <label className="block">
          <span className="text-[14px] text-muted">Due date</span>
          <input
            type="date"
            value={due}
            min={issue}
            onChange={(e) => setDueEdit(e.target.value)}
            className={INPUT}
          />
        </label>
        <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
          <button type="submit" disabled={busy || !ready} className={PRIMARY}>
            {busy ? "Adding…" : "Add invoice"}
          </button>
          {message && (
            <p role="status" className={`rise-in text-[15px] ${message.error ? "text-critical" : "text-muted"}`}>
              {message.text}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}

// ---- Key figures ----

function KeyFigures({
  initial,
  current,
  message,
  setMessage,
  onDone,
}: {
  initial: Figures;
  current: ScoreView;
  message: Message;
  setMessage: (m: Message) => void;
  onDone: () => void;
}) {
  const [cash, setCash] = useState(String(initial.cash_balance_pln));
  const [costs, setCosts] = useState(String(initial.monthly_costs_pln));
  const [result, setResult] = useState<{ key: string; view: ScoreView } | null>(null);
  const [busy, setBusy] = useState(false);

  const next = { cash_balance_pln: Number(cash), monthly_costs_pln: Number(costs) };
  const valid = cash !== "" && costs !== "" && next.cash_balance_pln >= 0 && next.monthly_costs_pln > 0;
  const dirty = next.cash_balance_pln !== initial.cash_balance_pln || next.monthly_costs_pln !== initial.monthly_costs_pln;
  const key = `${cash}|${costs}`;
  // Only a preview of exactly what is typed now counts; an older answer is ignored.
  const preview = valid && dirty && result?.key === key ? result.view : null;

  useEffect(() => {
    if (!valid || !dirty) return;
    let live = true;
    const t = setTimeout(async () => {
      try {
        const view = await post<ScoreView>("/api/data/figures", { cash_balance_pln: Number(cash), monthly_costs_pln: Number(costs), preview: true });
        if (live) setResult({ key: `${cash}|${costs}`, view });
      } catch {
        // No preview; saving still validates.
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [cash, costs, valid, dirty]);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const data = await post<ScoreView>("/api/data/figures", next);
      setMessage({ text: `Saved. ${scoreChange(current.score, data.score)}` });
      onDone();
    } catch (err) {
      setMessage({ text: (err as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }

  const shown = preview ?? current;
  return (
    <section>
      <h2 className="text-[24px] font-semibold tracking-tight">Key figures</h2>
      <p className="mt-1 text-[15px] text-muted">See how the score and runway move before you save.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-[14px] text-muted">Bank balance, PLN</span>
          <input
            type="number"
            min={0}
            step={1000}
            value={cash}
            onChange={(e) => {
              setCash(e.target.value);
              setMessage(null);
            }}
            className={`${INPUT} tabular`}
          />
        </label>
        <label className="block">
          <span className="text-[14px] text-muted">Monthly fixed costs, PLN</span>
          <input
            type="number"
            min={1}
            step={500}
            value={costs}
            onChange={(e) => {
              setCosts(e.target.value);
              setMessage(null);
            }}
            className={`${INPUT} tabular`}
          />
        </label>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-6 rounded-2xl bg-mist px-6 py-5" aria-live="polite">
        <div>
          <p className="text-[14px] text-muted">Health score</p>
          <p className="tabular mt-1 text-[28px] font-semibold leading-tight tracking-tight">
            {preview && preview.score !== current.score && <span className="text-faint">{current.score} → </span>}
            <span className={BAND_TEXT[shown.band]}>{shown.score}</span>
          </p>
          <p className="text-[13px] text-muted">{BAND_LABEL[shown.band]}</p>
        </div>
        <div>
          <p className="text-[14px] text-muted">Cash lasts</p>
          <p className="tabular mt-1 text-[28px] font-semibold leading-tight tracking-tight">
            {preview && preview.cash_runway_weeks !== current.cash_runway_weeks && (
              <span className="text-faint">{current.cash_runway_weeks} → </span>
            )}
            {shown.cash_runway_weeks} weeks
          </p>
          <p className="text-[13px] text-muted">{preview ? "Preview, not saved" : "Current"}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button type="button" onClick={save} disabled={busy || !valid || !dirty} className={PRIMARY}>
          {busy ? "Saving…" : "Save figures"}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setCash(String(initial.cash_balance_pln));
              setCosts(String(initial.monthly_costs_pln));
            }}
            className="text-[15px] text-accent hover:underline"
          >
            Undo changes
          </button>
        )}
        {message && (
          <p role="status" className={`rise-in text-[15px] ${message.error ? "text-critical" : "text-muted"}`}>
            {message.text}
          </p>
        )}
      </div>
    </section>
  );
}

// ---- Reset ----

function Reset({ onDone }: { onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  async function reset() {
    setBusy(true);
    setMessage(null);
    try {
      await post("/api/data/reset", { confirm: true });
      setConfirming(false);
      setMessage({ text: "Demo data is back to the start." });
      onDone();
    } catch (err) {
      setMessage({ text: (err as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-t border-line pt-10">
      <h2 className="text-[24px] font-semibold tracking-tight">Reset demo data</h2>
      <p className="mt-1 text-[15px] text-muted">
        Removes added invoices, key-figure edits and simulated payments. Settings and the activity log stay.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        {confirming ? (
          <>
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="rounded-full bg-critical px-6 py-2.5 text-[15px] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Resetting…" : "Yes, reset"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="text-[15px] text-accent hover:underline">
              Cancel
            </button>
            <span className="text-[15px] text-muted">This can&apos;t be undone.</span>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              setConfirming(true);
              setMessage(null);
            }}
            className="rounded-full bg-mist px-6 py-2.5 text-[15px] text-critical transition-colors hover:bg-line"
          >
            Reset demo data
          </button>
        )}
        {message && (
          <p role="status" className={`rise-in text-[15px] ${message.error ? "text-critical" : "text-muted"}`}>
            {message.text}
          </p>
        )}
      </div>
    </section>
  );
}
