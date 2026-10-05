"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, Layers } from "lucide-react";
import {
  PROJECT_STATUS_LABELS,
  type ColumnDto,
  type ProjectListItemDto,
  type ProjectStatus,
  t,
  intlTag,
} from "@plano/shared";
import { api } from "@/lib/api";
import { notifyProjectsChanged } from "@/lib/projects-events";
import { Card, Field, Kpi, ShareBar, StatusDot, columnTone, Input, Select } from "./ui";

export function ProjectOverview({
  project,
  columns,
  onChanged,
}: {
  project: ProjectListItemDto;
  columns: ColumnDto[];
  onChanged: () => void;
}) {
  const [stats, setStats] = useState<{ hoursBudget: number | null; loggedMinutes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.projectStats(project.id).then(setStats).catch(() => {});
  }, [project.id]);

  async function save(data: Parameters<typeof api.updateProject>[1]) {
    setError(null);
    try {
      await api.updateProject(project.id, data);
      notifyProjectsChanged();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const cards = columns.flatMap((c) => c.cards);
  const doneCount = columns.at(-1)?.cards.length ?? 0;
  const overdue = cards.filter((c) => c.dueDate && new Date(c.dueDate) < new Date(new Date().toDateString())).length;
  const loggedHours = stats ? Math.round((stats.loggedMinutes / 60) * 10) / 10 : 0;
  const budget = stats?.hoursBudget ?? null;
  const dateValue = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi label={t("common.cards")} icon={Layers} value={String(cards.length)} hint={t("projectOverview.inColumns", { columns: columns.length })} />
        <Kpi
          label={t("common.done")}
          icon={CheckCircle2}
          value={`${cards.length ? Math.round((doneCount / cards.length) * 100) : 0}%`}
          hint={t("projectOverview.ofIn", { doneCount, cards: cards.length, value: columns.at(-1)?.title ?? "—" })}
        />
        <Kpi
          label={t("common.overdue")}
          icon={AlertTriangle}
          value={String(overdue)}
          tone={overdue ? "danger" : undefined}
          hint={overdue ? t("projectOverview.theDueDateHasPassed") : t("projectOverview.allOnTime")}
        />
        <Kpi
          label={t("projectOverview.hoursLogged")}
          icon={Clock}
          value={String(loggedHours)}
          tone={budget !== null && loggedHours > budget ? "danger" : undefined}
          hint={budget !== null ? t("projectOverview.ofHBudget", { budget }) : t("projectOverview.noBudgetSet")}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Card title={t("projectOverview.cardsByStatus")} description={t("projectOverview.howManyTasksAreIn")}>
            <div className="space-y-3">
              {columns.map((col, i) => (
                <div key={col.id} className="flex items-center gap-3 text-base">
                  <StatusDot tone={columnTone(i, columns.length)} />
                  <span className="w-48 truncate">{col.title}</span>
                  <div className="flex-1">
                    <ShareBar value={cards.length ? col.cards.length / cards.length : 0} tone={columnTone(i, columns.length)} />
                  </div>
                  <span className="w-8 text-right font-medium">{col.cards.length}</span>
                </div>
              ))}
            </div>
          </Card>

          {budget !== null && budget > 0 && (
            <Card title={t("projectOverview.hoursBudget")} description={t("projectOverview.timeLoggedOnAllCards")}>
              <ShareBar value={loggedHours / budget} tone={loggedHours > budget ? "danger" : "success"} />
              <div className="mt-2 flex justify-between text-xs text-ink-faint">
                <span>{t("projectOverview.loggedH", { loggedHours })}</span>
                <span>{loggedHours <= budget ? t("projectOverview.leftH", { value: Math.round((budget - loggedHours) * 10) / 10 }) : t("projectOverview.overByH", { value: Math.round((loggedHours - budget) * 10) / 10 })}</span>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card
            title={t("projectOverview.projectDetails")}
            action={
              <Link href={`/projects/${project.id}/settings`} className="text-sm text-accent hover:underline">
                
                {t("projectOverview.edit")}
              </Link>
            }
          >
            <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
              <dt className="text-ink-faint">{t("common.status")}</dt>
              <dd>{PROJECT_STATUS_LABELS[project.status]}</dd>
              <dt className="text-ink-faint">{t("common.start")}</dt>
              <dd>{project.startDate ? new Date(project.startDate).toLocaleDateString(intlTag()) : "—"}</dd>
              <dt className="text-ink-faint">{t("common.deadline")}</dt>
              <dd>{project.deadline ? new Date(project.deadline).toLocaleDateString(intlTag()) : "—"}</dd>
              <dt className="text-ink-faint">{t("projectOverview.budget")}</dt>
              <dd>{project.hoursBudget !== null ? t("projectOverview.h", { hoursBudget: project.hoursBudget }) : "—"}</dd>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
