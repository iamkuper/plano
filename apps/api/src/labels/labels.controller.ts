import { Body, ConflictException, Controller, Delete, Get, HttpCode, Module, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { LABEL_COLORS } from "@amo-kanban/shared";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionGuard, RequirePermission } from "../auth/guards/permission.guard";
import { PrismaService } from "../prisma/prisma.service";
import { OWN_FIELDS } from "../prisma/tenant";

class CreateLabelDto {
  @IsString()
  @MinLength(1, { message: "Укажите название метки" })
  @MaxLength(30, { message: "Название — до 30 символов" })
  name!: string;

  @IsIn(LABEL_COLORS, { message: "Неизвестный цвет" })
  color!: string;
}

class UpdateLabelDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "Укажите название метки" })
  @MaxLength(30, { message: "Название — до 30 символов" })
  name?: string;

  @IsOptional()
  @IsIn(LABEL_COLORS, { message: "Неизвестный цвет" })
  color?: string;
}

// Anyone in the workspace can create and assign labels; renaming, recolouring
// and deleting needs "labels.manage".
@Controller("labels")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class LabelsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.label.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true } });
  }

  @Post()
  async create(@Body() dto: CreateLabelDto) {
    const name = dto.name.trim();
    await this.assertFree(name);
    return this.prisma.label.create({ data: { ...OWN_FIELDS, name, color: dto.color }, select: { id: true, name: true, color: true } });
  }

  @Patch(":id")
  @RequirePermission("labels.manage")
  async update(@Param("id") id: string, @Body() dto: UpdateLabelDto) {
    const name = dto.name?.trim();
    if (name) await this.assertFree(name, id);
    return this.prisma.label.update({ where: { id }, data: { name, color: dto.color }, select: { id: true, name: true, color: true } });
  }

  @Delete(":id")
  @RequirePermission("labels.manage")
  @HttpCode(204)
  async remove(@Param("id") id: string) {
    await this.prisma.label.delete({ where: { id } });
  }

  private async assertFree(name: string, exceptId?: string) {
    const taken = await this.prisma.label.findFirst({ where: { name: { equals: name, mode: "insensitive" }, id: { not: exceptId } } });
    if (taken) throw new ConflictException("Метка с таким названием уже есть");
  }
}

@Module({ controllers: [LabelsController] })
export class LabelsModule {}
