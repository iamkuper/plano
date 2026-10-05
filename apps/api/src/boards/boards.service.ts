import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { t } from "@plano/shared";
// What a card looks like on a board: enough for the tile, not the full modal.
export const cardTileInclude = {
  assignees: { select: { user: { select: { id: true, name: true, avatarUrl: true } } } },
  labels: { select: { label: { select: { id: true, name: true, color: true } } } },
  project: { select: { id: true, title: true } },
  type: { select: { id: true, name: true, color: true } },
  // Tiles show subtasks inline and let you tick them off on the board.
  checklist: { select: { id: true, text: true, done: true }, orderBy: { position: "asc" } },
  _count: { select: { comments: true, attachments: true } },
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

  private async withUnread<T extends { id: string }>(userId: string, cards: T[]): Promise<WithUnread<T>[]> {
    const counts = await this.unreadCounts(userId, cards.map((c) => c.id));
    return cards.map((c) => ({ ...c, unreadComments: counts.get(c.id) ?? 0 }));
  }

  private async boardProjectId(boardId: string) {
    return (await this.prisma.board.findUnique({ where: { id: boardId }, select: { projectId: true } }))?.projectId;
  }

  async getByProject(projectId: string, userId: string) {
    const board = await this.prisma.board.findUnique({
      where: { projectId },
      include: {
        columns: {
          orderBy: { position: "asc" },
          include: { cards: { orderBy: { position: "asc" }, include: cardTileInclude } },
        },
      },
    });
    if (!board) throw new NotFoundException(t("api.boards.boardNotFound"));
    const cards = await this.withUnread(userId, board.columns.flatMap((c) => c.cards));
    const byId = new Map(cards.map((c) => [c.id, c]));
    return { ...board, columns: board.columns.map((col) => ({ ...col, cards: col.cards.map((c) => byId.get(c.id)!) })) };
  }

  // The team board is a virtual view: cards of all ACTIVE projects grouped by
  // column title, in the order titles first appear across boards.
  async team(userId: string, assigneeId?: string) {
    const columns = await this.prisma.column.findMany({
      where: { board: { project: { status: "ACTIVE" } } },
      orderBy: { position: "asc" },
      include: {
        cards: {
          where: assigneeId ? { assignees: { some: { userId: assigneeId } } } : undefined,
          orderBy: [{ dueDate: "asc" }, { position: "asc" }],
          include: cardTileInclude,
        },
      },
    });

    const unread = await this.unreadCounts(userId, columns.flatMap((c) => c.cards.map((card) => card.id)));
    const byTitle = new Map<string, WithUnread<(typeof columns)[number]["cards"][number]>[]>();
    // A merged stage takes the first colour any board chose for it.
    const colorOf = new Map<string, string>();
    for (const column of columns) {
      if (column.color && !colorOf.has(column.title)) colorOf.set(column.title, column.color);
      const bucket = byTitle.get(column.title) ?? [];
      bucket.push(...column.cards.map((c) => ({ ...c, unreadComments: unread.get(c.id) ?? 0 })));
      byTitle.set(column.title, bucket);
    }
    return [...byTitle].map(([title, cards]) => ({ title, color: colorOf.get(title) ?? null, cards }));
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
