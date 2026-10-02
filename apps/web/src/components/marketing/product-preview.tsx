"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarRange,
  Check,
  ChevronRight,
  Clock,
  FolderKanban,
  Hand,
  House,
  KanbanSquare,
  List,
  MessageSquare,
  Paperclip,
  Search,
  X,
} from "lucide-react";

// A working miniature of the app for the landing page: cards can be dragged
// between stages (or moved from the card panel on touch screens), opened,
// and their subtasks ticked. Until the visitor touches it, it plays a short
// demo on its own. Everything is local state — nothing is sent anywhere.

type View = "board" | "list" | "gantt" | "time";
type Person = { name: string; color: string };
type Card = {
  id: string;
  n: number;
  title: string;
  type: "Настройка" | "Интеграция" | "Обучение" | "Ошибка" | "Прочее";
  col: number;
  who: number;
  due: string;
  start: number; // gantt: day offset
  len: number; // gantt: days
  hours: number;
  comments: number;
  files: number;
  subtasks: { t: string; done: boolean }[];
};

const PEOPLE: Person[] = [
  { name: "Анна", color: "#8A6CE8" },
  { name: "Илья", color: "#3D8BF2" },
  { name: "Мария", color: "#E26AA0" },
  { name: "Олег", color: "#1E8F7A" },
];
const COLS = [
  { title: "Бэклог", color: "#8B8D94" },
  { title: "В работе", color: "#3D8BF2" },
  { title: "На проверке", color: "#8A6CE8" },
  { title: "Готово", color: "#2FA36B" },
];
const TYPE_COLOR: Record<Card["type"], string> = {
  Настройка: "#3D8BF2",
  Интеграция: "#C2562F",
  Обучение: "#1E8F7A",
  Ошибка: "#D23F3F",
  Прочее: "#8B8D94",
};

const INITIAL: Card[] = [
  { id: "a", n: 21, title: "Бриф и требования клиента", type: "Настройка", col: 3, who: 0, due: "2 окт", start: 0, len: 3, hours: 6, comments: 4, files: 2, subtasks: [{ t: "Встреча с клиентом", done: true }, { t: "Цели и метрики", done: true }, { t: "Сроки и бюджет", done: true }] },
  { id: "b", n: 22, title: "Воронка продаж и этапы", type: "Настройка", col: 2, who: 1, due: "6 окт", start: 2, len: 4, hours: 9, comments: 2, files: 0, subtasks: [{ t: "Этапы сделки", done: true }, { t: "Поля карточки", done: true }, { t: "Права менеджеров", done: false }] },
  { id: "c", n: 23, title: "Интеграция с сайтом", type: "Интеграция", col: 1, who: 3, due: "9 окт", start: 4, len: 5, hours: 12, comments: 6, files: 1, subtasks: [{ t: "Форма заявки", done: true }, { t: "Вебхук", done: false }, { t: "Проверка на тестовых данных", done: false }] },
  { id: "d", n: 24, title: "Телефония и запись звонков", type: "Интеграция", col: 1, who: 1, due: "10 окт", start: 5, len: 4, hours: 7, comments: 1, files: 0, subtasks: [{ t: "Подключить номер", done: false }, { t: "Сценарии звонков", done: false }] },
  { id: "e", n: 25, title: "Обучение отдела продаж", type: "Обучение", col: 0, who: 2, due: "14 окт", start: 9, len: 2, hours: 0, comments: 0, files: 3, subtasks: [{ t: "Презентация", done: false }, { t: "Запись вебинара", done: false }] },
  { id: "f", n: 26, title: "Не приходят уведомления", type: "Ошибка", col: 0, who: 3, due: "8 окт", start: 6, len: 1, hours: 1, comments: 3, files: 1, subtasks: [{ t: "Воспроизвести", done: false }] },
  { id: "g", n: 27, title: "Отчёт за сентябрь", type: "Прочее", col: 2, who: 0, due: "5 окт", start: 3, len: 2, hours: 3, comments: 1, files: 1, subtasks: [] },
];

// The self-playing demo: which card goes to which stage, in turn.
const SCRIPT: [string, number][] = [
  ["c", 2],
  ["e", 1],
  ["b", 3],
  ["f", 1],
  ["c", 3],
  ["d", 2],
];

function Avatar({ who, size = 20 }: { who: number; size?: number }) {
  const p = PEOPLE[who];
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-semibold text-white" style={{ width: size, height: size, background: p.color, fontSize: size * 0.45 }} title={p.name}>
      {p.name[0]}
    </span>
  );
}

