import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { UserRole } from "@prisma/client";

export interface AuthenticatedUser {
  userId: string;
  workspaceId: string;
  // Read-only: the trial or paid period ended unpaid.
  locked: boolean;
  email: string;
  role: UserRole;
  permissions: string[];
  // The request is made with an API token, not a signed-in session.
  viaToken?: boolean;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  return ctx.switchToHttp().getRequest().user;
});
