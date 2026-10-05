import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, Module, NotFoundException, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { CUSTOM_FIELD_TYPES, type CustomFieldType, t } from "@plano/shared";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionGuard, RequirePermission } from "../auth/guards/permission.guard";
import { BillingService } from "../billing/billing.service";
import { PrismaService } from "../prisma/prisma.service";
import { OWN_FIELDS } from "../prisma/tenant";
import { RealtimeService } from "../realtime/realtime.service";
import { AuditService } from "../audit/audit.service";

const MAX_FIELDS = 20;
const MAX_OPTIONS = 30;
const select = { id: true, name: true, type: true, options: true, position: true } as const;

class CreateFieldDto {
  @IsString()
  @MinLength(1, { message: () => t("api.fields.enterAFieldName") })
  @MaxLength(40, { message: () => t("common.nameMustBeUpTo") })
  name!: string;

  @IsIn(CUSTOM_FIELD_TYPES, { message: () => t("api.fields.unknownFieldType") })
  type!: CustomFieldType;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_OPTIONS, { message: () => t("api.fields.atMostOptions", { MAX_OPTIONS }) })
  @IsString({ each: true })
  @MaxLength(60, { each: true, message: () => t("api.fields.anOptionMustBeUp") })
  options?: string[];
}

class UpdateFieldDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: () => t("api.fields.enterAFieldName") })
  @MaxLength(40, { message: () => t("common.nameMustBeUpTo") })
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_OPTIONS, { message: () => t("api.fields.atMostOptions", { MAX_OPTIONS }) })
  @IsString({ each: true })
  @MaxLength(60, { each: true, message: () => t("api.fields.anOptionMustBeUp") })
  options?: string[];
}

class SetValueDto {
  // null (or absent) clears the value.
  @IsOptional()
  value?: unknown;
}

const cleanOptions = (options: string[] | undefined) => [...new Set((options ?? []).map((o) => o.trim()).filter(Boolean))];

// Custom card fields are a Business feature. Everyone can read the
// definitions (cards of any plan show existing values); defining fields needs
// "fields.manage" and the plan, setting a value needs the plan.
@Controller()
@UseGuards(JwtAuthGuard, PermissionGuard)
export class FieldsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
  ) {}

  @Get("fields")
  list() {
    return this.prisma.customField.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }], select });
  }

  @Post("fields")
  @RequirePermission("fields.manage")
  async create(@Body() dto: CreateFieldDto) {
    await this.billing.assertFeature("fields");
    const name = dto.name.trim();
    await this.assertFree(name);
    const options = dto.type === "SELECT" ? cleanOptions(dto.options) : [];
    if (dto.type === "SELECT" && options.length < 1) throw new BadRequestException(t("api.fields.addAtLeastOneOption"));
    if ((await this.prisma.customField.count()) >= MAX_FIELDS) throw new BadRequestException(t("api.fields.atMostFields", { MAX_FIELDS }));
    const last = await this.prisma.customField.findFirst({ orderBy: { position: "desc" } });
    const field = await this.prisma.customField.create({ data: { ...OWN_FIELDS, name, type: dto.type, options, position: (last?.position ?? 0) + 1 }, select });
    await this.audit.record("field.create", t("api.fields.fieldCreated", { name: field.name }), field.id);
    return field;
  }

  @Patch("fields/:id")
  @RequirePermission("fields.manage")
  async update(@Param("id") id: string, @Body() dto: UpdateFieldDto) {
    await this.billing.assertFeature("fields");
    const field = await this.prisma.customField.findUnique({ where: { id } });
    if (!field) throw new NotFoundException(t("api.fields.fieldNotFound"));
    const name = dto.name?.trim();
    if (name) await this.assertFree(name, id);
    const options = dto.options && field.type === "SELECT" ? cleanOptions(dto.options) : undefined;
    if (options && options.length < 1) throw new BadRequestException(t("api.fields.addAtLeastOneOption"));
    return this.prisma.customField.update({ where: { id }, data: { name, options }, select });
  }

  @Delete("fields/:id")
  @RequirePermission("fields.manage")
  @HttpCode(204)
  async remove(@Param("id") id: string) {
    const field = await this.prisma.customField.findUnique({ where: { id }, select: { name: true } });
    await this.prisma.customField.delete({ where: { id } });
    await this.audit.record("field.delete", t("api.fields.fieldDeleted", { id: field?.name ?? id }), id);
  }

  @Put("cards/:cardId/fields/:fieldId")
  @HttpCode(204)
  async setValue(@Param("cardId") cardId: string, @Param("fieldId") fieldId: string, @Body() dto: SetValueDto) {
    await this.billing.assertFeature("fields");
    const [card, field] = await Promise.all([
      this.prisma.card.findUnique({ where: { id: cardId }, select: { projectId: true } }),
      this.prisma.customField.findUnique({ where: { id: fieldId } }),
    ]);
    if (!card) throw new NotFoundException(t("common.cardNotFound"));
    if (!field) throw new NotFoundException(t("api.fields.fieldNotFound"));
    const value = this.parse(field.type, field.options, dto.value);
    if (value === null) await this.prisma.cardFieldValue.deleteMany({ where: { cardId, fieldId } });
    else {
      await this.prisma.cardFieldValue.upsert({
        where: { cardId_fieldId: { cardId, fieldId } },
        create: { cardId, fieldId, value },
        update: { value },
      });
    }
    await this.realtime.cardChanged(cardId, card.projectId);
  }

  // Checks the value against the field type; null means "clear".
  private parse(type: CustomFieldType, options: string[], raw: unknown): string | number | boolean | null {
    if (raw === null || raw === undefined || raw === "") return null;
    switch (type) {
      case "TEXT":
        if (typeof raw !== "string") break;
        if (raw.length > 500) throw new BadRequestException(t("api.fields.textMustBeUpTo"));
        return raw;
      case "NUMBER":
        if (typeof raw !== "number" || !Number.isFinite(raw)) break;
        return raw;
      case "DATE":
        if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) break;
        return raw;
      case "SELECT":
        if (typeof raw !== "string" || !options.includes(raw)) throw new BadRequestException(t("api.fields.thereIsNoSuchOption"));
        return raw;
      case "CHECKBOX":
        if (typeof raw !== "boolean") break;
        return raw;
    }
    throw new BadRequestException(t("api.fields.theValueDoesNotFit"));
  }

  private async assertFree(name: string, exceptId?: string) {
    // Compared in JS: the database's case folding doesn't cover Cyrillic.
    const all = await this.prisma.customField.findMany({ select: { id: true, name: true } });
    if (all.some((f) => f.id !== exceptId && f.name.toLowerCase() === name.toLowerCase())) throw new ConflictException(t("api.fields.aFieldWithThisName"));
  }
}

@Module({ controllers: [FieldsController] })
export class FieldsModule {}
