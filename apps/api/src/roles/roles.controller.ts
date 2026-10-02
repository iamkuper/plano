import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { PERMISSIONS } from "@amo-kanban/shared";
import { AdminGuard } from "../auth/guards/admin.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { OWN_FIELDS } from "../prisma/tenant";
import { BillingService } from "../billing/billing.service";
import { AuditService } from "../audit/audit.service";

const KEYS = PERMISSIONS.map((p) => p.key);

class CreateRoleDto {
  @IsString()
  @MinLength(1, { message: "Укажите название роли" })
  @MaxLength(40, { message: "Название — до 40 символов" })
  name!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(KEYS, { each: true, message: "Неизвестное право" })
  permissions?: string[];
}

class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "Укажите название роли" })
  @MaxLength(40, { message: "Название — до 40 символов" })
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(KEYS, { each: true, message: "Неизвестное право" })
  permissions?: string[];

  // Only `true` is meaningful: makes this the role for new staff.
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

const withCount = { _count: { select: { users: true } } } as const;

// Custom roles. Anyone can list them (the staff table shows role names);
// only administrators change them.
@Controller("roles")
@UseGuards(JwtAuthGuard)
export class RolesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.prisma.role.findMany({ orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], include: withCount });
  }

  @Post()
  @UseGuards(AdminGuard)
  async create(@Body() dto: CreateRoleDto) {
    await this.billing.assertFeature("roles");
    const name = dto.name.trim();
    await this.assertFree(name);
    const first = (await this.prisma.role.count()) === 0;
    const role = await this.prisma.role.create({ data: { ...OWN_FIELDS, name, permissions: dto.permissions ?? [], isDefault: first }, include: withCount });
    await this.audit.record("role.create", `Создана роль «${role.name}»`, role.id);
    return role;
  }

  @Patch(":id")
  @UseGuards(AdminGuard)
  async update(@Param("id") id: string, @Body() dto: UpdateRoleDto) {
    const name = dto.name?.trim();
    if (name) await this.assertFree(name, id);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.role.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
      return tx.role.update({
        where: { id },
        data: { name, permissions: dto.permissions, ...(dto.isDefault ? { isDefault: true } : {}) },
        include: withCount,
      });
    });
    await this.audit.record("role.update", `Изменена роль «${updated.name}»${dto.permissions ? ": права" : ""}`, id);
    return updated;
  }

  // Staff with the deleted role move to the default role.
  @Delete(":id")
  @HttpCode(204)
  @UseGuards(AdminGuard)
  async remove(@Param("id") id: string) {
    const role = await this.prisma.role.findUniqueOrThrow({ where: { id } });
    if (role.isDefault) throw new BadRequestException("Роль по умолчанию удалить нельзя — сначала назначьте другую");
    const fallback = await this.prisma.role.findFirst({ where: { isDefault: true } });
    await this.prisma.$transaction([
      this.prisma.user.updateMany({ where: { roleId: id }, data: { roleId: fallback?.id ?? null } }),
      this.prisma.role.delete({ where: { id } }),
    ]);
    await this.audit.record("role.delete", `Удалена роль «${role.name}»`, id);
  }

  private async assertFree(name: string, exceptId?: string) {
    if (name.toLowerCase() === "администратор") throw new ConflictException("«Администратор» — встроенная роль");
    // Compared in JS: the database's case folding doesn't cover Cyrillic.
    const all = await this.prisma.role.findMany({ select: { id: true, name: true } });
    if (all.some((r) => r.id !== exceptId && r.name.toLowerCase() === name.toLowerCase())) throw new ConflictException("Роль с таким названием уже есть");
  }
}
