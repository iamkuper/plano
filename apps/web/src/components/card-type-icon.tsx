import { CircleDot, type LucideIcon } from "lucide-react";
import type { TaskTypeRefDto } from "@plano/shared";
import { labelColor } from "@/design/tokens";
import { Tag } from "./ui";

const NEUTRAL = "#6C6E75";

// A task type is a name plus an optional palette colour (neutral when unset).
export function typeStyle(type: Pick<TaskTypeRefDto, "color">): { icon: LucideIcon; color: string } {
  const color = type.color && type.color in labelColor ? labelColor[type.color as keyof typeof labelColor] : NEUTRAL;
  return { icon: CircleDot, color };
}

export function CardTypeIcon({ type, size = 18 }: { type: TaskTypeRefDto; size?: number }) {
  const { icon: Icon, color } = typeStyle(type);
  return (
    <span
      title={type.name}
      className="inline-flex shrink-0 items-center justify-center rounded-md"
      style={{ width: size, height: size, background: `${color}1A`, color }}
    >
      <Icon size={size * 0.62} strokeWidth={2.25} />
    </span>
  );
}

export function CardTypeTag({ type }: { type: TaskTypeRefDto }) {
  return <Tag color={typeStyle(type).color}>{type.name}</Tag>;
}
