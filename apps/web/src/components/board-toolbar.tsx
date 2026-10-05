"use client";

import { ArrowUpDown, Check, ListFilter, Search, X } from "lucide-react";
import { CARD_PRIORITY_LABELS, type CardPriority, type UserDto, t } from "@plano/shared";
import { activeFilterCount, type CardFilters, type DateFilter, type SortKey } from "@/lib/card-filters";
import { Avatar } from "./avatar";
import { useLabels } from "./label-picker";
import { LabelTag, MenuLabel, Popover, Segmented, inputClass } from "./ui";

const SORT_LABELS: Record<SortKey, string> = {
  manual: t("boardToolbar.manual"),
  due: t("boardToolbar.byDueDate"),
  priority: t("boardToolbar.byPriority"),
  updated: t("boardToolbar.byUpdate"),
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
  const [labels] = useLabels();

  const chips = [
    ...filters.assigneeIds.map((id) => ({
      key: `a-${id}`,
      label: users.find((u) => u.id === id)?.name ?? t("common.assignee"),
      remove: () => set({ assigneeIds: filters.assigneeIds.filter((v) => v !== id) }),
    })),
    ...filters.labelIds.map((id) => ({
      key: `l-${id}`,
      label: labels.find((l) => l.id === id)?.name ?? t("boardToolbar.label"),
      remove: () => set({ labelIds: filters.labelIds.filter((v) => v !== id) }),
    })),
    ...filters.priorities.map((p) => ({
      key: `p-${p}`,
      label: t("boardToolbar.priority", { toLowerCase: CARD_PRIORITY_LABELS[p].toLowerCase() }),
      remove: () => set({ priorities: filters.priorities.filter((v) => v !== p) }),
    })),
  ];

  return (
    <div className="py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<DateFilter>
          label={t("common.dueDate")}
          value={filters.date}
          onChange={(date) => set({ date })}
          options={[
            { value: "all", label: t("common.all") },
            { value: "today", label: t("common.today") },
            { value: "week", label: t("boardToolbar.7Days") },
            { value: "overdue", label: t("common.overdue") },
          ]}
        />
        <span aria-hidden className="mx-1 h-4 w-px bg-border" />
        <div className="relative">
          <Search size={14} strokeWidth={1.75} aria-hidden className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-ghost" />
          <input
            type="search"
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder={t("boardToolbar.searchTheBoard")}
            aria-label={t("boardToolbar.findACardOnThe")}
            className={`${inputClass} h-7 w-44 pl-7`}
          />
        </div>
        <Popover
          align="left"
          trigger={(open, toggleMenu) => (
            <button onClick={toggleMenu} aria-expanded={open} className={`${quietButton} ${count ? "text-ink" : ""}`}>
              <ListFilter size={15} strokeWidth={1.75} />  {t("boardToolbar.filter")}
              {count > 0 && <span className="text-xs text-accent">{count}</span>}
            </button>
          )}
        >
          {() => (
            <div role="menu" className="max-h-[420px] w-[240px] overflow-y-auto">
              {users.length > 0 && (
                <>
                  <MenuLabel>{t("common.assignee")}</MenuLabel>
                  {users.map((u) => (
                    <OptionRow key={u.id} on={filters.assigneeIds.includes(u.id)} onClick={() => set({ assigneeIds: toggle(filters.assigneeIds, u.id) })}>
                      <Avatar user={u} size={18} /> <span className="truncate">{u.name}</span>
                    </OptionRow>
                  ))}
                </>
              )}
              {labels.length > 0 && (
                <>
                  <MenuLabel>{t("boardToolbar.label")}</MenuLabel>
                  {labels.map((l) => (
                    <OptionRow key={l.id} on={filters.labelIds.includes(l.id)} onClick={() => set({ labelIds: toggle(filters.labelIds, l.id) })}>
                      <LabelTag label={l} />
                    </OptionRow>
                  ))}
                </>
              )}
              <MenuLabel>{t("common.priority")}</MenuLabel>
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
          trigger={(open, toggleMenu) => (
            <button onClick={toggleMenu} aria-expanded={open} className={`${quietButton} ${filters.sort !== "manual" ? "text-ink" : ""}`}>
              <ArrowUpDown size={15} strokeWidth={1.75} /> {filters.sort === "manual" ? t("boardToolbar.sort") : SORT_LABELS[filters.sort]}
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
            <button onClick={c.remove} aria-label={t("boardToolbar.removeFilter", { label: c.label })} className="grid size-5 place-items-center rounded-sm text-ink-ghost hover:text-ink">
              <X size={12} />
            </button>
          </span>
        ))}
        {chips.length > 0 && (
          <button onClick={() => set({ assigneeIds: [], priorities: [], labelIds: [] })} className="text-xs text-ink-ghost hover:text-ink">
            
            {t("boardToolbar.reset")}
          </button>
        )}

        {shown !== undefined && (
          <span className="ml-auto text-xs text-ink-ghost">
            {t("plural.cards", { count: shown })}
          </span>
        )}
      </div>
    </div>
  );
}
