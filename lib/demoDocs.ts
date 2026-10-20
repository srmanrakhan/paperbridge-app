import type { BankLine, ImportRow } from "@/lib/importParse";

// Demo documents for the "Add documents" scan, served from public/demo-docs/.
// scripts/demo-docs.ts renders them; the PDF entries double as pre-extracted data when there is no
// ANTHROPIC_API_KEY. Fictional companies, the same ones as lib/mockData.ts.

export const DEMO_DOCS_DIR = "/demo-docs";

export const SELLER = {
  name: "Drukarnia Wisła Sp. z o.o.",
  nip: "6790000001",
  address: "ul. Przemysłowa 14, 30-701 Kraków",
  account: "PL 12 1090 2851 0000 0001 2345 6789",
};

export type DemoInvoice = {
  file: string; // PDF file name
  number: string;
  ksef_number: string;
  buyer: { name: string; nip: string; address: string };
  issue_date: string;
  sale_date: string;
  due_date: string;
  lines: { name: string; qty: number; unit: string; net_unit_pln: number }[];
  vat_pct: number;
};

export const DEMO_PDF_INVOICES: DemoInvoice[] = [
  {
    file: "faktura-FV-2026-10-021.pdf",
    number: "FV/2026/10/021",
    ksef_number: "6790000001-20261013-4F2A9C61B7D3-1E",
    buyer: { name: "Księgarnia Stary Rynek", nip: "6760000005", address: "Rynek Główny 8, 31-042 Kraków" },
    issue_date: "2026-10-13",
    sale_date: "2026-10-13",
    due_date: "2026-11-12",
    lines: [
      { name: "Druk katalogu jesiennego A4, 48 str., 500 szt.", qty: 500, unit: "szt.", net_unit_pln: 9 },
      { name: "Projekt i skład okładki", qty: 1, unit: "usł.", net_unit_pln: 1000 },
    ],
    vat_pct: 23,
  },
  {
    file: "faktura-FV-2026-10-022.pdf",
    number: "FV/2026/10/022",
    ksef_number: "6790000001-20261014-9B0D3E77A215-6C",
    buyer: { name: "Hotel Pod Wawelem", nip: "6750000007", address: "ul. Grodzka 40, 31-044 Kraków" },
    issue_date: "2026-10-14",
    sale_date: "2026-10-14",
    due_date: "2026-11-13",
    lines: [
      { name: "Druk kart menu, papier 300 g, 200 szt.", qty: 200, unit: "szt.", net_unit_pln: 11 },
      { name: "Ulotki DL, 1000 szt.", qty: 1000, unit: "szt.", net_unit_pln: 1 },
    ],
    vat_pct: 23,
  },
];

export const invoiceNet = (inv: DemoInvoice) => inv.lines.reduce((s, l) => s + l.qty * l.net_unit_pln, 0);
export const invoiceGross = (inv: DemoInvoice) => Math.round(invoiceNet(inv) * (1 + inv.vat_pct / 100) * 100) / 100;

// What reading the PDF yields: the same fields the AI extraction returns.
export function demoExtraction(file: string): ImportRow | undefined {
  const inv = DEMO_PDF_INVOICES.find((i) => i.file === file);
  if (!inv) return undefined;
  return {
    number: inv.number,
    buyer_name: inv.buyer.name,
    buyer_nip: inv.buyer.nip,
    amount_pln: invoiceGross(inv),
    issue_date: inv.issue_date,
    due_date: inv.due_date,
  };
}

// Pre-extracted fields of the bank payment confirmation PDF (Hydromat's amber demo), used when the AI is unavailable.
export const DEMO_PAYMENT_PDFS: Record<string, BankLine> = {
  "potwierdzenie_przelewu_Budarol_FV-2026-09-0002.pdf": {
    date: "2026-11-16",
    amount_pln: 138405.47,
    counterparty: "Przedsiębiorstwo Budowlane Budarol Sp. z o.o.",
    nip: "4876383146",
    title: "Zapłata za FV/2026/09/0002",
    invoice_number: "FV/2026/09/0002",
    ksef_number: "5431651667-20260901-6938EA6120FD-C8",
  },
};

// The other demo files, listed for download on /data.
export const DEMO_FILES = [
  { file: "potwierdzenie_przelewu_Budarol_FV-2026-09-0002.pdf", label: "Payment confirmation, Budarol (PDF)" },
  { file: "wyciag_bankowy_2026-11-16.csv", label: "Bank statement, 16 Nov (CSV)" },
  ...DEMO_PDF_INVOICES.map((i) => ({ file: i.file, label: `Invoice ${i.number} (PDF)` })),
  { file: "faktura-FV-2026-10-023.xml", label: "Invoice FV/2026/10/023 (KSeF XML)" },
  { file: "wyciag-2026-10-15.csv", label: "Bank statement, 15 Oct (CSV)" },
];
