import { Body, Controller, Delete, Get, HttpCode, Global, Module, NotFoundException, Param, Patch, Post, UseGuards, BadRequestException } from "@nestjs/common";
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { WEBHOOK_EVENTS, type WebhookEvent, t } from "@plano/shared";
import { assertPublicUrl } from "../agents/llm";
import { seal } from "../agents/secret";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionGuard, RequirePermission } from "../auth/guards/permission.guard";
import { PrismaService } from "../prisma/prisma.service";
import { OWN_FIELDS } from "../prisma/tenant";
import { newSecret, WebhooksService } from "./webhooks.service";

class CreateWebhookDto {
  @IsString()
  @MaxLength(500)
  url!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(WEBHOOK_EVENTS, { each: true, message: () => t("api.webhooks.unknownEvent") })
  events?: WebhookEvent[];
}

class UpdateWebhookDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(WEBHOOK_EVENTS, { each: true, message: () => t("api.webhooks.unknownEvent") })
  events?: WebhookEvent[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

const MAX_WEBHOOKS = 10;
const SELECT = { id: true, url: true, events: true, isActive: true, createdAt: true } as const;

function checkUrl(raw: string) {
  try {
    return assertPublicUrl(raw.trim()).toString();
  } catch {
    throw new BadRequestException(t("api.webhooks.invalidUrl"));
  }
}

@Controller("webhooks")
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission("webhooks.manage")
export class WebhooksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhooksService,
  ) {}

  @Get()
  async list() {
    const rows = await this.prisma.webhook.findMany({ orderBy: { createdAt: "asc" }, select: { ...SELECT, deliveries: { orderBy: { createdAt: "desc" }, take: 1, select: { ok: true, statusCode: true, createdAt: true } } } });
    return rows.map(({ deliveries, ...w }) => ({ ...w, lastDelivery: deliveries[0] ?? null }));
  }

  // The signing secret is returned here and by "secret" only.
  @Post()
  async create(@Body() dto: CreateWebhookDto) {
    if ((await this.prisma.webhook.count()) >= MAX_WEBHOOKS) throw new BadRequestException(t("api.webhooks.tooMany", { count: MAX_WEBHOOKS }));
    const secret = newSecret();
    const row = await this.prisma.webhook.create({ data: { ...OWN_FIELDS, url: checkUrl(dto.url), events: dto.events ?? [], secret: seal(secret) }, select: SELECT });
    return { ...row, lastDelivery: null, secret };
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() dto: UpdateWebhookDto) {
    await this.find(id);
    const row = await this.prisma.webhook.update({ where: { id }, data: { url: dto.url === undefined ? undefined : checkUrl(dto.url), events: dto.events, isActive: dto.isActive }, select: SELECT });
    return { ...row, lastDelivery: null };
  }

  // A new secret replaces the old one at once.
  @Post(":id/secret")
  async rotate(@Param("id") id: string) {
    await this.find(id);
    const secret = newSecret();
    await this.prisma.webhook.update({ where: { id }, data: { secret: seal(secret) } });
    return { secret };
  }

  @Post(":id/test")
  @HttpCode(200)
  async test(@Param("id") id: string) {
    const hook = await this.find(id);
    const ok = await this.webhooks.ping({ id: hook.id, url: hook.url, secret: hook.secret });
    return { ok };
  }

  @Get(":id/deliveries")
  async deliveries(@Param("id") id: string) {
    await this.find(id);
    return this.prisma.webhookDelivery.findMany({ where: { webhookId: id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, event: true, ok: true, statusCode: true, error: true, attempts: true, createdAt: true } });
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@Param("id") id: string) {
    await this.find(id);
    await this.prisma.webhook.delete({ where: { id } });
  }

  private async find(id: string) {
    const hook = await this.prisma.webhook.findUnique({ where: { id } });
    if (!hook) throw new NotFoundException();
    return hook;
  }
}

@Global()
@Module({ controllers: [WebhooksController], providers: [WebhooksService], exports: [WebhooksService] })
export class WebhooksModule {}
