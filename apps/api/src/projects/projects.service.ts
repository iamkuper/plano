import { Injectable, NotFoundException } from "@nestjs/common";
import { ProjectStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { RealtimeService } from "../realtime/realtime.service";
import { AttachmentsService } from "../attachments/attachments.service";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { CARD_FIELDS, OWN_FIELDS, changedFields } from "../prisma/tenant";
import { BillingService } from "../billing/billing.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly realtime: RealtimeService,
    private readonly attachments: AttachmentsService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
  ) {}

  async list(status?: ProjectStatus) {
    const projects = await this.prisma.project.findMany({
      where: status ? { status } : { status: { not: "ARCHIVED" } },
      orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
      include: {
        _count: { select: { cards: true } },
        board: { select: { columns: { orderBy: { position: "asc" }, select: { _count: { select: { cards: true } } } } } },
      },
    });
    // Open = not in the last column ("done").
    return projects.map(({ board, ...p }) => ({
      ...p,
      openCards: (board?.columns ?? []).slice(0, -1).reduce((n, c) => n + c._count.cards, 0),
    }));
  }

  async get(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { board: { select: { id: true } } },
    });
    if (!project) throw new NotFoundException("Проект не найден");
    return project;
  }

  // Creates the project together with its board. With a template, the board
  // gets the template's columns and its cards land in the first column;
  // without one, the workspace's default stages are used and it starts empty.
  async create(dto: CreateProjectDto) {
    await this.billing.assertWithin("projects");
    const template = dto.templateId
      ? await this.prisma.template.findUnique({
          where: { id: dto.templateId },
          include: { cards: { orderBy: { position: "asc" } } },
        })
      : null;
    if (dto.templateId && !template) throw new NotFoundException("Шаблон не найден");

    const columnTitles = template?.columns.length ? template.columns : (await this.settings.get()).defaultColumns;

    const project = await this.prisma.project.create({
      data: {
        ...OWN_FIELDS,
        title: dto.title,
        startDate: dto.startDate,
        deadline: dto.deadline,
        hoursBudget: dto.hoursBudget,
        board: {
          create: {
            columns: { create: columnTitles.map((title, i) => ({ title, position: i + 1 })) },
          },
        },
      },
      include: { board: { include: { columns: { orderBy: { position: "asc" } } } } },
    });

    // Not one transaction on purpose: the tenant scope validates each card's
    // column in the workspace, which it can only see once committed.
    try {
      const firstColumn = project.board!.columns[0];
      for (const [i, tc] of (template?.cards ?? []).entries()) {
        await this.prisma.card.create({
          data: {
            ...CARD_FIELDS,
            projectId: project.id,
            columnId: firstColumn.id,
            title: tc.title,
            description: tc.description,
            type: tc.type,
            estimateHours: tc.estimateHours,
            position: i + 1,
            checklist: { create: tc.checklist.map((text, j) => ({ text, position: j + 1 })) },
          },
        });
      }
    } catch (e) {
      await this.prisma.project.delete({ where: { id: project.id } }).catch(() => {});
      throw e;
    }
    await this.audit.record("project.create", `Создан проект «${project.title}»`, project.id);
    return project;
  }

  async update(id: string, dto: UpdateProjectDto) {
    const project = await this.prisma.project.update({ where: { id }, data: dto });
    await this.audit.record("project.update", `Изменён проект «${project.title}»: ${changedFields(dto)}`, id);
    this.realtime.boardChanged(id);
    return project;
  }

  // Board, columns and cards go with it (onDelete: Cascade).
  async remove(id: string) {
    const purge = await this.attachments.filesOf({ card: { projectId: id } });
    const doomed = await this.prisma.project.findUnique({ where: { id }, select: { title: true } });
    await this.prisma.project.delete({ where: { id } });
    await this.audit.record("project.delete", `Удалён проект «${doomed?.title ?? id}»`, id);
    await purge();
    this.realtime.boardChanged(id);
  }

  // Hours budget vs. logged time, for the project header.
  async stats(id: string) {
    const project = await this.get(id);
    const logged = await this.prisma.timeEntry.aggregate({
      where: { card: { projectId: id } },
      _sum: { minutes: true },
    });
    return {
      hoursBudget: project.hoursBudget,
      loggedMinutes: logged._sum.minutes ?? 0,
    };
  }
}
