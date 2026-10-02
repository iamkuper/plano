import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { isLocked } from "../billing/subscription-state";
import { BillingService } from "../billing/billing.service";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { SystemPrismaService } from "../prisma/system-prisma.service";
import { OWN_FIELDS } from "../prisma/tenant";
import { appUrl, hashToken, newToken } from "../auth/tokens";
import { AuditService } from "../audit/audit.service";

export const INVITE_TTL_MS = 7 * 86_400_000;

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
    private readonly billing: BillingService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.invitation.findMany({
      where: { acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, roleId: true, expiresAt: true, createdAt: true },
    });
  }

  // The link is returned to the admin as well, so it can be passed on by hand
  // when mail is not configured or lands in spam.
  async create(dto: { email: string; role?: "ADMIN" | "MEMBER"; roleId?: string }, inviter: { userId: string; name: string }) {
    const email = dto.email.trim();
    await this.billing.assertWithin("users");
    if (await this.system.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } })) {
      throw new ConflictException("Эта почта уже зарегистрирована");
    }
    const role = dto.role ?? "MEMBER";
    const roleId = role === "ADMIN" ? null : (dto.roleId ?? (await this.prisma.role.findFirst({ where: { isDefault: true } }))?.id ?? null);
    // One live invitation per address: a new one replaces the old.
    await this.prisma.invitation.deleteMany({ where: { email: { equals: email, mode: "insensitive" }, acceptedAt: null } });
    const token = newToken();
    const invitation = await this.prisma.invitation.create({
      data: { ...OWN_FIELDS, email, role, roleId, invitedById: inviter.userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
    });
    const workspace = await this.prisma.workspace.findFirstOrThrow();
    const link = `${appUrl()}/invite/${token}`;
    const sent = await this.mail.send(
      email,
      `Приглашение в «${workspace.name}»`,
      `${inviter.name} приглашает вас в рабочее пространство «${workspace.name}» в Plano.\n\nПринять приглашение и задать пароль:\n${link}\n\nСсылка действует 7 дней.`,
    );
    await this.audit.record("invitation.create", `Приглашение для ${email}`, invitation.id);
    return { id: invitation.id, email, link, emailSent: sent };
  }

  async revoke(id: string) {
    await this.prisma.invitation.delete({ where: { id } });
  }

  // ---- public: the invited person ----

  private async find(token: string) {
    const inv = await this.system.invitation.findUnique({ where: { tokenHash: hashToken(token) }, include: { workspace: { select: { name: true } } } });
    if (!inv || inv.acceptedAt || inv.expiresAt <= new Date()) throw new NotFoundException("Приглашение недействительно или устарело");
    return inv;
  }

  async preview(token: string) {
    const inv = await this.find(token);
    this.billing.forgetSeats(inv.workspaceId);
    return { email: inv.email, workspaceName: inv.workspace.name };
  }

  // Creates the user inside the inviting workspace. Returns the user for the
  // caller to issue a session.
  async accept(token: string, name: string, password: string, hash: (p: string) => Promise<string>) {
    const inv = await this.find(token);
    if (await this.system.user.findFirst({ where: { email: { equals: inv.email, mode: "insensitive" } } })) {
      throw new ConflictException("Эта почта уже зарегистрирована. Войдите в аккаунт");
    }
    await this.assertRoom(inv.workspaceId);
    const claimed = await this.system.invitation.updateMany({ where: { id: inv.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
    if (!claimed.count) throw new NotFoundException("Приглашение уже использовано");
    const role = inv.roleId ? await this.system.role.findFirst({ where: { id: inv.roleId, workspaceId: inv.workspaceId } }) : null;
    return this.system.user.create({
      data: {
        workspaceId: inv.workspaceId,
        email: inv.email,
        name: name.trim(),
        passwordHash: await hash(password),
        role: inv.role,
        roleId: inv.role === "ADMIN" ? null : (role?.id ?? null),
      },
    });
  }

  // Seats may have run out since the invitation was sent.
  private async assertRoom(workspaceId: string) {
    const sub = await this.system.subscription.findUnique({ where: { workspaceId } });
    if (isLocked(sub)) throw new BadRequestException("Рабочее пространство сейчас в режиме чтения. Попросите администратора оплатить тариф");
    try {
      // This invitation already holds a seat, so count active users only.
      await this.billing.assertSeat(workspaceId, { countInvitations: false });
    } catch {
      throw new BadRequestException("В рабочем пространстве закончились места. Попросите администратора добавить места или освободить одно");
    }
  }
}
