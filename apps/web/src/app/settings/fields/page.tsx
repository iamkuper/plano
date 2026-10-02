"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { CUSTOM_FIELD_TYPES, CUSTOM_FIELD_TYPE_LABELS, type BillingDto, type CustomFieldDto, type CustomFieldType } from "@amo-kanban/shared";
import { AppShell } from "@/components/app-shell";
import { SettingsTabs } from "@/components/tab-links";
import { Button, Card, ConfirmDialog, Dialog, Field, IconButton, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { useCan } from "@/lib/permissions";
import { toast } from "@/lib/toast";

const parseOptions = (text: string) => text.split("\n").map((o) => o.trim()).filter(Boolean);

function FieldDialog({ field, onClose, onSaved }: { field?: CustomFieldDto; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(field?.name ?? "");
  const [type, setType] = useState<CustomFieldType>(field?.type ?? "TEXT");
  const [options, setOptions] = useState(field?.options.join("\n") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isSelect = type === "SELECT";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Укажите название");
    setBusy(true);
    try {
      if (field) await api.updateField(field.id, { name: name.trim(), ...(isSelect ? { options: parseOptions(options) } : {}) });
      else await api.createField({ name: name.trim(), type, ...(isSelect ? { options: parseOptions(options) } : {}) });
      toast(field ? "Поле сохранено" : "Поле создано", "success");
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={field ? "Изменить поле" : "Новое поле"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Название" error={error}>
          {(a) => <Input {...a} autoFocus maxLength={40} invalid={!!error} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Тип" hint={field ? "Тип нельзя поменять после создания" : undefined}>
          {(a) => (
            <Select {...a} disabled={!!field} value={type} onChange={(e) => setType(e.target.value as CustomFieldType)}>
              {CUSTOM_FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CUSTOM_FIELD_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {isSelect && (
          <Field label="Варианты" hint="Каждый вариант с новой строки">
            {(a) => <Textarea {...a} rows={5} value={options} onChange={(e) => setOptions(e.target.value)} />}
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" loading={busy}>
            {field ? "Сохранить" : "Создать поле"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function FieldsPage() {
  const can = useCan();
  const [fields, setFields] = useState<CustomFieldDto[] | null>(null);
  const [billing, setBilling] = useState<BillingDto | null>(null);
  const [editing, setEditing] = useState<CustomFieldDto | "new" | null>(null);
  const [removing, setRemoving] = useState<CustomFieldDto | null>(null);

  const load = useCallback(() => {
    api.fields().then(setFields).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    api.billing().then(setBilling).catch(() => {});
  }, [load]);

  const available = billing?.plan.features.includes("fields") ?? false;
  const canManage = can("fields.manage") && available;

  return (
    <AppShell>
      <PageHeader
        title="Настройки"
        meta={<SettingsTabs />}
        actions={
          canManage && (
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus size={15} /> Новое поле
            </Button>
          )
        }
      />
      <div className="w-full space-y-4 py-6">
        {billing && !available && (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-soft px-4 py-3 text-sm">
            <span>Дополнительные поля карточек есть на тарифе Business. Уже заполненные значения остаются видны.</span>
            <Link href="/settings/billing">
              <Button>Тарифы</Button>
            </Link>
          </div>
        )}
        <Card title="Дополнительные поля" description="Появляются в каждой карточке рядом со сроком и приоритетом. До 20 полей.">
          {!fields ? null : fields.length === 0 ? (
            <p className="text-sm text-ink-faint">Полей пока нет.{canManage ? " Добавьте, например, «Бюджет» или «Ссылка на договор»." : ""}</p>
          ) : (
            <ul className="divide-y divide-border">
              {fields.map((f) => (
                <li key={f.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-base">{f.name}</div>
                    <div className="truncate text-sm text-ink-faint">
                      {CUSTOM_FIELD_TYPE_LABELS[f.type]}
                      {f.type === "SELECT" ? `: ${f.options.join(", ")}` : ""}
                    </div>
                  </div>
                  {canManage && (
                    <>
                      <IconButton aria-label={`Изменить поле ${f.name}`} onClick={() => setEditing(f)}>
                        <Pencil size={15} />
                      </IconButton>
                      <IconButton aria-label={`Удалить поле ${f.name}`} onClick={() => setRemoving(f)}>
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
      {editing && <FieldDialog field={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={load} />}
      {removing && (
        <ConfirmDialog
          title={`Удалить поле «${removing.name}»?`}
          body="Значения этого поля во всех карточках тоже удалятся."
          confirmLabel="Удалить"
          onConfirm={async () => {
            await api.deleteField(removing.id).catch((e) => toast((e as Error).message, "error"));
            setRemoving(null);
            load();
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </AppShell>
  );
}
