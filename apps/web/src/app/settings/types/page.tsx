"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { LABEL_COLORS, type LabelColor, type TaskTypeDto, t } from "@plano/shared";
import { AppShell } from "@/components/app-shell";
import { CardTypeTag } from "@/components/card-type-icon";
import { SettingsTabs } from "@/components/tab-links";
import { Button, Card, ConfirmDialog, Dialog, Field, IconButton, Input, PageHeader } from "@/components/ui";
import { labelColor } from "@/design/tokens";
import { api } from "@/lib/api";
import { useCan } from "@/lib/permissions";
import { toast } from "@/lib/toast";
import { loadTaskTypes } from "@/lib/use-task-types";

function TypeDialog({ type, onClose, onSaved }: { type?: TaskTypeDto; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(type?.name ?? "");
  const [color, setColor] = useState<LabelColor | null>((type?.color as LabelColor | null) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError(t("common.enterATypeName"));
    setBusy(true);
    try {
      if (type) await api.updateTaskType(type.id, { name: name.trim(), color });
      else await api.createTaskType(name.trim(), color);
      toast(type ? t("settings.types.typeSaved") : t("settings.types.typeCreated"), "success");
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={type ? t("settings.types.editTaskType") : t("settings.types.newTaskType")} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t("common.name2")} error={error}>
          {(a) => <Input {...a} autoFocus maxLength={30} invalid={!!error} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <div>
          <div className="mb-1.5 text-sm font-medium">{t("settings.types.colour")}</div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("settings.types.colour")}>
            <button
              type="button"
              role="radio"
              aria-checked={color === null}
              aria-label={t("settings.types.noColour")}
              onClick={() => setColor(null)}
              className={`size-6 rounded-full border-2 ${color === null ? "border-ink" : "border-transparent"}`}
              style={{ background: "#6C6E75" }}
            />
            {LABEL_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={c}
                onClick={() => setColor(c)}
                className={`size-6 rounded-full border-2 ${color === c ? "border-ink" : "border-transparent"}`}
                style={{ background: labelColor[c] }}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            
            {t("common.cancel")}
          </Button>
          <Button variant="primary" loading={busy}>
            {type ? t("common.save") : t("settings.types.createType")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function TaskTypesPage() {
  const can = useCan();
  const [types, setTypes] = useState<TaskTypeDto[] | null>(null);
  const [editing, setEditing] = useState<TaskTypeDto | "new" | null>(null);
  const [removing, setRemoving] = useState<TaskTypeDto | null>(null);
  const canManage = can("types.manage");

  const load = useCallback(() => {
    loadTaskTypes(true).then(setTypes).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function makeDefault(type: TaskTypeDto) {
    try {
      await api.updateTaskType(type.id, { isDefault: true });
      toast(t("settings.types.defaultTypeChanged"), "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    load();
  }

  return (
    <AppShell>
      <PageHeader
        title={t("common.settings")}
        meta={<SettingsTabs />}
        actions={
          canManage && (
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus size={15} />  {t("settings.types.newType")}
            </Button>
          )
        }
      />
      <div className="w-full space-y-4 py-6">
        <Card title={t("settings.types.taskTypes")} description={t("settings.types.theTypeIsChosenIn")}>
          {!types ? null : (
            <ul className="divide-y divide-border">
              {types.map((type) => (
                <li key={type.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <CardTypeTag type={type} />
                  </div>
                  {type.isDefault && <span className="text-sm text-ink-faint">{t("settings.types.default")}</span>}
                  <span className="w-24 text-right text-sm text-ink-faint">{t("settings.types.cards", { cardCount: type.cardCount })}</span>
                  {canManage && (
                    <>
                      <IconButton aria-label={t("settings.types.makeTheDefaultType", { name: type.name })} disabled={type.isDefault} onClick={() => makeDefault(type)}>
                        <Star size={15} />
                      </IconButton>
                      <IconButton aria-label={t("settings.types.editType", { name: type.name })} onClick={() => setEditing(type)}>
                        <Pencil size={15} />
                      </IconButton>
                      <IconButton aria-label={t("settings.types.deleteType", { name: type.name })} disabled={type.isDefault} onClick={() => setRemoving(type)}>
                        <Trash2 size={15} />
                      </IconButton>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {editing && <TypeDialog type={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={load} />}
      {removing && (
        <ConfirmDialog
          title={t("settings.types.deleteType2", { name: removing.name })}
          body={t("settings.types.cardsTemplatesAndRecurringRules")}
          confirmLabel={t("common.remove")}
          onConfirm={async () => {
            await api.deleteTaskType(removing.id).catch((e) => toast((e as Error).message, "error"));
            setRemoving(null);
            load();
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </AppShell>
  );
}
