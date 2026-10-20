"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "@/components/Check";
import { BANKS } from "@/lib/offers";
import { buildReminder, type ReminderInvoice, type ReminderTone } from "@/lib/reminder";
import type { Settings } from "@/lib/workspace";

const TONES: { value: ReminderTone; label: string }[] = [
  { value: "friendly", label: "Friendly" },
  { value: "neutral", label: "Neutral" },
  { value: "firm", label: "Firm" },
];

const INPUT = "mt-1.5 block w-full rounded-xl bg-mist px-4 py-3 text-[17px] outline-none ring-accent focus:ring-2";

export type ReminderSample = { buyer: string; invoices: ReminderInvoice[] };

type Status = { state: "idle" | "saving" | "saved" } | { state: "error"; text: string };

// Client-side check, so a half-typed NIP doesn't fire a failing save. The server checks again.
function problem(s: Settings): string | null {
  if (!s.company_name.trim()) return "Enter a company name.";
  if (!/^\d{10}$/.test(s.nip.replace(/[\s-]/g, ""))) return "A NIP has 10 digits.";
  if (!s.industry.trim()) return "Enter an industry.";
  return null;
}

// Shrinks the logo to fit 256 px so it stays small in the database and on the Passport.
async function toLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Use a PNG, JPG or WebP image.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export function SettingsForm({ initial, sample }: { initial: Settings; sample: ReminderSample }) {
  const [settings, setSettings] = useState(initial);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const json = JSON.stringify(settings);
  // Back to what is saved (e.g. a bad NIP fixed): nothing to report.
  const shown: Status = status.state === "error" && json === saved ? { state: "idle" } : status;
  const logoInput = useRef<HTMLInputElement>(null);

  function update(patch: Partial<Settings>) {
    setSettings((s) => ({ ...s, ...patch }));
  }

  // Auto-save: 600 ms after the last change, if the form is valid and something changed.
  useEffect(() => {
    if (json === saved) return;
    const invalid = problem(settings);
    const t = setTimeout(async () => {
      if (invalid) {
        setStatus({ state: "error", text: invalid });
        return;
      }
      setStatus({ state: "saving" });
      try {
        const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: json });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Couldn't save. Please try again.");
        setSaved(json);
        setStatus({ state: "saved" });
      } catch (err) {
        setStatus({ state: "error", text: err instanceof Error && !(err instanceof TypeError) ? err.message : "Couldn't save. Check your connection." });
      }
    }, 600);
    return () => clearTimeout(t);
  }, [json, saved, settings]);

  // "Saved" fades away after a moment.
  useEffect(() => {
    if (status.state !== "saved") return;
    const t = setTimeout(() => setStatus({ state: "idle" }), 1800);
    return () => clearTimeout(t);
  }, [status]);

  const email = buildReminder({ tone: settings.reminder_tone, company: settings.company_name || "Your company", ...sample });

  return (
    <div className="mt-12 space-y-16">
      <section>
        <h2 className="text-[24px] font-semibold tracking-tight">Company</h2>
        <div className="mt-6 flex items-center gap-5">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-mist">
            {settings.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- a data URL, nothing to optimise
              <img src={settings.logo} alt="Company logo" className="h-full w-full object-contain p-2" />
            ) : (
              <span className="text-[28px] font-semibold text-faint">{settings.company_name.trim().charAt(0).toUpperCase() || "?"}</span>
            )}
          </div>
          <div>
            <p className="text-[15px] text-muted">Shown on your Passport.</p>
            <div className="mt-1 flex gap-4 text-[15px]">
              <button type="button" onClick={() => logoInput.current?.click()} className="text-accent hover:underline">
                {settings.logo ? "Change logo" : "Upload logo"}
              </button>
              {settings.logo && (
                <button type="button" onClick={() => update({ logo: "" })} className="text-accent hover:underline">
                  Remove
                </button>
              )}
            </div>
            <input
              ref={logoInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              aria-label="Upload logo"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  update({ logo: await toLogo(file) });
                } catch (err) {
                  setStatus({ state: "error", text: (err as Error).message });
                }
              }}
            />
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-[14px] text-muted">Company name</span>
            <input value={settings.company_name} onChange={(e) => update({ company_name: e.target.value })} maxLength={120} className={INPUT} />
          </label>
          <label className="block">
            <span className="text-[14px] text-muted">NIP</span>
            <input
              value={settings.nip}
              onChange={(e) => update({ nip: e.target.value })}
              inputMode="numeric"
              maxLength={13}
              className={`${INPUT} tabular`}
            />
          </label>
          <label className="block">
            <span className="text-[14px] text-muted">Industry</span>
            <input value={settings.industry} onChange={(e) => update({ industry: e.target.value })} maxLength={80} className={INPUT} />
          </label>
        </div>
      </section>

      <section>
        <h2 className="text-[24px] font-semibold tracking-tight">What the AI may do</h2>
        <p className="mt-1 text-[15px] text-muted">Four levels, from reading to acting. The last one always stays with you.</p>
        <ol className="mt-6 border-t border-line">
          <Tier level={1} title="Read your data" note="Invoices, payments and your score. The copilot needs this to answer." fixed="Always on" />
          <Tier
            level={2}
            title="Draft reminders"
            note={settings.drafts_enabled ? "Writes reminder emails for late buyers. Drafts wait for you." : "Off. The copilot won't draft reminders."}
            checked={settings.drafts_enabled}
            onChange={(v) => update({ drafts_enabled: v })}
          />
          <Tier
            level={3}
            title="Suggest financing"
            note={settings.financing_enabled ? "Points you to bank offers when cash runs low." : "Off. No loan suggestions unless you ask."}
            checked={settings.financing_enabled}
            onChange={(v) => update({ financing_enabled: v })}
          />
          <Tier level={4} title="Send anything" note="Emails, payments, applications. Nothing leaves without your click." fixed="Needs your approval" />
        </ol>
      </section>

      <section>
        <h2 className="text-[24px] font-semibold tracking-tight">Reminder style</h2>
        <div role="radiogroup" aria-label="Reminder style" className="mt-5 inline-flex rounded-full bg-mist p-1">
          {TONES.map((t) => {
            const active = settings.reminder_tone === t.value;
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => update({ reminder_tone: t.value })}
                className={`rounded-full px-5 py-1.5 text-[15px] transition-colors ${active ? "bg-white text-ink" : "text-muted hover:text-ink"}`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="mt-5 rounded-2xl bg-mist px-6 py-5" aria-live="polite">
          <p className="text-[13px] text-muted">Sample to {sample.buyer}</p>
          <p key={settings.reminder_tone + "s"} className="rise-in mt-1 text-[17px] font-semibold">
            {email.subject}
          </p>
          <p key={settings.reminder_tone} className="rise-in mt-3 whitespace-pre-line text-[15px] leading-relaxed">
            {email.body}
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-[24px] font-semibold tracking-tight">Thresholds</h2>
        <p className="mt-1 text-[15px] text-muted">Your overview and the copilot follow these.</p>
        <Slider
          label="Suggest reminders after"
          value={settings.remind_after_days}
          min={7}
          max={60}
          unit="days late"
          onChange={(v) => update({ remind_after_days: v })}
        />
        <Slider
          label="Warn me when cash lasts less than"
          value={settings.cash_warning_weeks}
          min={2}
          max={12}
          unit="weeks"
          onChange={(v) => update({ cash_warning_weeks: v })}
        />
        <Slider
          label="Keep a safety buffer of"
          value={settings.safety_buffer_weeks}
          min={1}
          max={12}
          unit="weeks of costs"
          onChange={(v) => update({ safety_buffer_weeks: v })}
        />
      </section>

      <section>
        <h2 className="text-[24px] font-semibold tracking-tight">Banks</h2>
        <p className="mt-1 text-[15px] text-muted">Which demo banks may see your Passport when you ask for offers.</p>
        <ul className="mt-6 border-t border-line">
          {BANKS.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-6 border-b border-line py-4">
              <span className="text-[17px]">{b.name}</span>
              <Toggle
                label={b.name}
                checked={settings.banks[b.id]}
                onChange={(v) => update({ banks: { ...settings.banks, [b.id]: v } })}
              />
            </li>
          ))}
        </ul>
        {!Object.values(settings.banks).some(Boolean) && (
          <p className="mt-3 text-[15px] text-muted">No bank can see your Passport, so you won&apos;t get offers.</p>
        )}
      </section>

      <SaveStatus status={shown} />
    </div>
  );
}

