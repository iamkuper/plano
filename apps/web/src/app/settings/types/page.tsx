"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { LABEL_COLORS, type LabelColor, type TaskTypeDto } from "@plano/shared";
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
    if (!name.trim()) return setError("Укажите название типа");
    setBusy(true);
    try {
      if (type) await api.updateTaskType(type.id, { name: name.trim(), color });
      else await api.createTaskType(name.trim(), color);
      toast(type ? "Тип сохранён" : "Тип создан", "success");
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={type ? "Изменить тип задач" : "Новый тип задач"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Название" error={error}>
          {(a) => <Input {...a} autoFocus maxLength={30} invalid={!!error} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <div>
          <div className="mb-1.5 text-sm font-medium">Цвет</div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Цвет">
            <button
              type="button"
              role="radio"
              aria-checked={color === null}
              aria-label="Без цвета"
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
            Отмена
          </Button>
          <Button variant="primary" loading={busy}>
            {type ? "Сохранить" : "Создать тип"}
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

  async function makeDefault(t: TaskTypeDto) {
    try {
      await api.updateTaskType(t.id, { isDefault: true });
      toast("Тип по умолчанию изменён", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    load();
  }

  return (
    <AppShell>
      <PageHeader
        title="Настройки"
        meta={<SettingsTabs />}
        actions={
          canManage && (
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus size={15} /> Новый тип
            </Button>
          )
        }
      />
      <div className="w-full space-y-4 py-6">
        <Card title="Типы задач" description="Тип выбирается в карточке и работает как фильтр. Новые карточки получают тип по умолчанию.">
          {!types ? null : (
            <ul className="divide-y divide-border">
              {types.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <CardTypeTag type={t} />
                  </div>
                  {t.isDefault && <span className="text-sm text-ink-faint">По умолчанию</span>}
                  <span className="w-24 text-right text-sm text-ink-faint">{t.cardCount} карт.</span>
                  {canManage && (
                    <>
                      <IconButton aria-label={`Сделать «${t.name}» типом по умолчанию`} disabled={t.isDefault} onClick={() => makeDefault(t)}>
                        <Star size={15} />
                      </IconButton>
                      <IconButton aria-label={`Изменить тип ${t.name}`} onClick={() => setEditing(t)}>
                        <Pencil size={15} />
                      </IconButton>
                      <IconButton aria-label={`Удалить тип ${t.name}`} disabled={t.isDefault} onClick={() => setRemoving(t)}>
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
          title={`Удалить тип «${removing.name}»?`}
          body="Карточки, шаблоны и повторяющиеся правила с этим типом перейдут на тип по умолчанию."
          confirmLabel="Удалить"
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
