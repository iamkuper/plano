import { Injectable } from "@nestjs/common";
import type { NotificationType } from "@prisma/client";
import { appUrl } from "../auth/tokens";
import { MailService } from "../mail/mail.service";
import { SystemPrismaService } from "../prisma/system-prisma.service";

export interface MailableNotification {
  userId: string;
  actorId?: string | null;
  cardId: string;
  type: NotificationType;
  text?: string | null;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

// Mail copies of notifications, for people who haven't turned them off.
// Works across workspaces (the scheduler has no request), so it reads with
// the system client. Never throws.
@Injectable()
export class NotificationMailer {
  constructor(
    private readonly db: SystemPrismaService,
    private readonly mail: MailService,
  ) {}

  async send(rows: MailableNotification[]) {
    if (!rows.length || !this.mail.enabled) return;
    try {
      const users = await this.db.user.findMany({
        where: { id: { in: rows.map((r) => r.userId) }, isActive: true, emailNotifications: true },
        select: { id: true, email: true },
      });
      const cards = await this.db.card.findMany({
        where: { id: { in: rows.map((r) => r.cardId) } },
        select: { id: true, number: true, title: true, dueDate: true, projectId: true, workspace: { select: { cardPrefix: true } } },
      });
      const actors = await this.db.user.findMany({ where: { id: { in: rows.map((r) => r.actorId).filter((v): v is string => !!v) } }, select: { id: true, name: true } });
      for (const row of rows) {
        const user = users.find((u) => u.id === row.userId);
        const card = cards.find((c) => c.id === row.cardId);
        if (!user || !card) continue;
        const key = `${card.workspace.cardPrefix}-${card.number}`;
        const who = actors.find((a) => a.id === row.actorId)?.name ?? "Коллега";
        const link = `${appUrl()}/projects/${card.projectId}?card=${card.id}`;
        const [subject, lead] = this.compose(row, who, key, card.title, card.dueDate);
        await this.mail.send(user.email, subject, `${lead}\n\n${row.text ? `${row.text}\n\n` : ""}Открыть карточку: ${link}\n\nОтключить письма можно в профиле.`);
      }
    } catch {
      // A mail problem must never break the action that caused it.
    }
  }

  private compose(row: MailableNotification, who: string, key: string, title: string, dueDate: Date | null): [string, string] {
    const name = `${key} «${title}»`;
    switch (row.type) {
      case "ASSIGNED":
        return [`Вас назначили на ${key}`, `${who} назначил(а) вас на ${name}.`];
      case "MENTIONED":
        return [`Вас упомянули в ${key}`, `${who} упомянул(а) вас в ${name}.`];
      case "COMMENTED":
        return [`Новое сообщение в ${key}`, `${who} написал(а) в ${name}.`];
      case "DUE_SOON": {
        const today = day(new Date()) === (dueDate ? day(dueDate) : "");
        return [`Срок ${today ? "сегодня" : "завтра"}: ${key}`, `Срок задачи ${name}: ${today ? "сегодня" : "завтра"}.`];
      }
      case "OVERDUE":
        return [`Срок истёк: ${key}`, `Срок задачи ${name} истёк${dueDate ? ` ${dueDate.toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" })}` : ""}.`];
    }
  }
}
