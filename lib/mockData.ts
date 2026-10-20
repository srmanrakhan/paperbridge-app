import hydromat from "@/lib/hydromatProfile.json";
import type { SmeProfile } from "@/types/sme";

// Fictional demo company. All names, NIPs and emails are made up (.example domains never resolve).
// Story: printing house with 3 buyers paying 30+ days late; cash lasts ~5 weeks.
export const DRUKARNIA_PROFILE: SmeProfile = {
  as_of: "2026-10-15",
  company: {
    id: "c1",
    name: "Drukarnia Wisła Sp. z o.o.",
    nip: "6790000001",
    city: "Kraków",
    industry: "Printing and packaging",
    address: "ul. Przemysłowa 14, 30-701 Kraków",
    annual_revenue_pln: 912_000,
    cash_balance_pln: 85_000,
    monthly_costs_pln: 73_500, // ~16,960 PLN/week -> 85,000 lasts 5 weeks
    // Last 12 full months; adds up to annual_revenue_pln.
    monthly_revenue: [
      { month: "2025-10", amount_pln: 74_200 },
      { month: "2025-11", amount_pln: 78_900 },
      { month: "2025-12", amount_pln: 69_400 },
      { month: "2026-01", amount_pln: 61_800 },
      { month: "2026-02", amount_pln: 66_300 },
      { month: "2026-03", amount_pln: 75_600 },
      { month: "2026-04", amount_pln: 79_100 },
      { month: "2026-05", amount_pln: 82_400 },
      { month: "2026-06", amount_pln: 80_700 },
      { month: "2026-07", amount_pln: 77_900 },
      { month: "2026-08", amount_pln: 81_300 },
      { month: "2026-09", amount_pln: 84_400 },
    ],
  },
  buyers: [
    { id: "b1", name: "Hurtownia Bałtyk Sp. z o.o.", nip: "5830000002", email: "ksiegowosc@baltyk-hurt.example", payment_terms_days: 30 },
    { id: "b2", name: "Meble Kowalczyk S.A.", nip: "7770000003", email: "platnosci@meble-kowalczyk.example", payment_terms_days: 30 },
    { id: "b3", name: "Agencja Reklamowa Pixel", nip: "5250000004", email: "biuro@pixel-agencja.example", payment_terms_days: 30 },
    { id: "b4", name: "Księgarnia Stary Rynek", nip: "6760000005", email: "faktury@stary-rynek.example", payment_terms_days: 30 },
    { id: "b5", name: "Biuro Rachunkowe Nowak", nip: "9450000006", email: "kontakt@nowak-biuro.example", payment_terms_days: 30 },
    { id: "b6", name: "Hotel Pod Wawelem", nip: "6750000007", email: "zakupy@hotel-wawel.example", payment_terms_days: 30 },
  ],
  invoices: [
    // Open and overdue
    { id: "i01", number: "FV/2026/07/028", buyer_id: "b1", issue_date: "2026-07-29", due_date: "2026-08-28", amount_pln: 18_450, status: "open" },
    { id: "i02", number: "FV/2026/08/013", buyer_id: "b1", issue_date: "2026-08-13", due_date: "2026-09-12", amount_pln: 12_300, status: "open" },
    { id: "i03", number: "FV/2026/08/006", buyer_id: "b2", issue_date: "2026-08-06", due_date: "2026-09-05", amount_pln: 24_600, status: "open" },
    { id: "i04", number: "FV/2026/08/011", buyer_id: "b3", issue_date: "2026-08-11", due_date: "2026-09-10", amount_pln: 7_380, status: "open" },
    { id: "i05", number: "FV/2026/09/006", buyer_id: "b6", issue_date: "2026-09-06", due_date: "2026-10-06", amount_pln: 4_920, status: "open" },
    // Open, not yet due
    { id: "i06", number: "FV/2026/09/025", buyer_id: "b2", issue_date: "2026-09-25", due_date: "2026-10-25", amount_pln: 9_840, status: "open" },
    { id: "i07", number: "FV/2026/09/030", buyer_id: "b4", issue_date: "2026-09-30", due_date: "2026-10-30", amount_pln: 6_150, status: "open" },
    { id: "i08", number: "FV/2026/10/006", buyer_id: "b5", issue_date: "2026-10-06", due_date: "2026-11-05", amount_pln: 3_690, status: "open" },
    // Paid (history)
    { id: "i09", number: "FV/2026/05/026", buyer_id: "b1", issue_date: "2026-05-26", due_date: "2026-06-25", amount_pln: 15_990, status: "paid" },
    { id: "i10", number: "FV/2026/06/015", buyer_id: "b2", issue_date: "2026-06-15", due_date: "2026-07-15", amount_pln: 21_525, status: "paid" },
    { id: "i11", number: "FV/2026/06/020", buyer_id: "b3", issue_date: "2026-06-20", due_date: "2026-07-20", amount_pln: 6_765, status: "paid" },
    { id: "i12", number: "FV/2026/07/021", buyer_id: "b6", issue_date: "2026-07-21", due_date: "2026-08-20", amount_pln: 5_535, status: "paid" },
    { id: "i13", number: "FV/2026/08/016", buyer_id: "b4", issue_date: "2026-08-16", due_date: "2026-09-15", amount_pln: 8_610, status: "paid" },
    { id: "i14", number: "FV/2026/08/021", buyer_id: "b5", issue_date: "2026-08-21", due_date: "2026-09-20", amount_pln: 3_690, status: "paid" },
    { id: "i15", number: "FV/2026/09/010", buyer_id: "b4", issue_date: "2026-09-10", due_date: "2026-10-10", amount_pln: 7_995, status: "paid" },
  ],
  payments: [
    { id: "p01", invoice_id: "i09", buyer_id: "b1", date: "2026-08-03", amount_pln: 15_990 }, // 39 days late
    { id: "p02", invoice_id: "i10", buyer_id: "b2", date: "2026-08-20", amount_pln: 21_525 }, // 36 days late
    { id: "p03", invoice_id: "i11", buyer_id: "b3", date: "2026-08-24", amount_pln: 6_765 }, // 35 days late
    { id: "p04", invoice_id: "i12", buyer_id: "b6", date: "2026-08-27", amount_pln: 5_535 }, // 7 days late
    { id: "p05", invoice_id: "i13", buyer_id: "b4", date: "2026-09-14", amount_pln: 8_610 },
    { id: "p06", invoice_id: "i14", buyer_id: "b5", date: "2026-09-18", amount_pln: 3_690 },
    { id: "p07", invoice_id: "i15", buyer_id: "b4", date: "2026-10-09", amount_pln: 7_995 },
  ],
};

// Finance-core's amber demo company (Hurtownia Techniczna Hydromat), trimmed by scripts/hydromat-profile.mjs.
export const HYDROMAT_PROFILE = hydromat as SmeProfile;

// Mock mode serves Hydromat unless DEMO_COMPANY=drukarnia.
export const DEMO_PROFILE: SmeProfile = process.env.DEMO_COMPANY === "drukarnia" ? DRUKARNIA_PROFILE : HYDROMAT_PROFILE;
