"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Check } from "@/components/Check";
import { Spinner } from "@/components/Spinner";
import { DEMO_DOCS_DIR, DEMO_FILES } from "@/lib/demoDocs";
import { longDate, pln } from "@/lib/format";
import { parseFile, type BankLine, type ImportRow } from "@/lib/importParse";

type FileState = { name: string; state: "waiting" | "reading" | "done" | "error"; note?: string };

type Found = {
  invoices: { number: string; buyer: string; new_buyer: boolean; amount_pln: number; due_date: string; paid: boolean }[];
  payments: { counterparty: string; amount_pln: number; date: string; invoice_number: string | null }[];
  skipped: number;
  impact: {
    score: { before: number; after: number };
    runway_weeks: { before: number; after: number };
    overdue_pln: { before: number; after: number };
  };
  message?: string;
};

type Stage = "idle" | "reading" | "review" | "saving" | "done";

const PRIMARY =
  "rounded-full bg-accent px-6 py-2.5 text-[15px] text-white transition-colors hover:bg-accent-hover disabled:bg-line disabled:text-faint";

const kindOf = (name: string) => (/\.(pdf|xml)$/i.test(name) ? "invoice" : "document");

async function scan(body: object): Promise<Found> {
  let res: Response;
  try {
    res = await fetch("/api/data/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Couldn't reach Paperbridge. Check your connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data as Found;
}

// "Add documents": drop PDFs, KSeF XML and CSVs; we read them, show what we found, and save only on Confirm.
export function DocumentScan({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState<Stage>("idle");
  const [files, setFiles] = useState<FileState[]>([]);
  const [current, setCurrent] = useState(0);
  const [found, setFound] = useState<Found | null>(null);
  const [payload, setPayload] = useState<{ invoices: ImportRow[]; payments: BankLine[]; files: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function reset() {
    setStage("idle");
    setFiles([]);
    setFound(null);
    setPayload(null);
  }

  async function read(list: FileList | null) {
    const picked = Array.from(list ?? []).slice(0, 20);
    if (!picked.length) return;
    setError(null);
    setStage("reading");
    setFiles(picked.map((f) => ({ name: f.name, state: "waiting" })));
    const invoices: ImportRow[] = [];
    const payments: BankLine[] = [];

    // One by one, so the owner sees each file being read.
    for (const [i, file] of picked.entries()) {
      setCurrent(i);
      setFiles((fs) => fs.map((f, n) => (n === i ? { ...f, state: "reading" } : f)));
      const [result] = await Promise.all([parseFile(file), new Promise((r) => setTimeout(r, 450))]);
      invoices.push(...result.rows);
      payments.push(...(result.payments ?? []));
      const note = result.error
        ? result.error
        : [
            result.rows.length && `${result.rows.length} ${result.rows.length === 1 ? "invoice" : "invoices"}`,
            result.payments?.length && `${result.payments.length} ${result.payments.length === 1 ? "payment" : "payments"}`,
          ]
            .filter(Boolean)
            .join(", ");
      setFiles((fs) => fs.map((f, n) => (n === i ? { ...f, state: result.error ? "error" : "done", note } : f)));
    }

    if (!invoices.length && !payments.length) {
      setError("We couldn't find any invoices or payments in these files. See the notes above, or try one of the demo documents.");
      setStage("idle");
      return;
    }
    try {
      const body = { invoices, payments, files: picked.map((f) => f.name) };
      setFound(await scan(body));
      setPayload(body);
      setStage("review");
    } catch (err) {
      setError((err as Error).message);
      setStage("idle");
    }
  }

  async function confirm() {
    if (!payload) return;
    setStage("saving");
    setError(null);
    try {
      setFound(await scan({ ...payload, confirm: true }));
      setStage("done");
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setStage("review");
    }
  }

  return (
    <section>
      <h2 className="text-[24px] font-semibold tracking-tight">Add documents</h2>
      <p className="mt-1 text-[15px] text-muted">Invoices as PDF or KSeF XML, a CSV of invoices, or a bank statement. We read them for you.</p>

      {stage === "idle" && (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              read(e.dataTransfer.files);
            }}
            className={`mt-6 rounded-2xl px-6 py-14 text-center transition-colors ${over ? "bg-accent/10 ring-2 ring-accent" : "bg-mist"}`}
          >
            <p className="text-[19px]">Drop your documents here</p>
            <p className="mt-1 text-[15px] text-muted">
              or{" "}
              <button type="button" onClick={() => input.current?.click()} className="text-accent hover:underline">
                choose files
              </button>
            </p>
            <input
              ref={input}
              type="file"
              multiple
              accept=".pdf,.csv,.xml,application/pdf,text/csv,application/xml,text/xml"
              className="hidden"
              aria-label="Choose documents"
              onChange={(e) => {
                read(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          <div className="mt-4 text-[14px] text-muted">
            <span>Demo documents: </span>
            {DEMO_FILES.map((f, i) => (
              <span key={f.file}>
                {i > 0 && " · "}
                <a href={`${DEMO_DOCS_DIR}/${f.file}`} download className="text-accent hover:underline">
                  {f.label}
                </a>
              </span>
            ))}
            <span>
              {" · "}
              <a href="/examples/invoices-example.csv" download className="text-accent hover:underline">
                Invoice CSV template
              </a>
            </span>
          </div>
        </>
      )}

      {files.length > 0 && stage !== "done" && (
        <div className="mt-6">
          {stage === "reading" && (
            <p className="text-[17px]" aria-live="polite">
              Reading {kindOf(files[current]?.name ?? "")} {current + 1} of {files.length}…
            </p>
          )}
          <ul className="mt-3 border-t border-line">
            {files.map((f) => (
              <li key={f.name} className="flex items-center justify-between gap-4 border-b border-line py-3 text-[15px]">
                <span className="min-w-0 truncate">{f.name}</span>
                <span className={`flex shrink-0 items-center gap-1.5 ${f.state === "error" ? "text-critical" : "text-muted"}`}>
                  {f.state === "reading" && <Spinner />}
                  {f.state === "done" && <Check className="h-3.5 w-3.5 text-good" />}
                  {f.state === "waiting" ? "Waiting" : f.state === "reading" ? "Reading…" : f.note}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(stage === "review" || stage === "saving") && found && (
        <Review found={found} busy={stage === "saving"} onConfirm={confirm} onCancel={reset} />
      )}

      {stage === "done" && found?.message && (
        <div className="rise-in mt-6 rounded-2xl bg-mist px-6 py-6">
          <p className="flex items-center gap-2 text-[19px] font-semibold">
            <Check className="h-5 w-5 text-good" />
            {found.message}
          </p>
          <div className="mt-4 flex flex-wrap gap-6 text-[15px]">
            <Link href="/dashboard" className="text-accent hover:underline">
              See your overview →
            </Link>
            <button type="button" onClick={reset} className="text-accent hover:underline">
              Add more documents
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rise-in mt-4 text-[15px] text-critical">
          {error}
        </p>
      )}
    </section>
  );
}

function Review({ found, busy, onConfirm, onCancel }: { found: Found; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  const { impact } = found;
  return (
    <div className="rise-in mt-10">
      <h3 className="text-[21px] font-semibold">Here&apos;s what we found</h3>

      {found.invoices.length > 0 && (
        <>
          <p className="mt-5 text-[14px] text-muted">New invoices</p>
          <ul className="mt-1 border-t border-line">
            {found.invoices.map((i) => (
              <li key={i.number} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-0.5 border-b border-line py-3">
                <div className="min-w-0">
                  <p className="text-[17px]">
                    {i.buyer}
                    {i.new_buyer && <span className="ml-2 text-[13px] text-muted">New buyer</span>}
                  </p>
                  <p className="text-[14px] text-muted">
                    {i.number} · {i.paid ? "already paid" : `due ${longDate(i.due_date)}`}
                  </p>
                </div>
                <span className="tabular shrink-0 text-[17px]">{pln(i.amount_pln)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {found.payments.length > 0 && (
        <>
          <p className="mt-6 text-[14px] text-muted">Payments received</p>
          <ul className="mt-1 border-t border-line">
            {found.payments.map((p, n) => (
              <li key={n} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-0.5 border-b border-line py-3">
                <div className="min-w-0">
                  <p className="text-[17px]">{p.counterparty || "Unknown payer"}</p>
                  <p className="text-[14px] text-muted">
                    {longDate(p.date)} ·{" "}
                    {p.invoice_number ? (
                      <span className="text-good">Paid {p.invoice_number}, matched to your invoice</span>
                    ) : (
                      "No matching invoice, so it won't be added"
                    )}
                  </p>
                </div>
                <span className="tabular shrink-0 text-[17px]">{pln(p.amount_pln)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {found.skipped > 0 && (
        <p className="mt-4 text-[14px] text-muted">
          {found.skipped} {found.skipped === 1 ? "invoice is" : "invoices are"} already on file and will be skipped.
        </p>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 rounded-2xl bg-mist px-6 py-6 sm:grid-cols-3">
        <Impact label="Health score" before={String(impact.score.before)} after={String(impact.score.after)} />
        <Impact label="Cash covers" before={`${impact.runway_weeks.before}`} after={`${impact.runway_weeks.after} weeks`} />
        <Impact label="Past due" before={pln(impact.overdue_pln.before)} after={pln(impact.overdue_pln.after)} />
      </div>

      <div className="mt-6 flex items-center gap-5">
        <button type="button" onClick={onConfirm} disabled={busy} className={PRIMARY}>
          {busy ? "Saving…" : "Confirm"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="text-[15px] text-accent hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}

function Impact({ label, before, after }: { label: string; before: string; after: string }) {
  const same = before === after || after.startsWith(`${before} `);
  return (
    <div>
      <p className="text-[14px] text-muted">{label}</p>
      <p className="tabular mt-1 text-[21px] font-semibold leading-tight">
        {!same && <span className="font-normal text-faint">{before} → </span>}
        {after}
      </p>
    </div>
  );
}
