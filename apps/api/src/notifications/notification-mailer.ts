import { Injectable } from "@nestjs/common";
import type { NotificationType } from "@prisma/client";
import { appUrl } from "../auth/tokens";
import { MailService } from "../mail/mail.service";
import { SystemPrismaService } from "../prisma/system-prisma.service";
import { t, intlTag } from "@plano/shared";
import { asLocale, withLocale } from "../i18n/request-locale";
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
        select: { id: true, email: true, locale: true },
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
        const link = `${appUrl()}/projects/${card.projectId}?card=${card.id}`;
        // Written in the recipient's language, whatever the sender uses.
        await withLocale(asLocale(user.locale) ?? "ru", async () => {
          const who = actors.find((a) => a.id === row.actorId)?.name ?? t("api.notifications.colleague");
          const [subject, lead] = this.compose(row, who, key, card.title, card.dueDate);
          await this.mail.send(user.email, subject, t("api.notifications.openTheCardYouCan", { lead, value: row.text ? `${row.text}\n\n` : "", link }));
        });
      }
    } catch {
      // A mail problem must never break the action that caused it.
    }
  }

  private compose(row: MailableNotification, who: string, key: string, title: string, dueDate: Date | null): [string, string] {
    const name = `${key} «${title}»`;
    switch (row.type) {
      case "ASSIGNED":
        return [t("api.notifications.youWereAssignedTo", { key }), t("api.notifications.assignedYouTo", { who, name })];
      case "MENTIONED":
        return [t("api.notifications.youWereMentionedIn", { key }), t("api.notifications.mentionedYouIn", { who, name })];
      case "COMMENTED":
        return [t("api.notifications.newMessageIn", { key }), t("api.notifications.wroteIn", { who, name })];
      case "DUE_SOON": {
        const today = day(new Date()) === (dueDate ? day(dueDate) : "");
        return [t("api.notifications.due", { value: today ? t("api.notifications.today") : t("api.notifications.tomorrow"), key }), t("api.notifications.taskIsDue", { name, value: today ? t("api.notifications.today") : t("api.notifications.tomorrow") })];
      }
      case "OVERDUE":
        return [t("api.notifications.overdue", { key }), t("api.notifications.taskWasDue", { name, value: dueDate ? ` ${dueDate.toLocaleDateString(intlTag(), { day: "numeric", month: "long", timeZone: "UTC" })}` : "" })];
    }
  }
}
