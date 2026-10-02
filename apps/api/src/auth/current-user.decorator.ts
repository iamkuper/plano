import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { UserRole } from "@prisma/client";

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: UserRole;
  permissions: string[];
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  return ctx.switchToHttp().getRequest().user;
});
