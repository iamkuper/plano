import { Controller, Get, Module, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionGuard, RequirePermission } from "../auth/guards/permission.guard";
import { BillingService } from "../billing/billing.service";
import { PrismaService } from "../prisma/prisma.service";

const PAGE = 50;

// Business feature; visible to administrators and people with "audit.view".
@Controller("audit")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AuditController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  // Newest first; `before` is the id of the last row of the previous page.
  @Get()
  @RequirePermission("audit.view")
  async list(@Query("before") before?: string, @Query("group") group?: string) {
    await this.billing.assertFeature("audit");
    const rows = await this.prisma.auditLog.findMany({
      where: group ? { action: { startsWith: `${group}.` } } : undefined,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE + 1,
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
      select: { id: true, action: true, summary: true, entityId: true, createdAt: true, user: { select: { id: true, name: true, avatarUrl: true } } },
    });
    return { items: rows.slice(0, PAGE), next: rows.length > PAGE ? rows[PAGE - 1].id : null };
  }
}

@Module({ controllers: [AuditController] })
export class AuditApiModule {}
