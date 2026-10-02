import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { IsBoolean, IsIn, IsString } from "class-validator";
import { AuthenticatedUser, CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionGuard, RequirePermission } from "../auth/guards/permission.guard";
import { BillingService } from "./billing.service";

class CheckoutDto {
  @IsString()
  planId!: string;

  @IsIn(["MONTH", "YEAR"])
  interval!: "MONTH" | "YEAR";
}

class CancelDto {
  @IsBoolean()
  cancel!: boolean;
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
    return this.billing.checkout(dto.planId, dto.interval, user.email);
  }

  @Post("cancel")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission("billing.manage")
  cancel(@Body() dto: CancelDto) {
    return this.billing.setCancel(dto.cancel);
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
