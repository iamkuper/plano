"use client";

import { Check } from "lucide-react";
import { LABEL_COLORS, type LabelColor } from "@amo-kanban/shared";
import { labelColor } from "@/design/tokens";
import { Popover } from "./ui";

const NAMES: Record<LabelColor, string> = {
  gray: "Серый",
  red: "Красный",
  orange: "Оранжевый",
  amber: "Янтарный",
  green: "Зелёный",
  teal: "Бирюзовый",
  blue: "Синий",
  violet: "Фиолетовый",
  pink: "Розовый",
};

// Row of colour dots plus "auto" (null = colour by position).
export function ColorSwatches({ value, auto, onChange }: { value: LabelColor | null; auto: string; onChange: (c: LabelColor | null) => void }) {
  const dot = "grid size-6 place-items-center rounded-full ring-offset-2 ring-offset-surface transition-shadow";
  return (
    <div role="radiogroup" aria-label="Цвет колонки" className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        title="Автоматически"
        onClick={() => onChange(null)}
        className={`${dot} border border-dashed border-border-strong ${value === null ? "ring-2 ring-ink-ghost" : "hover:ring-2 hover:ring-border"}`}
      >
        <span className="size-3 rounded-full" style={{ background: auto }} />
      </button>
      {LABEL_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          title={NAMES[c]}
          aria-label={NAMES[c]}
          onClick={() => onChange(c)}
          className={`${dot} ${value === c ? "ring-2 ring-ink-ghost" : "hover:ring-2 hover:ring-border"}`}
          style={{ background: labelColor[c] }}
        >
          {value === c && <Check size={13} strokeWidth={3} className="text-white" />}
        </button>
      ))}
    </div>
  );
}

// A colour stripe/dot that opens the swatches.
export function ColorButton({
  color,
  value,
  auto,
  onChange,
  className = "",
}: {
  color: string;
  value: LabelColor | null;
  auto: string;
  onChange: (c: LabelColor | null) => void;
  className?: string;
}) {
  return (
    <Popover
      align="left"
      trigger={(open, toggle) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          title="Цвет колонки"
          aria-label="Цвет колонки"
          className={`rounded-full transition-transform hover:scale-110 ${className}`}
          style={{ background: color }}
        />
      )}
    >
      {(close) => (
        <div className="w-[248px] p-2">
          <div className="mb-2 text-xs text-ink-ghost">Цвет колонки</div>
          <ColorSwatches
            value={value}
            auto={auto}
            onChange={(c) => {
              onChange(c);
              close();
            }}
          />
        </div>
      )}
    </Popover>
  );
}
