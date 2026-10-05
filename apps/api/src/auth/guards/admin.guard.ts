import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "../current-user.decorator";
import { t } from "@plano/shared";
// Use after JwtAuthGuard: @UseGuards(JwtAuthGuard, AdminGuard)
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user: AuthenticatedUser | undefined = ctx.switchToHttp().getRequest().user;
    if (user?.role !== "ADMIN") {
      throw new ForbiddenException(t("api.auth.availableToAdministratorsOnly"));
    }
    return true;
  }
}
