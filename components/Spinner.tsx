// Small activity ring in the accent colour.
export function Spinner() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 animate-spin text-accent" aria-hidden>
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.8" />
      <path d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
