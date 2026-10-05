"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronRight, Link2, MessageSquare, Paperclip, Plus, Repeat, Trash2, X } from "lucide-react";
import {
  CARD_FIELD_LABELS,
  CARD_PRIORITY_LABELS,
  cardKey,
  type CardPriority,
  type ActivityDto,
  type CardDetailDto,
  type AttachmentDto,
  type UserDto,
  t,
  intlTag,
} from "@plano/shared";
import { useCan } from "@/lib/permissions";
import { api, uploadAttachment, type CardPatch } from "@/lib/api";
import { describeRecurrence } from "@/lib/recurrence";
import { AttachmentGrid, MessageAttachments } from "./attachments";
import { RecurringDialog } from "./recurring-dialog";
import { priorityColor } from "@/design/tokens";
import { Avatar, AvatarStack, LetterMark } from "./avatar";
import { LabelPicker } from "./label-picker";
import { CustomFieldInputs } from "./custom-field-inputs";
import { typeStyle } from "./card-type-icon";
import { useTaskTypes } from "@/lib/use-task-types";
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

function formatMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return t("common.min", { m });
  return m ? t("common.hMin", { h, m }) : t("common.h", { h });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(intlTag(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
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
  if (d.toDateString() === today.toDateString()) return t("common.today");
  if (d.toDateString() === yesterday.toDateString()) return t("cardModal.yesterday");
  return d.toLocaleDateString(intlTag(), { day: "numeric", month: "long", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(intlTag(), { hour: "2-digit", minute: "2-digit" });
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function describeActivity(a: ActivityDto) {
  const payload = a.payload as Record<string, string> | string[] | null;
  switch (a.action) {
    case "created":
      return t("cardModal.createdTheCard");
    case "moved":
      return t("cardModal.movedFromTo", { from: (payload as Record<string, string>).from, to: (payload as Record<string, string>).to });
    case "commented":
      return t("cardModal.leftAComment");
    case "updated": {
      const fields = Array.isArray(payload) ? payload.map((f) => CARD_FIELD_LABELS[f] ?? f) : [];
      return fields.length ? t("cardModal.changed", { join: fields.join(", ") }) : t("cardModal.changedTheCard");
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
  const taskTypes = useTaskTypes();
  const [users, setUsers] = useState<UserDto[]>([]);
  const [columns, setColumns] = useState<{ id: string; title: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasFields, setHasFields] = useState(false);
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
    api.billing().then((b) => setHasFields(b.plan.features.includes("fields"))).catch(() => {});
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
  const reloadCard = () => run(async () => {});

  // Keep the discussion scrolled to the latest message.
  const chatEnd = useRef<HTMLDivElement>(null);
  const commentCount = card?.comments.length ?? 0;
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [commentCount, tab]);

  if (!card) {
    return (
      <Modal label={t("cardModal.taskCard")} onClose={close}>
        <div className="p-10 text-center text-base text-ink-faint">{error ?? t("common.loading")}</div>
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
  const { icon: TypeIcon, color: typeColor } = typeStyle(card.type);

  async function remove() {
    try {
      await api.deleteCard(cardId);
      toast(t("cardModal.cardDeleted", { cardKey: cardKey(card!) }), "success");
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
    <Modal label={t("cardModal.taskCard")} onClose={close}>
      {/* Header — same anatomy as the card's top row */}
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border pl-5 pr-3 text-sm">
        <LetterMark name={card.project.title} size={18} />
        <span className="ml-1 truncate text-ink-faint">{card.project.title}</span>
        <ChevronRight size={14} className="shrink-0 text-ink-ghost" />
        <span className="font-medium text-ink">{cardKey(card)}</span>
        {card.recurringRule && (
          <Link
            href={`/projects/${card.project.id}/settings`}
            title={t("cardModal.createdByARecurringRule")}
            className={`ml-2 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ${card.recurringRule.active ? "bg-accent-soft text-accent" : "bg-surface-sunken text-ink-faint"}`}
          >
            <Repeat size={12} /> {describeRecurrence(card.recurringRule)}
          </Link>
        )}
        <div className="ml-auto flex items-center gap-0.5 text-ink-faint">
          <IconButton
            title={copied ? t("common.linkCopied") : t("cardModal.copyLink")}
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
              { label: t("common.makeRecurring"), icon: Repeat, onClick: () => setRepeating(true) },
              { label: t("common.attachAFile"), icon: Paperclip, onClick: () => document.getElementById(`files-${cardId}`)?.click() },
              ...(allowed("cards.delete") ? [{ label: t("cardModal.deleteCard"), icon: Trash2, onClick: () => setConfirmingDelete(true), danger: true }] : []),
            ]}
          />
          <IconButton onClick={close} title={t("cardModal.closeEsc")}>
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
              
              {t("cardModal.releaseToAttachTheFiles")}
            </div>
          )}
          <textarea
            aria-label={t("common.name2")}
            className="-mx-2 w-[calc(100%+16px)] resize-none rounded-md border border-transparent px-2 py-1 text-2xl font-semibold text-ink outline-none transition-colors hover:bg-surface-soft focus:border-accent focus:bg-surface"
            rows={1}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== card.title && save({ title: title.trim() })}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
          />
          <textarea
            aria-label={t("common.description")}
            className="-mx-2 mt-1 min-h-[64px] w-[calc(100%+16px)] resize-none rounded-md border border-transparent px-2 py-1.5 text-base leading-6 text-ink-soft outline-none transition-colors placeholder:text-ink-ghost hover:bg-surface-soft focus:border-accent focus:bg-surface"
            placeholder={t("cardModal.addADescription")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => description !== (card.description ?? "") && save({ description: description || null })}
          />

          {/* Properties — the same fields as every form in the app */}
          <section className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 xl:grid-cols-3">
            <Field label={t("common.status")}>
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

            <Field label={t("common.assignees")}>
              {(a) => (
                <Popover
                  align="left"
                  trigger={(open, toggle) => (
                    <button {...a} type="button" onClick={toggle} aria-expanded={open} className={`${inputClass} flex items-center gap-2 text-left`}>
                      {card.assignees.length === 0 ? (
                        <span className="text-ink-ghost">{t("cardModal.notAssigned")}</span>
                      ) : (
                        <>
                          <AvatarStack users={card.assignees.map((a) => a.user)} size={18} />
                          <span className="min-w-0 flex-1 truncate">
                            {card.assignees.length === 1 ? card.assignees[0].user.name : t("plural.assignees", { count: card.assignees.length })}
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

            <Field label={t("common.labels")}>
              {(a) => <LabelPicker field={a} selected={card.labels.map((l) => l.label)} onChange={(ids) => save({ labelIds: ids })} />}
            </Field>

            <Field label={t("common.type")}>
              {(a) => (
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2" style={{ color: typeColor }}>
                    <TypeIcon size={14} strokeWidth={2} />
                  </span>
                  <Select {...a} className="pl-8" value={card.type.id} onChange={(e) => save({ typeId: e.target.value })}>
                    {(taskTypes.some((x) => x.id === card.type.id) ? taskTypes : [card.type, ...taskTypes]).map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </Field>

            <Field label={t("common.priority")}>
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

            <Field label={t("common.start2")}>
              {(a) => (
                <Input
                  {...a}
                  type="date"
                  max={card.dueDate ? card.dueDate.slice(0, 10) : undefined}
                  value={card.startDate ? card.startDate.slice(0, 10) : ""}
                  onChange={(e) => save({ startDate: e.target.value || null })}
                />
              )}
            </Field>

            <Field label={t("common.dueDate")}>
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

            <CustomFieldInputs card={card} canEdit={hasFields} onChanged={reloadCard} />

            <Field label={t("cardModal.estimateHours")}>
              {(a) => (
                <Input
                  {...a}
                  type="number"
                  min={0}
                  placeholder={t("cardModal.notSet")}
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
              <h3 className="text-sm font-medium">{t("common.subtasks")}</h3>
              {card.checklist.length > 0 && (
                <>
                  <span className="text-xs text-ink-ghost"> {t("cardModal.of", { doneCount, checklist: card.checklist.length })} </span>
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
                    title={t("cardModal.deleteSubtask")}
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
                  aria-label={t("cardModal.newSubtask")}
                  className="h-10 flex-1 bg-transparent text-base outline-none placeholder:text-ink-ghost"
                  placeholder={t("cardModal.addSubtask")}
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                />
              </form>
            </div>
          </section>

          {/* Files */}
          <section className="mt-8">
            <header className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-medium">{t("common.files")}</h3>
              {card.attachments.length > 0 && <span className="text-xs text-ink-ghost">{card.attachments.length}</span>}
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => document.getElementById(`files-${cardId}`)?.click()}>
                <Paperclip size={14} />  {t("cardModal.attach")}
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
                  <Paperclip size={15} />  {t("cardModal.dropFilesHereOrChoose")}
                </button>
              )
            )}
          </section>

          {/* Time tracking */}
          <section className="mt-8">
            <header className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-medium">{t("cardModal.timeTracking")}</h3>
              <span className={`text-xs ${over ? "font-medium text-danger" : "text-ink-ghost"}`}>
                {formatMinutes(loggedMinutes)}
                {estimateMinutes !== null && t("cardModal.of2", { formatMinutes: formatMinutes(estimateMinutes) })}
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
                  setError(t("cardModal.enterATimeForExample"));
                  return;
                }
                setDuration("");
                setTimeNote("");
                run(() => api.addTimeEntry(cardId, { minutes, date: timeDate, note: timeNote.trim() || undefined }));
              }}
            >
              <div className="w-24 shrink-0">
                <Input aria-label={t("cardModal.howLong")} placeholder="1:30" value={duration} onChange={(e) => setDuration(e.target.value)} />
              </div>
              <div className="w-40 shrink-0">
                <Input aria-label={t("common.date")} type="date" value={timeDate} onChange={(e) => setTimeDate(e.target.value)} />
              </div>
              <div className="min-w-[160px] flex-1">
                <Input aria-label={t("cardModal.whatWasDone")} placeholder={t("cardModal.whatWasDone")} value={timeNote} onChange={(e) => setTimeNote(e.target.value)} />
              </div>
              <Button variant="primary">{t("cardModal.log")}</Button>
            </form>
            {card.timeEntries.length > 0 && (
              <div className="mt-3 overflow-hidden rounded-lg border border-border">
                {card.timeEntries.map((entry) => (
                  <div key={entry.id} className="group flex h-10 items-center gap-3 border-b border-border px-3 text-sm last:border-b-0">
                    <Avatar user={entry.user} size={20} />
                    <span className="w-16 shrink-0 font-medium">{formatMinutes(entry.minutes)}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-soft">{entry.note ?? t("cardModal.noComment")}</span>
                    <span className="shrink-0 text-xs text-ink-ghost">
                      {new Date(entry.date).toLocaleDateString(intlTag(), { day: "numeric", month: "short" })}
                    </span>
                    {(entry.user.id === me?.id || me?.role === "ADMIN") && (
                      <IconButton
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                        onClick={() => run(() => api.deleteTimeEntry(entry.id))}
                        title={t("cardModal.deleteEntry")}
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
              label={t("cardModal.discussion")}
              value={tab}
              onChange={setTab}
              options={[
                { value: "comments", label: t("cardModal.discussion"), count: card.comments.length || undefined },
                { value: "activity", label: t("cardModal.history") },
              ]}
            />
          </div>

          {tab === "comments" ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
                {card.comments.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <MessageSquare size={20} strokeWidth={1.75} className="text-ink-ghost" />
                    <p className="mt-2 text-sm text-ink-faint">{t("cardModal.noMessagesYet")}</p>
                    <p className="mt-0.5 max-w-[240px] text-xs text-ink-ghost">{t("cardModal.writeQuestionsAndAgreementsAbout")}</p>
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
                                title={t("cardModal.deleteMessage")}
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
            typeId: card.type.id,
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
          title={t("cardModal.deleteCard2", { cardKey: cardKey(card) })}
          body={<>{t("cardModal.willBeDeletedTogetherWith", { title: card.title })}</>}
          confirmLabel={t("cardModal.deleteCard")}
          onConfirm={remove}
          onClose={() => setConfirmingDelete(false)}
        />
      )}
    </Modal>
  );
}

