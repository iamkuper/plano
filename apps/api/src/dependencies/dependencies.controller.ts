import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Module, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { IsString } from "class-validator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { BillingService } from "../billing/billing.service";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { t } from "@plano/shared";
class AddDependencyDto {
  @IsString()
  dependsOnId!: string;
}

// Finish-to-start links between cards of one project (Gantt arrows).
// A Business feature; cycles are refused.
@Controller()
@UseGuards(JwtAuthGuard)
export class DependenciesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get("projects/:projectId/dependencies")
  async list(@Param("projectId") projectId: string) {
    await this.billing.assertFeature("gantt");
    return this.prisma.cardDependency.findMany({
      where: { card: { projectId } },
      select: { cardId: true, dependsOnId: true },
    });
  }

  @Post("cards/:id/dependencies")
  async add(@Param("id") id: string, @Body() dto: AddDependencyDto) {
    await this.billing.assertFeature("gantt");
    if (id === dto.dependsOnId) throw new BadRequestException(t("api.dependencies.aCardCannotDependOn"));
    const [card, other] = await Promise.all([
      this.prisma.card.findUnique({ where: { id }, select: { projectId: true } }),
      this.prisma.card.findUnique({ where: { id: dto.dependsOnId }, select: { projectId: true } }),
    ]);
    if (!card || !other) throw new NotFoundException(t("common.cardNotFound"));
    if (card.projectId !== other.projectId) throw new BadRequestException(t("api.dependencies.onlyCardsOfTheSame"));
    if (await this.reaches(dto.dependsOnId, id)) throw new BadRequestException(t("api.dependencies.thisLinkWouldCreateA"));
    await this.prisma.cardDependency.upsert({
      where: { cardId_dependsOnId: { cardId: id, dependsOnId: dto.dependsOnId } },
      create: { cardId: id, dependsOnId: dto.dependsOnId },
      update: {},
    });
    this.realtime.boardChanged(card.projectId);
    return { cardId: id, dependsOnId: dto.dependsOnId };
  }

  @Delete("cards/:id/dependencies/:dependsOnId")
  @HttpCode(204)
  async remove(@Param("id") id: string, @Param("dependsOnId") dependsOnId: string) {
    await this.billing.assertFeature("gantt");
    const card = await this.prisma.card.findUnique({ where: { id }, select: { projectId: true } });
    if (!card) throw new NotFoundException(t("common.cardNotFound"));
    await this.prisma.cardDependency.deleteMany({ where: { cardId: id, dependsOnId } });
    this.realtime.boardChanged(card.projectId);
  }

  // Does `from` already depend (directly or through others) on `target`?
  private async reaches(from: string, target: string) {
    const seen = new Set<string>();
    let frontier = [from];
    while (frontier.length) {
      if (frontier.includes(target)) return true;
      frontier.forEach((f) => seen.add(f));
      const next = await this.prisma.cardDependency.findMany({ where: { cardId: { in: frontier } }, select: { dependsOnId: true } });
      frontier = [...new Set(next.map((n) => n.dependsOnId))].filter((n) => !seen.has(n));
    }
    return false;
  }
}

@Module({ controllers: [DependenciesController] })
export class DependenciesModule {}
