import { Body, Controller, Get, HttpCode, Param, Post, StreamableFile, UseGuards } from "@nestjs/common";
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";
import { AuthenticatedUser, CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionGuard, RequirePermission } from "../auth/guards/permission.guard";
import { BillingService } from "./billing.service";

class CheckoutDto {
  @IsString()
  planId!: string;

  @IsIn(["MONTH", "YEAR"])
  interval!: "MONTH" | "YEAR";

  // Defaults to the active users.
  @IsOptional()
  @IsInt({ message: "Укажите число мест" })
  @Min(1, { message: "Нужно хотя бы одно место" })
  @Max(10000)
  seats?: number;
}


class InvoiceDto extends CheckoutDto {
  @IsString()
  @MinLength(2, { message: "Укажите название организации" })
  @MaxLength(300)
  payerName!: string;

  @Matches(/^(\d{10}|\d{12})$/, { message: "ИНН — 10 цифр для организации или 12 для ИП" })
  payerInn!: string;

  @IsOptional()
  @Matches(/^(\d{9})?$/, { message: "КПП — 9 цифр" })
  payerKpp?: string;

  @IsString()
  @MinLength(5, { message: "Укажите юридический адрес" })
  @MaxLength(500)
  payerAddress!: string;

  @IsEmail({}, { message: "Укажите почту, куда прислать счёт" })
  payerEmail!: string;
}

class DevPayDto {
  @IsBoolean()
  success!: boolean;
}

@Controller("billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

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
