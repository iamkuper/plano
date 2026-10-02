import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { can, PERMISSIONS, type Permission } from "@amo-kanban/shared";
import type { AuthenticatedUser } from "../current-user.decorator";

const KEY = "permission";
// @UseGuards(JwtAuthGuard, PermissionGuard) @RequirePermission("projects.delete")
export const RequirePermission = (perm: Permission) => SetMetadata(KEY, perm);

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext) {
    const perm = this.reflector.getAllAndOverride<Permission | undefined>(KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!perm) return true;
    const user: AuthenticatedUser | undefined = ctx.switchToHttp().getRequest().user;
    if (!can(user, perm)) {
      const label = PERMISSIONS.find((p) => p.key === perm)?.label ?? perm;
      throw new ForbiddenException(`Нет права: «${label}». Его выдаёт администратор`);
    }
    return true;
  }
}
