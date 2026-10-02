import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { SystemPrismaService } from "../prisma/system-prisma.service";
import { InvitationsService } from "../invitations/invitations.service";
import { MailService } from "../mail/mail.service";
import { appUrl, hashToken, newToken } from "./tokens";
import { LoginDto } from "./dto/login.dto";
import { templateCreateData } from "../templates/default-template";
import { RegisterDto } from "./dto/register.dto";
import { TRIAL_DAYS } from "../billing/billing.service";

const RESET_TTL_MS = 60 * 60_000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: SystemPrismaService,
    private readonly jwt: JwtService,
    private readonly invitations: InvitationsService,
    private readonly mail: MailService,
  ) {}

  private async issueToken(userId: string, email: string) {
    const accessToken = await this.jwt.signAsync({ sub: userId, email });
    return { accessToken };
  }

  // Open sign-up: creates a workspace together with its first administrator.
  // Further staff are added by that administrator via POST /users.
  async register(dto: RegisterDto) {
    const email = dto.email.trim();
    if (await this.prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } })) {
      throw new ConflictException("Эта почта уже зарегистрирована");
    }
    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name.trim(),
        passwordHash: await bcrypt.hash(dto.password, 10),
        role: "ADMIN",
        workspace: {
          create: {
            name: dto.workspaceName.trim(),
            templates: { create: templateCreateData() },
            subscription: { create: { planId: "PRO", status: "TRIALING", trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000) } },
          },
        },
      },
    });
    return this.issueToken(user.id, user.email);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user?.isActive || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Неверная почта или пароль");
    }
    return this.issueToken(user.id, user.email);
  }

  invitePreview(token: string) {
    return this.invitations.preview(token);
  }

  async acceptInvite(token: string, name: string, password: string) {
    const user = await this.invitations.accept(token, name, password, (p) => bcrypt.hash(p, 10));
    return this.issueToken(user.id, user.email);
  }

  // Always answers the same, so the form can't be used to find out who has an
  // account. At most one mail per minute per user.
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findFirst({ where: { email: { equals: email.trim(), mode: "insensitive" }, isActive: true } });
    if (!user) return;
    const recent = await this.prisma.passwordReset.findFirst({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 60_000) } } });
    if (recent) return;
    const token = newToken();
    await this.prisma.passwordReset.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) } });
    await this.mail.send(
      user.email,
      "Сброс пароля в Plano",
      `Чтобы задать новый пароль, откройте ссылку:\n${appUrl()}/reset/${token}\n\nСсылка действует 1 час. Если вы не запрашивали сброс, просто проигнорируйте письмо.`,
    );
  }

  async resetPassword(token: string, password: string) {
    const reset = await this.prisma.passwordReset.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!reset || reset.usedAt || reset.expiresAt <= new Date()) throw new BadRequestException("Ссылка недействительна или устарела. Запросите сброс заново");
    const claimed = await this.prisma.passwordReset.updateMany({ where: { id: reset.id, usedAt: null }, data: { usedAt: new Date() } });
    if (!claimed.count) throw new BadRequestException("Ссылка уже использована");
    await this.prisma.user.update({ where: { id: reset.userId }, data: { passwordHash: await bcrypt.hash(password, 10) } });
    // Older links of this user stop working too.
    await this.prisma.passwordReset.updateMany({ where: { userId: reset.userId, usedAt: null }, data: { usedAt: new Date() } });
  }
}
