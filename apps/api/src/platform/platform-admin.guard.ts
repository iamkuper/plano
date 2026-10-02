import { CanActivate, ExecutionContext, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/current-user.decorator";

// The addresses allowed into the hidden platform back-office
// (PLATFORM_ADMIN_EMAILS, comma-separated). Everyone else gets a plain 404, so
// the endpoints look like they don't exist. Use after JwtAuthGuard.
export const platformAdminEmails = (env = process.env) =>
  (env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user: AuthenticatedUser | undefined = ctx.switchToHttp().getRequest().user;
    if (!user || !platformAdminEmails().includes(user.email.toLowerCase())) throw new NotFoundException();
    return true;
  }
}
