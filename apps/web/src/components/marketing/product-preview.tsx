"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
  ChartGantt,
  Check,
  ChevronRight,
  ChevronUp,
  Download,
  FolderKanban,
  Hand,
  House,
  KanbanSquare,
  List,
  ListFilter,
  PanelLeftClose,
  Search,
  Settings,
  SlidersHorizontal,
  Table2,
  X,
} from "lucide-react";
import { forceLocale, setCardKeyPrefix, type CardTileDto, type ColumnDto, type Locale, type TaskTypeRefDto } from "@plano/shared";
import { makeTr, type Tr } from "@/lib/marketing";
import { Avatar, LetterMark } from "@/components/avatar";
import { ColumnShell, ProjectFunnel } from "@/components/board";
import { CardTile } from "@/components/card-tile";
import { CardsList, CardsTable } from "@/components/cards-views";
import { Segmented, ShareBar } from "@/components/ui";
import { columnColor } from "@/design/tokens";
import { applyFilters, DEFAULT_FILTERS, type CardFilters } from "@/lib/card-filters";

// A working copy of the project screen for the landing page, built from the
// app's own components (card tile, column, table, list), so it looks like the
// product. Cards can be dragged between stages, opened and their subtasks
// ticked; views and quick filters switch. Until the visitor touches it, it
// plays a short demo. Everything is local state — nothing is sent anywhere.

type View = "kanban" | "table" | "list" | "gantt" | "overview";

const makePeople = (tr: Tr) => [
  { id: "u1", name: tr("mk.productPreview.annaSmirnova"), avatarUrl: null },
  { id: "u2", name: tr("mk.productPreview.ilyaPetrov"), avatarUrl: null },
  { id: "u3", name: tr("mk.productPreview.mariaKim"), avatarUrl: null },
  { id: "u4", name: tr("mk.productPreview.olegNovikov"), avatarUrl: null },
];
const makeStages = (tr: Tr) => [tr("settings.templates.id.backlog"), tr("settings.templates.id.inProgress"), tr("settings.templates.id.inReview"), tr("common.done")];
const DAY = 86_400_000;
const today = new Date(new Date().toDateString()).getTime();
const at = (days: number) => new Date(today + days * DAY).toISOString();

// The demo shows a few task types a team might set up.
const makeTypes = (tr: Tr) => ({
  SETUP: { id: "setup", name: tr("mk.productPreview.setup"), color: "blue" },
  INTEGRATION: { id: "integration", name: tr("mk.productPreview.integration"), color: "orange" },
  WIDGET: { id: "widget", name: tr("mk.productPreview.development"), color: "teal" },
  TRAINING: { id: "training", name: tr("mk.productPreview.training"), color: "green" },
  BUG: { id: "bug", name: tr("mk.productPreview.bug"), color: "red" },
  OTHER: { id: "task", name: tr("common.task"), color: null },
}) satisfies Record<string, TaskTypeRefDto>;
type TypeKey = "SETUP" | "INTEGRATION" | "WIDGET" | "TRAINING" | "BUG" | "OTHER";
type Seed = [n: number, title: string, type: TypeKey, stage: number, who: number[], due: number, start: number, subtasks: [string, boolean][], comments: number, files: number, high?: boolean];
const makeSeeds = (tr: Tr): Seed[] => [
  [21, tr("mk.productPreview.clientBriefAndRequirements"), "SETUP", 3, [0], -3, -6, [[tr("mk.productPreview.meetingWithTheClient"), true], [tr("mk.productPreview.goalsAndMetrics"), true], [tr("mk.productPreview.timelineAndBudget"), true]], 4, 2],
  [22, tr("mk.productPreview.salesFunnelAndDealStages"), "SETUP", 2, [1], 1, -3, [[tr("mk.productPreview.dealStages"), true], [tr("mk.productPreview.cardFields"), true], [tr("mk.productPreview.managerPermissions"), false]], 2, 0],
  [27, tr("mk.productPreview.septemberReport"), "OTHER", 2, [0], 0, -1, [], 1, 1],
  [23, tr("mk.productPreview.websiteIntegrationLeadForm"), "INTEGRATION", 1, [3, 1], 4, -1, [[tr("mk.productPreview.leadForm"), true], [tr("mk.productPreview.webhook"), false], [tr("mk.productPreview.testWithSampleData"), false]], 6, 1, true],
  [24, tr("mk.productPreview.telephonyAndCallRecording"), "INTEGRATION", 1, [1], 5, 1, [[tr("mk.productPreview.connectANumber"), false], [tr("mk.productPreview.callScripts"), false]], 1, 0],
  [26, tr("mk.productPreview.newLeadNotificationsDonT"), "BUG", 0, [3], -1, -2, [[tr("mk.productPreview.reproduce"), false]], 3, 1, true],
  [25, tr("mk.productPreview.salesTeamTraining"), "TRAINING", 0, [2], 9, 7, [[tr("mk.productPreview.slides"), false], [tr("mk.productPreview.webinarRecording"), false]], 0, 3],
  [28, tr("mk.productPreview.priceCalculatorWidget"), "WIDGET", 0, [2, 0], 12, 8, [], 0, 0],
];


