// Generates the demo documents in public/demo-docs/ (served at /demo-docs):
// 2 invoice PDFs, 1 KSeF FA(3) XML invoice and 1 bank statement CSV, plus the PDF hashes the scan
// uses to recognise them without an API key. PDFs are printed from HTML with headless Chrome or Edge.
// Run: npm run demo-docs
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEMO_PDF_INVOICES, SELLER, invoiceGross, invoiceNet, type DemoInvoice } from "../lib/demoDocs";

const OUT = path.join("public", "demo-docs");
const BROWSERS = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter((p): p is string => Boolean(p));

const money = (n: number) => n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (iso: string) => iso.split("-").reverse().join(".");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function invoiceHtml(inv: DemoInvoice): string {
  const net = invoiceNet(inv);
  const gross = invoiceGross(inv);
  const vat = Math.round((gross - net) * 100) / 100;
  const rows = inv.lines
    .map((l, i) => {
      const lineNet = l.qty * l.net_unit_pln;
      return `<tr><td>${i + 1}</td><td>${esc(l.name)}</td><td class="r">${l.qty}</td><td>${l.unit}</td><td class="r">${money(l.net_unit_pln)}</td><td class="r">${money(lineNet)}</td><td class="r">${inv.vat_pct}%</td><td class="r">${money(lineNet * (1 + inv.vat_pct / 100))}</td></tr>`;
    })
    .join("");
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Faktura ${inv.number}</title><style>
    @page { size: A4; margin: 16mm; }
    body { font-family: "Segoe UI", Helvetica, Arial, sans-serif; color: #1d1d1f; font-size: 10.5pt; }
    h1 { font-size: 20pt; margin: 0; } .muted { color: #6e6e73; } .r { text-align: right; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; }
    .parties { display: flex; gap: 40px; margin-top: 28px; } .parties div { flex: 1; }
    .label { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .06em; color: #6e6e73; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 28px; }
    th { font-size: 8.5pt; font-weight: 600; text-align: left; color: #6e6e73; border-bottom: 1px solid #d2d2d7; padding: 6px 4px; }
    td { border-bottom: 1px solid #e8e8ed; padding: 6px 4px; vertical-align: top; }
    .sum { margin-top: 18px; margin-left: auto; width: 300px; } .sum div { display: flex; justify-content: space-between; padding: 3px 0; }
    .due { font-size: 14pt; font-weight: 600; border-top: 1px solid #1d1d1f; margin-top: 6px; padding-top: 6px !important; }
    .foot { margin-top: 36px; font-size: 9pt; }
  </style></head><body>
    <div class="top">
      <div><h1>Faktura VAT</h1><div style="font-size:13pt;margin-top:4px">nr ${inv.number}</div>
        <div class="muted" style="margin-top:6px">Numer KSeF: ${inv.ksef_number}</div></div>
      <div class="r"><div>Data wystawienia: ${date(inv.issue_date)}</div><div>Data sprzedaży: ${date(inv.sale_date)}</div>
        <div>Miejsce wystawienia: Kraków</div></div>
    </div>
    <div class="parties">
      <div><div class="label">Sprzedawca</div><strong>${esc(SELLER.name)}</strong><br>${esc(SELLER.address)}<br>NIP: ${SELLER.nip}</div>
      <div><div class="label">Nabywca</div><strong>${esc(inv.buyer.name)}</strong><br>${esc(inv.buyer.address)}<br>NIP: ${inv.buyer.nip}</div>
    </div>
    <table><thead><tr><th>Lp.</th><th>Nazwa towaru lub usługi</th><th class="r">Ilość</th><th>J.m.</th><th class="r">Cena netto</th><th class="r">Wartość netto</th><th class="r">VAT</th><th class="r">Wartość brutto</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <div class="sum">
      <div><span>Razem netto</span><span>${money(net)} PLN</span></div>
      <div><span>VAT ${inv.vat_pct}%</span><span>${money(vat)} PLN</span></div>
      <div class="due"><span>Do zapłaty</span><span>${money(gross)} PLN</span></div>
    </div>
    <div class="foot">
      <div>Sposób płatności: przelew · Termin płatności: <strong>${date(inv.due_date)}</strong></div>
      <div>Numer rachunku: ${SELLER.account}</div>
      <div class="muted" style="margin-top:18px">Faktura wystawiona w Krajowym Systemie e-Faktur (KSeF). Dokument demonstracyjny, dane fikcyjne.</div>
    </div>
  </body></html>`;
}

const KSEF_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Demo KSeF FA(3) e-invoice, trimmed to the main fields. Fictional companies. -->
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <DataWytworzeniaFa>2026-10-15T08:12:00Z</DataWytworzeniaFa>
  </Naglowek>
  <Podmiot1>
    <DaneIdentyfikacyjne><NIP>${SELLER.nip}</NIP><Nazwa>${SELLER.name}</Nazwa></DaneIdentyfikacyjne>
  </Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne><NIP>9450000006</NIP><Nazwa>Biuro Rachunkowe Nowak</Nazwa></DaneIdentyfikacyjne>
  </Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>2026-10-15</P_1>
    <P_2>FV/2026/10/023</P_2>
    <P_13_1>2000.00</P_13_1>
    <P_14_1>460.00</P_14_1>
    <P_15>2460.00</P_15>
    <RodzajFaktury>VAT</RodzajFaktury>
    <FaWiersz>
      <NrWierszaFa>1</NrWierszaFa>
      <P_7>Druk teczek firmowych z logo, 400 szt.</P_7>
      <P_8A>szt.</P_8A>
      <P_8B>400</P_8B>
      <P_9A>5.00</P_9A>
      <P_11>2000.00</P_11>
      <P_12>23</P_12>
    </FaWiersz>
    <Platnosc>
      <TerminPlatnosci><Termin>2026-11-14</Termin></TerminPlatnosci>
      <FormaPlatnosci>6</FormaPlatnosci>
    </Platnosc>
  </Fa>
</Faktura>
`;

// Polish bank export style: semicolons, decimal commas. Bałtyk pays FV/2026/07/028 (18,450 PLN, due 28 Aug).
const BANK_CSV = `Data operacji;Data księgowania;Kontrahent;NIP kontrahenta;Tytuł;Kwota;Waluta
2026-10-14;2026-10-14;Hurtownia Bałtyk Sp. z o.o.;5830000002;Zapłata za FV/2026/07/028;18450,00;PLN
`;

function browser(): string {
  const found = BROWSERS.find((p) => existsSync(p));
  if (!found) throw new Error("Chrome or Edge not found. Set CHROME_PATH to a Chromium browser.");
  return found;
}

mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(path.join(tmpdir(), "paperbridge-docs-"));
const hashes: Record<string, string> = {};
for (const inv of DEMO_PDF_INVOICES) {
  const html = path.join(tmp, inv.file.replace(/\.pdf$/, ".html"));
  writeFileSync(html, invoiceHtml(inv));
  const pdf = path.resolve(OUT, inv.file);
  execFileSync(browser(), ["--headless", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${pdf}`, html], { stdio: "ignore" });
  hashes[createHash("sha256").update(readFileSync(pdf)).digest("hex")] = inv.file;
  console.log(`${inv.file}: ${invoiceGross(inv)} PLN`);
}
writeFileSync(path.join(OUT, "faktura-FV-2026-10-023.xml"), KSEF_XML);
writeFileSync(path.join(OUT, "wyciag-2026-10-15.csv"), "\uFEFF" + BANK_CSV);
writeFileSync(path.join("lib", "demoDocs.hashes.json"), JSON.stringify(hashes, null, 2) + "\n");
console.log(`Wrote ${OUT} and lib/demoDocs.hashes.json`);
