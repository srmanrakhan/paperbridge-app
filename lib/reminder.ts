import { longDate, pln } from "@/lib/format";

// Payment reminder text in the owner's chosen tone. Pure, so the agent and the Settings preview share it.

export type ReminderTone = "friendly" | "neutral" | "firm";

export const REMINDER_TONES: ReminderTone[] = ["friendly", "neutral", "firm"];

export type ReminderInvoice = { number: string; amount_pln: number; due_date: string; days_late: number };

export function buildReminder({
  tone,
  company,
  buyer,
  invoices,
}: {
  tone: ReminderTone;
  company: string;
  buyer: string;
  invoices: ReminderInvoice[];
}): { subject: string; body: string } {
  const total = pln(
    invoices.reduce((s, i) => s + i.amount_pln, 0),
    2,
  );
  const lines = invoices.map((i) => `- ${i.number}: ${pln(i.amount_pln, 2)}, due ${longDate(i.due_date)} (${i.days_late} days overdue)`);

  if (tone === "friendly") {
    return {
      subject: `Friendly reminder: ${total} outstanding with ${company}`,
      body: [
        `Hello ${buyer} team,`,
        "",
        `I hope all is well. A quick reminder that these invoices from ${company} are now past due:`,
        ...lines,
        "",
        `Total: ${total}.`,
        "",
        "Could you let us know when we can expect payment? If it is already on its way, thank you, and please ignore this note.",
        "",
        "Best regards,",
        company,
      ].join("\n"),
    };
  }
  if (tone === "neutral") {
    return {
      subject: `Payment reminder: ${total} past due`,
      body: [
        `Dear ${buyer} team,`,
        "",
        `Our records show the following invoices from ${company} as unpaid after their due date:`,
        ...lines,
        "",
        `Total: ${total}.`,
        "",
        "Please arrange payment or let us know the expected payment date. If you have already paid, please disregard this message.",
        "",
        "Kind regards,",
        company,
      ].join("\n"),
    };
  }
  return {
    subject: `Overdue payment: ${total} owed to ${company}`,
    body: [
      `Dear ${buyer} team,`,
      "",
      `The following invoices from ${company} remain unpaid after their due date:`,
      ...lines,
      "",
      `Total overdue: ${total}.`,
      "",
      "Please pay the full amount within 7 days, or reply with a confirmed payment date. If you have already paid, please send us the transfer confirmation.",
      "",
      "Regards,",
      company,
    ].join("\n"),
  };
}
