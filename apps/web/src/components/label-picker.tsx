"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { LABEL_COLORS, type LabelColor, type LabelDto } from "@plano/shared";
import { labelColor } from "@/design/tokens";
import { api, onSessionChange } from "@/lib/api";
import { toast } from "@/lib/toast";
import { inputClass, LabelTag, MenuItem, Popover } from "./ui";

// Labels of the workspace, loaded once per page.
let cache: Promise<LabelDto[]> | null = null;
onSessionChange(() => (cache = null));
export function loadLabels(force = false) {
  if (!cache || force) cache = api.labels().catch((e) => ((cache = null), Promise.reject(e)));
  return cache;
}

export function useLabels() {
  const [labels, setLabels] = useState<LabelDto[]>([]);
  useEffect(() => {
    loadLabels().then(setLabels).catch(() => {});
  }, []);
  return [labels, (next: LabelDto[]) => setLabels(next)] as const;
}

// Pick labels for a card; type a new name to create one on the spot.
export function LabelPicker({
  selected,
  onChange,
  field,
}: {
  selected: LabelDto[];
  onChange: (ids: string[]) => void;
  field: Record<string, unknown>;
}) {
  const [labels, setLabels] = useLabels();
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>("blue");
  const ids = selected.map((l) => l.id);
  const trimmed = name.trim();
  const exists = labels.some((l) => l.name.toLowerCase() === trimmed.toLowerCase());

  async function create() {
    try {
      const label = await api.createLabel(trimmed, color);
      const next = [...labels, label].sort((a, b) => a.name.localeCompare(b.name, "ru"));
      cache = Promise.resolve(next);
      setLabels(next);
      setName("");
      onChange([...ids, label.id]);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <Popover
      align="left"
      trigger={(open, toggle) => (
        <button {...field} type="button" onClick={toggle} aria-expanded={open} className={`${inputClass} flex items-center gap-2 text-left`}>
          {selected.length === 0 ? (
            <span className="text-ink-ghost">Нет меток</span>
          ) : (
            <span className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-0.5">
              {selected.map((l) => (
                <LabelTag key={l.id} label={l} />
              ))}
            </span>
          )}
          <ChevronDown size={14} className="ml-auto shrink-0 text-ink-ghost" />
        </button>
      )}
    >
      {() => (
        <div className="w-[260px]">
          <div className="max-h-[220px] overflow-y-auto">
            {labels.map((l) => {
              const on = ids.includes(l.id);
              return (
                <MenuItem key={l.id} selected={on} onClick={() => onChange(on ? ids.filter((id) => id !== l.id) : [...ids, l.id])}>
                  <LabelTag label={l} />
                </MenuItem>
              );
            })}
            {labels.length === 0 && <p className="px-3 py-2 text-sm text-ink-faint">Меток пока нет. Создайте первую ниже</p>}
          </div>
          <form
            className="border-t border-border p-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (trimmed && !exists) create();
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              placeholder="Новая метка"
              aria-label="Название новой метки"
              className={`${inputClass} w-full`}
            />
            <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label="Цвет метки">
              {LABEL_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={c}
                  onClick={() => setColor(c)}
                  className={`grid size-5 place-items-center rounded-full border-2 ${color === c ? "border-ink" : "border-transparent"}`}
                >
                  <span className="size-3 rounded-full" style={{ background: labelColor[c] }} />
                </button>
              ))}
              <button type="submit" disabled={!trimmed || exists} className="ml-auto inline-flex h-6 items-center gap-1 rounded-md px-2 text-sm text-accent disabled:text-ink-ghost">
                <Plus size={13} /> Создать
              </button>
            </div>
          </form>
        </div>
      )}
    </Popover>
  );
}
