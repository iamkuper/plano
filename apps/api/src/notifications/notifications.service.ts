import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";

const excerpt = (text: string) => (text.length > 140 ? `${text.slice(0, 139)}…` : text);

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(userId: string) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          actor: { select: { id: true, name: true, avatarUrl: true } },
          card: { select: { id: true, number: true, title: true, projectId: true } },
        },
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, unread };
  }

  async markRead(userId: string, ids?: string[]) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    this.realtime.notify(userId);
  }

  private async create(rows: Prisma.NotificationCreateManyInput[]) {
    if (!rows.length) return;
    await this.prisma.notification.createMany({ data: rows });
    for (const userId of new Set(rows.map((r) => r.userId))) this.realtime.notify(userId);
  }

  // People newly added as assignees (the actor doesn't notify themselves).
  assigned(cardId: string, actorId: string, userIds: string[]) {
    return this.create(userIds.filter((id) => id !== actorId).map((userId) => ({ userId, actorId, cardId, type: "ASSIGNED" })));
  }

  // A message: @mentioned people get MENTIONED, other assignees COMMENTED.
  async commented(cardId: string, actorId: string, text: string, mentionIds: string[]) {
    const valid = mentionIds.length
      ? (await this.prisma.user.findMany({ where: { id: { in: mentionIds }, isActive: true }, select: { id: true } })).map((u) => u.id)
      : [];
    const assignees = (await this.prisma.cardAssignee.findMany({ where: { cardId }, select: { userId: true } })).map((a) => a.userId);
    const mentioned = new Set(valid.filter((id) => id !== actorId));
    const rows: Prisma.NotificationCreateManyInput[] = [
      ...[...mentioned].map((userId) => ({ userId, actorId, cardId, type: "MENTIONED" as const, text: excerpt(text) })),
      ...assignees
        .filter((id) => id !== actorId && !mentioned.has(id))
        .map((userId) => ({ userId, actorId, cardId, type: "COMMENTED" as const, text: excerpt(text) })),
    ];
    await this.create(rows);
  }
}
