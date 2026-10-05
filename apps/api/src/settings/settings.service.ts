import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { currentWorkspaceId, changedFields } from "../prisma/tenant";
import { UpdateSettingsDto } from "./settings.dto";
import { AuditService } from "../audit/audit.service";
import { t } from "@plano/shared";
// Settings of the current workspace (name, card prefix, default stages).
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private get id() {
    return currentWorkspaceId()!;
  }

  async get() {
    const { id, accountNumber, name, cardPrefix, defaultColumns, updatedAt } = await this.prisma.workspace.findUniqueOrThrow({ where: { id: this.id } });
    return { id, accountNumber, workspaceName: name, cardPrefix, defaultColumns, updatedAt };
  }

  async update(dto: UpdateSettingsDto) {
    await this.prisma.workspace.update({
      where: { id: this.id },
      data: {
        name: dto.workspaceName,
        cardPrefix: dto.cardPrefix?.toUpperCase(),
        defaultColumns: dto.defaultColumns?.map((c) => c.trim()).filter(Boolean),
      },
    });
    await this.audit.record("settings.update", t("api.settings.settingsChanged", { changedFields: changedFields(dto) }));
    return this.get();
  }
}
