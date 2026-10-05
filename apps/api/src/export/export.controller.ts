import { Controller, Get, Header, Module, NotFoundException, Param, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { CARD_PRIORITY_LABELS, t } from "@plano/shared";
import { AuditService } from "../audit/audit.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { BillingService } from "../billing/billing.service";
import { PrismaService } from "../prisma/prisma.service";

// A cell is quoted when needed. Values that a spreadsheet would run as a
// formula (=, +, -, @, tab, CR) get a leading apostrophe.
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const csvRow = (cells: unknown[]) => cells.map(csvCell).join(";");

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

// Export of a project's cards as CSV (Business). Semicolon-separated with a
// BOM so Excel in a Russian locale opens it with the right columns/encoding.
@Controller()
@UseGuards(JwtAuthGuard)
export class ExportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
  ) {}

  @Get("projects/:projectId/export.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async projectCsv(@Param("projectId") projectId: string, @Res({ passthrough: true }) res: Response) {
    await this.billing.assertFeature("export");
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { title: true } });
    if (!project) throw new NotFoundException(t("common.projectNotFound"));
    const [workspace, fields, cards] = await Promise.all([
      this.prisma.workspace.findFirstOrThrow({ select: { cardPrefix: true } }),
      this.prisma.customField.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
      this.prisma.card.findMany({
        where: { projectId },
        orderBy: [{ column: { position: "asc" } }, { position: "asc" }],
        include: {
          column: { select: { title: true } },
          type: { select: { name: true } },
          assignees: { select: { user: { select: { name: true } } } },
          labels: { select: { label: { select: { name: true } } } },
          checklist: { select: { done: true } },
          timeEntries: { select: { minutes: true } },
          fieldValues: { select: { fieldId: true, value: true } },
        },
      }),
    ]);

    const header = [t("api.export.key"), t("common.name2"), t("common.description"), t("common.column"), t("common.type"), t("common.priority"), t("common.assignees"), t("common.labels"), t("common.start2"), t("common.dueDate"), t("common.estimateH"), t("api.export.loggedMin"), t("common.subtasks"), t("common.created"), ...fields.map((f) => f.name)];
    const lines = [csvRow(header)];
    for (const c of cards) {
      const done = c.checklist.filter((i) => i.done).length;
      lines.push(
        csvRow([
          `${workspace.cardPrefix}-${c.number}`,
          c.title,
          c.description,
          c.column.title,
          c.type.name,
          CARD_PRIORITY_LABELS[c.priority],
          c.assignees.map((a) => a.user.name).join(", "),
          c.labels.map((l) => l.label.name).join(", "),
          day(c.startDate),
          day(c.dueDate),
          c.estimateHours,
          c.timeEntries.reduce((sum, t) => sum + t.minutes, 0),
          c.checklist.length ? `${done}/${c.checklist.length}` : "",
          day(c.createdAt),
          ...fields.map((f) => {
            const v = c.fieldValues.find((x) => x.fieldId === f.id)?.value;
            return typeof v === "boolean" ? (v ? t("api.export.yes") : t("api.export.no")) : v;
          }),
        ]),
      );
    }
    const name = encodeURIComponent(`${project.title}.csv`);
    res.setHeader("Content-Disposition", `attachment; filename="export.csv"; filename*=UTF-8''${name}`);
    await this.audit.record("export.project", t("api.export.projectExportedToCsvCards", { title: project.title, cards: cards.length }), projectId);
    return `﻿${lines.join("\r\n")}\r\n`;
  }
}

@Module({ controllers: [ExportController] })
export class ExportModule {}
