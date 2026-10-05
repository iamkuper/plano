import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Module, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { IsString, MaxLength, MinLength } from "class-validator";
import { t } from "@plano/shared";
import { AuthModule } from "../auth/auth.module";
import { AuthService } from "../auth/auth.service";
import { CurrentUser, type AuthenticatedUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { OWN_FIELDS } from "../prisma/tenant";

class CreateTokenDto {
  @IsString()
  @MinLength(1, { message: () => t("api.apiTokens.enterAName") })
  @MaxLength(60, { message: () => t("api.apiTokens.nameMustBeUpTo") })
  name!: string;
}

const SELECT = { id: true, name: true, hint: true, lastUsedAt: true, createdAt: true } as const;
const MAX_TOKENS = 20;

// Personal access tokens for the public API. They act with the rights of their
// owner and can't be used to manage tokens: that needs a signed-in session.
@Controller("api-tokens")
@UseGuards(JwtAuthGuard)
export class ApiTokensController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  list(@CurrentUser() me: AuthenticatedUser) {
    return this.prisma.apiToken.findMany({ where: { userId: me.userId }, orderBy: { createdAt: "desc" }, select: SELECT });
  }

  @Post()
  async create(@CurrentUser() me: AuthenticatedUser, @Body() dto: CreateTokenDto) {
    this.assertSession(me);
    if ((await this.prisma.apiToken.count({ where: { userId: me.userId } })) >= MAX_TOKENS) throw new ForbiddenException(t("api.apiTokens.tooMany", { count: MAX_TOKENS }));
    const row = await this.prisma.apiToken.create({ data: { ...OWN_FIELDS, userId: me.userId, name: dto.name.trim(), hint: "" }, select: SELECT });
    const token = await this.auth.signApiToken(me.userId, me.email, row.id);
    // The token is shown once; only its tail is kept to tell tokens apart.
    const saved = await this.prisma.apiToken.update({ where: { id: row.id }, data: { hint: token.slice(-6) }, select: SELECT });
    return { ...saved, token };
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentUser() me: AuthenticatedUser, @Param("id") id: string) {
    this.assertSession(me);
    const row = await this.prisma.apiToken.findFirst({ where: { id, userId: me.userId }, select: { id: true } });
    if (!row) throw new NotFoundException();
    await this.prisma.apiToken.delete({ where: { id } });
  }

  private assertSession(me: AuthenticatedUser) {
    if (me.viaToken) throw new ForbiddenException(t("api.apiTokens.sessionOnly"));
  }
}

@Module({ imports: [AuthModule], controllers: [ApiTokensController] })
export class ApiTokensModule {}
