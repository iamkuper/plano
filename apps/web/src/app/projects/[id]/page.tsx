"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, CalendarDays, ChartGantt, Download, KanbanSquare, List, Settings, Table2 } from "lucide-react";
import { PROJECT_STATUS_LABELS, type ProjectListItemDto, type UserDto } from "@amo-kanban/shared";
import { AppShell } from "@/components/app-shell";
import { Board, BoardSkeleton, ProjectFunnel } from "@/components/board";
import { BulkBar } from "@/components/bulk-bar";
import { BoardToolbar } from "@/components/board-toolbar";
import { CardModal } from "@/components/card-modal";
import { CardsCalendar } from "@/components/cards-calendar";
import { GanttChart } from "@/components/gantt-chart";
import { CardsList, CardsTable } from "@/components/cards-views";
import { ProjectOverview } from "@/components/project-overview";
import { PageHeader, Segmented } from "@/components/ui";
import { api, downloadProjectCsv } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useBoard } from "@/lib/use-board";
import { useCardParam, useQueryParam } from "@/lib/use-card-param";
import { useFilters } from "@/lib/use-filters";
import { useDebounced, useRealtime } from "@/lib/realtime";
import { applyFilters } from "@/lib/card-filters";

type View = "kanban" | "table" | "list" | "calendar" | "gantt" | "overview";

function ProjectPage({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectListItemDto | null>(null);
  const [users, setUsers] = useState<UserDto[]>([]);
  // null until the plan is known.
  const [hasGantt, setHasGantt] = useState<boolean | null>(null);
  const state = useBoard(projectId);
  const { board, reload } = state;
  const [cardId, setCardId] = useCardParam();
  const [viewParam, setView] = useQueryParam("view");
  const view = (viewParam as View) ?? "kanban";
  const [filters, setFilters] = useFilters(`amo-kanban.filters.${projectId}`);

  // Board/table selection for bulk actions (Shift/⌘-click or checkbox).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const selectMany = (ids: string[], on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  // Drop ids that no longer exist (deleted elsewhere).
  useEffect(() => {
    if (!board) return;
    const live = new Set(board.columns.flatMap((c) => c.cards.map((k) => k.id)));
    setSelected((s) => (Array.from(s).every((id) => live.has(id)) ? s : new Set(Array.from(s).filter((id) => live.has(id)))));
  }, [board]);

  const loadProject = useCallback(() => {
    api.project(projectId).then((p) => setProject(p)).catch(() => {});
  }, [projectId]);
  useEffect(loadProject, [loadProject]);

  // Colleagues' changes arrive over the socket; refetch the board and header.
  const refresh = useDebounced(() => {
    reload();
    loadProject();
  });
  useRealtime(`project:${projectId}`, { "board:changed": refresh });
  useEffect(() => {
    api.billing().then((b) => setHasGantt(b.plan.features.includes("gantt"))).catch(() => setHasGantt(false));
  }, []);
  useEffect(() => {
    api.users().then((list) => setUsers(list.filter((u) => u.isActive))).catch(() => {});
  }, []);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Проекты", href: "/projects" }]}
        title={project ? project.title : "…"}
        meta={
          project && (
            <>
              {project.status !== "ACTIVE" && <span className="text-xs text-ink-ghost">{PROJECT_STATUS_LABELS[project.status]}</span>}
            </>
          )
        }
        actions={
          <>
            {board && <ProjectFunnel columns={board.columns} />}
            <span aria-hidden className="mx-1 h-4 w-px bg-border" />
            <button
              title="Выгрузить карточки в CSV"
              aria-label="Выгрузить карточки в CSV"
              onClick={() => downloadProjectCsv(projectId, project?.title ?? "project").catch((e) => toast((e as Error).message, "error"))}
              className="grid size-7 place-items-center rounded-md text-ink-ghost transition-colors hover:bg-surface-sunken hover:text-ink"
            >
              <Download size={16} strokeWidth={1.75} />
            </button>
            <Link
              href={`/projects/${projectId}/settings`}
              title="Настройки проекта"
              aria-label="Настройки проекта"
              className="grid size-7 place-items-center rounded-md text-ink-ghost transition-colors hover:bg-surface-sunken hover:text-ink"
            >
              <Settings size={16} strokeWidth={1.75} />
            </Link>
            <Segmented<View>
              label="Вид"
              value={view}
              onChange={(v) => setView(v === "kanban" ? null : v)}
              options={[
                { value: "kanban", label: "Доска", icon: KanbanSquare },
                { value: "table", label: "Таблица", icon: Table2 },
                { value: "list", label: "Список", icon: List },
                { value: "calendar", label: "Календарь", icon: CalendarDays },
                { value: "gantt", label: "Гант", icon: ChartGantt },
                { value: "overview", label: "Обзор", icon: BarChart3 },
              ]}
            />
          </>
        }
      />

      {view !== "overview" && (
        <BoardToolbar
          filters={filters}
          onChange={setFilters}
          users={users}
          shown={board ? board.columns.reduce((n, c) => n + applyFilters(c.cards, filters).length, 0) : undefined}
        />
      )}
      {state.error && <p className="py-3 text-sm text-danger">Не удалось загрузить доску: {state.error}</p>}
      {!board && !state.error && <BoardSkeleton />}

      {board && view === "kanban" && (
        <Board
          boardId={board.id}
          columns={board.columns}
          state={state}
          filters={filters}
          onOpenCard={setCardId}
          selected={selected}
          onToggleSelect={toggleSelect}
        />
      )}
      {board && view === "table" && (
        <CardsTable
          columns={board.columns}
          filters={filters}
          onOpenCard={setCardId}
          selected={selected}
          onToggleSelect={toggleSelect}
          onSelectAll={selectMany}
        />
      )}
      {board && selected.size > 0 && (view === "kanban" || view === "table") && (
        <BulkBar
          ids={Array.from(selected)}
          columns={board.columns}
          users={users}
          onDone={reload}
          onClear={() => setSelected(new Set())}
        />
      )}
      {board && view === "list" && <CardsList columns={board.columns} filters={filters} onOpenCard={setCardId} />}
      {board && view === "calendar" && <CardsCalendar columns={board.columns} filters={filters} onOpenCard={setCardId} onChanged={reload} />}
      {board && view === "gantt" && (
        <GanttChart projectId={projectId} columns={board.columns} filters={filters} hasGantt={hasGantt} onOpenCard={setCardId} onChanged={reload} />
      )}
      {board && view === "overview" && project && (
        <div className="py-5">
          <ProjectOverview project={project} columns={board.columns} onChanged={loadProject} />
        </div>
      )}

      {cardId && (
        <CardModal
          key={cardId}
          cardId={cardId}
          onClose={(changed) => {
            setCardId(null);
            if (changed) reload();
          }}
        />
      )}
    </>
  );
}

export default function ProjectBoardPage({ params }: { params: { id: string } }) {
  return (
    <AppShell>
      <Suspense>
        <ProjectPage projectId={params.id} />
      </Suspense>
    </AppShell>
  );
}
