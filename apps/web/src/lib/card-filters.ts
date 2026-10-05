import { cardKey, type CardPriority, type CardTileDto } from "@plano/shared";

export type DateFilter = "all" | "today" | "week" | "overdue";
export type SortKey = "manual" | "due" | "priority" | "updated";

export interface CardFilters {
  date: DateFilter;
  assigneeIds: string[];
  // Task type ids.
  types: string[];
  priorities: CardPriority[];
  labelIds: string[];
  // Free text over title, description and key.
  q: string;
  sort: SortKey;
}

export const DEFAULT_FILTERS: CardFilters = { date: "all", assigneeIds: [], types: [], priorities: [], labelIds: [], q: "", sort: "manual" };

// Filters other than the date chips and the sort (shown as a count on the
// "Фильтры" button).
export function activeFilterCount(f: CardFilters) {
  return f.assigneeIds.length + f.types.length + f.priorities.length + f.labelIds.length;
}

// True when the visible order differs from the stored one, so the board
// can't map a drop index back to a real position.
export function isReordered(f: CardFilters) {
  return f.sort !== "manual" || f.date !== "all" || !!f.q.trim() || activeFilterCount(f) > 0;
}

const PRIORITY_RANK: Record<CardPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function matchesDate(card: CardTileDto, date: DateFilter) {
  if (date === "all") return true;
  if (!card.dueDate) return false;
  const due = startOfDay(new Date(card.dueDate)).getTime();
  const today = startOfDay().getTime();
  if (date === "today") return due === today;
  if (date === "week") return due >= today && due < today + 7 * 86_400_000;
  return due < today;
}

function matchesText(card: CardTileDto, q: string) {
  const term = q.trim().toLowerCase();
  if (!term) return true;
  return `${card.number} ${cardKey(card)} ${card.title} ${card.description ?? ""}`.toLowerCase().includes(term);
}

export function applyFilters(cards: CardTileDto[], f: CardFilters) {
  const visible = cards.filter(
    (c) =>
      matchesDate(c, f.date) &&
      matchesText(c, f.q) &&
      (!f.labelIds.length || c.labels.some((l) => f.labelIds.includes(l.label.id))) &&
      (!f.assigneeIds.length || c.assignees.some((a) => f.assigneeIds.includes(a.user.id))) &&
      (!f.types.length || f.types.includes(c.type.id)) &&
      (!f.priorities.length || f.priorities.includes(c.priority)),
  );
  switch (f.sort) {
    case "due":
      return [...visible].sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
    case "priority":
      return [...visible].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
    case "updated":
      return [...visible].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    default:
      return visible;
  }
}

// "5 мин", "3 ч", "2 д", "12 окт" — compact age like the reference's "15m".
export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "сейчас";
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} д`;
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}
