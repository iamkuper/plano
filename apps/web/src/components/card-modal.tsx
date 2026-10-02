"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronRight, Link2, MessageSquare, Paperclip, Plus, Repeat, Trash2, X } from "lucide-react";
import {
  CARD_FIELD_LABELS,
  CARD_PRIORITY_LABELS,
  CARD_TYPE_LABELS,
  cardKey,
  type CardPriority,
  type ActivityDto,
  type CardDetailDto,
  type CardType,
  type AttachmentDto,
  type UserDto,
} from "@amo-kanban/shared";
import { useCan } from "@/lib/permissions";
import { api, uploadAttachment, type CardPatch } from "@/lib/api";
import { describeRecurrence } from "@/lib/recurrence";
import { AttachmentGrid, MessageAttachments } from "./attachments";
import { RecurringDialog } from "./recurring-dialog";
import { priorityColor } from "@/design/tokens";
import { Avatar, AvatarStack, LetterMark } from "./avatar";
import { LabelPicker } from "./label-picker";
import { CARD_TYPE_STYLES } from "./card-type-icon";
import {
  Button,
  Checkbox,
  ConfirmDialog,
  Field,
  IconButton,
  Input,
  Menu,
  MenuItem,
  Modal,
  Popover,
  Segmented,
  Select,
  ShareBar,
  StatusDot,
  columnTone,
  inputClass,
} from "./ui";
import { toast } from "@/lib/toast";
import { useDebounced, useRealtime } from "@/lib/realtime";
import { MessageComposer, MessageText } from "./message-composer";
import { plural } from "./board-toolbar";

function formatMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} мин`;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// "1.5", "1,5", "1:30", "90м" → minutes. Plain numbers are hours.
function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase().replace(",", ".");
  const hm = s.match(/^(\d+):(\d{1,2})$/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const mins = s.match(/^(\d+)\s*(м|мин|m)$/);
  if (mins) return Number(mins[1]);
  const hours = Number(s.replace(/\s*(ч|h)$/, ""));
  return Number.isFinite(hours) && hours > 0 ? Math.round(hours * 60) : null;
}

function dayKey(iso: string) {
  return new Date(iso).toDateString();
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Сегодня";
  if (d.toDateString() === yesterday.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function describeActivity(a: ActivityDto) {
  const payload = a.payload as Record<string, string> | string[] | null;
  switch (a.action) {
    case "created":
      return "создал(а) карточку";
    case "moved":
      return `перенёс(ла) из «${(payload as Record<string, string>).from}» в «${(payload as Record<string, string>).to}»`;
    case "commented":
      return "оставил(а) комментарий";
    case "updated": {
      const fields = Array.isArray(payload) ? payload.map((f) => CARD_FIELD_LABELS[f] ?? f) : [];
      return fields.length ? `изменил(а) ${fields.join(", ")}` : "изменил(а) карточку";
    }
    default:
      return a.action;
  }
}

const PRIORITY_DOT = priorityColor;

export function CardModal({ cardId, onClose }: { cardId: string; onClose: (changed: boolean) => void }) {
  const [card, setCard] = useState<CardDetailDto | null>(null);
  const [me, setMe] = useState<UserDto | null>(null);
  const allowed = useCan();
  const [users, setUsers] = useState<UserDto[]>([]);
  const [columns, setColumns] = useState<{ id: string; title: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const changed = useRef(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [newItem, setNewItem] = useState("");
  const [tab, setTab] = useState<"comments" | "activity">("comments");
  const [duration, setDuration] = useState("");
  const [timeDate, setTimeDate] = useState(today);
  const [timeNote, setTimeNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [repeating, setRepeating] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<{ key: string; name: string; progress: number }[]>([]);

  const reload = useCallback(async () => {
    const c = await api.card(cardId);
    setCard(c);
    setTitle(c.title);
    setDescription(c.description ?? "");
    return c;
  }, [cardId]);

  useEffect(() => {
    reload()
      .then((c) => api.projectBoard(c.project.id))
      .then((b) => setColumns(b.columns.map(({ id, title }) => ({ id, title }))))
      .catch((e) => setError(e.message));
    api.me().then(setMe).catch(() => {});
    api.users().then((list) => setUsers(list.filter((u) => u.isActive))).catch(() => {});
  }, [reload]);

  // Live: colleagues' edits and messages refresh the open card.
  const liveReload = useDebounced(() => {
    reload().catch(() => {});
  }, 200);
  useRealtime(`card:${cardId}`, { "card:changed": liveReload });

  // Opening the card (and every new message seen here) marks it read.
  const seenComments = card?.comments.length;
  useEffect(() => {
    if (seenComments === undefined) return;
    api.markCardRead(cardId).then(() => (changed.current = true), () => {});
  }, [cardId, seenComments]);

  const close = useCallback(() => onClose(changed.current), [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // Every mutation goes through here: marks the board stale, refreshes the
  // card (so activity/counters stay in sync) and surfaces errors inline.
  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      changed.current = true;
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const save = (patch: Partial<CardPatch>) => run(() => api.updateCard(cardId, patch));

  // Keep the discussion scrolled to the latest message.
  const chatEnd = useRef<HTMLDivElement>(null);
  const commentCount = card?.comments.length ?? 0;
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [commentCount, tab]);

  if (!card) {
    return (
      <Modal label="Карточка задачи" onClose={close}>
        <div className="p-10 text-center text-base text-ink-faint">{error ?? "Загрузка…"}</div>
      </Modal>
    );
  }

  const assigneeIds = card.assignees.map((a) => a.user.id);
  const doneCount = card.checklist.filter((i) => i.done).length;
  const loggedMinutes = card.timeEntries.reduce((sum, e) => sum + e.minutes, 0);
  const estimateMinutes = card.estimateHours ? card.estimateHours * 60 : null;
  const over = estimateMinutes !== null && loggedMinutes > estimateMinutes;
  const columnIndex = columns.findIndex((c) => c.id === card.column.id);
  const statusTone = columnIndex === -1 ? "todo" : columnTone(columnIndex, columns.length);
  const { icon: TypeIcon, color: typeColor } = CARD_TYPE_STYLES[card.type];

  async function remove() {
    try {
      await api.deleteCard(cardId);
      toast(`Карточка ${cardKey(card!)} удалена`, "success");
      onClose(true);
    } catch (e) {
      setConfirmingDelete(false);
      setError((e as Error).message);
    }
  }

  // Card-level upload (button or drop); files appear in "Файлы".
  async function uploadFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const key = `${file.name}-${Math.random()}`;
      setUploads((u) => [...u, { key, name: file.name, progress: 0 }]);
      try {
        await uploadAttachment(cardId, file, (progress) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress } : x))));
        changed.current = true;
      } catch (e) {
        toast((e as Error).message, "error");
      } finally {
        setUploads((u) => u.filter((x) => x.key !== key));
      }
    }
    reload().catch(() => {});
  }

  const canDeleteFile = (a: AttachmentDto) => a.uploaderId === me?.id || me?.role === "ADMIN";

  return (
    <Modal label="Карточка задачи" onClose={close}>
      {/* Header — same anatomy as the card's top row */}
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border pl-5 pr-3 text-sm">
        <LetterMark name={card.project.title} size={18} />
        <span className="ml-1 truncate text-ink-faint">{card.project.title}</span>
        <ChevronRight size={14} className="shrink-0 text-ink-ghost" />
        <span className="font-medium text-ink">{cardKey(card)}</span>
        {card.recurringRule && (
          <Link
            href={`/projects/${card.project.id}/settings`}
            title="Создана повторяющимся правилом — изменить в настройках проекта"
            className={`ml-2 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ${card.recurringRule.active ? "bg-accent-soft text-accent" : "bg-surface-sunken text-ink-faint"}`}
          >
            <Repeat size={12} /> {describeRecurrence(card.recurringRule)}
          </Link>
        )}
        <div className="ml-auto flex items-center gap-0.5 text-ink-faint">
          <IconButton
            title={copied ? "Ссылка скопирована" : "Скопировать ссылку"}
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? <Check size={16} strokeWidth={1.5} /> : <Link2 size={16} strokeWidth={1.5} />}
          </IconButton>
          <Menu
            items={[
              { label: "Сделать повторяющейся", icon: Repeat, onClick: () => setRepeating(true) },
              { label: "Прикрепить файл", icon: Paperclip, onClick: () => document.getElementById(`files-${cardId}`)?.click() },
              ...(allowed("cards.delete") ? [{ label: "Удалить карточку", icon: Trash2, onClick: () => setConfirmingDelete(true), danger: true }] : []),
            ]}
          />
          <IconButton onClick={close} title="Закрыть (Esc)">
            <X size={17} strokeWidth={1.5} />
          </IconButton>
        </div>
      </div>

      {error && <div className="border-b border-border bg-danger-soft px-5 py-2 text-sm text-danger">{error}</div>}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Content — also a drop target for files */}
        <div
          className="relative min-w-0 flex-1 overflow-y-auto px-8 pb-10 pt-6"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) {
              e.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
          onDrop={(e) => {
            if (!e.dataTransfer.files.length) return;
            e.preventDefault();
            setDragging(false);
            uploadFiles(e.dataTransfer.files);
          }}
        >
          {dragging && (
            <div className="pointer-events-none absolute inset-3 z-10 grid place-items-center rounded-xl border-2 border-dashed border-accent bg-accent-soft/80 text-sm font-medium text-accent">
              Отпустите, чтобы прикрепить файлы
            </div>
          )}
          <textarea
            aria-label="Название"
            className="-mx-2 w-[calc(100%+16px)] resize-none rounded-md border border-transparent px-2 py-1 text-2xl font-semibold text-ink outline-none transition-colors hover:bg-surface-soft focus:border-accent focus:bg-surface"
            rows={1}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== card.title && save({ title: title.trim() })}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
          />
          <textarea
            aria-label="Описание"
            className="-mx-2 mt-1 min-h-[64px] w-[calc(100%+16px)] resize-none rounded-md border border-transparent px-2 py-1.5 text-base leading-6 text-ink-soft outline-none transition-colors placeholder:text-ink-ghost hover:bg-surface-soft focus:border-accent focus:bg-surface"
            placeholder="Добавьте описание"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => description !== (card.description ?? "") && save({ description: description || null })}
          />

          {/* Properties — the same fields as every form in the app */}
          <section className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 xl:grid-cols-3">
            <Field label="Статус">
              {(a) => (
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2">
                    <StatusDot tone={statusTone} />
                  </span>
                  <Select {...a} className="pl-7" value={card.column.id} onChange={(e) => run(() => api.moveCard(cardId, e.target.value))}>
                    {columns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </Field>

            <Field label="Исполнители">
              {(a) => (
                <Popover
                  align="left"
                  trigger={(open, toggle) => (
                    <button {...a} type="button" onClick={toggle} aria-expanded={open} className={`${inputClass} flex items-center gap-2 text-left`}>
                      {card.assignees.length === 0 ? (
                        <span className="text-ink-ghost">Не назначены</span>
                      ) : (
                        <>
                          <AvatarStack users={card.assignees.map((a) => a.user)} size={18} />
                          <span className="min-w-0 flex-1 truncate">
                            {card.assignees.length === 1 ? card.assignees[0].user.name : `${card.assignees.length} ${plural(card.assignees.length, "исполнитель", "исполнителя", "исполнителей")}`}
                          </span>
                        </>
                      )}
                      <ChevronDown size={14} className="ml-auto shrink-0 text-ink-ghost" />
                    </button>
                  )}
                >
                  {() => (
                    <div className="w-[240px]">
                      {users.map((u) => {
                        const on = assigneeIds.includes(u.id);
                        return (
                          <MenuItem
                            key={u.id}
                            selected={on}
                            onClick={() => save({ assigneeIds: on ? assigneeIds.filter((id) => id !== u.id) : [...assigneeIds, u.id] })}
                          >
                            <span className="flex items-center gap-2">
                              <Avatar user={u} size={18} /> {u.name}
                            </span>
                          </MenuItem>
                        );
                      })}
                    </div>
                  )}
                </Popover>
              )}
            </Field>

            <Field label="Метки">
              {(a) => <LabelPicker field={a} selected={card.labels.map((l) => l.label)} onChange={(ids) => save({ labelIds: ids })} />}
            </Field>

            <Field label="Тип">
              {(a) => (
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2" style={{ color: typeColor }}>
                    <TypeIcon size={14} strokeWidth={2} />
                  </span>
                  <Select {...a} className="pl-8" value={card.type} onChange={(e) => save({ type: e.target.value as CardType })}>
                    {Object.entries(CARD_TYPE_LABELS).map(([value, text]) => (
                      <option key={value} value={value}>
                        {text}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </Field>

            <Field label="Приоритет">
              {(a) => (
                <div className="relative">
                  <span
                    className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-2 -translate-y-1/2 rounded-full"
                    style={{ background: PRIORITY_DOT[card.priority] }}
                  />
                  <Select {...a} className="pl-7" value={card.priority} onChange={(e) => save({ priority: e.target.value as CardPriority })}>
                    {Object.entries(CARD_PRIORITY_LABELS).map(([value, text]) => (
                      <option key={value} value={value}>
                        {text}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </Field>

            <Field label="Срок">
              {(a) => (
                <Input
                  {...a}
                  type="date"
                  invalid={!!card.dueDate && new Date(card.dueDate) < new Date(new Date().toDateString())}
                  value={card.dueDate ? card.dueDate.slice(0, 10) : ""}
                  onChange={(e) => save({ dueDate: e.target.value || null })}
                />
              )}
            </Field>

            <Field label="Оценка, часов">
              {(a) => (
                <Input
                  {...a}
                  type="number"
                  min={0}
                  placeholder="Не задана"
                  defaultValue={card.estimateHours ?? ""}
                  key={card.estimateHours ?? "none"}
                  onBlur={(e) => {
                    const v = e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value)));
                    if (v !== card.estimateHours) save({ estimateHours: v });
                  }}
                />
              )}
            </Field>
          </section>

          {/* Subtasks */}
          <section className="mt-8">
            <header className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-medium">Подзадачи</h3>
              {card.checklist.length > 0 && (
                <>
                  <span className="text-xs text-ink-ghost">
                    {doneCount} из {card.checklist.length}
                  </span>
                  <div className="ml-auto w-24">
                    <ShareBar value={doneCount / card.checklist.length} tone="success" />
                  </div>
                </>
              )}
            </header>
            <div className="overflow-hidden rounded-lg border border-border">
              {card.checklist.map((item) => (
                <div key={item.id} className="group flex h-10 items-center gap-3 border-b border-border px-3">
                  <Checkbox checked={item.done} label={item.text} onChange={(done) => run(() => api.updateChecklistItem(item.id, { done }))} />
                  <span className={`flex-1 text-base ${item.done ? "text-ink-ghost line-through" : "text-ink"}`}>{item.text}</span>
                  <IconButton
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                    onClick={() => run(() => api.deleteChecklistItem(item.id))}
                    title="Удалить подзадачу"
                  >
                    <Trash2 size={14} strokeWidth={1.75} />
                  </IconButton>
                </div>
              ))}
              <form
                className="flex items-center gap-3 px-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = newItem.trim();
                  if (!text) return;
                  setNewItem("");
                  run(() => api.addChecklistItem(cardId, text));
                }}
              >
                <Plus size={16} strokeWidth={1.75} className="shrink-0 text-ink-ghost" />
                <input
                  aria-label="Новая подзадача"
                  className="h-10 flex-1 bg-transparent text-base outline-none placeholder:text-ink-ghost"
                  placeholder="Добавить подзадачу"
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                />
              </form>
            </div>
          </section>

          {/* Files */}
          <section className="mt-8">
            <header className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-medium">Файлы</h3>
              {card.attachments.length > 0 && <span className="text-xs text-ink-ghost">{card.attachments.length}</span>}
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => document.getElementById(`files-${cardId}`)?.click()}>
                <Paperclip size={14} /> Прикрепить
              </Button>
              <input
                id={`files-${cardId}`}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) uploadFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </header>
            {uploads.length > 0 && (
              <div className="mb-2 space-y-1">
                {uploads.map((u) => (
                  <div key={u.key} className="flex items-center gap-2 text-xs text-ink-faint">
                    <span className="min-w-0 flex-1 truncate">{u.name}</span>
                    <span className="w-24">
                      <ShareBar value={u.progress / 100} />
                    </span>
                    <span className="w-8 text-right">{u.progress}%</span>
                  </div>
                ))}
              </div>
            )}
            {card.attachments.length > 0 ? (
              <AttachmentGrid items={card.attachments} canDelete={canDeleteFile} onDelete={(a) => run(() => api.deleteAttachment(a.id))} />
            ) : (
              uploads.length === 0 && (
                <button
                  type="button"
                  onClick={() => document.getElementById(`files-${cardId}`)?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong py-4 text-sm text-ink-faint transition-colors hover:border-accent hover:text-accent"
                >
                  <Paperclip size={15} /> Перетащите файлы сюда или выберите — до 20 МБ каждый
                </button>
              )
            )}
          </section>

          {/* Time tracking */}
          <section className="mt-8">
            <header className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-medium">Учёт времени</h3>
              <span className={`text-xs ${over ? "font-medium text-danger" : "text-ink-ghost"}`}>
                {formatMinutes(loggedMinutes)}
                {estimateMinutes !== null && ` из ${formatMinutes(estimateMinutes)}`}
              </span>
              {estimateMinutes !== null && estimateMinutes > 0 && (
                <div className="ml-auto w-24">
                  <ShareBar value={loggedMinutes / estimateMinutes} tone={over ? "danger" : "accent"} />
                </div>
              )}
            </header>
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const minutes = parseDuration(duration);
                if (!minutes) {
                  setError("Укажите время, например 1.5, 1:30 или 45м");
                  return;
                }
                setDuration("");
                setTimeNote("");
                run(() => api.addTimeEntry(cardId, { minutes, date: timeDate, note: timeNote.trim() || undefined }));
              }}
            >
              <div className="w-24 shrink-0">
                <Input aria-label="Сколько времени" placeholder="1:30" value={duration} onChange={(e) => setDuration(e.target.value)} />
              </div>
              <div className="w-40 shrink-0">
                <Input aria-label="Дата" type="date" value={timeDate} onChange={(e) => setTimeDate(e.target.value)} />
              </div>
              <div className="min-w-[160px] flex-1">
                <Input aria-label="Что делали" placeholder="Что делали" value={timeNote} onChange={(e) => setTimeNote(e.target.value)} />
              </div>
              <Button variant="primary">Списать</Button>
            </form>
            {card.timeEntries.length > 0 && (
              <div className="mt-3 overflow-hidden rounded-lg border border-border">
                {card.timeEntries.map((t) => (
                  <div key={t.id} className="group flex h-10 items-center gap-3 border-b border-border px-3 text-sm last:border-b-0">
                    <Avatar user={t.user} size={20} />
                    <span className="w-16 shrink-0 font-medium">{formatMinutes(t.minutes)}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-soft">{t.note ?? "Без комментария"}</span>
                    <span className="shrink-0 text-xs text-ink-ghost">
                      {new Date(t.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                    </span>
                    {(t.user.id === me?.id || me?.role === "ADMIN") && (
                      <IconButton
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                        onClick={() => run(() => api.deleteTimeEntry(t.id))}
                        title="Удалить запись"
                      >
                        <Trash2 size={13} strokeWidth={1.75} />
                      </IconButton>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Discussion — messenger-style */}
        <aside className="flex min-h-[320px] w-full shrink-0 flex-col border-t border-border bg-surface-soft md:w-[380px] md:border-l md:border-t-0">
          <div className="flex h-11 shrink-0 items-center border-b border-border px-3">
            <Segmented
              label="Обсуждение"
              value={tab}
              onChange={setTab}
              options={[
                { value: "comments", label: "Обсуждение", count: card.comments.length || undefined },
                { value: "activity", label: "История" },
              ]}
            />
          </div>

          {tab === "comments" ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
                {card.comments.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <MessageSquare size={20} strokeWidth={1.75} className="text-ink-ghost" />
                    <p className="mt-2 text-sm text-ink-faint">Сообщений пока нет</p>
                    <p className="mt-0.5 max-w-[240px] text-xs text-ink-ghost">Вопросы и договорённости по задаче пишите здесь — их увидит вся команда.</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {card.comments.map((c, i) => {
                      const prev = card.comments[i - 1];
                      const mineMsg = c.author.id === me?.id;
                      const newDay = !prev || dayKey(prev.createdAt) !== dayKey(c.createdAt);
                      const sameAuthor = !newDay && prev?.author.id === c.author.id;
                      const canDelete = mineMsg || me?.role === "ADMIN";
                      return (
                        <div key={c.id}>
                          {newDay && (
                            <div className="my-3 flex justify-center">
                              <span className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-xs text-ink-faint">{dayLabel(c.createdAt)}</span>
                            </div>
                          )}
                          <div className={`group flex items-end gap-2 ${mineMsg ? "flex-row-reverse" : ""} ${sameAuthor ? "" : "mt-3"}`}>
                            {!mineMsg && (
                              <span className={`shrink-0 ${sameAuthor ? "invisible" : ""}`}>
                                <Avatar user={c.author} size={26} />
                              </span>
                            )}
                            <div className={`flex max-w-[78%] flex-col ${mineMsg ? "items-end" : "items-start"}`}>
                              {!mineMsg && !sameAuthor && <span className="mb-0.5 px-1 text-xs font-medium text-ink-faint">{c.author.name}</span>}
                              <div
                                className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-base leading-5 ${
                                  mineMsg ? "rounded-br-md bg-accent text-white" : "rounded-bl-md border border-border bg-surface text-ink"
                                }`}
                              >
                                {c.text && <MessageText text={c.text} users={users} mine={mineMsg} />}
                                {c.attachments && c.attachments.length > 0 && <MessageAttachments items={c.attachments} mine={mineMsg} />}
                                <span className={`ml-2 inline-block translate-y-0.5 text-xs ${mineMsg ? "text-white/70" : "text-ink-ghost"} ${c.text ? "" : "float-right mt-1"}`}>
                                  {timeLabel(c.createdAt)}
                                </span>
                              </div>
                            </div>
                            {canDelete && (
                              <IconButton
                                size="sm"
                                className="mb-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100"
                                onClick={() => run(() => api.deleteComment(c.id))}
                                title="Удалить сообщение"
                              >
                                <Trash2 size={13} strokeWidth={1.75} />
                              </IconButton>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={chatEnd} />
                  </div>
                )}
              </div>

              <MessageComposer
                users={users}
                onUpload={(file, onProgress) => uploadAttachment(cardId, file, onProgress)}
                onSend={(text, mentionIds, attachmentIds) => run(() => api.addComment(cardId, text, mentionIds, attachmentIds))}
              />
            </>
          ) : (
            <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {card.activity.map((a) => (
                <li key={a.id} className="flex gap-2.5 text-sm">
                  <Avatar user={a.user} size={20} />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{a.user.name}</span> <span className="text-ink-soft">{describeActivity(a)}</span>
                    <span className="block text-xs text-ink-ghost">{formatDateTime(a.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
      {repeating && (
        <RecurringDialog
          projectId={card.project.id}
          users={users as UserDto[]}
          prefill={{
            title: card.title,
            description: card.description,
            type: card.type,
            priority: card.priority,
            estimateHours: card.estimateHours,
            assigneeIds: card.assignees.map((a) => a.user.id),
            checklist: card.checklist.map((i) => i.text),
          }}
          onClose={() => setRepeating(false)}
          onSaved={() => (changed.current = true)}
        />
      )}
      {confirmingDelete && (
        <ConfirmDialog
          title={`Удалить карточку ${cardKey(card)}?`}
          body={<>«{card.title}» удалится вместе с подзадачами, комментариями и записями времени.</>}
          confirmLabel="Удалить карточку"
          onConfirm={remove}
          onClose={() => setConfirmingDelete(false)}
        />
      )}
    </Modal>
  );
}

