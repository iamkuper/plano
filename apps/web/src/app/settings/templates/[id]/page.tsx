"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2, X } from "lucide-react";
import { CARD_TYPE_LABELS, type CardType, type UserDto } from "@amo-kanban/shared";
import { can } from "@amo-kanban/shared";
import { AppShell } from "@/components/app-shell";
import { useSettings } from "@/lib/settings";
import { CARD_TYPE_STYLES } from "@/components/card-type-icon";
import { Button, Card, ConfirmDialog, Field, IconButton, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { stageColor } from "@/design/tokens";
import { api, type TemplateCardInput, type TemplateInput } from "@/lib/api";
import { toast } from "@/lib/toast";
import { plural } from "@/components/board-toolbar";

type DraftItem = { key: string; text: string };
type DraftCard = Omit<TemplateCardInput, "checklist"> & { key: string; checklist: DraftItem[] };
type Draft = { name: string; columns: string[]; cards: DraftCard[] };

let seq = 0;
const toDraftItem = (text: string): DraftItem => ({ key: `i${++seq}`, text });
const toDraftCard = (c: TemplateCardInput): DraftCard => ({ ...c, key: `c${++seq}`, checklist: c.checklist.map(toDraftItem) });
const EMPTY: Draft = { name: "", columns: ["Бэклог", "В работе", "На проверке", "Готово"], cards: [] };

function toInput(d: Draft): TemplateInput {
  return {
    name: d.name.trim(),
    columns: d.columns.map((c) => c.trim()).filter(Boolean),
    cards: d.cards.map(({ key: _k, checklist, ...c }) => ({
      ...c,
      title: c.title.trim(),
      description: c.description?.trim() || null,
      checklist: checklist.map((i) => i.text.trim()).filter(Boolean),
    })),
  };
}

function swap<T>(list: T[], i: number, j: number) {
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// Same look as subtasks in the card window: a row per item, edited in place,
// and an "add" row at the bottom. Enter adds; pasting several lines adds them all.
function SubtasksEditor({ items, readOnly, onChange }: { items: DraftItem[]; readOnly: boolean; onChange: (items: DraftItem[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = (texts: string[]) => {
    const clean = texts.map((t) => t.trim()).filter(Boolean);
    if (clean.length) onChange([...items, ...clean.map(toDraftItem)]);
  };
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {items.map((item, i) => (
        <div key={item.key} className="group flex h-10 items-center gap-2 border-b border-border px-3 last:border-b-0">
          <span className="grid size-4 shrink-0 place-items-center rounded-sm border border-border-strong" aria-hidden />
          <input
            aria-label={`Подзадача ${i + 1}`}
            disabled={readOnly}
            className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none disabled:text-ink"
            value={item.text}
            onChange={(e) => onChange(items.map((x) => (x.key === item.key ? { ...x, text: e.target.value } : x)))}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !item.text) {
                e.preventDefault();
                onChange(items.filter((x) => x.key !== item.key));
              }
            }}
          />
          {!readOnly && (
            <div className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <IconButton size="sm" title="Выше" disabled={i === 0} onClick={() => onChange(swap(items, i, i - 1))}>
                <ArrowUp size={14} />
              </IconButton>
              <IconButton size="sm" title="Ниже" disabled={i === items.length - 1} onClick={() => onChange(swap(items, i, i + 1))}>
                <ArrowDown size={14} />
              </IconButton>
              <IconButton size="sm" title="Удалить подзадачу" onClick={() => onChange(items.filter((x) => x.key !== item.key))}>
                <Trash2 size={14} strokeWidth={1.75} />
              </IconButton>
            </div>
          )}
        </div>
      ))}
      {!readOnly && (
        <div className={`flex items-center gap-3 px-3 ${items.length ? "border-t border-border" : ""}`}>
          <Plus size={16} strokeWidth={1.75} className="shrink-0 text-ink-ghost" />
          <input
            aria-label="Новая подзадача"
            className="h-10 flex-1 bg-transparent text-base outline-none placeholder:text-ink-ghost"
            placeholder="Добавить подзадачу"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add([draft]);
                setDraft("");
              }
            }}
            onBlur={() => {
              add([draft]);
              setDraft("");
            }}
            onPaste={(e) => {
              const lines = e.clipboardData.getData("text").split(/\r?\n/);
              if (lines.length > 1) {
                e.preventDefault();
                add(lines);
              }
            }}
          />
        </div>
      )}
      {readOnly && !items.length && <p className="px-3 py-2.5 text-sm text-ink-ghost">Подзадач нет</p>}
    </div>
  );
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
  const { icon: TypeIcon, color } = CARD_TYPE_STYLES[card.type];
  const items = card.checklist.filter((i) => i.text.trim()).length;
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
              <Select {...a} disabled={readOnly} value={card.type} onChange={(e) => onChange({ type: e.target.value as CardType })}>
                {Object.entries(CARD_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
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
          <div className="sm:col-span-3">
            <Field label="Описание">
              {(a) => <Textarea {...a} disabled={readOnly} className="min-h-[72px]" value={card.description ?? ""} onChange={(e) => onChange({ description: e.target.value })} />}
            </Field>
          </div>
          <div className="sm:col-span-3">
            <div className="mb-1.5 flex items-center gap-2 text-sm font-medium">
              Подзадачи
              {items > 0 && <span className="text-xs font-normal text-ink-ghost">{items}</span>}
            </div>
            <SubtasksEditor items={card.checklist} readOnly={readOnly} onChange={(checklist) => onChange({ checklist })} />
          </div>
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
                    onClick={() => set({ cards: [...draft.cards, toDraftCard({ title: "", type: "OTHER", estimateHours: null, checklist: [], description: null })] })}
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
