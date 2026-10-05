import { BadRequestException, Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { can } from "@plano/shared";
import { AuthenticatedUser, CurrentUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { BillingService } from "../billing/billing.service";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

@Controller("reports")
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  // Time entries in [from, to] (inclusive dates), with who/what/where for
  // grouping and export on the client.
  @Get("time")
  async time(
    @CurrentUser() user: AuthenticatedUser,
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("userId") userId?: string,
    @Query("projectId") projectId?: string,
  ) {
    await this.billing.assertFeature("time");
    // Without "time.viewAll" a member sees only their own entries.
    if (!can(user, "time.viewAll")) userId = user.userId;
    if (!DAY.test(from ?? "") || !DAY.test(to ?? "")) throw new BadRequestException("Укажите период: from и to в формате ГГГГ-ММ-ДД");
    if (from > to) throw new BadRequestException("Начало периода позже конца");
    return this.prisma.timeEntry.findMany({
      where: {
        date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
        ...(userId ? { userId } : {}),
        ...(projectId ? { card: { projectId } } : {}),
      },
      orderBy: [{ date: "desc" }, { id: "asc" }],
      take: 5000,
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        card: {
          select: {
            id: true,
            number: true,
            title: true,
            type: { select: { id: true, name: true, color: true } },
            project: { select: { id: true, title: true } },
          },
        },
      },
    });
  }
}
