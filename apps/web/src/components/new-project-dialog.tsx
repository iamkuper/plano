"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { TemplateListItemDto } from "@amo-kanban/shared";
import { goal } from "@/lib/analytics";
import { api } from "@/lib/api";
import { notifyProjectsChanged } from "@/lib/projects-events";
import { Button, Dialog, Field, Input, Select } from "./ui";

export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateListItemDto[]>([]);
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.templates().then((list) => {
      setTemplates(list);
      if (list[0]) setTemplateId(list[0].id);
    }).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Укажите название проекта");
      return;
    }
    setBusy(true);
    try {
      const project = await api.createProject({
        title: title.trim(),
        templateId: templateId || undefined,
        deadline: deadline || undefined,
      });
      notifyProjectsChanged();
      goal("project_created");
      onClose();
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Новый проект" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Название">
          {(a) => (
            <Input {...a} autoFocus placeholder="Например, «Запуск сайта»" value={title} onChange={(e) => setTitle(e.target.value)} />
          )}
        </Field>
        <Field label="Шаблон">
          {(a) => (
            <Select {...a} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">Без шаблона</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t._count.cards} карточек)</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Дедлайн">
          {(a) => (
            <Input {...a} type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          )}
        </Field>
        {error && <p className="text-base text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Отмена</Button>
          <Button variant="primary" disabled={busy}>Создать проект</Button>
        </div>
      </form>
    </Dialog>
  );
}
