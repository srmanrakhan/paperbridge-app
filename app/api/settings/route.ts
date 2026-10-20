import { logAction } from "@/lib/actions";
import { friendlyError } from "@/lib/errors";
import { BANKS, type BankId } from "@/lib/offers";
import { REMINDER_TONES, type ReminderTone } from "@/lib/reminder";
import { saveSettings, type Settings } from "@/lib/workspace";

// POST /api/settings  the full Settings object (the form auto-saves it on every change).
// Reading data is always allowed and sending always needs the owner's click, so neither is a setting.
const MAX_LOGO = 300_000; // characters of the data URL; the form shrinks logos to 256 px first

function parse(body: Record<string, unknown> | null): Settings | string {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const name = str(body?.company_name);
  const nip = str(body?.nip).replace(/[\s-]/g, "");
  const industry = str(body?.industry);
  const logo = str(body?.logo);
  const tone = body?.reminder_tone;
  const remind = Number(body?.remind_after_days);
  const warn = Number(body?.cash_warning_weeks);
  const buffer = Number(body?.safety_buffer_weeks);
  const banks = (body?.banks ?? {}) as Record<string, unknown>;

  if (!name || name.length > 120) return "Enter a company name (up to 120 characters).";
  if (!/^\d{10}$/.test(nip)) return "A NIP has 10 digits.";
  if (!industry || industry.length > 80) return "Enter an industry (up to 80 characters).";
  if (logo && (!/^data:image\/(png|jpeg|webp);base64,/.test(logo) || logo.length > MAX_LOGO)) return "Use a PNG, JPG or WebP logo.";
  if (!REMINDER_TONES.includes(tone as ReminderTone)) return "Choose a reminder style.";
  if (typeof body?.drafts_enabled !== "boolean" || typeof body?.financing_enabled !== "boolean") return "Invalid permission setting.";
  if (!Number.isInteger(remind) || remind < 7 || remind > 60) return "Reminders can start between 7 and 60 days late.";
  if (!Number.isInteger(warn) || warn < 2 || warn > 12) return "The cash warning can be set between 2 and 12 weeks.";
  if (!Number.isInteger(buffer) || buffer < 1 || buffer > 12) return "The safety buffer can be set between 1 and 12 weeks.";

  return {
    company_name: name,
    nip,
    industry,
    logo,
    reminder_tone: tone as ReminderTone,
    drafts_enabled: body.drafts_enabled,
    financing_enabled: body.financing_enabled,
    remind_after_days: remind,
    cash_warning_weeks: warn,
    safety_buffer_weeks: buffer,
    banks: Object.fromEntries(BANKS.map((b) => [b.id, banks[b.id] !== false])) as Record<BankId, boolean>,
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const settings = parse(body);
  if (typeof settings === "string") return Response.json({ error: settings }, { status: 400 });

  try {
    await saveSettings(settings);
    // The logo itself is not worth a log row; whether there is one is.
    await logAction("settings", { ...settings, logo: settings.logo ? "set" : "none" }, "logged");
    return Response.json({ settings });
  } catch (err) {
    console.error("settings failed", err);
    return Response.json({ error: friendlyError(err) }, { status: 500 });
  }
}
