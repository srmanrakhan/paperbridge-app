// Data the company can add to make the score more accurate. Demo status is fixed:
// invoices and one bank account are connected, the rest is missing.
// Weights say how much each item moves the score; they add up to 100.

export type DataItem = { id: string; title: string; reason: string; weight: number; added: boolean };

export const DATA_ITEMS: DataItem[] = [
  { id: "purchase-invoices", title: "Purchase invoices", reason: "Show your costs and margins, not just sales.", weight: 35, added: true },
  { id: "bank-accounts", title: "All bank accounts", reason: "One account is connected; the rest completes the cash picture.", weight: 25, added: true },
  { id: "loans", title: "Existing loans and leases", reason: "Shows your debt and monthly repayments.", weight: 10, added: false },
  { id: "payroll", title: "Payroll and ZUS/tax payments", reason: "Your fixed costs every month.", weight: 10, added: false },
  { id: "annual-statements", title: "Last annual financial statements (KRS)", reason: "Banks compare your figures with the filed accounts.", weight: 10, added: false },
  { id: "fixed-assets", title: "Fixed assets and equipment", reason: "What the business owns and could pledge.", weight: 5, added: false },
  { id: "inventory", title: "Inventory", reason: "Stock ties up cash and counts as an asset.", weight: 5, added: false },
];

export function completenessPct(items: DataItem[] = DATA_ITEMS) {
  return Math.round(items.reduce((s, i) => s + (i.added ? i.weight : 0), 0));
}
