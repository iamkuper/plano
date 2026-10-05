import { Body, ConflictException, Controller, Delete, Get, HttpCode, Module, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from "class-validator";
import { LABEL_COLORS, type TaskTypeDto } from "@plano/shared";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionGuard, RequirePermission } from "../auth/guards/permission.guard";
import { PrismaService } from "../prisma/prisma.service";
import { OWN_FIELDS } from "../prisma/tenant";
import { AuditService } from "../audit/audit.service";

class CreateTaskTypeDto {
  @IsString()
  @MinLength(1, { message: "Укажите название типа" })
  @MaxLength(30, { message: "Название — до 30 символов" })
  name!: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(LABEL_COLORS, { message: "Неизвестный цвет" })
  color?: string | null;
}

class UpdateTaskTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "Укажите название типа" })
  @MaxLength(30, { message: "Название — до 30 символов" })
  name?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(LABEL_COLORS, { message: "Неизвестный цвет" })
  color?: string | null;

  // Only `true` is accepted: the default moves to this type.
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

const SELECT = { id: true, name: true, color: true, position: true, isDefault: true, _count: { select: { cards: true } } } as const;
const toDto = (t: { id: string; name: string; color: string | null; position: number; isDefault: boolean; _count: { cards: number } }): TaskTypeDto => ({
  id: t.id,
  name: t.name,
  color: t.color,
  position: t.position,
  isDefault: t.isDefault,
  cardCount: t._count.cards,
});

// Anyone can read the list (card forms need it); changes need "types.manage".
@Controller("task-types")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class TaskTypesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list() {
    return (await this.prisma.taskType.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: SELECT })).map(toDto);
  }

  @Post()
  @RequirePermission("types.manage")
  async create(@Body() dto: CreateTaskTypeDto) {
    const name = dto.name.trim();
    await this.assertFree(name);
    const last = await this.prisma.taskType.findFirst({ orderBy: { position: "desc" }, select: { position: true } });
    const type = await this.prisma.taskType.create({ data: { ...OWN_FIELDS, name, color: dto.color ?? null, position: (last?.position ?? 0) + 1 }, select: SELECT });
    await this.audit.record("taskType.create", `Создан тип задач «${name}»`, type.id);
    return toDto(type);
  }

  @Patch(":id")
  @RequirePermission("types.manage")
  async update(@Param("id") id: string, @Body() dto: UpdateTaskTypeDto) {
    const name = dto.name?.trim();
    if (name) await this.assertFree(name, id);
    if (dto.isDefault === false) throw new ConflictException("Тип по умолчанию нужен всегда: назначьте им другой тип");
    if (dto.isDefault) await this.prisma.taskType.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
    const type = await this.prisma.taskType.update({ where: { id }, data: { name, color: dto.color, isDefault: dto.isDefault ? true : undefined }, select: SELECT });
    return toDto(type);
  }

  // Cards, template cards and recurring rules of the deleted type move to the default one.
  @Delete(":id")
  @RequirePermission("types.manage")
  @HttpCode(204)
  async remove(@Param("id") id: string) {
    const type = await this.prisma.taskType.findUniqueOrThrow({ where: { id }, select: { name: true, isDefault: true } });
    if (type.isDefault) throw new ConflictException("Тип по умолчанию удалить нельзя: сначала назначьте по умолчанию другой");
    const fallback = await this.prisma.taskType.findFirstOrThrow({ where: { isDefault: true }, select: { id: true } });
    await this.prisma.card.updateMany({ where: { typeId: id }, data: { typeId: fallback.id } });
    await this.prisma.templateCard.updateMany({ where: { typeId: id }, data: { typeId: fallback.id } });
    await this.prisma.recurringRule.updateMany({ where: { typeId: id }, data: { typeId: fallback.id } });
    await this.prisma.taskType.delete({ where: { id } });
    await this.audit.record("taskType.delete", `Удалён тип задач «${type.name}»`, id);
  }

  private async assertFree(name: string, exceptId?: string) {
    const all = await this.prisma.taskType.findMany({ select: { id: true, name: true } });
    if (all.some((t) => t.id !== exceptId && t.name.toLowerCase() === name.toLowerCase())) throw new ConflictException("Тип с таким названием уже есть");
  }
}

@Module({ controllers: [TaskTypesController] })
export class TaskTypesModule {}
