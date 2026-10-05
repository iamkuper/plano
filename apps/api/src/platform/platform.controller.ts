import { Body, Controller, Get, HttpCode, Module, StreamableFile, Param, Post, Query, UseGuards } from "@nestjs/common";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PlatformService } from "./platform.service";
import { BillingService } from "../billing/billing.service";

class SubscriptionActionDto {
  @IsIn(["grant", "extend-trial", "lock", "free", "seats"])
  action!: "grant" | "extend-trial" | "lock" | "free" | "seats";

  @IsOptional()
  @IsString()
  planId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  days?: number;

  // Paid seats for "grant" and "seats".
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  seats?: number;
}

// Hidden back-office for the platform owner. Not linked anywhere in the app;
// anyone not listed in PLATFORM_ADMIN_EMAILS sees 404.
@Controller("platform")
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly billing: BillingService,
  ) {}

  @Get("stats")
  stats() {
    return this.platform.stats();
  }

  @Get("workspaces")
  workspaces(@Query("q") q?: string, @Query("state") state?: string, @Query("cursor") cursor?: string) {
    const allowed = ["trial", "paid", "free", "locked", "past_due"] as const;
    return this.platform.workspaces(q, allowed.find((s) => s === state), cursor);
  }

  @Get("workspaces/:id")
  workspace(@Param("id") id: string) {
    return this.platform.workspace(id);
  }

  // Invoice requests waiting for a bank transfer.
  @Get("invoices")
  invoices() {
    return this.billing.pendingInvoices();
  }

  @Get("invoices/:id/pdf")
  async invoicePdf(@Param("id") id: string) {
    const { filename, content } = await this.billing.invoicePdf(id, true);
    return new StreamableFile(content, { type: "application/pdf", disposition: `attachment; filename="${filename}"` });
  }

  @Post("invoices/:id/paid")
  @HttpCode(204)
  invoicePaid(@Param("id") id: string) {
    return this.billing.markInvoicePaid(id);
  }

  @Post("workspaces/:id/subscription")
  change(@Param("id") id: string, @Body() dto: SubscriptionActionDto) {
    return this.platform.changeSubscription(id, dto as never);
  }
}

@Module({ controllers: [PlatformController], providers: [PlatformService, PlatformAdminGuard] })
export class PlatformModule {}
