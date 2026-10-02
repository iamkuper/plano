import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import type { AuthenticatedUser } from "../current-user.decorator";

export interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: SystemPrismaService) {
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
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, include: { customRole: true } });
    if (!user?.isActive) {
      throw new UnauthorizedException();
    }
    return { userId: user.id, workspaceId: user.workspaceId, email: user.email, role: user.role, permissions: user.customRole?.permissions ?? [] };
  }
}
