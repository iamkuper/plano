"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { TeamBoardColumnDto, UserDto } from "@plano/shared";
import { AppShell } from "@/components/app-shell";
import { BoardSkeleton, ColumnShell } from "@/components/board";
import { BoardToolbar } from "@/components/board-toolbar";
import { CardModal } from "@/components/card-modal";
import { CardTile } from "@/components/card-tile";
import { HomeTabs } from "@/components/tab-links";
import { PageHeader, Segmented } from "@/components/ui";
import { stageColor } from "@/design/tokens";
import { api } from "@/lib/api";
import { applyFilters } from "@/lib/card-filters";
import { useCardParam } from "@/lib/use-card-param";
import { useFilters } from "@/lib/use-filters";
import { useDebounced, useRealtime } from "@/lib/realtime";

// Cards of all active projects grouped by column title. "Мои задачи"
// (?mine=1) narrows it to the current user. Cards are moved on their
// project's own board; here they're opened and edited in the modal.
function TeamBoard() {
  const mine = useSearchParams().get("mine") === "1";
  const router = useRouter();
  const [me, setMe] = useState<UserDto | null>(null);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [columns, setColumns] = useState<TeamBoardColumnDto[] | null>(null);
  const [cardId, setCardId] = useCardParam();
  const [filters, setFilters] = useFilters(mine ? "plano.filters.mine" : "plano.filters.team");

  useEffect(() => {
    api.me().then(setMe).catch(() => {});
    api.users().then((list) => setUsers(list.filter((u) => u.isActive))).catch(() => {});
  }, []);

  const load = useCallback(() => {
    if (mine && !me) return;
    api.teamBoard(mine ? me!.id : undefined).then(setColumns).catch(() => {});
  }, [mine, me]);

  useEffect(load, [load]);

  // Live updates from every active project shown here.
  const [projectIds, setProjectIds] = useState<string[]>([]);
  useEffect(() => {
    api.projects("ACTIVE").then((list) => setProjectIds(list.map((p) => p.id))).catch(() => {});
  }, []);
  const refresh = useDebounced(load, 400);
  useRealtime(projectIds.map((id) => `project:${id}`), { "board:changed": refresh });

  return (
    <>
      <PageHeader
        title="Главная"
        meta={<HomeTabs />}
        actions={
          <Segmented<"mine" | "all">
            label="Чьи задачи"
            value={mine ? "mine" : "all"}
            onChange={(v) => router.replace(v === "mine" ? "/team?mine=1" : "/team")}
            options={[
              { value: "mine", label: "Мои" },
              { value: "all", label: "Все" },
            ]}
          />
        }
      />

      <BoardToolbar
        filters={filters}
        onChange={setFilters}
        users={mine ? [] : users}
        shown={columns ? columns.reduce((n, c) => n + applyFilters(c.cards, filters).length, 0) : undefined}
      />
      {!columns && <BoardSkeleton />}
      <div className="-mx-6 flex h-[calc(100vh-124px)] min-h-[420px] items-start gap-2 overflow-x-auto px-6 pb-4">
        {columns?.map((column, index) => {
          const visible = applyFilters(column.cards, filters);
          return (
            <ColumnShell key={column.title} title={column.title} color={stageColor(index, columns.length)} count={visible.length}>
              {visible.map((card) => (
                <CardTile key={card.id} card={card} showProject onOpen={() => setCardId(card.id)} />
              ))}
            </ColumnShell>
          );
        })}
        {columns?.length === 0 && <p className="text-base text-ink-faint">Активных проектов пока нет.</p>}
      </div>
      {cardId && (
        <CardModal
          key={cardId}
          cardId={cardId}
          onClose={(changed) => {
            setCardId(null);
            if (changed) load();
          }}
        />
      )}
    </>
  );
}

export default function TeamBoardPage() {
  return (
    <AppShell>
      <Suspense>
        <TeamBoard />
      </Suspense>
    </AppShell>
  );
}
