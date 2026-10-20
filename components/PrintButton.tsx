"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print shrink-0 rounded-full bg-accent px-5 py-2 text-[15px] text-white transition-colors hover:bg-accent-hover"
    >
      Print to PDF
    </button>
  );
}
