import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionGuard, RequirePermission } from "../auth/guards/permission.guard";
import { PrismaService } from "../prisma/prisma.service";
import { FromProjectDto, SaveTemplateDto } from "./templates.dto";
import { OWN_FIELDS } from "../prisma/tenant";
import { AuditService } from "../audit/audit.service";

const clean = (dto: SaveTemplateDto) => ({
  name: dto.name.trim(),
  columns: dto.columns.map((c) => c.trim()).filter(Boolean),
  cards: dto.cards.map((c, i) => ({
    title: c.title.trim(),
    description: c.description?.trim() || null,
    type: c.type,
    estimateHours: c.estimateHours ?? null,
    checklist: c.checklist.map((t) => t.trim()).filter(Boolean),
    position: i + 1,
  })),
});

// Project templates: stages + starter cards. Anyone can read; admins edit.
@Controller("templates")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class TemplatesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.prisma.template.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { cards: true } } },
    });
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.prisma.template.findUniqueOrThrow({
      where: { id },
      include: { cards: { orderBy: { position: "asc" } } },
    });
  }

  @Post()
  @RequirePermission("templates.manage")
  async create(@Body() dto: SaveTemplateDto) {
    const { cards, ...data } = clean(dto);
    const template = await this.prisma.template.create({ data: { ...OWN_FIELDS, ...data, cards: { create: cards } } });
    await this.audit.record("template.create", `Создан шаблон «${template.name}»`, template.id);
    return template;
  }

  @Put(":id")
  @RequirePermission("templates.manage")
  save(@Param("id") id: string, @Body() dto: SaveTemplateDto) {
    const { cards, ...data } = clean(dto);
    return this.prisma.template.update({
      where: { id },
      data: { ...data, cards: { deleteMany: {}, create: cards } },
      include: { cards: { orderBy: { position: "asc" } } },
    });
  }

  @Delete(":id")
  @RequirePermission("templates.manage")
  @HttpCode(204)
  async remove(@Param("id") id: string) {
    const template = await this.prisma.template.findUnique({ where: { id }, select: { name: true } });
    await this.prisma.template.delete({ where: { id } });
    await this.audit.record("template.delete", `Удалён шаблон «${template?.name ?? id}»`, id);
  }

  // Snapshot a project's stages and cards (titles, types, estimates,
  // checklist texts) as a new template. Card order follows the board.
  @Post("from-project/:projectId")
  @RequirePermission("templates.manage")
  async fromProject(@Param("projectId") projectId: string, @Body() dto: FromProjectDto) {
    const board = await this.prisma.board.findUnique({
      where: { projectId },
      include: {
        columns: {
          orderBy: { position: "asc" },
          include: { cards: { orderBy: { position: "asc" }, include: { checklist: { orderBy: { position: "asc" } } } } },
        },
      },
    });
    if (!board) throw new NotFoundException("Доска проекта не найдена");
    const cards = board.columns.flatMap((col) => col.cards);
    return this.prisma.template.create({
      data: {
        ...OWN_FIELDS,
        name: dto.name.trim(),
        columns: board.columns.map((c) => c.title),
        cards: {
          create: cards.map((c, i) => ({
            title: c.title,
            description: c.description,
            type: c.type,
            estimateHours: c.estimateHours,
            checklist: c.checklist.map((item) => item.text),
            position: i + 1,
          })),
        },
      },
    });
  }
}