function CardTile({ card, moved, onOpen, onDragStart }: { card: Card; moved: boolean; onOpen: () => void; onDragStart: (e: React.DragEvent) => void }) {
  const done = card.subtasks.filter((s) => s.done).length;
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      className={`group w-full cursor-grab rounded-lg border bg-white p-2.5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-0.5 hover:border-[#C9CBD0] hover:shadow-md active:cursor-grabbing ${
        moved ? "lp-rise border-[#3D8BF2] ring-2 ring-[#3D8BF2]/20" : "border-[#E6E7EA]"
      }`}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-[#9A9CA3]">
        <span>P-{card.n}</span>
        <span className="ml-auto">
          <Avatar who={card.who} size={18} />
        </span>
      </div>
      <div className="mt-1 text-[13px] font-medium leading-snug text-[#1B1C1F]">{card.title}</div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-[#6B6E76]">
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full" style={{ background: TYPE_COLOR[card.type] }} />
          {card.type}
        </span>
        {card.subtasks.length > 0 && (
          <span className={`flex items-center gap-0.5 ${done === card.subtasks.length ? "text-[#22865A]" : ""}`}>
            <Check size={11} /> {done}/{card.subtasks.length}
          </span>
        )}
        {card.comments > 0 && (
          <span className="flex items-center gap-0.5">
            <MessageSquare size={11} /> {card.comments}
          </span>
        )}
        {card.files > 0 && (
          <span className="flex items-center gap-0.5">
            <Paperclip size={11} /> {card.files}
          </span>
        )}
        <span className="ml-auto">{card.due}</span>
      </div>
    </button>
  );
}

function CardPanel({ card, onClose, onMove, onToggle }: { card: Card; onClose: () => void; onMove: (col: number) => void; onToggle: (i: number) => void }) {
  const done = card.subtasks.filter((s) => s.done).length;
  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-full max-w-[340px] flex-col border-l border-[#E6E7EA] bg-white shadow-2xl animate-sheet-in">
      <div className="flex h-11 items-center gap-1.5 border-b border-[#E6E7EA] px-4 text-xs text-[#6B6E76]">
        Внедрение CRM <ChevronRight size={12} /> <span className="font-medium text-[#1B1C1F]">P-{card.n}</span>
        <button onClick={onClose} className="ml-auto grid size-7 place-items-center rounded-md hover:bg-[#F3F4F6]" aria-label="Закрыть">
          <X size={15} />
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <h4 className="text-base font-semibold leading-snug text-[#1B1C1F]">{card.title}</h4>
        <div>
          <div className="mb-1.5 text-[11px] text-[#9A9CA3]">Этап</div>
          <div className="flex flex-wrap gap-1">
            {COLS.map((c, i) => (
              <button
                key={c.title}
                onClick={() => onMove(i)}
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors ${
                  card.col === i ? "border-transparent bg-[#1B1C1F] text-white" : "border-[#E6E7EA] text-[#45474D] hover:bg-[#F3F4F6]"
                }`}
              >
                <span className="size-1.5 rounded-full" style={{ background: c.color }} />
                {c.title}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-[11px] text-[#9A9CA3]">Исполнитель</div>
            <div className="mt-1 flex items-center gap-1.5">
              <Avatar who={card.who} size={18} /> {PEOPLE[card.who].name}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[#9A9CA3]">Срок</div>
            <div className="mt-1">{card.due}</div>
          </div>
        </div>
        {card.subtasks.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-[11px] text-[#9A9CA3]">
              Подзадачи {done} из {card.subtasks.length}
              <span className="ml-auto h-1 w-20 overflow-hidden rounded-full bg-[#EEF0F2]">
                <span className="block h-full rounded-full bg-[#2FA36B] transition-all duration-500" style={{ width: `${(done / card.subtasks.length) * 100}%` }} />
              </span>
            </div>
            <div className="overflow-hidden rounded-lg border border-[#E6E7EA]">
              {card.subtasks.map((s, i) => (
                <button key={s.t} onClick={() => onToggle(i)} className="flex w-full items-center gap-2.5 border-b border-[#E6E7EA] px-3 py-2 text-left text-xs last:border-b-0 hover:bg-[#F8F9FA]">
                  <span className={`grid size-4 place-items-center rounded-sm border transition-colors ${s.done ? "border-[#2B2F33] bg-[#2B2F33] text-white" : "border-[#C9CBD0]"}`}>
                    {s.done && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className={s.done ? "text-[#9A9CA3] line-through" : "text-[#1B1C1F]"}>{s.t}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <div className="mb-1.5 text-[11px] text-[#9A9CA3]">Обсуждение</div>
          <div className="space-y-2">
            <div className="flex gap-2">
              <Avatar who={(card.who + 1) % 4} size={20} />
              <div className="rounded-xl rounded-tl-sm bg-[#F3F4F6] px-3 py-2 text-xs text-[#1B1C1F]">
                <span className="font-medium text-[#3D8BF2]">@{PEOPLE[card.who].name}</span>, посмотри, пожалуйста, до пятницы
              </div>
            </div>
            <div className="flex justify-end">
              <div className="rounded-xl rounded-tr-sm bg-[#2B2F33] px-3 py-2 text-xs text-white">Беру, сегодня сделаю 👍</div>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[#9A9CA3]">
              <Avatar who={(card.who + 2) % 4} size={16} /> печатает
              <span className="lp-typing">
                <span>•</span>
                <span>•</span>
                <span>•</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BoardView({ cards, moved, onOpen, onDrop }: { cards: Card[]; moved: string | null; onOpen: (id: string) => void; onDrop: (id: string, col: number) => void }) {
  const [over, setOver] = useState<number | null>(null);
  return (
    <div className="flex h-full gap-2.5 overflow-x-auto p-3">
      {COLS.map((col, i) => {
        const list = cards.filter((c) => c.col === i);
        return (
          <div
            key={col.title}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(i);
            }}
            onDragLeave={() => setOver((o) => (o === i ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              onDrop(e.dataTransfer.getData("text/plain"), i);
            }}
            className={`flex w-[200px] shrink-0 flex-col rounded-xl transition-colors sm:w-auto sm:flex-1 ${over === i ? "bg-[#E8F1FE]" : "bg-[#F3F4F6]"}`}
          >
            <div className="h-[3px] rounded-t-xl" style={{ background: col.color }} />
            <div className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#1B1C1F]">
              {col.title} <span className="font-normal text-[#9A9CA3]">{list.length}</span>
            </div>
            <div className="flex-1 space-y-1.5 px-1.5 pb-1.5">
              {list.map((c) => (
                <CardTile
                  key={`${c.id}-${c.col}`}
                  card={c}
                  moved={moved === c.id}
                  onOpen={() => onOpen(c.id)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", c.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListView({ cards, onOpen }: { cards: Card[]; onOpen: (id: string) => void }) {
  return (
    <div className="h-full overflow-auto p-3">
      <div className="min-w-[520px] overflow-hidden rounded-xl border border-[#E6E7EA] bg-white">
        <div className="grid grid-cols-[56px_1fr_120px_90px_60px] border-b border-[#E6E7EA] bg-[#F8F9FA] px-3 py-2 text-[11px] text-[#9A9CA3]">
          <span>№</span>
          <span>Задача</span>
          <span>Этап</span>
          <span>Исполнитель</span>
          <span className="text-right">Срок</span>
        </div>
        {[...cards].sort((a, b) => a.col - b.col).map((c, i) => (
          <button
            key={c.id}
            onClick={() => onOpen(c.id)}
            className="lp-rise grid w-full grid-cols-[56px_1fr_120px_90px_60px] items-center border-b border-[#E6E7EA] px-3 py-2 text-left text-xs last:border-b-0 hover:bg-[#F8F9FA]"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span className="text-[#9A9CA3]">P-{c.n}</span>
            <span className="truncate pr-2 font-medium text-[#1B1C1F]">{c.title}</span>
            <span className="flex items-center gap-1.5 text-[#45474D]">
              <span className="size-1.5 rounded-full" style={{ background: COLS[c.col].color }} />
              {COLS[c.col].title}
            </span>
            <span className="flex items-center gap-1.5 text-[#45474D]">
              <Avatar who={c.who} size={16} /> {PEOPLE[c.who].name}
            </span>
            <span className="text-right text-[#6B6E76]">{c.due}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function GanttView({ cards, onOpen }: { cards: Card[]; onOpen: (id: string) => void }) {
  const days = 14;
  const sorted = [...cards].sort((a, b) => a.start - b.start);
  return (
    <div className="h-full overflow-auto p-3">
      <div className="min-w-[560px] rounded-xl border border-[#E6E7EA] bg-white">
        <div className="grid grid-cols-[170px_1fr] border-b border-[#E6E7EA] text-[10px] text-[#9A9CA3]">
          <span className="px-3 py-2">Задача</span>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${days}, 1fr)` }}>
            {Array.from({ length: days }, (_, d) => (
              <span key={d} className={`border-l border-[#F0F1F3] py-2 text-center ${d === 4 ? "font-semibold text-[#D23F3F]" : ""}`}>
                {d + 1}
              </span>
            ))}
          </div>
        </div>
        {sorted.map((c, i) => (
          <button key={c.id} onClick={() => onOpen(c.id)} className="grid w-full grid-cols-[170px_1fr] items-center border-b border-[#F0F1F3] text-left last:border-b-0 hover:bg-[#F8F9FA]">
            <span className="truncate px-3 py-2 text-xs text-[#1B1C1F]">{c.title}</span>
            <div className="relative h-8">
              <div className="absolute inset-y-0 border-l-2 border-dashed border-[#D23F3F]/40" style={{ left: `${(4.5 / days) * 100}%` }} />
              <div
                className="lp-grow absolute top-1.5 flex h-5 items-center overflow-hidden rounded-md px-2 text-[10px] font-medium text-white"
                style={{
                  left: `${(c.start / days) * 100}%`,
                  width: `${(c.len / days) * 100}%`,
                  background: COLS[c.col].color,
                  animationDelay: `${i * 70}ms`,
                }}
              >
                {c.len > 1 ? PEOPLE[c.who].name : ""}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function TimeView({ cards }: { cards: Card[] }) {
  const per = PEOPLE.map((p, i) => ({ ...p, hours: cards.filter((c) => c.who === i).reduce((n, c) => n + c.hours, 0) }));
  const max = Math.max(...per.map((p) => p.hours), 1);
  const total = per.reduce((n, p) => n + p.hours, 0);
  return (
    <div className="h-full overflow-auto p-3">
      <div className="grid gap-2.5 sm:grid-cols-3">
        {[
          ["Всего за неделю", `${total} ч`],
          ["Бюджет проекта", "120 ч"],
          ["Осталось", `${120 - total} ч`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-[#E6E7EA] bg-white px-3 py-2.5">
            <div className="text-[11px] text-[#9A9CA3]">{k}</div>
            <div className="mt-0.5 text-lg font-semibold text-[#1B1C1F]">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-2.5 space-y-2.5 rounded-xl border border-[#E6E7EA] bg-white p-3">
        {per.map((p, i) => (
          <div key={p.name} className="grid grid-cols-[110px_1fr_44px] items-center gap-3 text-xs">
            <span className="flex items-center gap-2 text-[#1B1C1F]">
              <Avatar who={i} size={20} /> {p.name}
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-[#EEF0F2]">
              <span className="lp-grow block h-full rounded-full" style={{ width: `${(p.hours / max) * 100}%`, background: p.color, animationDelay: `${i * 90}ms` }} />
            </span>
            <span className="text-right text-[#6B6E76]">{p.hours} ч</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const TABS: { id: View; label: string; icon: typeof KanbanSquare }[] = [
  { id: "board", label: "Доска", icon: KanbanSquare },
  { id: "list", label: "Список", icon: List },
  { id: "gantt", label: "Гант", icon: CalendarRange },
  { id: "time", label: "Время", icon: Clock },
];

export function ProductPreview() {
  const [cards, setCards] = useState(INITIAL);
  const [view, setView] = useState<View>("board");
  const [open, setOpen] = useState<string | null>(null);
  const [moved, setMoved] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const step = useRef(0);

  const move = useCallback((id: string, col: number) => {
    setCards((list) => list.map((c) => (c.id === id ? { ...c, col } : c)));
    setMoved(id);
  }, []);

  // Self-playing demo until the visitor interacts (and not with reduced motion).
  useEffect(() => {
    if (touched || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      const [id, col] = SCRIPT[step.current % SCRIPT.length];
      step.current++;
      if (step.current % SCRIPT.length === 0) setCards(INITIAL);
      else move(id, col);
    }, 2600);
    return () => clearInterval(timer);
  }, [touched, move]);

  useEffect(() => {
    if (!moved) return;
    const t = setTimeout(() => setMoved(null), 1400);
    return () => clearTimeout(t);
  }, [moved]);

  const card = useMemo(() => cards.find((c) => c.id === open) ?? null, [cards, open]);
  const doneCount = cards.filter((c) => c.col === 3).length;

  return (
    <div className="relative" onPointerDown={() => setTouched(true)}>
      {/* Hint */}
      {!touched && (
        <div className="lp-float pointer-events-none absolute -top-4 right-6 z-30 hidden items-center gap-1.5 rounded-full bg-[#1B1C1F] px-3 py-1.5 text-xs font-medium text-white shadow-lg sm:flex">
          <Hand size={13} /> Попробуйте: перетащите карточку
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-[#E6E7EA] bg-white text-left shadow-[0_30px_80px_-20px_rgba(27,28,31,0.25),0_8px_24px_-8px_rgba(27,28,31,0.12)]">
        {/* Window bar */}
        <div className="flex h-9 items-center gap-1.5 border-b border-[#E6E7EA] bg-[#F8F9FA] px-3">
          <span className="size-2.5 rounded-full bg-[#FF5F57]" />
          <span className="size-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="size-2.5 rounded-full bg-[#28C840]" />
          <span className="mx-auto hidden rounded-md bg-white px-10 py-0.5 text-[11px] text-[#9A9CA3] sm:block">plano.team/projects/crm</span>
        </div>
        <div className="flex h-[480px] sm:h-[520px]">
          {/* Sidebar */}
          <aside className="hidden w-[180px] shrink-0 flex-col gap-0.5 bg-[#2B2F33] p-2 text-[12px] md:flex">
            <div className="mb-2 flex items-center gap-2 px-2 py-1.5 font-medium text-white">
              <img src="/plano.svg" alt="" className="size-5 rounded" /> Студия «Север»
            </div>
            <div className="mb-2 flex items-center gap-2 rounded-md bg-white/5 px-2 py-1.5 text-[#979CA2]">
              <Search size={13} /> Поиск
            </div>
            {[
              [House, "Главная", false],
              [FolderKanban, "Проекты", false],
            ].map(([Icon, label]) => {
              const I = Icon as typeof House;
              return (
                <div key={label as string} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[#CDD0D4]">
                  <I size={14} className="text-[#979CA2]" /> {label as string}
                </div>
              );
            })}
            <div className="mt-3 px-2 py-1 text-[10px] text-[#979CA2]">В работе</div>
            {["Внедрение CRM", "Сайт для клиники", "Поддержка"].map((p, i) => (
              <div key={p} className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${i === 0 ? "bg-[#43484E] text-white" : "text-[#CDD0D4]"}`}>
                <span className="grid size-4 place-items-center rounded bg-white/90 text-[9px] font-bold text-[#2B2F33]">{p[0]}</span>
                <span className="truncate">{p}</span>
                <span className="ml-auto text-[10px] text-[#979CA2]">{i === 0 ? cards.filter((c) => c.col < 3).length : [8, 3][i - 1]}</span>
              </div>
            ))}
            <div className="mt-auto flex items-center gap-2 px-2 py-1.5 text-[#CDD0D4]">
              <Avatar who={0} size={20} /> Анна
            </div>
          </aside>
          {/* Main */}
          <div className="relative flex min-w-0 flex-1 flex-col bg-white">
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[#E6E7EA] px-3">
              <span className="truncate text-sm font-medium text-[#1B1C1F]">Внедрение CRM</span>
              <span className="hidden items-center gap-1.5 text-[11px] text-[#9A9CA3] sm:flex">
                <span className="h-1 w-16 overflow-hidden rounded-full bg-[#EEF0F2]">
                  <span className="block h-full rounded-full bg-[#2FA36B] transition-all duration-700" style={{ width: `${(doneCount / cards.length) * 100}%` }} />
                </span>
                {doneCount} из {cards.length}
              </span>
              <div role="tablist" className="ml-auto flex items-center gap-0.5">
                {TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={view === id}
                    onClick={() => {
                      setView(id);
                      setTouched(true);
                    }}
                    className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors ${view === id ? "bg-[#EEF0F2] font-medium text-[#1B1C1F]" : "text-[#6B6E76] hover:bg-[#F3F4F6]"}`}
                  >
                    <Icon size={13} /> <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div key={view} className="min-h-0 flex-1 animate-dialog-in bg-[#FBFBFC]">
              {view === "board" && <BoardView cards={cards} moved={moved} onOpen={setOpen} onDrop={(id, col) => id && move(id, col)} />}
              {view === "list" && <ListView cards={cards} onOpen={setOpen} />}
              {view === "gantt" && <GanttView cards={cards} onOpen={setOpen} />}
              {view === "time" && <TimeView cards={cards} />}
            </div>
            {card && (
              <>
                <div className="absolute inset-0 z-10 bg-black/10" onClick={() => setOpen(null)} />
                <CardPanel
                  card={card}
                  onClose={() => setOpen(null)}
                  onMove={(col) => move(card.id, col)}
                  onToggle={(i) => setCards((list) => list.map((c) => (c.id === card.id ? { ...c, subtasks: c.subtasks.map((s, j) => (j === i ? { ...s, done: !s.done } : s)) } : c)))}
                />
              </>
            )}
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-ink-ghost sm:hidden">Нажмите на карточку, чтобы открыть и перенести её</p>
    </div>
  );
}

