import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import type { AuthenticatedUser } from "../auth/current-user.decorator";
import { runInWorkspace } from "./tenant";

// Runs the handler of every authenticated request inside the user's
// workspace. Guards run before interceptors, so req.user is already set.
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user: AuthenticatedUser | undefined = ctx.switchToHttp().getRequest()?.user;
    if (!user?.workspaceId) return next.handle();
    return new Observable((subscriber) => runInWorkspace(user.workspaceId, () => next.handle().subscribe(subscriber)));
  }
}
