import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { t } from "@plano/shared";
import { buildTiles } from "./card-tiles";
// What a card looks like on a board: enough for the tile, not the full modal.
export const cardTileInclude = {
  assignees: { select: { user: { select: { id: true, name: true, avatarUrl: true, kind: true } } } },
  labels: { select: { label: { select: { id: true, name: true, color: true } } } },
  project: { select: { id: true, title: true } },
  // Tiles show subtasks inline and let you tick them off on the board.
  checklist: { select: { id: true, text: true, done: true }, orderBy: { position: "asc" } },
} satisfies Prisma.CardInclude;

type WithUnread<T> = T & { unreadComments: number };

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  // Messages by others posted after the user last opened each card.
  private async unreadCounts(userId: string, cardIds: string[]) {
    if (!cardIds.length) return new Map<string, number>();
    const rows = await this.prisma.$queryRaw<{ cardId: string; n: bigint }[]>`
      SELECT c."cardId", COUNT(*) AS n
      FROM "Comment" c
      LEFT JOIN "CardRead" r ON r."cardId" = c."cardId" AND r."userId" = ${userId}
      WHERE c."cardId" IN (${Prisma.join(cardIds)})
        AND c."authorId" <> ${userId}
        AND (r."readAt" IS NULL OR c."createdAt" > r."readAt")
      GROUP BY c."cardId"`;
    return new Map(rows.map((r) => [r.cardId, Number(r.n)]));
  }

  // Same, for every card of a project in one query, so the board and the counts
  // are fetched at the same time.
  private async unreadCountsOfProject(userId: string, projectId: string) {
    const rows = await this.prisma.$queryRaw<{ cardId: string; n: bigint }[]>`
      SELECT c."cardId", COUNT(*) AS n
      FROM "Comment" c
      JOIN "Card" k ON k."id" = c."cardId" AND k."projectId" = ${projectId}
      LEFT JOIN "CardRead" r ON r."cardId" = c."cardId" AND r."userId" = ${userId}
      WHERE c."authorId" <> ${userId}
        AND (r."readAt" IS NULL OR c."createdAt" > r."readAt")
      GROUP BY c."cardId"`;
    return new Map(rows.map((r) => [r.cardId, Number(r.n)]));
  }

  private async withUnread<T extends { id: string }>(userId: string, cards: T[]): Promise<WithUnread<T>[]> {
    const counts = await this.unreadCounts(userId, cards.map((c) => c.id));
    return cards.map((c) => ({ ...c, unreadComments: counts.get(c.id) ?? 0 }));
  }

  private async boardProjectId(boardId: string) {
    return (await this.prisma.board.findUnique({ where: { id: boardId }, select: { projectId: true } }))?.projectId;
  }

  async getByProject(projectId: string, userId: string) {
    const [board, unread] = await Promise.all([
      this.prisma.board.findUnique({
        where: { projectId },
        include: { columns: { orderBy: { position: "asc" }, include: { cards: { orderBy: { position: "asc" } } } } },
      }),
      this.unreadCountsOfProject(userId, projectId),
    ]);
    if (!board) throw new NotFoundException(t("api.boards.boardNotFound"));
    const tiles = new Map((await buildTiles(this.prisma, board.columns.flatMap((c) => c.cards), { projectId })).map((c) => [c.id, c]));
    return { ...board, columns: board.columns.map((col) => ({ ...col, cards: col.cards.map((c) => ({ ...tiles.get(c.id)!, unreadComments: unread.get(c.id) ?? 0 })) })) };
  }

  // Stages of the team board: columns of all active projects merged by title,
  // in the order titles first appear. `filter` narrows the cards that count.
  private async teamStages(assigneeId?: string) {
    const columns = await this.prisma.column.findMany({
      where: { board: { project: { status: "ACTIVE" } } },
      orderBy: { position: "asc" },
      select: { id: true, title: true, color: true },
    });
    const counts = await this.prisma.card.groupBy({
      by: ["columnId"],
      where: { column: { board: { project: { status: "ACTIVE" } } }, ...(assigneeId ? { assignees: { some: { userId: assigneeId } } } : {}) },
      _count: { _all: true },
    });
    const perColumn = new Map(counts.map((c) => [c.columnId, c._count._all]));
    const stages = new Map<string, { title: string; color: string | null; total: number }>();
    for (const column of columns) {
      const stage = stages.get(column.title) ?? { title: column.title, color: null, total: 0 };
      // A merged stage takes the first colour any board chose for it.
      if (column.color && !stage.color) stage.color = column.color;
      stage.total += perColumn.get(column.id) ?? 0;
      stages.set(column.title, stage);
    }
    return [...stages.values()];
  }

  // Number of cards per stage: the home page only needs these.
  teamSummary(assigneeId?: string) {
    return this.teamStages(assigneeId).then((list) => list.map(({ title, color, total }) => ({ title, color, count: total })));
  }

  // The team board is a virtual view: cards of all ACTIVE projects grouped by
  // column title, in the order titles first appear across boards. With `limit`
  // every stage returns its first cards only (and its `total`); `stage` and
  // `offset` fetch the next ones of one stage.
  async team(userId: string, assigneeId?: string, page?: { limit: number; stage?: string; offset?: number }) {
    if (page) return this.teamPage(userId, assigneeId, page);
    const columns = await this.prisma.column.findMany({
      where: { board: { project: { status: "ACTIVE" } } },
      orderBy: { position: "asc" },
      include: {
        cards: {
          where: assigneeId ? { assignees: { some: { userId: assigneeId } } } : undefined,
          orderBy: [{ dueDate: "asc" }, { position: "asc" }],
        },
      },
    });

    const all = columns.flatMap((c) => c.cards);
    const ids = all.map((card) => card.id);
    const [unread, built] = await Promise.all([this.unreadCounts(userId, ids), buildTiles(this.prisma, all, { ids })]);
    const tiles = new Map(built.map((c) => [c.id, c]));
    const byTitle = new Map<string, WithUnread<(typeof built)[number]>[]>();
    // A merged stage takes the first colour any board chose for it.
    const colorOf = new Map<string, string>();
    for (const column of columns) {
      if (column.color && !colorOf.has(column.title)) colorOf.set(column.title, column.color);
      const bucket = byTitle.get(column.title) ?? [];
      bucket.push(...column.cards.map((c) => ({ ...tiles.get(c.id)!, unreadComments: unread.get(c.id) ?? 0 })));
      byTitle.set(column.title, bucket);
    }
    return [...byTitle].map(([title, cards]) => ({ title, color: colorOf.get(title) ?? null, cards }));
  }

  private async teamPage(userId: string, assigneeId: string | undefined, page: { limit: number; stage?: string; offset?: number }) {
    const stages = (await this.teamStages(assigneeId)).filter((s) => !page.stage || s.title === page.stage);
    const lists = await Promise.all(
      stages.map((stage) =>
        this.prisma.card.findMany({
          where: { column: { title: stage.title, board: { project: { status: "ACTIVE" } } }, ...(assigneeId ? { assignees: { some: { userId: assigneeId } } } : {}) },
          orderBy: [{ dueDate: "asc" }, { position: "asc" }],
          skip: page.offset ?? 0,
          take: page.limit,
        }),
      ),
    );
    const all = lists.flat();
    const ids = all.map((c) => c.id);
    const [unread, built] = await Promise.all([this.unreadCounts(userId, ids), buildTiles(this.prisma, all, { ids })]);
    const tiles = new Map(built.map((c) => [c.id, c]));
    return stages.map((stage, i) => ({ title: stage.title, color: stage.color, total: stage.total, cards: lists[i].map((c) => ({ ...tiles.get(c.id)!, unreadComments: unread.get(c.id) ?? 0 })) }));
  }

  async addColumn(boardId: string, title: string) {
    const last = await this.prisma.column.findFirst({
      where: { boardId },
      orderBy: { position: "desc" },
    });
    const column = await this.prisma.column.create({
      data: { boardId, title, position: (last?.position ?? 0) + 1 },
    });
    const pid = await this.boardProjectId(boardId);
    if (pid) this.realtime.boardChanged(pid);
    return column;
  }

  async removeColumn(columnId: string) {
    const column = await this.prisma.column.findUnique({
      where: { id: columnId },
      include: { _count: { select: { cards: true } }, board: { include: { _count: { select: { columns: true } } } } },
    });
    if (!column) throw new NotFoundException(t("common.columnNotFound"));
    if (column._count.cards > 0) throw new BadRequestException(t("api.boards.moveTheCardsOutOf"));
    if (column.board._count.columns <= 1) throw new BadRequestException(t("api.boards.theBoardMustKeepAt"));
    await this.prisma.column.delete({ where: { id: columnId } });
    this.realtime.boardChanged(column.board.projectId);
  }

  async updateColumn(columnId: string, data: { title?: string; wipLimit?: number | null; position?: number; color?: string | null }) {
    const column = await this.prisma.column.update({ where: { id: columnId }, data, include: { board: { select: { projectId: true } } } });
    this.realtime.boardChanged(column.board.projectId);
    const { board: _board, ...rest } = column;
    return rest;
  }
}
