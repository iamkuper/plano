import { randomBytes } from "crypto";
import { Controller, Get, Header, Module, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { t } from "@plano/shared";
import { appUrl } from "../auth/tokens";
import { CurrentUser, type AuthenticatedUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { asLocale, withLocale } from "../i18n/request-locale";
import { PrismaService } from "../prisma/prisma.service";
import { SystemPrismaService } from "../prisma/system-prisma.service";
import { buildCalendar, type IcsEvent } from "./ics";

const DAY = 86_400_000;
const newToken = () => randomBytes(24).toString("hex");
const feedUrl = (token: string) => `${(process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3101}`).replace(/\/$/, "")}/calendar/${token}/plano.ics`;

// A personal calendar feed: the user's open cards with a due date, as all-day
// events, for Google Calendar, Apple Calendar, Outlook and the like. The
// address is the secret: whoever has it can read the feed, so it can be
// replaced at any time.
@Controller("calendar")
export class CalendarController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
  ) {}

  @Get("feed")
  @UseGuards(JwtAuthGuard)
  async feed(@CurrentUser() me: AuthenticatedUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: me.userId }, select: { icalToken: true } });
    if (user.icalToken) return { url: feedUrl(user.icalToken) };
    return this.issue(me.userId);
  }

  // The old address stops working.
  @Post("feed/reset")
  @UseGuards(JwtAuthGuard)
  reset(@CurrentUser() me: AuthenticatedUser) {
    return this.issue(me.userId);
  }

  @Get(":token/plano.ics")
  @Header("Content-Type", "text/calendar; charset=utf-8")
  @Header("Cache-Control", "private, max-age=300")
  async ics(@Param("token") token: string) {
    const user = await this.system.user.findUnique({ where: { icalToken: token }, include: { workspace: { select: { name: true, cardPrefix: true } } } });
    if (!user?.isActive || user.kind !== "HUMAN") throw new NotFoundException();
    const cards = await this.system.card.findMany({
      where: { workspaceId: user.workspaceId, dueDate: { not: null }, assignees: { some: { userId: user.id } }, project: { status: "ACTIVE" } },
      include: { project: { select: { id: true, title: true } }, column: { select: { boardId: true, position: true } } },
      orderBy: { dueDate: "asc" },
      take: 2000,
    });
    // Cards in the last column of their board are finished: not in the calendar.
    const last = new Map<string, number>();
    for (const g of await this.system.column.groupBy({ by: ["boardId"], where: { boardId: { in: [...new Set(cards.map((c) => c.column.boardId))] } }, _max: { position: true } })) last.set(g.boardId, g._max.position ?? 0);
    const events: IcsEvent[] = cards
      .filter((c) => c.column.position < (last.get(c.column.boardId) ?? 0))
      .map((c) => {
        const due = c.dueDate!;
        const start = c.startDate && c.startDate < due ? c.startDate : due;
        return {
          uid: `${c.id}@plano`,
          summary: `${user.workspace.cardPrefix}-${c.number} ${c.title}`,
          description: c.project.title,
          url: `${appUrl()}/projects/${c.project.id}?card=${c.id}`,
          start,
          endExclusive: new Date(due.getTime() + DAY),
          modified: c.updatedAt,
        };
      });
    return withLocale(asLocale(user.locale) ?? "ru", () => buildCalendar(t("api.calendar.name", { workspace: user.workspace.name }), events));
  }

  private async issue(userId: string) {
    const token = newToken();
    await this.prisma.user.update({ where: { id: userId }, data: { icalToken: token } });
    return { url: feedUrl(token) };
  }
}

@Module({ controllers: [CalendarController] })
export class CalendarModule {}