function Tier({
  level,
  title,
  note,
  fixed,
  checked,
  onChange,
}: {
  level: number;
  title: string;
  note: string;
  fixed?: string;
  checked?: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-6 border-b border-line py-5">
      <div className="flex min-w-0 items-start gap-4">
        <span className="tabular mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mist text-[13px] text-muted">{level}</span>
        <div className="min-w-0">
          <p className="text-[17px] font-semibold">{title}</p>
          <p className="mt-0.5 text-[15px] text-muted">{note}</p>
        </div>
      </div>
      {fixed ? (
        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[13px] text-faint">
          <Lock /> {fixed}
        </span>
      ) : (
        <Toggle label={title} checked={Boolean(checked)} onChange={(v) => onChange?.(v)} />
      )}
    </li>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors ${checked ? "bg-good" : "bg-line"}`}
    >
      <span className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white transition-all ${checked ? "left-[22px]" : "left-[2px]"}`} />
    </button>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mt-8 block">
      <span className="flex items-baseline justify-between gap-4">
        <span className="text-[17px]">{label}</span>
        <span className="tabular text-[17px] font-semibold">
          {value} <span className="font-normal text-muted">{unit}</span>
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full accent-accent"
      />
      <span className="tabular flex justify-between text-[12px] text-faint">
        <span>{min}</span>
        <span>{max}</span>
      </span>
    </label>
  );
}

function Lock() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

// A small pill at the bottom of the screen: "Saving…", "Saved", or what is wrong.
function SaveStatus({ status }: { status: Status }) {
  if (status.state === "idle") return null;
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-8 z-30 flex justify-center px-6">
      <p
        key={status.state}
        className={`rise-in flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] ${
          status.state === "error" ? "bg-critical text-white" : "bg-ink text-white"
        }`}
      >
        {status.state === "saved" && <Check />}
        {status.state === "error" ? status.text : status.state === "saving" ? "Saving…" : "Saved"}
      </p>
    </div>
  );
}
