"use client";

import { ArrowUpDown, Check, ListFilter, X } from "lucide-react";
import { CARD_PRIORITY_LABELS, CARD_TYPE_LABELS, type CardPriority, type CardType, type UserDto } from "@amo-kanban/shared";
import { activeFilterCount, type CardFilters, type DateFilter, type SortKey } from "@/lib/card-filters";
import { Avatar } from "./avatar";
import { CARD_TYPE_STYLES } from "./card-type-icon";
import { MenuLabel, Popover, Segmented } from "./ui";

const SORT_LABELS: Record<SortKey, string> = {
  manual: "Вручную",
  due: "По сроку",
  priority: "По приоритету",
  updated: "По изменению",
};

function toggle<T>(list: T[], value: T) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function OptionRow({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="menuitemcheckbox"
      aria-checked={on}
      onClick={onClick}
      className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-surface-soft"
    >
      <span className={`grid size-4 shrink-0 place-items-center rounded-sm border ${on ? "border-accent bg-accent text-white" : "border-border-strong"}`}>
        {on && <Check size={11} strokeWidth={3} />}
      </span>
      {children}
    </button>
  );
}

const quietButton =
  "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm text-ink-faint transition-colors hover:bg-surface-soft hover:text-ink";

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// 48px row under the page header: date scope on the left, filter/sort and
// result count on the right; active filters appear as removable chips.
export function BoardToolbar({
  filters,
  onChange,
  users,
  shown,
}: {
  filters: CardFilters;
  onChange: (f: CardFilters) => void;
  users: UserDto[];
  shown?: number;
}) {
  const set = (patch: Partial<CardFilters>) => onChange({ ...filters, ...patch });
  const count = activeFilterCount(filters);

  const chips = [
    ...filters.assigneeIds.map((id) => ({
      key: `a-${id}`,
      label: users.find((u) => u.id === id)?.name ?? "Исполнитель",
      remove: () => set({ assigneeIds: filters.assigneeIds.filter((v) => v !== id) }),
    })),
    ...filters.types.map((t) => ({
      key: `t-${t}`,
      label: CARD_TYPE_LABELS[t],
      remove: () => set({ types: filters.types.filter((v) => v !== t) }),
    })),
    ...filters.priorities.map((p) => ({
      key: `p-${p}`,
      label: `Приоритет ${CARD_PRIORITY_LABELS[p].toLowerCase()}`,
      remove: () => set({ priorities: filters.priorities.filter((v) => v !== p) }),
    })),
  ];

  return (
    <div className="py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<DateFilter>
          label="Срок"
          value={filters.date}
          onChange={(date) => set({ date })}
          options={[
            { value: "all", label: "Все" },
            { value: "today", label: "Сегодня" },
            { value: "week", label: "7 дней" },
            { value: "overdue", label: "Просрочено" },
          ]}
        />
        <span aria-hidden className="mx-1 h-4 w-px bg-border" />
        <Popover
          align="left"
          trigger={(open, t) => (
            <button onClick={t} aria-expanded={open} className={`${quietButton} ${count ? "text-ink" : ""}`}>
              <ListFilter size={15} strokeWidth={1.75} /> Фильтр
              {count > 0 && <span className="text-xs text-accent">{count}</span>}
            </button>
          )}
        >
          {() => (
            <div role="menu" className="max-h-[420px] w-[240px] overflow-y-auto">
              {users.length > 0 && (
                <>
                  <MenuLabel>Исполнитель</MenuLabel>
                  {users.map((u) => (
                    <OptionRow key={u.id} on={filters.assigneeIds.includes(u.id)} onClick={() => set({ assigneeIds: toggle(filters.assigneeIds, u.id) })}>
                      <Avatar user={u} size={18} /> <span className="truncate">{u.name}</span>
                    </OptionRow>
                  ))}
                </>
              )}
              <MenuLabel>Тип</MenuLabel>
              {(Object.keys(CARD_TYPE_LABELS) as CardType[]).map((t) => {
                const { icon: Icon, color } = CARD_TYPE_STYLES[t];
                return (
                  <OptionRow key={t} on={filters.types.includes(t)} onClick={() => set({ types: toggle(filters.types, t) })}>
                    <Icon size={14} strokeWidth={2} style={{ color }} /> {CARD_TYPE_LABELS[t]}
                  </OptionRow>
                );
              })}
              <MenuLabel>Приоритет</MenuLabel>
              {(Object.keys(CARD_PRIORITY_LABELS) as CardPriority[]).map((p) => (
                <OptionRow key={p} on={filters.priorities.includes(p)} onClick={() => set({ priorities: toggle(filters.priorities, p) })}>
                  {CARD_PRIORITY_LABELS[p]}
                </OptionRow>
              ))}
            </div>
          )}
        </Popover>
        <Popover
          align="left"
          trigger={(open, t) => (
            <button onClick={t} aria-expanded={open} className={`${quietButton} ${filters.sort !== "manual" ? "text-ink" : ""}`}>
              <ArrowUpDown size={15} strokeWidth={1.75} /> {filters.sort === "manual" ? "Сортировка" : SORT_LABELS[filters.sort]}
            </button>
          )}
        >
          {(close) => (
            <div role="menu" className="w-[200px]">
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <button
                  key={key}
                  role="menuitemradio"
                  aria-checked={filters.sort === key}
                  onClick={() => {
                    set({ sort: key });
                    close();
                  }}
                  className="flex h-8 w-full items-center justify-between rounded-md px-2 text-left text-sm transition-colors hover:bg-surface-soft"
                >
                  {SORT_LABELS[key]}
                  {filters.sort === key && <Check size={14} className="text-accent" />}
                </button>
              ))}
            </div>
          )}
        </Popover>

        {chips.map((c) => (
          <span key={c.key} className="inline-flex h-6 items-center gap-1 rounded-md border border-border pl-2 pr-0.5 text-xs text-ink-soft">
            {c.label}
            <button onClick={c.remove} aria-label={`Убрать фильтр ${c.label}`} className="grid size-5 place-items-center rounded-sm text-ink-ghost hover:text-ink">
              <X size={12} />
            </button>
          </span>
        ))}
        {chips.length > 0 && (
          <button onClick={() => set({ assigneeIds: [], types: [], priorities: [] })} className="text-xs text-ink-ghost hover:text-ink">
            Сбросить
          </button>
        )}

        {shown !== undefined && (
          <span className="ml-auto text-xs text-ink-ghost">
            {shown} {plural(shown, "карточка", "карточки", "карточек")}
          </span>
        )}
      </div>
    </div>
  );
}
