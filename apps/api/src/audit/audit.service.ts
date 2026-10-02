import { Global, Injectable, Logger, Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { currentUserId, OWN_FIELDS } from "../prisma/tenant";

// Writes one line of the workspace journal for the current request's user.
// Always recorded (reading it is a Business feature); a failure to log must
// never break the action itself.
@Injectable()
export class AuditService {
  private readonly log = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(action: string, summary: string, entityId?: string) {
    try {
      await this.prisma.auditLog.create({ data: { ...OWN_FIELDS, userId: currentUserId() ?? null, action, summary: summary.slice(0, 300), entityId } });
    } catch (e) {
      this.log.warn(`audit ${action}: ${(e as Error).message}`);
    }
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
