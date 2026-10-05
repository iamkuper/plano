"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { PROJECT_STATUS_LABELS, type ProjectListItemDto, type ProjectStatus, t, intlTag } from "@plano/shared";
import { AppShell } from "@/components/app-shell";
import { LetterMark } from "@/components/avatar";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { Badge, Button, EmptyState, PageHeader, Segmented, TableSkeleton, type BadgeTone } from "@/components/ui";
import { useCan } from "@/lib/permissions";
import { api } from "@/lib/api";

const STATUS_TONES: Record<ProjectStatus, BadgeTone> = {
  ACTIVE: "primary",
  ON_HOLD: "warning",
  DONE: "success",
  ARCHIVED: "default",
};

type Filter = "" | ProjectStatus;

function formatDeadline(iso: string) {
  const d = new Date(iso);
  const overdue = d < new Date(new Date().toDateString());
  return { text: d.toLocaleDateString(intlTag(), { day: "numeric", month: "short", year: "numeric" }), overdue };
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectListItemDto[] | null>(null);
  const [filter, setFilter] = useState<Filter>("ACTIVE");
  const allowed = useCan();
  const [creating, setCreating] = useState(false);
  // /projects?new=1 (from the onboarding) opens the dialog straight away.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") setCreating(true);
  }, []);

  useEffect(() => {
    setProjects(null);
    api.projects(filter || undefined).then(setProjects).catch(() => setProjects([]));
  }, [filter]);

  return (
    <AppShell>
      <PageHeader
        title={t("common.projects")}
        actions={
          <>
            <Segmented<Filter>
              label={t("common.status")}
              value={filter}
              onChange={setFilter}
              options={[
                { value: "ACTIVE", label: t("common.active") },
                { value: "ON_HOLD", label: t("common.onHold") },
                { value: "DONE", label: t("projects.completed") },
                { value: "ARCHIVED", label: t("projects.archive") },
                { value: "", label: t("common.all") },
              ]}
            />
            {allowed("projects.create") && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus size={15} />  {t("common.newProject")}
              </Button>
            )}
          </>
        }
      />

      <div className="py-5">
        {!projects && <TableSkeleton />}
        {projects?.length === 0 && (
          <EmptyState
            icon={FolderKanban}
            title={filter === "ACTIVE" ? t("projects.noActiveProjects") : t("projects.nothingHere")}
            action={
              allowed("projects.create") && (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  <Plus size={15} />  {t("common.newProject")}
                </Button>
              )
            }
          >
            
            {t("projects.aProjectIsASeparate")}
          </EmptyState>
        )}
        {projects && projects.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="grid h-9 grid-cols-[minmax(0,2fr)_120px_96px_140px] items-center gap-4 border-b border-border bg-surface-soft px-4 text-xs text-ink-ghost">
              <span>{t("common.project")}</span>
              <span>{t("common.status")}</span>
              <span className="text-right">{t("common.cards")}</span>
              <span>{t("common.deadline")}</span>
            </div>
            {projects.map((p) => {
              const deadline = p.deadline ? formatDeadline(p.deadline) : null;
              return (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="grid h-12 grid-cols-[minmax(0,2fr)_120px_96px_140px] items-center gap-4 border-b border-border px-4 transition-colors last:border-b-0 hover:bg-surface-soft"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <LetterMark name={p.title} size={22} />
                    <span className="truncate text-base font-medium">{p.title}</span>
                  </span>
                  <span>
                    <Badge tone={STATUS_TONES[p.status]}>{PROJECT_STATUS_LABELS[p.status]}</Badge>
                  </span>
                  <span className="text-right text-sm text-ink-faint">{p._count.cards}</span>
                  <span className={`text-sm ${deadline?.overdue && p.status === "ACTIVE" ? "text-danger" : "text-ink-faint"}`}>
                    {deadline ? deadline.text : "—"}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      {creating && <NewProjectDialog onClose={() => setCreating(false)} />}
    </AppShell>
  );
}
