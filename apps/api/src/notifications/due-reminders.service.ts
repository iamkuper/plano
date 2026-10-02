import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { isLocked } from "../billing/subscription-state";
import { RealtimeService } from "../realtime/realtime.service";
import { SystemPrismaService } from "../prisma/system-prisma.service";
import { MailableNotification, NotificationMailer } from "./notification-mailer";

const DAY = 86_400_000;
const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

// Once an hour: assignees of open cards get a reminder when the due date is
// today or tomorrow (DUE_SOON) and the day after it passed (OVERDUE). One
// reminder per card, person and due date (unique index), so restarts and
// repeated runs don't duplicate. Cards in the last column (done) and
// projects that aren't active are skipped.
@Injectable()
export class DueRemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(DueRemindersService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly db: SystemPrismaService,
    private readonly realtime: RealtimeService,
    private readonly mailer: NotificationMailer,
  ) {}

  onModuleInit() {
    if (process.env.DISABLE_SCHEDULERS === "1") return;
    this.timer = setInterval(() => this.run(), 60 * 60_000);
    setTimeout(() => this.run(), 15_000);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async run(now = new Date()) {
    if (this.running) return 0;
    this.running = true;
    try {
      const today = startOfUtcDay(now);
      const cards = await this.db.card.findMany({
        where: {
          dueDate: { gte: new Date(today.getTime() - DAY), lt: new Date(today.getTime() + 2 * DAY) },
          project: { status: "ACTIVE" },
          assignees: { some: { user: { isActive: true } } },
        },
        select: {
          id: true,
          dueDate: true,
          workspace: { select: { subscription: true } },
          column: { select: { position: true, boardId: true } },
          assignees: { where: { user: { isActive: true } }, select: { userId: true } },
        },
      });
      if (!cards.length) return 0;

      // The last column of a board is "done".
      const lastPositions = await this.db.column.groupBy({ by: ["boardId"], where: { boardId: { in: [...new Set(cards.map((c) => c.column.boardId))] } }, _max: { position: true } });
      const lastOf = new Map(lastPositions.map((l) => [l.boardId, l._max.position]));

      const created: MailableNotification[] = [];
      for (const card of cards) {
        if (card.column.position === lastOf.get(card.column.boardId)) continue;
        if (isLocked(card.workspace.subscription, now)) continue;
        const due = startOfUtcDay(card.dueDate!);
        const type = due < today ? "OVERDUE" : "DUE_SOON";
        for (const { userId } of card.assignees) {
          try {
            await this.db.notification.create({ data: { userId, cardId: card.id, type, dueFor: card.dueDate } });
            created.push({ userId, cardId: card.id, type });
          } catch (e) {
            if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
          }
        }
      }
      for (const userId of new Set(created.map((c) => c.userId))) this.realtime.notify(userId);
      await this.mailer.send(created);
      if (created.length) this.log.log(`Sent ${created.length} due-date reminder(s)`);
      return created.length;
    } catch (e) {
      this.log.error(`Reminders failed: ${(e as Error).message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }
}
