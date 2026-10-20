import { createHash } from "node:crypto";
import { getAnthropic, MODEL } from "@/lib/anthropic";
import { DEMO_PAYMENT_PDFS, demoExtraction } from "@/lib/demoDocs";
import hashes from "@/lib/demoDocs.hashes.json";
import { referencesIn, type BankLine, type ImportRow } from "@/lib/importParse";

// POST /api/data/extract  multipart form with one PDF ("file") -> { kind: "invoice", invoice, source } or { kind: "payment", payment, source }
// With ANTHROPIC_API_KEY, Claude reads the PDF (an invoice or a bank payment confirmation) and returns the fields as JSON.
// Without it (or if that fails), the demo PDFs from /demo-docs are recognised by content hash or file name and their
// pre-extracted fields used. Anything else gets a plain message.
const MAX_BYTES = 5_000_000;

const SCHEMA = {
  type: "object",
  properties: {
    document_type: {
      type: "string",
      enum: ["invoice", "payment_confirmation", "other"],
      description:
        "invoice = a VAT invoice (faktura) issued by a seller. payment_confirmation = a bank confirmation of a money transfer (potwierdzenie przelewu). other = anything else.",
    },
    invoice_number: { type: "string", description: "Invoice: its number. Payment confirmation: the invoice number named in the transfer title (e.g. FV/2026/09/0002). Else empty." },
    ksef_number: { type: "string", description: "KSeF number (e.g. 5431651667-20260901-6938EA6120FD-C8) printed on the document, or empty" },
    party_name: { type: "string", description: "Invoice: the buyer (Nabywca). Payment confirmation: the payer (Nadawca)." },
    party_nip: { type: "string", description: "NIP of that party, digits only, or empty" },
    amount_pln: { type: "number", description: "Invoice: total to pay, gross (Do zapłaty / brutto). Payment confirmation: the transferred amount (Kwota). In PLN." },
    date: { type: "string", description: "Invoice: issue date (Data wystawienia). Payment confirmation: booking date (Data księgowania). YYYY-MM-DD, or empty" },
    due_date: { type: "string", description: "Invoice only: payment due date (Termin płatności), YYYY-MM-DD, or empty" },
    transfer_title: { type: "string", description: "Payment confirmation only: the transfer title (Tytuł przelewu), or empty" },
  },
  required: ["document_type", "invoice_number", "ksef_number", "party_name", "party_nip", "amount_pln", "date", "due_date", "transfer_title"],
  additionalProperties: false,
};

const PROMPT =
  "This is a Polish finance document: either a VAT invoice or a bank payment confirmation (potwierdzenie przelewu). " +
  "First decide document_type. A bank confirmation has a sender (Nadawca), a recipient (Odbiorca) and a transfer title; it is NOT an invoice. " +
  "Then extract the fields in the schema exactly as printed. Convert dates to YYYY-MM-DD. " +
  "If a field is not on the document, return an empty string. Do not guess.";

type Extracted = { kind: "invoice"; invoice: ImportRow } | { kind: "payment"; payment: BankLine } | { kind: "other" };

const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

async function readWithClaude(pdf: Buffer): Promise<Extracted> {
  const response = await getAnthropic().beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("refusal");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("no text block");
  const f = JSON.parse(text.text) as Record<string, string | number>;
  console.log("PDF extraction result:", f);

  const nip = String(f.party_nip).replace(/\D/g, "") || undefined;
  if (f.document_type === "payment_confirmation") {
    const title = String(f.transfer_title);
    const refs = referencesIn(`${title} ${f.invoice_number} ${f.ksef_number}`);
    return {
      kind: "payment",
      payment: {
        date: String(f.date),
        amount_pln: Number(f.amount_pln),
        counterparty: String(f.party_name),
        nip,
        title,
        invoice_number: String(f.invoice_number) || refs.invoice_number,
        ksef_number: String(f.ksef_number) || refs.ksef_number,
      },
    };
  }
  if (f.document_type === "invoice") {
    const issue = String(f.date);
    return {
      kind: "invoice",
      invoice: {
        number: String(f.invoice_number) || undefined,
        buyer_name: String(f.party_name),
        buyer_nip: nip,
        amount_pln: Number(f.amount_pln),
        issue_date: issue,
        due_date: String(f.due_date) || (/^\d{4}-\d{2}-\d{2}$/.test(issue) ? addDays(issue, 30) : ""),
      },
    };
  }
  return { kind: "other" };
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose a PDF." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "The PDF is larger than 5 MB." }, { status: 400 });

  const pdf = Buffer.from(await file.arrayBuffer());
  if (pdf.subarray(0, 5).toString() !== "%PDF-") return Response.json({ error: "This file isn't a PDF." }, { status: 400 });

  const hash = createHash("sha256").update(pdf).digest("hex");
  const demoName = (hashes as Record<string, string>)[hash] ?? file.name;
  const demoInvoice = demoExtraction(demoName);
  const demoPayment = DEMO_PAYMENT_PDFS[demoName];
  const demo: Extracted | undefined = demoPayment ? { kind: "payment", payment: demoPayment } : demoInvoice ? { kind: "invoice", invoice: demoInvoice } : undefined;
  const reply = (r: Extracted, source: "ai" | "demo") => {
    if (r.kind === "payment") return Response.json({ kind: "payment", payment: r.payment, source });
    if (r.kind === "invoice") return Response.json({ kind: "invoice", invoice: r.invoice, source });
    return Response.json(
      { error: "This PDF isn't an invoice or a bank payment confirmation, so there's nothing to add. Try a Polish VAT invoice or a transfer confirmation." },
      { status: 422 },
    );
  };

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return reply(await readWithClaude(pdf), "ai");
    } catch (err) {
      console.error(`PDF extraction failed for ${file.name}:`, err);
      if (!demo) return Response.json({ error: "Couldn't read this PDF. Please try again." }, { status: 502 });
    }
  } else {
    console.warn(`ANTHROPIC_API_KEY is missing, so ${file.name} can't be read by AI.`);
  }
  if (demo) return reply(demo, "demo");
  return Response.json(
    { error: "Reading your own PDFs needs the AI connected (ANTHROPIC_API_KEY). The demo PDFs work without it." },
    { status: 422 },
  );
}
