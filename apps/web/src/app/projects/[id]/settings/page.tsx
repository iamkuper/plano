"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Repeat, Trash2 } from "lucide-react";
import {
  PROJECT_STATUS_LABELS,
  type ColumnDto,
  type ProjectListItemDto,
  type ProjectStatus,
  type RecurringRuleDto,
  type UserDto,
} from "@amo-kanban/shared";
import { AppShell } from "@/components/app-shell";
import { Button, Card, ConfirmDialog, Field, IconButton, Input, PageHeader, Select } from "@/components/ui";
import { stageColor } from "@/design/tokens";
import { useCan } from "@/lib/permissions";
import { api } from "@/lib/api";
import { notifyProjectsChanged } from "@/lib/projects-events";
import { toast } from "@/lib/toast";
import { describeRecurrence } from "@/lib/recurrence";
import { Avatar } from "@/components/avatar";
import { RecurringDialog } from "@/components/recurring-dialog";

type ProjectWithBoard = ProjectListItemDto & { board: { id: string } | null };

const dateValue = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

function DetailsSection({
  project,
  onSaved,
}: {
  project: ProjectWithBoard;
  onSaved: () => void;
}) {
  const initial = {
    title: project.title,
    status: project.status,
    startDate: dateValue(project.startDate),
    deadline: dateValue(project.deadline),
    hoursBudget: project.hoursBudget?.toString() ?? "",
  };
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return setError("Укажите название проекта");
    if (form.startDate && form.deadline && form.deadline < form.startDate) return setError("Дедлайн раньше даты старта");
    setError(null);
    setBusy(true);
    try {
      await api.updateProject(project.id, {
        title: form.title.trim(),
        status: form.status,
        startDate: form.startDate || null,
        deadline: form.deadline || null,
        hoursBudget: form.hoursBudget === "" ? null : Math.max(0, Math.round(Number(form.hoursBudget))),
      });
      notifyProjectsChanged();
      onSaved();
      toast("Проект сохранён", "success");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Основное">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Название" error={error && !form.title.trim() ? error : null}>
            {(a) => <Input {...a} value={form.title} onChange={set("title")} />}
          </Field>
          <Field label="Статус">
            {(a) => (
              <Select {...a} value={form.status} onChange={set("status")}>
                {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Бюджет, часов" hint="Сравнивается со списанным временем по карточкам">
            {(a) => <Input {...a} type="number" min={0} placeholder="Не задан" value={form.hoursBudget} onChange={set("hoursBudget")} />}
          </Field>
          <Field label="Старт">{(a) => <Input {...a} type="date" value={form.startDate} onChange={set("startDate")} />}</Field>
          <Field label="Дедлайн">{(a) => <Input {...a} type="date" value={form.deadline} onChange={set("deadline")} />}</Field>
        </div>
        {error && form.title.trim() && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          {dirty && (
            <Button type="button" variant="ghost" onClick={() => setForm(initial)}>
              Отменить изменения
            </Button>
          )}
          <Button variant="primary" loading={busy} disabled={!dirty}>
            Сохранить
          </Button>
        </div>
      </form>
    </Card>
  );
}

function StageRow({
  column,
  index,
  count,
  onRename,
  onLimit,
  onMove,
  onDelete,
}: {
  column: ColumnDto;
  index: number;
  count: number;
  onRename: (title: string) => void;
  onLimit: (limit: number | null) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(column.title);
  const cards = column.cards.length;
  return (
    <div className="grid h-12 grid-cols-[4px_minmax(0,1fr)_120px_64px_auto] items-center gap-3 border-b border-border px-3 last:border-b-0">
      <span className="h-6 rounded-full" style={{ background: stageColor(index, count) }} />
      <Input
        aria-label={`Название этапа ${index + 1}`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => (title.trim() ? title.trim() !== column.title && onRename(title.trim()) : setTitle(column.title))}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <Input
        aria-label={`Лимит карточек этапа ${column.title}`}
        type="number"
        min={1}
        placeholder="Без лимита"
        defaultValue={column.wipLimit ?? ""}
        onBlur={(e) => {
          const v = e.target.value === "" ? null : Math.max(1, Math.round(Number(e.target.value)));
          if (v !== column.wipLimit) onLimit(v);
        }}
      />
      <span className="text-right text-xs text-ink-ghost">{cards} карт.</span>
      <div className="flex items-center">
        <IconButton size="sm" title="Выше" disabled={index === 0} onClick={() => onMove(-1)}>
          <ArrowUp size={14} />
        </IconButton>
        <IconButton size="sm" title="Ниже" disabled={index === count - 1} onClick={() => onMove(1)}>
          <ArrowDown size={14} />
        </IconButton>
        <IconButton
          size="sm"
          title={cards ? "Сначала перенесите карточки из этапа" : count <= 1 ? "Нужен хотя бы один этап" : "Удалить этап"}
          disabled={cards > 0 || count <= 1}
          onClick={onDelete}
        >
          <Trash2 size={14} />
        </IconButton>
      </div>
    </div>
  );
}

function StagesSection({ boardId, columns, reload }: { boardId: string; columns: ColumnDto[]; reload: () => void }) {
  const [newTitle, setNewTitle] = useState("");

  async function guard(p: Promise<unknown>, done?: string) {
    try {
      await p;
      if (done) toast(done, "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      reload();
    }
  }

  function move(index: number, dir: -1 | 1) {
    const a = columns[index];
    const b = columns[index + dir];
    guard(Promise.all([api.updateColumn(a.id, { position: b.position }), api.updateColumn(b.id, { position: a.position })]));
  }

  return (
    <Card
      title="Этапы доски"
      description="Колонки канбана слева направо. Первый этап — новые задачи, последний — готовые."
      bodyClassName="p-4 pt-3"
    >
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid h-8 grid-cols-[4px_minmax(0,1fr)_120px_64px_auto] items-center gap-3 border-b border-border bg-surface-soft px-3 text-xs text-ink-ghost">
          <span />
          <span>Этап</span>
          <span>Лимит</span>
          <span className="text-right">Сейчас</span>
          <span className="w-[84px]" />
        </div>
        {columns.map((col, i) => (
          <StageRow
            key={`${col.id}-${col.position}`}
            column={col}
            index={i}
            count={columns.length}
            onRename={(title) => guard(api.updateColumn(col.id, { title }), "Этап переименован")}
            onLimit={(wipLimit) => guard(api.updateColumn(col.id, { wipLimit }))}
            onMove={(dir) => move(i, dir)}
            onDelete={() => guard(api.deleteColumn(col.id), `Этап «${col.title}» удалён`)}
          />
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newTitle.trim()) return;
          guard(api.addColumn(boardId, newTitle.trim()), "Этап добавлен");
          setNewTitle("");
        }}
      >
        <div className="flex-1">
          <Input aria-label="Новый этап" placeholder="Новый этап, например «Тестирование»" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
        </div>
        <Button type="submit" disabled={!newTitle.trim()}>
          <Plus size={15} /> Добавить этап
        </Button>
      </form>
    </Card>
  );
}

function RecurringSection({ projectId, users }: { projectId: string; users: UserDto[] }) {
  const [rules, setRules] = useState<RecurringRuleDto[] | null>(null);
  const [editing, setEditing] = useState<RecurringRuleDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<RecurringRuleDto | null>(null);
  const load = useCallback(() => {
    api.recurring(projectId).then(setRules).catch(() => setRules([]));
  }, [projectId]);
  useEffect(load, [load]);
  const byId = new Map(users.map((u) => [u.id, u]));

  async function act(p: Promise<unknown>, done: string) {
    try {
      await p;
      toast(done, "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      load();
    }
  }

  return (
    <Card
      title="Повторяющиеся задачи"
      description="Карточки создаются сами в первом этапе доски, в 9:00 в день повтора."
      bodyClassName="p-4 pt-3"
      action={
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus size={14} /> Новое правило
        </Button>
      }
    >
      {rules && rules.length === 0 && (
        <p className="rounded-lg border border-dashed border-border-strong px-4 py-5 text-center text-sm text-ink-faint">
          Правил нет. Повторение можно настроить и из карточки: меню «⋯» → «Сделать повторяющейся».
        </p>
      )}
      {rules && rules.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          {rules.map((r) => (
            <div key={r.id} className={`flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0 ${r.active ? "" : "opacity-60"}`}>
              <Repeat size={15} strokeWidth={1.75} className="shrink-0 text-ink-ghost" />
              <button onClick={() => setEditing(r)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-base font-medium hover:text-accent">{r.title}</span>
                <span className="block truncate text-xs text-ink-faint">
                  {describeRecurrence(r)}
                  {r.active
                    ? `, следующая ${new Date(r.nextRunAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`
                    : ", на паузе"}
                </span>
              </button>
              <span className="flex shrink-0">
                {r.assigneeIds.map((id) => byId.get(id)).filter(Boolean).slice(0, 3).map((u) => (
                  <span key={u!.id} className="-ml-1 first:ml-0">
                    <Avatar user={u!} size={20} />
                  </span>
                ))}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => act(api.runRecurring(r.id), `Карточка «${r.title}» создана`)}>
                  Создать сейчас
                </Button>
                <Button size="sm" variant="ghost" onClick={() => act(api.toggleRecurring(r.id, !r.active), r.active ? "Правило на паузе" : "Правило снова работает")}>
                  {r.active ? "Пауза" : "Включить"}
                </Button>
                <IconButton size="sm" title="Удалить правило" onClick={() => setDeleting(r)}>
                  <Trash2 size={14} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <RecurringDialog
          projectId={projectId}
          users={users}
          rule={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Удалить правило «${deleting.title}»?`}
          body="Новые карточки перестанут создаваться. Уже созданные останутся на доске."
          confirmLabel="Удалить правило"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            setDeleting(null);
            await act(api.deleteRecurring(deleting.id), "Правило удалено");
          }}
        />
      )}
    </Card>
  );
}

function SaveAsTemplateSection({ project }: { project: ProjectWithBoard }) {
  const router = useRouter();
  const [name, setName] = useState(project.title);
  const [busy, setBusy] = useState(false);
  return (
    <Card title="Сохранить как шаблон" description="Этапы и карточки проекта (названия, типы, оценки, чек-листы) станут шаблоном для новых проектов.">
      <form
        className="flex items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setBusy(true);
          try {
            const { id } = await api.templateFromProject(project.id, name.trim());
            toast("Шаблон создан", "success");
            router.push(`/settings/templates/${id}`);
          } catch (err) {
            toast((err as Error).message, "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="flex-1">
          <Field label="Название шаблона">{(a) => <Input {...a} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        </div>
        <Button loading={busy} disabled={!name.trim()}>
          Создать шаблон
        </Button>
      </form>
    </Card>
  );
}

function DangerSection({ project, canDelete, onArchive }: { project: ProjectWithBoard; canDelete: boolean; onArchive: () => void }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const archived = project.status === "ARCHIVED";

  return (
    <Card title="Архив и удаление">
      <div className="divide-y divide-border">
        <div className="flex items-center justify-between gap-4 pb-4">
          <div>
            <div className="text-sm font-medium">{archived ? "Вернуть из архива" : "Перенести в архив"}</div>
            <p className="text-sm text-ink-faint">
              {archived ? "Проект снова появится в списке «В работе»." : "Проект пропадёт из меню и общей доски, данные сохранятся."}
            </p>
          </div>
          <Button onClick={onArchive}>{archived ? "Вернуть" : "В архив"}</Button>
        </div>
        <div className="flex items-center justify-between gap-4 pt-4">
          <div>
            <div className="text-sm font-medium">Удалить проект</div>
            <p className="text-sm text-ink-faint">
              {canDelete ? "Доска, карточки, комментарии и время удалятся без возможности восстановления." : "Нет права удалять проекты. Его выдаёт администратор."}
            </p>
          </div>
          <Button variant="outline" className="text-danger" disabled={!canDelete} onClick={() => setConfirming(true)}>
            Удалить проект
          </Button>
        </div>
      </div>
      {confirming && (
        <ConfirmDialog
          title={`Удалить проект «${project.title}»?`}
          body={`Удалятся доска и все карточки с комментариями и записями времени. Отменить это нельзя.`}
          confirmLabel="Удалить проект"
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            try {
              await api.deleteProject(project.id);
              notifyProjectsChanged();
              toast("Проект удалён", "success");
              router.replace("/projects");
            } catch (e) {
              toast((e as Error).message, "error");
              setConfirming(false);
            }
          }}
        />
      )}
    </Card>
  );
}

export default function ProjectSettingsPage({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<ProjectWithBoard | null>(null);
  const [columns, setColumns] = useState<ColumnDto[] | null>(null);
  const [me, setMe] = useState<UserDto | null>(null);
  const [users, setUsers] = useState<UserDto[]>([]);

  const allowed = useCan();
  const loadProject = useCallback(() => {
    api.project(params.id).then((p) => setProject(p as ProjectWithBoard)).catch(() => {});
  }, [params.id]);
  const loadColumns = useCallback(() => {
    api.projectBoard(params.id).then((b) => setColumns(b.columns)).catch(() => {});
  }, [params.id]);

  useEffect(() => {
    loadProject();
    loadColumns();
    api.me().then(setMe).catch(() => {});
    api.users().then((list) => setUsers(list.filter((u) => u.isActive))).catch(() => {});
  }, [loadProject, loadColumns]);

  return (
    <AppShell>
      <PageHeader
        crumbs={[
          { label: "Проекты", href: "/projects" },
          ...(project ? [{ label: project.title, href: `/projects/${project.id}` }] : []),
        ]}
        title="Настройки проекта"
      />
      <div className="w-full space-y-4 py-6">
        {me && !allowed("projects.edit") && (
          <p className="rounded-lg border border-border bg-surface-soft px-4 py-3 text-sm text-ink-faint">
            Менять проект может сотрудник с правом «Менять проекты». Права выдаёт администратор в настройках.
          </p>
        )}
        {project ? (
          <>
            <DetailsSection key={JSON.stringify(project)} project={project} onSaved={loadProject} />
            {project.board && columns && <StagesSection boardId={project.board.id} columns={columns} reload={loadColumns} />}
            <RecurringSection projectId={project.id} users={users} />
            {allowed("templates.manage") && <SaveAsTemplateSection project={project} />}
            <DangerSection
              project={project}
              canDelete={allowed("projects.delete")}
              onArchive={async () => {
                const status: ProjectStatus = project.status === "ARCHIVED" ? "ACTIVE" : "ARCHIVED";
                await api.updateProject(project.id, { status });
                notifyProjectsChanged();
                toast(status === "ARCHIVED" ? "Проект в архиве" : "Проект возвращён в работу", "success");
                loadProject();
              }}
            />
          </>
        ) : (
          <div className="space-y-4" aria-busy="true">
            {[300, 260, 140].map((h, i) => (
              <div key={i} className="animate-pulse rounded-lg bg-surface-soft" style={{ height: h }} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
