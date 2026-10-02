import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { RecurringRule } from "@prisma/client";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { isLocked } from "../billing/subscription-state";
import { SystemPrismaService } from "../prisma/system-prisma.service";
import { CARD_FIELDS, runInWorkspace } from "../prisma/tenant";
import { RealtimeService } from "../realtime/realtime.service";
import { SaveRecurringDto } from "./recurring.dto";
import { firstRun, nextRun } from "./schedule";
import { BillingService } from "../billing/billing.service";

@Injectable()
export class RecurringService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(RecurringService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    // The scheduler looks across all workspaces, then works inside each one.
    private readonly system: SystemPrismaService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly billing: BillingService,
  ) {}

  onModuleInit() {
    if (process.env.DISABLE_SCHEDULERS === "1") return;
    // Check once a minute; also right after start to catch up after downtime.
    this.timer = setInterval(() => this.runDue(), 60_000);
    setTimeout(() => this.runDue(), 5_000);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  list(projectId: string) {
    return this.prisma.recurringRule.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  }

  private data(dto: SaveRecurringDto) {
    const rule = {
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      type: dto.type ?? "OTHER",
      priority: dto.priority ?? "MEDIUM",
      estimateHours: dto.estimateHours ?? null,
      assigneeIds: dto.assigneeIds ?? [],
      checklist: (dto.checklist ?? []).map((t) => t.trim()).filter(Boolean),
      frequency: dto.frequency,
      interval: dto.interval,
      weekday: dto.frequency === "WEEKLY" ? dto.weekday ?? 1 : null,
      monthDay: dto.frequency === "MONTHLY" ? dto.monthDay ?? 1 : null,
      dueInDays: dto.dueInDays ?? null,
    };
    return { ...rule, nextRunAt: firstRun(rule, dto.startDate) };
  }

  async create(projectId: string, dto: SaveRecurringDto, userId: string) {
    await this.billing.assertWithin("recurring");
    return this.prisma.recurringRule.create({ data: { ...this.data(dto), projectId, createdById: userId } });
  }

  update(id: string, dto: SaveRecurringDto) {
    return this.prisma.recurringRule.update({ where: { id }, data: this.data(dto) });
  }

  setActive(id: string, active: boolean) {
    return this.prisma.recurringRule.update({ where: { id }, data: { active } });
  }

  async remove(id: string) {
    await this.prisma.recurringRule.delete({ where: { id } });
  }

  // Create the card now without moving the schedule.
  async runNow(id: string) {
    const rule = await this.prisma.recurringRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException("Правило не найдено");
    return this.createCard(rule, new Date());
  }

  private async createCard(rule: RecurringRule, runAt: Date) {
    const column = await this.prisma.column.findFirst({
      where: { board: { projectId: rule.projectId } },
      orderBy: { position: "asc" },
    });
    if (!column) return null;
    const last = await this.prisma.card.findFirst({ where: { columnId: column.id }, orderBy: { position: "desc" } });
    const users = await this.prisma.user.findMany({ where: { id: { in: rule.assigneeIds }, isActive: true }, select: { id: true } });
    const due = rule.dueInDays != null ? new Date(runAt.getTime() + rule.dueInDays * 86_400_000) : null;
    const card = await this.prisma.card.create({
      data: {
        ...CARD_FIELDS,
        projectId: rule.projectId,
        columnId: column.id,
        title: rule.title,
        description: rule.description,
        type: rule.type,
        priority: rule.priority,
        estimateHours: rule.estimateHours,
        dueDate: due,
        position: (last?.position ?? 0) + 1,
        recurringRuleId: rule.id,
        assignees: { create: users.map((u) => ({ userId: u.id })) },
        checklist: { create: rule.checklist.map((text, i) => ({ text, position: i + 1 })) },
      },
    });
    await this.prisma.activityLog.create({ data: { cardId: card.id, userId: rule.createdById, action: "created", payload: { recurring: true } } });
    await this.notifications.assigned(card.id, rule.createdById, users.map((u) => u.id));
    this.realtime.boardChanged(rule.projectId);
    return card;
  }

  // Creates cards for every rule whose time has come and moves it forward.
  // Missed runs (server was off) produce one card, not a backlog of them.
  async runDue() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const due = await this.system.recurringRule.findMany({
        where: { active: true, nextRunAt: { lte: now }, project: { status: { in: ["ACTIVE", "ON_HOLD"] } } },
        include: { project: { select: { workspaceId: true, workspace: { select: { subscription: true } } } } },
      });
      for (const { project, ...rule } of due) {
        // A locked workspace is read-only: nothing is created in it.
        if (isLocked(project.workspace.subscription)) continue;
        await runInWorkspace(project.workspaceId, async () => {
          await this.createCard(rule, rule.nextRunAt);
          let next = nextRun(rule, rule.nextRunAt);
          while (next <= now) next = nextRun(rule, next);
          await this.prisma.recurringRule.update({ where: { id: rule.id }, data: { lastRunAt: now, nextRunAt: next } });
        });
      }
      if (due.length) this.log.log(`Created ${due.length} recurring card(s)`);
    } catch (e) {
      this.log.error(`Recurring run failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
