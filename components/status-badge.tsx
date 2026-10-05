/**
 * Status chip for a DM: a tinted pill with a dot and a word, so the state
 * never depends on colour alone.
 */

const statusConfig: Record<string, { tone: string; dot: string; label: string }> = {
  SENT: { tone: "bg-gain/12 text-gain", dot: "bg-gain", label: "Sent" },
  FAILED: { tone: "bg-loss/12 text-loss", dot: "bg-loss", label: "Failed" },
  PENDING: { tone: "bg-warning/12 text-warning", dot: "bg-warning", label: "Pending" },
  SKIPPED_DEDUP: { tone: "bg-surface-sunk text-muted", dot: "bg-muted", label: "Already DMed" },
  SKIPPED_RATE_LIMIT: { tone: "bg-warning/12 text-warning", dot: "bg-warning", label: "Rate limited" },
  SKIPPED_PLAN_LIMIT: { tone: "bg-warning/12 text-warning", dot: "bg-warning", label: "Plan limit" },
  SKIPPED_NO_MATCH: { tone: "bg-surface-sunk text-muted", dot: "bg-muted", label: "No match" },
};

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.PENDING;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${config.tone}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} aria-hidden="true" />
      {config.label}
    </span>
  );
}
