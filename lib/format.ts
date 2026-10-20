import type { ScoreBand } from "@/types/sme";

// "200 000 zł": non-breaking spaces, so an amount never wraps. Same everywhere in the UI.
export const num = (n: number, digits = 0) => {
  const s = Math.abs(n)
    .toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    .replace(/,/g, " ");
  return n < 0 ? "−" + s : s;
};
export const pln = (n: number, digits = 0) => `${num(n, digits)} zł`;

export const longDate = (iso: string) =>
  new Date(iso.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

// "2026-09" -> "Sep"
export const shortMonth = (yyyyMm: string) =>
  new Date(yyyyMm + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

// "Hurtownia Bałtyk Sp. z o.o." -> "Bałtyk": drops the legal form and a leading trade word, for short headlines.
const LEGAL_FORM = /\s+(sp\.?\s*z\s*o\.?\s*o\.?|s\.?\s*a\.?|sp\.?\s*j\.?|sp\.?\s*k\.?|sp\.)$/i;
const TRADE_WORDS = /^(hurtownia|meble|agencja( reklamowa)?|księgarnia|biuro( rachunkowe)?|drukarnia|firma|przedsiębiorstwo( budowlane)?|zakład( remontowy)?|hurtownia techniczna)\s+/i;
export const companyName = (name: string) => name.replace(LEGAL_FORM, "").trim().replace(/\.$/, "");
export const shortName = (name: string) => companyName(name).replace(TRADE_WORDS, "").trim() || companyName(name);

// Calm wording: the owner should feel in control, not in trouble.
export const BAND_LABEL: Record<ScoreBand, string> = {
  red: "Needs care",
  amber: "Steady",
  green: "Healthy",
};

// One supportive line under the score.
export const BAND_LINE: Record<ScoreBand, string> = {
  red: "A few things need your care. We'll take them one at a time.",
  amber: "Steady, with a few invoices to follow up.",
  green: "In good shape. Keep doing what you're doing.",
};

export const BAND_TEXT: Record<ScoreBand, string> = {
  red: "text-critical",
  amber: "text-warning",
  green: "text-good",
};

export const BAND_BG: Record<ScoreBand, string> = {
  red: "bg-critical",
  amber: "bg-warning",
  green: "bg-good",
};
