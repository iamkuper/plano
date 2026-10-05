"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, Layers } from "lucide-react";
import {
  PROJECT_STATUS_LABELS,
  type ColumnDto,
  type ProjectListItemDto,
  type ProjectStatus,
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
        <Kpi label="Карточек" icon={Layers} value={String(cards.length)} hint={`в ${columns.length} колонках`} />
        <Kpi
          label="Готово"
          icon={CheckCircle2}
          value={`${cards.length ? Math.round((doneCount / cards.length) * 100) : 0}%`}
          hint={`${doneCount} из ${cards.length} в «${columns.at(-1)?.title ?? "—"}»`}
        />
        <Kpi
          label="Просрочено"
          icon={AlertTriangle}
          value={String(overdue)}
          tone={overdue ? "danger" : undefined}
          hint={overdue ? "срок уже прошёл" : "всё в срок"}
        />
        <Kpi
          label="Списано часов"
          icon={Clock}
          value={String(loggedHours)}
          tone={budget !== null && loggedHours > budget ? "danger" : undefined}
          hint={budget !== null ? `из ${budget} ч бюджета` : "бюджет не задан"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Card title="Карточки по статусам" description="Сколько задач на каждом этапе">
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
            <Card title="Бюджет часов" description="Списанное время по всем карточкам проекта">
              <ShareBar value={loggedHours / budget} tone={loggedHours > budget ? "danger" : "success"} />
              <div className="mt-2 flex justify-between text-xs text-ink-faint">
                <span>списано — {loggedHours} ч</span>
                <span>{loggedHours <= budget ? `осталось — ${Math.round((budget - loggedHours) * 10) / 10} ч` : `перерасход — ${Math.round((loggedHours - budget) * 10) / 10} ч`}</span>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card
            title="Параметры проекта"
            action={
              <Link href={`/projects/${project.id}/settings`} className="text-sm text-accent hover:underline">
                Изменить
              </Link>
            }
          >
            <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
              <dt className="text-ink-faint">Статус</dt>
              <dd>{PROJECT_STATUS_LABELS[project.status]}</dd>
              <dt className="text-ink-faint">Старт</dt>
              <dd>{project.startDate ? new Date(project.startDate).toLocaleDateString("ru-RU") : "—"}</dd>
              <dt className="text-ink-faint">Дедлайн</dt>
              <dd>{project.deadline ? new Date(project.deadline).toLocaleDateString("ru-RU") : "—"}</dd>
              <dt className="text-ink-faint">Бюджет</dt>
              <dd>{project.hoursBudget !== null ? `${project.hoursBudget} ч` : "—"}</dd>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
