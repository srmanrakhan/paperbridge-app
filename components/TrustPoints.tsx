import { Check } from "@/components/Check";

export const TRUST_POINTS = [
  "Data comes straight from KSeF, the official government e-invoice system.",
  "Bank access is read-only, via regulated open banking (PSD2). We can't move money.",
  "The score is calculated with transparent maths, not guessed by AI.",
  "The AI never sends anything without your approval, and every action is logged.",
  "You decide who sees your Passport, and can revoke access anytime. Data stays in the EU (GDPR).",
];

// "Why you can trust Paperbridge": the same five points on the login page and the Passport.
export function TrustPoints({ variant }: { variant: "login" | "passport" }) {
  const login = variant === "login";
  return (
    <section className={login ? "mt-8 w-full max-w-[400px]" : "avoid-break mt-8 border-t border-line pt-5"}>
      <h2 className="text-[15px] font-semibold">Why you can trust Paperbridge</h2>
      <ul className={login ? "mt-3 space-y-2" : "mt-2 space-y-1.5"}>
        {TRUST_POINTS.map((p) => (
          <li key={p} className={`flex gap-2.5 ${login ? "text-[14px] leading-snug text-muted" : ""}`}>
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-good" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
