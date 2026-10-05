"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2, X } from "lucide-react";
import type { UserDto } from "@plano/shared";
import { can } from "@plano/shared";
import { AppShell } from "@/components/app-shell";
import { useSettings } from "@/lib/settings";
import { typeStyle } from "@/components/card-type-icon";
import { useTaskTypes } from "@/lib/use-task-types";
import { Button, Card, ConfirmDialog, Field, IconButton, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { stageColor } from "@/design/tokens";
import { api, type TemplateCardInput, type TemplateInput } from "@/lib/api";
import { toast } from "@/lib/toast";
import { plural } from "@/components/board-toolbar";

type DraftCard = TemplateCardInput & { key: string; checklistText: string };
type Draft = { name: string; columns: string[]; cards: DraftCard[] };

let seq = 0;
const toDraftCard = (c: TemplateCardInput): DraftCard => ({ ...c, key: `c${++seq}`, checklistText: c.checklist.join("\n") });
const EMPTY: Draft = { name: "", columns: ["Бэклог", "В работе", "На проверке", "Готово"], cards: [] };

function toInput(d: Draft): TemplateInput {
  return {
    name: d.name.trim(),
    columns: d.columns.map((c) => c.trim()).filter(Boolean),
    cards: d.cards.map(({ key: _k, checklistText, ...c }) => ({
      ...c,
      title: c.title.trim(),
      description: c.description?.trim() || null,
      checklist: checklistText.split("\n").map((t) => t.trim()).filter(Boolean),
    })),
  };
}

function swap<T>(list: T[], i: number, j: number) {
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function CardEditor({
  card,
  index,
  count,
  readOnly,
  onChange,
  onMove,
  onRemove,
}: {
  card: DraftCard;
  index: number;
  count: number;
  readOnly: boolean;
  onChange: (patch: Partial<DraftCard>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(!card.title);
  const taskTypes = useTaskTypes();
  const current = taskTypes.find((x) => x.id === card.typeId);
  const { icon: TypeIcon, color } = typeStyle(current ?? { color: null });
  const items = card.checklistText.split("\n").filter((t) => t.trim()).length;
  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex h-11 items-center gap-2 px-3">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="grid size-6 place-items-center rounded text-ink-ghost hover:text-ink" aria-label={open ? "Свернуть" : "Развернуть"}>
          <ChevronDown size={14} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
        <TypeIcon size={14} strokeWidth={2} style={{ color }} className="shrink-0" />
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 truncate text-left text-base">
          {card.title || <span className="text-ink-ghost">Без названия</span>}
        </button>
        <span className="shrink-0 text-xs text-ink-ghost">
          {card.estimateHours ? `${card.estimateHours} ч` : ""}
          {items ? `${card.estimateHours ? ", " : ""}${items} ${plural(items, "пункт", "пункта", "пунктов")}` : ""}
        </span>
        {!readOnly && (
          <div className="flex shrink-0 items-center">
            <IconButton size="sm" title="Выше" disabled={index === 0} onClick={() => onMove(-1)}>
              <ArrowUp size={14} />
            </IconButton>
            <IconButton size="sm" title="Ниже" disabled={index === count - 1} onClick={() => onMove(1)}>
              <ArrowDown size={14} />
            </IconButton>
            <IconButton size="sm" title="Убрать карточку" onClick={onRemove}>
              <Trash2 size={14} />
            </IconButton>
          </div>
        )}
      </div>
      {open && (
        <div className="grid gap-3 px-11 pb-4 sm:grid-cols-[1fr_180px_120px]">
          <Field label="Название">
            {(a) => <Input {...a} autoFocus={!card.title} disabled={readOnly} value={card.title} onChange={(e) => onChange({ title: e.target.value })} />}
          </Field>
          <Field label="Тип">
            {(a) => (
              <Select {...a} disabled={readOnly} value={card.typeId ?? taskTypes.find((x) => x.isDefault)?.id ?? ""} onChange={(e) => onChange({ typeId: e.target.value })}>
                {taskTypes.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Оценка, ч">
            {(a) => (
              <Input
                {...a}
                type="number"
                min={0}
                disabled={readOnly}
                placeholder="—"
                value={card.estimateHours ?? ""}
                onChange={(e) => onChange({ estimateHours: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))) })}
              />
            )}
          </Field>
          <div className="sm:col-span-2">
            <Field label="Описание">
              {(a) => <Textarea {...a} disabled={readOnly} className="min-h-[72px]" value={card.description ?? ""} onChange={(e) => onChange({ description: e.target.value })} />}
            </Field>
          </div>
          <Field label="Чек-лист" hint="Пункт на строку">
            {(a) => (
              <Textarea {...a} disabled={readOnly} className="min-h-[72px]" value={card.checklistText} onChange={(e) => onChange({ checklistText: e.target.value })} />
            )}
          </Field>
        </div>
      )}
    </div>
  );
}

export default function TemplateEditorPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const isNew = params.id === "new";
  const [saved, setSaved] = useState<Draft | null>(isNew ? EMPTY : null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [me, setMe] = useState<UserDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newStage, setNewStage] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    api.me().then(setMe).catch(() => {});
    if (isNew) return;
    api
      .template(params.id)
      .then((t) => {
        const d = { name: t.name, columns: t.columns, cards: t.cards.map(toDraftCard) };
        setSaved(d);
        setDraft(d);
      })
      .catch((e) => setError(e.message));
  }, [isNew, params.id]);

  const settings = useSettings();
  const readOnly = !can(me, "templates.manage");
  const dirty = saved !== null && JSON.stringify(toInput(draft)) !== JSON.stringify(toInput(saved));
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setCard = (key: string, patch: Partial<DraftCard>) =>
    setDraft((d) => ({ ...d, cards: d.cards.map((c) => (c.key === key ? { ...c, ...patch } : c)) }));

  async function save() {
    const input = toInput(draft);
    if (!input.name) return setError("Укажите название шаблона");
    if (!input.columns.length) return setError("Нужен хотя бы один этап");
    if (input.cards.some((c) => !c.title)) return setError("У каждой карточки должно быть название");
    setError(null);
    setBusy(true);
    try {
      if (isNew) {
        const { id } = await api.createTemplate(input);
        toast("Шаблон создан", "success");
        router.replace(`/settings/templates/${id}`);
      } else {
        await api.saveTemplate(params.id, input);
        setSaved(draft);
        toast("Шаблон сохранён", "success");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        crumbs={[{ label: "Настройки", href: "/settings" }, { label: "Шаблоны", href: "/settings/templates" }]}
        title={isNew ? "Новый шаблон" : saved?.name ?? "…"}
        actions={
          !readOnly && (
            <>
              {!isNew && (
                <Button variant="ghost" className="text-danger" onClick={() => setConfirming(true)}>
                  Удалить
                </Button>
              )}
              <Button variant="primary" loading={busy} disabled={!isNew && !dirty} onClick={save}>
                {isNew ? "Создать шаблон" : "Сохранить"}
              </Button>
            </>
          )
        }
      />
      <div className="w-full space-y-4 py-6">
        {readOnly && me && (
          <p className="rounded-lg border border-border bg-surface-soft px-4 py-3 text-sm text-ink-faint">Редактировать шаблоны может администратор.</p>
        )}
        {error && <p className="rounded-lg bg-danger-soft px-4 py-2.5 text-sm text-danger">{error}</p>}
        {saved && (
          <>
            <Card title="Основное">
              <Field label="Название шаблона">
                {(a) => <Input {...a} autoFocus={isNew} disabled={readOnly} placeholder="Например, «Запуск интернет-магазина»" value={draft.name} onChange={(e) => set({ name: e.target.value })} />}
              </Field>
            </Card>

            <Card title="Этапы" description="Колонки доски проекта слева направо." bodyClassName="p-4 pt-3">
              <div className="overflow-hidden rounded-lg border border-border">
                {draft.columns.map((col, i) => (
                  <div key={i} className="flex h-11 items-center gap-3 border-b border-border px-3 last:border-b-0">
                    <span className="h-5 w-1 rounded-full" style={{ background: stageColor(i, draft.columns.length) }} />
                    <Input
                      aria-label={`Этап ${i + 1}`}
                      disabled={readOnly}
                      value={col}
                      onChange={(e) => set({ columns: draft.columns.map((c, j) => (j === i ? e.target.value : c)) })}
                    />
                    {!readOnly && (
                      <div className="flex shrink-0 items-center">
                        <IconButton size="sm" title="Выше" disabled={i === 0} onClick={() => set({ columns: swap(draft.columns, i, i - 1) })}>
                          <ArrowUp size={14} />
                        </IconButton>
                        <IconButton size="sm" title="Ниже" disabled={i === draft.columns.length - 1} onClick={() => set({ columns: swap(draft.columns, i, i + 1) })}>
                          <ArrowDown size={14} />
                        </IconButton>
                        <IconButton
                          size="sm"
                          title={draft.columns.length <= 1 ? "Нужен хотя бы один этап" : "Убрать этап"}
                          disabled={draft.columns.length <= 1}
                          onClick={() => set({ columns: draft.columns.filter((_, j) => j !== i) })}
                        >
                          <X size={14} />
                        </IconButton>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {!readOnly && (
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newStage.trim() || draft.columns.length >= 12) return;
                    set({ columns: [...draft.columns, newStage.trim()] });
                    setNewStage("");
                  }}
                >
                  <div className="flex-1">
                    <Input aria-label="Новый этап" placeholder="Новый этап" value={newStage} onChange={(e) => setNewStage(e.target.value)} />
                  </div>
                  <Button type="submit" disabled={!newStage.trim()}>
                    <Plus size={15} /> Добавить этап
                  </Button>
                </form>
              )}
            </Card>

            <Card
              title="Карточки"
              description="Появятся в первом этапе нового проекта, в этом порядке."
              bodyClassName="p-4 pt-3"
              action={
                !readOnly && (
                  <Button
                    size="sm"
                    onClick={() => set({ cards: [...draft.cards, toDraftCard({ title: "", estimateHours: null, checklist: [], description: null })] })}
                  >
                    <Plus size={14} /> Карточка
                  </Button>
                )
              }
            >
              {draft.cards.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-sm text-ink-faint">
                  Карточек нет — проект по шаблону получит только этапы.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  {draft.cards.map((c, i) => (
                    <CardEditor
                      key={c.key}
                      card={c}
                      index={i}
                      count={draft.cards.length}
                      readOnly={readOnly}
                      onChange={(patch) => setCard(c.key, patch)}
                      onMove={(dir) => set({ cards: swap(draft.cards, i, i + dir) })}
                      onRemove={() => set({ cards: draft.cards.filter((x) => x.key !== c.key) })}
                    />
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </div>
      {confirming && (
        <ConfirmDialog
          title={`Удалить шаблон «${saved?.name}»?`}
          body="Проекты, уже созданные по нему, не изменятся."
          confirmLabel="Удалить шаблон"
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            try {
              await api.deleteTemplate(params.id);
              toast("Шаблон удалён", "success");
              router.replace("/settings/templates");
            } catch (e) {
              toast((e as Error).message, "error");
              setConfirming(false);
            }
          }}
        />
      )}
    </AppShell>
  );
}
