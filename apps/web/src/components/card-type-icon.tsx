import { Bug, CircleDot, GraduationCap, Plug, Puzzle, Settings2, type LucideIcon } from "lucide-react";
import { CARD_TYPE_LABELS, type CardType } from "@amo-kanban/shared";
import { cardTypeColor } from "@/design/tokens";
import { Tag } from "./ui";

const ICONS: Record<CardType, LucideIcon> = {
  SETUP: Settings2,
  INTEGRATION: Plug,
  WIDGET: Puzzle,
  TRAINING: GraduationCap,
  BUG: Bug,
  OTHER: CircleDot,
};

export const CARD_TYPE_STYLES = Object.fromEntries(
  (Object.keys(ICONS) as CardType[]).map((t) => [t, { icon: ICONS[t], color: cardTypeColor[t] }]),
) as Record<CardType, { icon: LucideIcon; color: string }>;

export function CardTypeIcon({ type, size = 18 }: { type: CardType; size?: number }) {
  const Icon = ICONS[type];
  const color = cardTypeColor[type];
  return (
    <span
      title={CARD_TYPE_LABELS[type]}
      className="inline-flex shrink-0 items-center justify-center rounded-md"
      style={{ width: size, height: size, background: `${color}1A`, color }}
    >
      <Icon size={size * 0.62} strokeWidth={2.25} />
    </span>
  );
}

export function CardTypeTag({ type }: { type: CardType }) {
  return <Tag color={cardTypeColor[type]}>{CARD_TYPE_LABELS[type]}</Tag>;
}
