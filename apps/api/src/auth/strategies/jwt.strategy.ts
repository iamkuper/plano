import { Injectable, UnauthorizedException } from "@nestjs/common";
import { BillingService } from "../../billing/billing.service";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { isLocked } from "../../billing/subscription-state";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import type { AuthenticatedUser } from "../current-user.decorator";
import { t } from "@plano/shared";
export const NO_SEAT_MESSAGE = t("api.auth.thereIsNoPaidSeat");

export interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: SystemPrismaService,
    private readonly billing: BillingService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? "change-me-in-production",
    });
  }

  // Role and isActive are read from the DB on every request (not baked into
  // the token) so deactivating a user or changing their role takes effect
  // immediately.
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, include: { customRole: true, workspace: { select: { subscription: true } } } });
    if (!user?.isActive || user.kind === "AGENT") {
      throw new UnauthorizedException();
    }
    // Beyond the paid seats: no access until a seat is bought or freed.
    if ((await this.billing.overSeatIds(user.workspaceId)).has(user.id)) {
      throw new UnauthorizedException(NO_SEAT_MESSAGE);
    }
    return { userId: user.id, workspaceId: user.workspaceId, locked: isLocked(user.workspace.subscription), email: user.email, role: user.role, permissions: user.customRole?.permissions ?? [] };
  }
}
