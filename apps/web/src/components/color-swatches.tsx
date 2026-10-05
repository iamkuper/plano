"use client";

import { Check } from "lucide-react";
import { LABEL_COLORS, type LabelColor, t } from "@plano/shared";
import { labelColor } from "@/design/tokens";
import { Popover } from "./ui";

const NAMES: Record<LabelColor, string> = {
  gray: t("colorSwatches.grey"),
  red: t("colorSwatches.red"),
  orange: t("colorSwatches.orange"),
  amber: t("colorSwatches.amber"),
  green: t("colorSwatches.green"),
  teal: t("colorSwatches.teal"),
  blue: t("colorSwatches.blue"),
  violet: t("colorSwatches.violet"),
  pink: t("colorSwatches.pink"),
};

// Row of colour dots plus "auto" (null = colour by position).
export function ColorSwatches({ value, auto, onChange }: { value: LabelColor | null; auto: string; onChange: (c: LabelColor | null) => void }) {
  const dot = "grid size-6 place-items-center rounded-full ring-offset-2 ring-offset-surface transition-shadow";
  return (
    <div role="radiogroup" aria-label={t("colorSwatches.columnColour")} className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        title={t("colorSwatches.automatic")}
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
          title={t("colorSwatches.columnColour")}
          aria-label={t("colorSwatches.columnColour")}
          className={`rounded-full transition-transform hover:scale-110 ${className}`}
          style={{ background: color }}
        />
      )}
    >
      {(close) => (
        <div className="w-[248px] p-2">
          <div className="mb-2 text-xs text-ink-ghost">{t("colorSwatches.columnColour")}</div>
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
