"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { TemplateListItemDto } from "@plano/shared";
import { api } from "@/lib/api";
import { notifyProjectsChanged } from "@/lib/projects-events";
import { Button, Dialog, Field, Input, Select } from "./ui";
import { t } from "@plano/shared";
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
      setError(t("common.enterAProjectName"));
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
      onClose();
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={t("common.newProject")} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t("common.name2")}>
          {(a) => (
            <Input {...a} autoFocus placeholder={t("newProjectDialog.forExampleWebsiteLaunch")} value={title} onChange={(e) => setTitle(e.target.value)} />
          )}
        </Field>
        <Field label={t("newProjectDialog.template")}>
          {(a) => (
            <Select {...a} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">{t("newProjectDialog.noTemplate")}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>{t("newProjectDialog.cards", { name: tpl.name, cards: tpl._count.cards })}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("common.deadline")}>
          {(a) => (
            <Input {...a} type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          )}
        </Field>
        {error && <p className="text-base text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={busy}>{t("common.createProject")}</Button>
        </div>
      </form>
    </Dialog>
  );
}
