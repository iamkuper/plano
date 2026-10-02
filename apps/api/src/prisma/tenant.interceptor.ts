import { CallHandler, ExecutionContext, HttpException, HttpStatus, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import type { AuthenticatedUser } from "../auth/current-user.decorator";
import { allowedWhileLocked } from "../billing/subscription-state";
import { runInWorkspace } from "./tenant";

// Runs the handler of every authenticated request inside the user's
// workspace, and refuses writes once the workspace is locked (see
// subscription-state.ts). Guards run before interceptors, so req.user is set.
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = req?.user;
    if (!user?.workspaceId) return next.handle();
    // A lapsed workspace keeps read access and payment; everything else is refused.
    if (user.locked && !allowedWhileLocked(req.method, req.originalUrl ?? req.url ?? "")) {
      throw new HttpException(
        { statusCode: 402, error: "Payment Required", code: "WORKSPACE_LOCKED", message: "Тариф закончился: данные доступны только для чтения. Оплатите тариф в разделе «Тариф и оплата», и всё заработает." },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return new Observable((subscriber) => runInWorkspace(user.workspaceId, () => next.handle().subscribe(subscriber), user.userId));
  }
}
