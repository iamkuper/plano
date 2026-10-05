import { BadRequestException, Controller, Get, Header, Query, Res, UseGuards } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Response } from "express";
import { csvRow } from "../export/export.controller";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { can, t } from "@plano/shared";
import { AuthenticatedUser, CurrentUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { currentWorkspaceId } from "../prisma/tenant";
import { BillingService } from "../billing/billing.service";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

interface Filter {
  from: string;
  to: string;
  userId?: string;
  projectId?: string;
}
type GroupBy = "user" | "project";

const include = {
  user: { select: { id: true, name: true, avatarUrl: true } },
  card: { select: { id: true, number: true, title: true, project: { select: { id: true, title: true } } } },
} as const;

@Controller("reports")
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  // Time entries in [from, to] (inclusive dates), with who/what/where for
  // grouping and export on the client.
  @Get("time")
  async time(
    @CurrentUser() user: AuthenticatedUser,
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("userId") userId?: string,
    @Query("projectId") projectId?: string,
  ) {
    await this.billing.assertFeature("time");
    // Without "time.viewAll" a member sees only their own entries.
    if (!can(user, "time.viewAll")) userId = user.userId;
    if (!DAY.test(from ?? "") || !DAY.test(to ?? "")) throw new BadRequestException(t("api.reports.specifyThePeriodFromAnd"));
    if (from > to) throw new BadRequestException(t("api.reports.theStartOfThePeriod"));
    return this.prisma.timeEntry.findMany({
      where: {
        date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
        ...(userId ? { userId } : {}),
        ...(projectId ? { card: { projectId } } : {}),
      },
      orderBy: [{ date: "desc" }, { id: "asc" }],
      take: 5000,
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        card: {
          select: {
            id: true,
            number: true,
            title: true,
            project: { select: { id: true, title: true } },
          },
        },
      },
    });
  }

  // Same rules for every report: the feature, the period, and "own entries
  // only" without time.viewAll.
  private async filter(user: AuthenticatedUser, from: string, to: string, userId?: string, projectId?: string): Promise<Filter> {
    await this.billing.assertFeature("time");
    if (!can(user, "time.viewAll")) userId = user.userId;
    if (!DAY.test(from ?? "") || !DAY.test(to ?? "")) throw new BadRequestException(t("api.reports.specifyThePeriodFromAnd"));
    if (from > to) throw new BadRequestException(t("api.reports.theStartOfThePeriod"));
    return { from, to, userId: userId || undefined, projectId: projectId || undefined };
  }

  private where(f: Filter, group?: { by: GroupBy; key: string }): Prisma.TimeEntryWhereInput {
    return {
      date: { gte: new Date(`${f.from}T00:00:00Z`), lte: new Date(`${f.to}T00:00:00Z`) },
      ...(f.userId ? { userId: f.userId } : {}),
      ...(f.projectId ? { card: { projectId: f.projectId } } : {}),
      ...(group ? (group.by === "user" ? { userId: group.key } : { card: { projectId: group.key } }) : {}),
    };
  }

  // Totals and one row per person or project, computed in the database: the
  // page shows these first and loads the entries of a group when it is opened.
  @Get("time/summary")
  async summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("groupBy") groupBy: string = "user",
    @Query("userId") userId?: string,
    @Query("projectId") projectId?: string,
  ) {
    const f = await this.filter(user, from, to, userId, projectId);
    const by: GroupBy = groupBy === "project" ? "project" : "user";
    const ws = currentWorkspaceId();
    const cond = Prisma.sql`c."workspaceId" = ${ws} AND e."date" >= ${new Date(`${f.from}T00:00:00Z`)} AND e."date" <= ${new Date(`${f.to}T00:00:00Z`)}
      ${f.userId ? Prisma.sql`AND e."userId" = ${f.userId}` : Prisma.empty} ${f.projectId ? Prisma.sql`AND c."projectId" = ${f.projectId}` : Prisma.empty}`;
    const key = by === "user" ? Prisma.sql`e."userId"` : Prisma.sql`c."projectId"`;
    const [totals, rows] = await Promise.all([
      this.prisma.$queryRaw<{ minutes: bigint | null; entries: bigint; people: bigint; projects: bigint }[]>`
        SELECT SUM(e."minutes") AS minutes, COUNT(*) AS entries, COUNT(DISTINCT e."userId") AS people, COUNT(DISTINCT c."projectId") AS projects
        FROM "TimeEntry" e JOIN "Card" c ON c."id" = e."cardId" WHERE ${cond}`,
      this.prisma.$queryRaw<{ key: string; minutes: bigint; entries: bigint }[]>`
        SELECT ${key} AS key, SUM(e."minutes") AS minutes, COUNT(*) AS entries
        FROM "TimeEntry" e JOIN "Card" c ON c."id" = e."cardId" WHERE ${cond} GROUP BY ${key} ORDER BY minutes DESC`,
    ]);
    const keys = rows.map((r) => r.key);
    const people = by === "user" ? await this.prisma.user.findMany({ where: { id: { in: keys } }, select: { id: true, name: true, avatarUrl: true } }) : [];
    const projects = by === "project" ? await this.prisma.project.findMany({ where: { id: { in: keys } }, select: { id: true, title: true } }) : [];
    const label = new Map<string, string>([...people.map((p) => [p.id, p.name] as const), ...projects.map((p) => [p.id, p.title] as const)]);
    const whoIs = new Map(people.map((p) => [p.id, p]));
    const total = totals[0];
    return {
      totalMinutes: Number(total?.minutes ?? 0),
      entries: Number(total?.entries ?? 0),
      people: Number(total?.people ?? 0),
      projects: Number(total?.projects ?? 0),
      groups: rows.map((r) => ({ key: r.key, label: label.get(r.key) ?? "", user: whoIs.get(r.key) ?? null, minutes: Number(r.minutes), entries: Number(r.entries) })),
    };
  }

  // The entries of one group (or all of them without `key`), a page at a time.
  @Get("time/entries")
  async entries(
    @CurrentUser() user: AuthenticatedUser,
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("groupBy") groupBy: string = "user",
    @Query("key") key?: string,
    @Query("userId") userId?: string,
    @Query("projectId") projectId?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const f = await this.filter(user, from, to, userId, projectId);
    const where = this.where(f, key ? { by: groupBy === "project" ? "project" : "user", key } : undefined);
    const take = Math.min(500, Math.max(1, Math.floor(Number(limit)) || 100));
    const [total, items] = await Promise.all([
      this.prisma.timeEntry.count({ where }),
      this.prisma.timeEntry.findMany({ where, orderBy: [{ date: "desc" }, { id: "asc" }], skip: Math.max(0, Math.floor(Number(offset)) || 0), take, include }),
    ]);
    return { total, items };
  }

  // Everything in the period as a CSV for Excel, read in portions and sent as
  // it goes: it has no limit on the number of entries.
  @Get("time/export.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("userId") userId?: string,
    @Query("projectId") projectId?: string,
  ) {
    const f = await this.filter(user, from, to, userId, projectId);
    const workspace = await this.prisma.workspace.findFirstOrThrow({ select: { cardPrefix: true } });
    const where = this.where(f);
    res.write("\uFEFF" + csvRow([t("common.date"), t("common.employee"), t("common.project"), t("common.card"), t("common.cardTitle"), t("reports.time.comment"), t("reports.time.minutes"), t("reports.time.hours")]) + "\r\n");
    for (let offset = 0; ; offset += 2000) {
      const part = await this.prisma.timeEntry.findMany({ where, orderBy: [{ date: "desc" }, { id: "asc" }], skip: offset, take: 2000, include });
      for (const e of part) {
        res.write(csvRow([e.date.toISOString().slice(0, 10), e.user.name, e.card.project.title, `${workspace.cardPrefix}-${e.card.number}`, e.card.title, e.note ?? "", e.minutes, String(Math.round((e.minutes / 60) * 10) / 10).replace(".", ",")]) + "\r\n");
      }
      if (part.length < 2000) break;
    }
    res.end();
  }
}