// Everything language-dependent in the demo: texts, people, stages, task types, cards.
interface World {
  tr: Tr;
  people: ReturnType<typeof makePeople>;
  stages: string[];
  types: ReturnType<typeof makeTypes>;
  seeds: Seed[];
}
const makeWorld = (locale: Locale): World => {
  const tr = makeTr(locale);
  return { tr, people: makePeople(tr), stages: makeStages(tr), types: makeTypes(tr), seeds: makeSeeds(tr) };
};
const WorldContext = createContext<World>(makeWorld("ru"));
const useWorld = () => useContext(WorldContext);

function makeColumns({ tr, people: PEOPLE, stages: STAGES, types: TYPES, seeds: SEEDS }: World): ColumnDto[] {
  return STAGES.map((title, i) => ({
    id: `col${i}`,
    title,
    position: i + 1,
    wipLimit: i === 1 ? 3 : null,
    color: null,
    cards: SEEDS.filter((s) => s[3] === i).map(([n, cardTitle, type, , who, due, start, subtasks, comments, files, high], k) => ({
      id: `c${n}`,
      number: n,
      columnId: `col${i}`,
      title: cardTitle,
      description: null,
      type: TYPES[type],
      priority: high ? "HIGH" : "MEDIUM",
      position: k + 1,
      dueDate: at(due),
      startDate: at(start),
      estimateHours: null,
      updatedAt: at(0),
      assignees: who.map((w) => ({ user: PEOPLE[w] })),
      project: { id: "p1", title: tr("mk.shared.crmImplementation") },
      checklist: subtasks.map(([text, done], j) => ({ id: `c${n}-${j}`, text, done })),
      _count: { comments, attachments: files },
      labels: [],
    })) as unknown as CardTileDto[],
  })) as ColumnDto[];
}

// The self-playing demo: card number → stage, in turn.
const SCRIPT: [number, number][] = [
  [23, 2],
  [25, 1],
  [22, 3],
  [26, 1],
  [23, 3],
  [24, 2],
];

// ---- Sidebar, with the app shell's classes ----

function Nav({ icon: Icon, label, count }: { icon: typeof House; label: string; count?: number }) {
  return (
    <div className="flex h-[30px] items-center gap-2.5 rounded-md px-2 text-sm text-chrome-ink-soft">
      <Icon size={16} strokeWidth={1.75} className="text-chrome-ink-faint" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count ? <span className="text-xs font-semibold text-red-300">{count}</span> : null}
    </div>
  );
}

