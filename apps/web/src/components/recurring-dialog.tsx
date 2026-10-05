"use client";

import { useState } from "react";
import { CARD_PRIORITY_LABELS, type CardPriority, type RecurrenceFrequency, type RecurringRuleDto, type UserDto } from "@plano/shared";
import { api, type RecurringInput } from "@/lib/api";
import { WEEKDAYS, describeRecurrence } from "@/lib/recurrence";
import { toast } from "@/lib/toast";
import { useTaskTypes } from "@/lib/use-task-types";
import { Avatar } from "./avatar";
import { Button, Checkbox, Dialog, Field, Input, Select, Textarea } from "./ui";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export type RecurringPrefill = Partial<Omit<RecurringInput, "startDate">>;

// Create or edit a recurring rule. New cards appear in the first stage of
// the project's board at 09:00 on each run day.
export function RecurringDialog({
  projectId,
  users,
  rule,
  prefill,
  onClose,
  onSaved,
}: {
  projectId: string;
  users: UserDto[];
  rule?: RecurringRuleDto;
  prefill?: RecurringPrefill;
  onClose: () => void;
  onSaved: (rule: RecurringRuleDto) => void;
}) {
  const today = new Date();
  const src = rule ?? prefill ?? {};
  const [title, setTitle] = useState(src.title ?? "");
  const [description, setDescription] = useState(src.description ?? "");
  const taskTypes = useTaskTypes();
  const [typeId, setTypeId] = useState<string>(src.typeId ?? "");
  const [priority, setPriority] = useState<CardPriority>(src.priority ?? "MEDIUM");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(src.assigneeIds ?? []);
  const [checklist, setChecklist] = useState((src.checklist ?? []).join("\n"));
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(src.frequency ?? "MONTHLY");
  const [interval, setInterval] = useState(String(src.interval ?? 1));
  const [weekday, setWeekday] = useState(String(src.weekday ?? ((today.getDay() + 6) % 7) + 1));
  const [monthDay, setMonthDay] = useState(String(src.monthDay ?? today.getDate()));
  const [dueInDays, setDueInDays] = useState(src.dueInDays != null ? String(src.dueInDays) : "");
  const [startDate, setStartDate] = useState(rule ? rule.nextRunAt.slice(0, 10) : iso(today));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = Math.max(1, Math.round(Number(interval) || 1));
  const summary = describeRecurrence({ frequency, interval: n, weekday: Number(weekday), monthDay: Number(monthDay) });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Укажите название задачи");
    setError(null);
    setBusy(true);
    const data: RecurringInput = {
      title: title.trim(),
      description: description.trim() || null,
      typeId: typeId || undefined,
      priority,
      assigneeIds,
      estimateHours: src.estimateHours ?? null,
      checklist: checklist.split("\n").map((t) => t.trim()).filter(Boolean),
      frequency,
      interval: n,
      weekday: frequency === "WEEKLY" ? Number(weekday) : null,
      monthDay: frequency === "MONTHLY" ? Math.min(31, Math.max(1, Number(monthDay) || 1)) : null,
      dueInDays: dueInDays === "" ? null : Math.max(0, Math.round(Number(dueInDays))),
      startDate,
    };
    try {
      const saved = rule ? await api.updateRecurring(rule.id, data) : await api.createRecurring(projectId, data);
      toast(rule ? "Правило сохранено" : `Повторение настроено: ${summary.toLowerCase()}`, "success");
      onSaved(saved);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={rule ? "Повторяющаяся задача" : "Сделать повторяющейся"} description="Карточка будет создаваться в первом этапе доски в 9:00." onClose={onClose} width="max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Название задачи" error={error && !title.trim() ? error : null}>
          {(a) => <Input {...a} autoFocus={!title} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например, «Ежемесячный отчёт»" />}
        </Field>

        <div className="rounded-lg border border-border bg-surface-soft p-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Повторять">
              {(a) => (
                <Select {...a} value={frequency} onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}>
                  <option value="DAILY">Ежедневно</option>
                  <option value="WEEKLY">Еженедельно</option>
                  <option value="MONTHLY">Ежемесячно</option>
                </Select>
              )}
            </Field>
            <Field label={frequency === "DAILY" ? "Каждые, дней" : frequency === "WEEKLY" ? "Каждые, недель" : "Каждые, месяцев"}>
              {(a) => <Input {...a} type="number" min={1} max={52} value={interval} onChange={(e) => setInterval(e.target.value)} />}
            </Field>
            {frequency === "WEEKLY" && (
              <Field label="День недели">
                {(a) => (
                  <Select {...a} value={weekday} onChange={(e) => setWeekday(e.target.value)}>
                    {WEEKDAYS.map((d, i) => (
                      <option key={d} value={i + 1}>
                        {d[0].toUpperCase() + d.slice(1)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            {frequency === "MONTHLY" && (
              <Field label="Число месяца" hint="31 → последний день месяца">
                {(a) => <Input {...a} type="number" min={1} max={31} value={monthDay} onChange={(e) => setMonthDay(e.target.value)} />}
              </Field>
            )}
            <Field label="Начиная с">{(a) => <Input {...a} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />}</Field>
          </div>
          <p className="mt-2 text-sm text-ink-soft">
            {summary}. Срок у карточки:{" "}
            <input
              aria-label="Срок через, дней"
              type="number"
              min={0}
              placeholder="—"
              className="mx-1 h-7 w-14 rounded-md border border-border bg-surface px-1.5 text-center text-sm outline-none focus:border-accent"
              value={dueInDays}
              onChange={(e) => setDueInDays(e.target.value)}
            />
            {dueInDays === "" ? "не ставить" : "дн. после создания"}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Тип">
            {(a) => (
              <Select {...a} value={typeId || taskTypes.find((x) => x.isDefault)?.id || ""} onChange={(e) => setTypeId(e.target.value)}>
                {taskTypes.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Приоритет">
            {(a) => (
              <Select {...a} value={priority} onChange={(e) => setPriority(e.target.value as CardPriority)}>
                {Object.entries(CARD_PRIORITY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink-soft">Исполнители</span>
          <div className="flex flex-wrap gap-2">
            {users.map((u) => {
              const on = assigneeIds.includes(u.id);
              return (
                <label key={u.id} className={`flex h-8 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-sm ${on ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-soft"}`}>
                  <Checkbox checked={on} label={u.name} onChange={() => setAssigneeIds((ids) => (on ? ids.filter((id) => id !== u.id) : [...ids, u.id]))} />
                  <Avatar user={u} size={18} /> {u.name}
                </label>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Описание">{(a) => <Textarea {...a} className="min-h-[88px]" value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
          <Field label="Чек-лист" hint="Пункт на строку">
            {(a) => <Textarea {...a} className="min-h-[88px]" value={checklist} onChange={(e) => setChecklist(e.target.value)} />}
          </Field>
        </div>

        {error && title.trim() && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" loading={busy}>
            {rule ? "Сохранить" : "Настроить повторение"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
