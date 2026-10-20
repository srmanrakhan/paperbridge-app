import type { ActionStatus } from "@/lib/actions";

const STYLE: Record<ActionStatus, { dot: string; label: string }> = {
  drafted: { dot: "bg-warning", label: "Waiting for approval" },
  approved: { dot: "bg-good", label: "Approved" },
  rejected: { dot: "bg-critical", label: "Rejected" },
  logged: { dot: "bg-faint", label: "Logged" },
};

export function StatusPill({ status }: { status: ActionStatus }) {
  const s = STYLE[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}