function Sidebar({ open }: { open: number }) {
  const { tr, people: PEOPLE, stages: STAGES } = useWorld();
  return (
    <aside className="hidden w-[232px] shrink-0 flex-col bg-chrome px-2 pb-2 md:flex">
      <div className="flex h-12 items-center px-1">
        <span className="flex h-8 items-center gap-2 px-1.5 text-chrome-ink">
          <img src="/plano.svg" alt="" className="size-5 rounded-[5px]" />
          <span className="text-sm font-medium">{tr("mk.productPreview.northStudio")}</span>
        </span>
        <span className="ml-auto flex items-center gap-1 text-chrome-ink-faint">
          <span className="relative grid size-7 place-items-center">
            <Bell size={16} strokeWidth={1.75} />
            <span className="absolute right-1 top-1 size-1.5 rounded-full bg-red-400" />
          </span>
          <span className="grid size-7 place-items-center">
            <PanelLeftClose size={16} strokeWidth={1.75} />
          </span>
        </span>
      </div>
      <div className="mb-2 px-1">
        <div className="relative">
          <Search size={14} strokeWidth={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-chrome-ink-faint" />
          <div className="flex h-8 items-center rounded-md border border-chrome-line bg-chrome-hover pl-8 text-sm text-chrome-ink-faint">{tr("common.search")}</div>
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm border border-chrome-line bg-chrome px-1 text-xs text-chrome-ink-faint">⌘K</kbd>
        </div>
      </div>
      <nav className="flex flex-col gap-px px-1">
        <Nav icon={House} label={tr("common.home")} count={2} />
        <Nav icon={FolderKanban} label={tr("common.projects")} />
      </nav>
      <div className="mt-5 px-1">
        <div className="flex h-7 items-center px-2 text-xs text-chrome-ink-faint">{tr("settings.templates.id.inProgress")}</div>
        {(
          [
            [tr("mk.shared.crmImplementation"), open],
            [tr("mk.productPreview.clinicWebsite"), 8],
            [tr("mk.shared.customerSupport"), 3],
          ] as const
        ).map(([title, n], i) => (
          <div
            key={title}
            className={`flex h-[30px] items-center gap-2.5 rounded-md px-2 text-sm ${i === 0 ? "bg-chrome-active font-medium text-chrome-ink" : "text-chrome-ink-soft"}`}
          >
            <LetterMark name={title} size={16} />
            <span className="min-w-0 flex-1 truncate">{title}</span>
            <span className="text-xs text-chrome-ink-faint">{n}</span>
          </div>
        ))}
      </div>
      <div className="mt-auto border-t border-chrome-line px-1 pt-2">
        <div className="flex h-9 items-center gap-2 rounded-md px-1.5 text-chrome-ink">
          <Avatar user={PEOPLE[0]} size={22} />
          <span className="min-w-0 flex-1 truncate text-sm">{tr("mk.productPreview.annaSmirnova")}</span>
          <ChevronUp size={14} className="text-chrome-ink-faint" />
        </div>
      </div>
    </aside>
  );
}

// ---- Views the app has no pure component for ----

function GanttPreview({ columns, onOpen }: { columns: ColumnDto[]; onOpen: (id: string) => void }) {
  const { tr, people: PEOPLE, stages: STAGES } = useWorld();
  const from = -7;
  const days = 21;
  const rows = columns
    .flatMap((c, i) => c.cards.map((card) => ({ card, color: columnColor(c.color, i, columns.length) })))
    .sort((a, b) => (a.card.startDate ?? "").localeCompare(b.card.startDate ?? ""));
  const dayOf = (iso: string) => Math.round((new Date(iso).getTime() - today) / DAY) - from;
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-[240px_1fr] border-b border-border bg-surface-soft text-xs text-ink-ghost">
          <span className="px-3 py-2">{tr("common.task")}</span>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${days}, 1fr)` }}>
            {Array.from({ length: days }, (_, d) => (
              <span key={d} className={`border-l border-border py-2 text-center ${d + from === 0 ? "font-semibold text-danger" : ""}`}>
                {new Date(today + (d + from) * DAY).getDate()}
              </span>
            ))}
          </div>
        </div>
        {rows.map(({ card, color }, i) => {
          const s = Math.max(dayOf(card.startDate!), 0);
          const e = Math.min(dayOf(card.dueDate!) + 1, days);
          return (
            <button key={card.id} onClick={() => onOpen(card.id)} className="grid w-full grid-cols-[240px_1fr] items-center border-b border-border text-left last:border-b-0 hover:bg-surface-soft">
              <span className="truncate px-3 py-2 text-sm">{card.title}</span>
              <div className="relative h-9">
                <div className="absolute inset-y-0 border-l-2 border-dashed border-danger/40" style={{ left: `${((-from + 0.5) / days) * 100}%` }} />
                <div
                  className="lp-grow absolute top-2 flex h-5 items-center overflow-hidden rounded px-2 text-[11px] font-medium text-white"
                  style={{ left: `${(s / days) * 100}%`, width: `${((e - s) / days) * 100}%`, background: color, animationDelay: `${i * 60}ms` }}
                >
                  {card.assignees[0]?.user.name.split(" ")[0]}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OverviewPreview({ columns }: { columns: ColumnDto[] }) {
  const { tr, people: PEOPLE, stages: STAGES } = useWorld();
  const all = columns.flatMap((c) => c.cards);
  const done = columns[columns.length - 1].cards.length;
  const overdue = all.filter((c) => c.columnId !== "col3" && c.dueDate && new Date(c.dueDate).getTime() < today).length;
  const hours: [number, number][] = [
    [0, 14],
    [1, 11],
    [3, 9],
    [2, 5],
  ];
  return (
    <div className="space-y-4 pt-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            [tr("common.cards"), all.length],
            [tr("common.done"), done],
            [tr("common.overdue"), overdue],
            [tr("dashboard.timeThisWeek"), tr("mk.productPreview.39HOf120")],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border bg-surface px-4 py-3.5">
            <div className="text-sm text-ink-faint">{k}</div>
            <div className={`mt-1 text-2xl font-semibold ${k === tr("common.overdue") && overdue ? "text-danger" : ""}`}>{v}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-3 text-base font-medium">{tr("mk.productPreview.timeByPeople")}</div>
        <div className="space-y-2.5">
          {hours.map(([who, h]) => (
            <div key={who} className="grid grid-cols-[minmax(0,1fr)_200px_48px] items-center gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <Avatar user={PEOPLE[who]} size={20} />
                <span className="truncate">{PEOPLE[who].name}</span>
              </span>
              <ShareBar value={h / 39} />
              <span className="text-right text-ink-faint">{tr("common.h", { h })}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Card window, in the app's modal style ----

function CardWindow({ card, column, onClose, onMove, onToggle }: { card: CardTileDto; column: number; onClose: () => void; onMove: (col: number) => void; onToggle: (id: string) => void }) {
  const { tr, people: PEOPLE, stages: STAGES } = useWorld();
  const done = card.checklist.filter((i) => i.done).length;
  return (
    <div className="absolute inset-0 z-20 flex items-start justify-center bg-black/30 p-4 pt-8" onClick={onClose}>
      <div className="animate-dialog-in flex max-h-full w-full max-w-[600px] flex-col overflow-hidden rounded-xl bg-surface shadow-raised" onClick={(e) => e.stopPropagation()}>
        <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border pl-5 pr-3 text-sm">
          <LetterMark name={card.project.title} size={18} />
          <span className="ml-1 truncate text-ink-faint">{card.project.title}</span>
          <ChevronRight size={14} className="shrink-0 text-ink-ghost" />
          <span className="font-medium text-ink">P-{card.number}</span>
          <button onClick={onClose} aria-label={tr("ui.close")} className="ml-auto grid size-8 place-items-center rounded-md text-ink-ghost hover:bg-surface-soft hover:text-ink">
            <X size={17} strokeWidth={1.5} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-6 pt-4">
          <h4 className="text-xl font-semibold leading-snug">{card.title}</h4>
          <div className="mt-4 grid grid-cols-[110px_1fr] items-center gap-y-2.5 text-sm">
            <span className="text-ink-faint">{tr("projects.id.settings.stage")}</span>
            <div className="flex flex-wrap gap-1">
              {STAGES.map((s, i) => (
                <button
                  key={s}
                  onClick={() => onMove(i)}
                  className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors ${column === i ? "bg-surface-sunken font-medium text-ink" : "text-ink-faint hover:bg-surface-soft hover:text-ink"}`}
                >
                  <span className="size-2 rounded-full" style={{ background: columnColor(null, i, STAGES.length) }} />
                  {s}
                </button>
              ))}
            </div>
            <span className="text-ink-faint">{tr("common.assignees")}</span>
            <span className="flex flex-wrap items-center gap-3">
              {card.assignees.map(({ user }) => (
                <span key={user.id} className="flex items-center gap-1.5">
                  <Avatar user={user} size={20} /> {user.name}
                </span>
              ))}
            </span>
            <span className="text-ink-faint">{tr("common.dueDate")}</span>
            <span>{new Date(card.dueDate!).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</span>
          </div>
          {card.checklist.length > 0 && (
            <section className="mt-6">
              <header className="mb-2 flex items-center gap-2">
                <h3 className="text-sm font-medium">{tr("common.subtasks")}</h3>
                <span className="text-xs text-ink-ghost"> {tr("mk.productPreview.of", { done, checklist: card.checklist.length })} </span>
                <div className="ml-auto w-24">
                  <ShareBar value={done / card.checklist.length} tone="success" />
                </div>
              </header>
              <div className="overflow-hidden rounded-lg border border-border">
                {card.checklist.map((item) => (
                  <button key={item.id} onClick={() => onToggle(item.id)} className="flex h-10 w-full items-center gap-3 border-b border-border px-3 text-left last:border-b-0 hover:bg-surface-soft">
                    <span className={`grid size-4 shrink-0 place-items-center rounded-sm border transition-colors ${item.done ? "border-accent bg-accent text-white" : "border-border-strong bg-surface"}`}>
                      {item.done && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className={`flex-1 text-base ${item.done ? "text-ink-ghost line-through" : "text-ink"}`}>{item.text}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          <section className="mt-6">
            <h3 className="mb-2 text-sm font-medium">{tr("cardModal.discussion")}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <Avatar user={PEOPLE[2]} size={24} />
                <div className="rounded-2xl rounded-tl-md bg-surface-soft px-3 py-2">
                  <span className="font-medium text-accent">@{card.assignees[0]?.user.name}</span>  {tr("mk.productPreview.pleaseTakeALookBefore")}
                </div>
              </div>
              <div className="flex justify-end">
                <div className="rounded-2xl rounded-tr-md bg-accent px-3 py-2 text-white">{tr("mk.productPreview.onItWillDoIt")}</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Preview() {
  const world = useWorld();
  const { tr, people: PEOPLE, stages: STAGES } = world;
  // Card keys read as P-21 in the preview.
  useMemo(() => setCardKeyPrefix("P"), []);
  const [columns, setColumns] = useState<ColumnDto[]>(() => makeColumns(world));
  const [view, setView] = useState<View>("kanban");
  const [filters, setFilters] = useState<CardFilters>(DEFAULT_FILTERS);
  const [openId, setOpenId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const dragId = useRef<string | null>(null);
  const step = useRef(0);

  const move = useCallback((cardId: string, colIndex: number) => {
    setColumns((cols) => {
      const card = cols.flatMap((c) => c.cards).find((c) => c.id === cardId);
      if (!card || card.columnId === `col${colIndex}`) return cols;
      return cols.map((c, i) => {
        const rest = c.cards.filter((x) => x.id !== cardId);
        return i === colIndex ? { ...c, cards: [{ ...card, columnId: c.id }, ...rest] } : { ...c, cards: rest };
      });
    });
  }, []);

  // Self-playing demo until the visitor interacts (and not with reduced motion).
  useEffect(() => {
    if (touched || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      const i = step.current++ % (SCRIPT.length + 1);
      if (i === SCRIPT.length) setColumns(makeColumns(world));
      else move(`c${SCRIPT[i][0]}`, SCRIPT[i][1]);
    }, 2600);
    return () => clearInterval(timer);
  }, [touched, move]);

  const open = useMemo(() => columns.flatMap((c) => c.cards).find((c) => c.id === openId) ?? null, [columns, openId]);
  const openCol = open ? columns.findIndex((c) => c.id === open.columnId) : -1;
  const shown = columns.reduce((n, c) => n + applyFilters(c.cards, filters).length, 0);

  return (
    <div className="relative" onPointerDown={() => setTouched(true)}>
      {!touched && (
        <div className="lp-float pointer-events-none absolute -top-4 right-6 z-30 hidden items-center gap-1.5 rounded-full bg-[#1B1C1F] px-3 py-1.5 text-xs font-medium text-white shadow-lg sm:flex">
          <Hand size={13} />  {tr("mk.productPreview.tryItDragACard")}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-[#E6E7EA] bg-chrome text-left shadow-[0_30px_80px_-20px_rgba(27,28,31,0.25),0_8px_24px_-8px_rgba(27,28,31,0.12)]">
        <div className="flex h-9 items-center gap-1.5 border-b border-[#E6E7EA] bg-[#F8F9FA] px-3">
          <span className="size-2.5 rounded-full bg-[#FF5F57]" />
          <span className="size-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="size-2.5 rounded-full bg-[#28C840]" />
          <span className="mx-auto hidden rounded-md bg-white px-10 py-0.5 text-[11px] text-[#9A9CA3] sm:block">plano.team/projects/crm</span>
        </div>
        {/* The app at its real size, scaled down to fit the landing column. */}
        <div className="[zoom:0.62] sm:[zoom:0.78] lg:[zoom:0.86]">
          <div className="flex h-[700px]">
            <Sidebar open={columns.slice(0, -1).reduce((n, c) => n + c.cards.length, 0)} />
            <main className="relative my-2 ml-2 mr-2 min-w-0 flex-1 overflow-hidden rounded-lg bg-bg md:ml-0">
              <div className="flex h-full flex-col px-6">
                <header className="-mx-6 flex h-12 shrink-0 items-center gap-3 border-b border-border px-6">
                  <nav className="flex min-w-0 items-center gap-1.5 text-sm">
                    <span className="text-ink-faint">{tr("common.projects")}</span>
                    <ChevronRight size={14} className="shrink-0 text-ink-ghost" />
                    <span className="truncate font-medium text-ink">{tr("mk.shared.crmImplementation")}</span>
                  </nav>
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    <span className="hidden xl:block">
                      <ProjectFunnel columns={columns} />
                    </span>
                    <span aria-hidden className="mx-1 hidden h-4 w-px bg-border xl:block" />
                    <span className="hidden size-7 place-items-center text-ink-ghost sm:grid">
                      <Download size={16} strokeWidth={1.75} />
                    </span>
                    <span className="hidden size-7 place-items-center text-ink-ghost sm:grid">
                      <Settings size={16} strokeWidth={1.75} />
                    </span>
                    <Segmented<View>
                      label={tr("projects.id.view")}
                      value={view}
                      onChange={(v) => {
                        setView(v);
                        setTouched(true);
                      }}
                      options={[
                        { value: "kanban", label: tr("projects.id.board"), icon: KanbanSquare },
                        { value: "table", label: tr("projects.id.table"), icon: Table2 },
                        { value: "list", label: tr("common.list"), icon: List },
                        { value: "gantt", label: tr("projects.id.gantt"), icon: ChartGantt },
                        { value: "overview", label: tr("common.overview"), icon: BarChart3 },
                      ]}
                    />
                  </div>
                </header>

                {view !== "overview" && (
                  <div className="flex shrink-0 items-center gap-2 py-2.5">
                    <Segmented<CardFilters["date"]>
                      label={tr("common.dueDate")}
                      value={filters.date}
                      onChange={(date) => setFilters((f) => ({ ...f, date }))}
                      options={[
                        { value: "all", label: tr("common.all") },
                        { value: "today", label: tr("common.today") },
                        { value: "week", label: tr("boardToolbar.7Days") },
                        { value: "overdue", label: tr("common.overdue") },
                      ]}
                    />
                    <span aria-hidden className="mx-1 h-4 w-px bg-border" />
                    <div className="relative hidden sm:block">
                      <Search size={14} strokeWidth={1.75} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-ghost" />
                      <input
                        type="search"
                        value={filters.q}
                        onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                        placeholder={tr("boardToolbar.searchTheBoard")}
                        aria-label={tr("mk.productPreview.findACard")}
                        className="h-7 w-44 rounded-md border border-border bg-surface pl-7 pr-2 text-sm outline-none placeholder:text-ink-ghost focus:border-accent"
                      />
                    </div>
                    <span className="hidden h-7 items-center gap-1.5 rounded-md px-2 text-sm text-ink-faint lg:flex">
                      <ListFilter size={15} strokeWidth={1.75} />  {tr("boardToolbar.filter")}
                    </span>
                    <span className="hidden h-7 items-center gap-1.5 rounded-md px-2 text-sm text-ink-faint lg:flex">
                      <SlidersHorizontal size={15} strokeWidth={1.75} />  {tr("boardToolbar.sort")}
                    </span>
                    <span className="ml-auto text-xs text-ink-ghost">{tr("mk.productPreview.cards", { shown })}</span>
                  </div>
                )}

                <div key={view} className="min-h-0 flex-1 animate-dialog-in overflow-auto pb-4">
                  {view === "kanban" && (
                    <div className="-mx-6 flex h-full items-start gap-2 overflow-x-auto px-6">
                      {columns.map((column, index) => {
                        const visible = applyFilters(column.cards, filters);
                        return (
                          <ColumnShell
                            key={column.id}
                            title={column.title}
                            color={columnColor(column.color, index, columns.length)}
                            count={visible.length}
                            wipLimit={column.wipLimit}
                            highlighted={over === column.id}
                            onDragOver={(e) => {
                              e.preventDefault();
                              if (over !== column.id) setOver(column.id);
                            }}
                            onDrop={() => {
                              if (dragId.current) move(dragId.current, index);
                              dragId.current = null;
                              setOver(null);
                            }}
                          >
                            {visible.map((card) => (
                              <div
                                key={card.id}
                                draggable
                                onDragStart={() => (dragId.current = card.id)}
                                onDragEnd={() => setOver(null)}
                                className="lp-rise cursor-grab active:cursor-grabbing"
                              >
                                <CardTile card={card} onOpen={() => setOpenId(card.id)} />
                              </div>
                            ))}
                          </ColumnShell>
                        );
                      })}
                    </div>
                  )}
                  {view === "table" && <CardsTable columns={columns} filters={filters} onOpenCard={setOpenId} />}
                  {view === "list" && <CardsList columns={columns} filters={filters} onOpenCard={setOpenId} />}
                  {view === "gantt" && <GanttPreview columns={columns} onOpen={setOpenId} />}
                  {view === "overview" && <OverviewPreview columns={columns} />}
                </div>
              </div>

              {open && (
                <CardWindow
                  card={open}
                  column={openCol}
                  onClose={() => setOpenId(null)}
                  onMove={(i) => move(open.id, i)}
                  onToggle={(itemId) =>
                    setColumns((cols) =>
                      cols.map((c) => ({
                        ...c,
                        cards: c.cards.map((x) => (x.id === open.id ? { ...x, checklist: x.checklist.map((it) => (it.id === itemId ? { ...it, done: !it.done } : it)) } : x)),
                      })),
                    )
                  }
                />
              )}
            </main>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-ink-ghost sm:hidden">{tr("mk.productPreview.clickACardToOpen")}</p>
    </div>
  );
}

// Sets the language of the app components shown inside the demo (card tiles,
// table, list), which otherwise follow the visitor's browser: the page's
// language is fixed by its address. The scope starts before the demo and, on the
// server, ends right after it, so one request cannot leak into another.
function LocaleScope({ locale }: { locale: Locale }) {
  forceLocale(locale);
  useEffect(() => {
    forceLocale(locale);
    return () => forceLocale(null);
  }, [locale]);
  return null;
}
function LocaleScopeEnd() {
  if (typeof window === "undefined") forceLocale(null);
  return null;
}

export function ProductPreview({ locale = "ru" }: { locale?: Locale }) {
  const world = useMemo(() => makeWorld(locale), [locale]);
  return (
    <WorldContext.Provider value={world}>
      <LocaleScope locale={locale} />
      <Preview />
      <LocaleScopeEnd />
    </WorldContext.Provider>
  );
}
