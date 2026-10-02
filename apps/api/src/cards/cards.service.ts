import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "../auth/current-user.decorator";
import { NotificationsService } from "../notifications/notifications.service";
import { RealtimeService } from "../realtime/realtime.service";
import { AttachmentsService, withUrl } from "../attachments/attachments.service";
import { cardTileInclude } from "../boards/boards.service";
import { CreateCardDto } from "./dto/create-card.dto";
import { UpdateCardDto } from "./dto/update-card.dto";
import { MoveCardDto } from "./dto/move-card.dto";
import { BulkCardsDto } from "./dto/bulk.dto";
import { CARD_FIELDS } from "../prisma/tenant";
import { BillingService } from "../billing/billing.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly attachments: AttachmentsService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
  ) {}

  // Opening a card marks its discussion and its notifications as read.
  async markRead(cardId: string, userId: string) {
    await this.prisma.cardRead.upsert({
      where: { userId_cardId: { userId, cardId } },
      update: { readAt: new Date() },
      create: { userId, cardId },
    });
    const { count } = await this.prisma.notification.updateMany({ where: { userId, cardId, readAt: null }, data: { readAt: new Date() } });
    if (count) this.realtime.notify(userId);
  }

  // Assignees must be people of this workspace.
  private async assertUsers(ids: string[] | undefined) {
    const unique = [...new Set(ids ?? [])];
    if (unique.length && (await this.prisma.user.count({ where: { id: { in: unique } } })) !== unique.length) {
      throw new BadRequestException("Исполнитель не найден");
    }
  }

  private async assertLabels(ids: string[] | undefined) {
    const unique = [...new Set(ids ?? [])];
    if (unique.length && (await this.prisma.label.count({ where: { id: { in: unique } } })) !== unique.length) {
      throw new BadRequestException("Метка не найдена");
    }
  }

  private log(cardId: string, userId: string, action: string, payload?: Prisma.InputJsonValue) {
    return this.prisma.activityLog.create({ data: { cardId, userId, action, payload } });
  }

  // Header search: by title/description, or by key ("TSK-12" / "12").
  search(q: string) {
    const term = q.trim();
    if (!term) return [];
    const key = term.match(/^(?:[a-zа-яё0-9]+-)?(\d+)$/i);
    return this.prisma.card.findMany({
      where: {
        OR: [
          { title: { contains: term, mode: "insensitive" } },
          { description: { contains: term, mode: "insensitive" } },
          ...(key ? [{ number: Number(key[1]) }] : []),
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      include: cardTileInclude,
    });
  }

  async get(id: string) {
    const card = await this.prisma.card.findUnique({
      where: { id },
      include: {
        ...cardTileInclude,
        column: { select: { id: true, title: true } },
        // Overrides the tile's `done`-only checklist with full items.
        checklist: { orderBy: { position: "asc" } },
        comments: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true, avatarUrl: true } }, attachments: { orderBy: { createdAt: "asc" } } },
        },
        attachments: { orderBy: { createdAt: "desc" }, include: { uploader: { select: { id: true, name: true, avatarUrl: true } } } },
        recurringRule: { select: { id: true, frequency: true, interval: true, active: true } },
        fieldValues: { select: { fieldId: true, value: true } },
        timeEntries: { orderBy: { date: "desc" }, include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
        activity: { orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      },
    });
    if (!card) throw new NotFoundException("Карточка не найдена");
    return {
      ...card,
      attachments: card.attachments.map(withUrl),
      comments: card.comments.map((c) => ({ ...c, attachments: c.attachments.map(withUrl) })),
    };
  }

  async create(dto: CreateCardDto, userId: string) {
    const column = await this.prisma.column.findUnique({
      where: { id: dto.columnId },
      include: { board: { select: { projectId: true } } },
    });
    if (!column) throw new NotFoundException("Колонка не найдена");
    await this.assertUsers(dto.assigneeIds);

    const last = await this.prisma.card.findFirst({
      where: { columnId: dto.columnId },
      orderBy: { position: "desc" },
    });
    const card = await this.prisma.card.create({
      data: {
        ...CARD_FIELDS,
        projectId: column.board.projectId,
        columnId: dto.columnId,
        title: dto.title,
        description: dto.description,
        type: dto.type,
        priority: dto.priority,
        dueDate: dto.dueDate,
        estimateHours: dto.estimateHours,
        position: (last?.position ?? 0) + 1,
        assignees: dto.assigneeIds ? { create: dto.assigneeIds.map((uid) => ({ userId: uid })) } : undefined,
      },
      include: cardTileInclude,
    });
    await this.log(card.id, userId, "created");
    if (dto.assigneeIds?.length) await this.notifications.assigned(card.id, userId, dto.assigneeIds);
    this.realtime.boardChanged(card.projectId);
    return card;
  }

  async update(id: string, dto: UpdateCardDto, userId: string) {
    const { assigneeIds, labelIds, ...fields } = dto;
    await this.assertUsers(assigneeIds);
    await this.assertLabels(labelIds);
    if (dto.startDate !== undefined || dto.dueDate !== undefined) {
      const current = await this.prisma.card.findUnique({ where: { id }, select: { startDate: true, dueDate: true } });
      if (!current) throw new NotFoundException("Карточка не найдена");
      const start = dto.startDate !== undefined ? dto.startDate : current.startDate;
      const due = dto.dueDate !== undefined ? dto.dueDate : current.dueDate;
      if (start && due && start > due) throw new BadRequestException("Начало не может быть позже срока");
    }
    const before = assigneeIds
      ? (await this.prisma.cardAssignee.findMany({ where: { cardId: id }, select: { userId: true } })).map((a) => a.userId)
      : [];
    const card = await this.prisma.card.update({
      where: { id },
      data: {
        ...fields,
        assignees: assigneeIds
          ? { deleteMany: {}, create: assigneeIds.map((uid) => ({ userId: uid })) }
          : undefined,
        labels: labelIds ? { deleteMany: {}, create: labelIds.map((labelId) => ({ labelId })) } : undefined,
      },
      include: cardTileInclude,
    });
    await this.log(id, userId, "updated", Object.keys(dto));
    if (assigneeIds) await this.notifications.assigned(id, userId, assigneeIds.filter((uid) => !before.includes(uid)));
    await this.realtime.cardChanged(id, card.projectId);
    return card;
  }

  // The client computes the new fractional position from its neighbours
  // ((prev + next) / 2, or prev + 1 at the end), so a move touches one row.
  // Cards can't leave their project's board.
  async move(id: string, dto: MoveCardDto, userId: string) {
    const card = await this.prisma.card.findUnique({
      where: { id },
      include: { column: { select: { boardId: true, title: true } } },
    });
    if (!card) throw new NotFoundException("Карточка не найдена");
    const target = await this.prisma.column.findUnique({ where: { id: dto.columnId } });
    if (!target || target.boardId !== card.column.boardId) {
      throw new BadRequestException("Нельзя перенести карточку на другую доску");
    }

    let position = dto.position;
    if (position === undefined) {
      const last = await this.prisma.card.findFirst({
        where: { columnId: dto.columnId, id: { not: id } },
        orderBy: { position: "desc" },
      });
      position = (last?.position ?? 0) + 1;
    }

    const moved = await this.prisma.card.update({
      where: { id },
      data: { columnId: dto.columnId, position },
      include: cardTileInclude,
    });
    if (card.columnId !== dto.columnId) {
      await this.log(id, userId, "moved", { from: card.column.title, to: target.title });
    }
    await this.realtime.cardChanged(id, moved.projectId);
    return moved;
  }

  async remove(id: string) {
    const purge = await this.attachments.filesOf({ cardId: id });
    const card = await this.prisma.card.delete({ where: { id } });
    await purge();
    await this.audit.record("card.delete", `Удалена карточка ${card.title}`, id);
    await this.realtime.cardChanged(id, card.projectId);
  }

  // ---- bulk ----

  // One action over many cards (board selection). Move keeps cards on their
  // board and appends them to the target column in their current order.
  async bulk(dto: BulkCardsDto, userId: string) {
    const cards = await this.prisma.card.findMany({
      where: { id: { in: dto.ids } },
      include: { column: { select: { boardId: true, title: true } } },
      orderBy: [{ column: { position: "asc" } }, { position: "asc" }],
    });
    if (!cards.length) throw new NotFoundException("Карточки не найдены");
    const ids = cards.map((c) => c.id);
    const projects = new Set(cards.map((c) => c.projectId));

    switch (dto.action) {
      case "move": {
        const target = await this.prisma.column.findUnique({ where: { id: dto.columnId! } });
        if (!target || cards.some((c) => c.column.boardId !== target.boardId)) {
          throw new BadRequestException("Перенести можно только в колонку той же доски");
        }
        const last = await this.prisma.card.findFirst({
          where: { columnId: target.id, id: { notIn: ids } },
          orderBy: { position: "desc" },
        });
        let pos = last?.position ?? 0;
        await this.prisma.$transaction(cards.map((c) => this.prisma.card.update({ where: { id: c.id }, data: { columnId: target.id, position: ++pos } })));
        await this.prisma.activityLog.createMany({
          data: cards
            .filter((c) => c.columnId !== target.id)
            .map((c) => ({ cardId: c.id, userId, action: "moved", payload: { from: c.column.title, to: target.title } })),
        });
        break;
      }
      case "assign": {
        const userIds = dto.userIds ?? [];
        await this.prisma.cardAssignee.createMany({
          data: ids.flatMap((cardId) => userIds.map((uid) => ({ cardId, userId: uid }))),
          skipDuplicates: true,
        });
        for (const id of ids) await this.notifications.assigned(id, userId, userIds);
        await this.prisma.activityLog.createMany({ data: ids.map((cardId) => ({ cardId, userId, action: "updated", payload: ["assigneeIds"] })) });
        break;
      }
      case "unassign":
        await this.prisma.cardAssignee.deleteMany({ where: { cardId: { in: ids }, userId: { in: dto.userIds ?? [] } } });
        await this.prisma.activityLog.createMany({ data: ids.map((cardId) => ({ cardId, userId, action: "updated", payload: ["assigneeIds"] })) });
        break;
      case "priority":
        await this.prisma.card.updateMany({ where: { id: { in: ids } }, data: { priority: dto.priority } });
        await this.prisma.activityLog.createMany({ data: ids.map((cardId) => ({ cardId, userId, action: "updated", payload: ["priority"] })) });
        break;
      case "due":
        await this.prisma.card.updateMany({ where: { id: { in: ids } }, data: { dueDate: dto.dueDate ?? null } });
        await this.prisma.activityLog.createMany({ data: ids.map((cardId) => ({ cardId, userId, action: "updated", payload: ["dueDate"] })) });
        break;
      case "delete": {
        const purge = await this.attachments.filesOf({ cardId: { in: ids } });
        await this.prisma.card.deleteMany({ where: { id: { in: ids } } });
        await purge();
        await this.audit.record("card.delete", `Удалено карточек: ${ids.length}`);
        break;
      }
    }

    for (const pid of projects) this.realtime.boardChanged(pid);
    return { count: ids.length };
  }

  // ---- checklist ----

  async addChecklistItem(cardId: string, text: string) {
    const last = await this.prisma.checklistItem.findFirst({ where: { cardId }, orderBy: { position: "desc" } });
    const item = await this.prisma.checklistItem.create({ data: { cardId, text, position: (last?.position ?? 0) + 1 } });
    await this.realtime.cardChanged(cardId);
    return item;
  }

  async updateChecklistItem(itemId: string, data: { text?: string; done?: boolean }) {
    const item = await this.prisma.checklistItem.update({ where: { id: itemId }, data });
    await this.realtime.cardChanged(item.cardId);
    return item;
  }

  async removeChecklistItem(itemId: string) {
    const item = await this.prisma.checklistItem.delete({ where: { id: itemId } });
    await this.realtime.cardChanged(item.cardId);
  }

  // ---- comments ----

  async addComment(cardId: string, userId: string, text: string, mentionIds: string[] = [], attachmentIds: string[] = []) {
    if (!text.trim() && !attachmentIds.length) throw new BadRequestException("Пустое сообщение");
    const comment = await this.prisma.comment.create({
      data: { cardId, authorId: userId, text },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    });
    await this.attachments.linkToComment(attachmentIds, comment.id, cardId, userId);
    await this.log(cardId, userId, "commented");
    // The author has obviously seen their own message.
    await this.prisma.cardRead.upsert({
      where: { userId_cardId: { userId, cardId } },
      update: { readAt: new Date() },
      create: { userId, cardId },
    });
    await this.notifications.commented(cardId, userId, text || "Файл", mentionIds);
    await this.realtime.cardChanged(cardId);
    return comment;
  }

  // Authors can delete their own comments; admins can delete any.
  async removeComment(commentId: string, user: AuthenticatedUser) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException();
    if (comment.authorId !== user.userId && user.role !== "ADMIN") throw new ForbiddenException();
    await this.prisma.comment.delete({ where: { id: commentId } });
    await this.realtime.cardChanged(comment.cardId);
  }

  // ---- time ----

  async addTimeEntry(cardId: string, userId: string, data: { minutes: number; date: Date; note?: string }) {
    await this.billing.assertFeature("time");
    const entry = await this.prisma.timeEntry.create({
      data: { cardId, userId, ...data },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });
    await this.realtime.cardChanged(cardId);
    return entry;
  }

  async removeTimeEntry(entryId: string, user: AuthenticatedUser) {
    const entry = await this.prisma.timeEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundException();
    if (entry.userId !== user.userId && user.role !== "ADMIN") throw new ForbiddenException();
    await this.prisma.timeEntry.delete({ where: { id: entryId } });
    await this.realtime.cardChanged(entry.cardId);
  }
}
