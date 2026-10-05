import { CARD_PRIORITY_LABELS, type CardPriority } from "@plano/shared";
import { priorityColor } from "@/design/tokens";

// Priority as a dot + plain text; only "high" draws attention.
export function PriorityBadge({ priority }: { priority: CardPriority }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${priority === "HIGH" ? "font-medium text-danger" : "text-ink-faint"}`}>
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: priorityColor[priority] }} />
      {CARD_PRIORITY_LABELS[priority]}
    </span>
  );
}
