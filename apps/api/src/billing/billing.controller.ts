import { Body, Controller, Get, HttpCode, Param, Post, StreamableFile, UseGuards } from "@nestjs/common";
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";
import { AuthenticatedUser, CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionGuard, RequirePermission } from "../auth/guards/permission.guard";
import { BillingService } from "./billing.service";
import { t } from "@plano/shared";
class CheckoutDto {
  @IsString()
  planId!: string;

  @IsIn(["MONTH", "YEAR"])
  interval!: "MONTH" | "YEAR";

  // Defaults to the active users.
  @IsOptional()
  @IsInt({ message: () => t("api.billing.enterTheNumberOfSeats") })
  @Min(1, { message: () => t("api.billing.atLeastOneSeatIs") })
  @Max(10000)
  seats?: number;
}


class SeatsDto {
  @IsInt({ message: () => t("common.enterHowManySeatsTo") })
  @Min(1)
  @Max(10000)
  seats!: number;
}

class InvoiceDto extends CheckoutDto {
  // Extra seats for the current period instead of a whole plan purchase.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  addSeats?: number;

  @IsString()
  @MinLength(2, { message: () => t("api.billing.enterTheOrganisationName") })
  @MaxLength(300)
  payerName!: string;

  @Matches(/^(\d{10}|\d{12})$/, { message: () => t("api.billing.taxId10DigitsFor") })
  payerInn!: string;

  @IsOptional()
  @Matches(/^(\d{9})?$/, { message: () => t("api.billing.registrationCode9Digits") })
  payerKpp?: string;

  @IsString()
  @MinLength(5, { message: () => t("api.billing.enterTheLegalAddress") })
  @MaxLength(500)
  payerAddress!: string;

  @IsEmail({}, { message: () => t("api.billing.enterTheEmailToSend") })
  payerEmail!: string;
}

class DevPayDto {
  @IsBoolean()
  success!: boolean;
}

@Controller("billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  // Public: the landing and pricing pages show the plans.
  @Get("plans")
  plans() {
    return this.billing.publicPlans();
  }

  // Anyone in the workspace sees the plan and usage; paying needs the right.
  @Get()
  @UseGuards(JwtAuthGuard)
  overview() {
    return this.billing.overview();
  }

  @Post("checkout")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission("billing.manage")
  checkout(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckoutDto) {
    return this.billing.checkout(dto.planId, dto.interval, dto.seats, user.email);
  }


  // More seats inside the current paid period, prorated for the days left.
  @Post("seats")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission("billing.manage")
  seats(@CurrentUser() user: AuthenticatedUser, @Body() dto: SeatsDto) {
    return this.billing.buySeats(dto.seats, user.email);
  }

  // Bank transfer: request an invoice (the platform owner issues it).
  @Post("invoice")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission("billing.manage")
  invoice(@CurrentUser() user: AuthenticatedUser, @Body() dto: InvoiceDto) {
    return this.billing.requestInvoice(dto, user);
  }

  @Get("invoice/:id/pdf")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission("billing.manage")
  async invoicePdf(@Param("id") id: string) {
    const { filename, content } = await this.billing.invoicePdf(id);
    return new StreamableFile(content, { type: "application/pdf", disposition: `attachment; filename="${filename}"` });
  }

  @Post("invoice/:id/cancel")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission("billing.manage")
  cancelInvoice(@Param("id") id: string) {
    return this.billing.cancelInvoice(id);
  }

  // Leave the trial or a locked workspace for the free plan.
  @Post("free")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission("billing.manage")
  free() {
    return this.billing.switchToFree();
  }

  // The bank posts here; authenticity is the Token inside the body.
  // T-Bank expects the plain text "OK" with HTTP 200.
  @Post("webhooks/tbank")
  @HttpCode(200)
  async webhook(@Body() body: Record<string, unknown>) {
    await this.billing.handleNotification(body);
    return "OK";
  }

  // Test provider only: the stand-in for the bank's payment page.
  @Post("dev/pay/:orderId")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  devPay(@Param("orderId") orderId: string, @Body() dto: DevPayDto) {
    return this.billing.devPay(orderId, dto.success);
  }
}
