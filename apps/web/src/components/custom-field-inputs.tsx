"use client";

import { useEffect, useState } from "react";
import type { CardDetailDto, CustomFieldDto, CustomFieldValue } from "@plano/shared";
import { api, onSessionChange } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Checkbox, Field, Input, Select } from "./ui";
import { t } from "@plano/shared";
let cache: Promise<CustomFieldDto[]> | null = null;
onSessionChange(() => (cache = null));
const loadFields = () => (cache ??= api.fields().catch((e) => ((cache = null), Promise.reject(e))));

// Custom fields of the workspace in a card. Values can be set on the
// Business plan; on other plans they show read-only.
export function CustomFieldInputs({ card, canEdit, onChanged }: { card: CardDetailDto; canEdit: boolean; onChanged: () => void }) {
  const [fields, setFields] = useState<CustomFieldDto[]>([]);
  useEffect(() => {
    loadFields().then(setFields).catch(() => {});
  }, []);

  const valueOf = (id: string) => card.fieldValues?.find((v) => v.fieldId === id)?.value;
  async function set(field: CustomFieldDto, value: CustomFieldValue | null) {
    try {
      await api.setFieldValue(card.id, field.id, value);
      onChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  // Without the feature, show only fields that have a value.
  const shown = fields.filter((f) => canEdit || valueOf(f.id) !== undefined);
  if (shown.length === 0) return null;

  return (
    <>
      {shown.map((f) => {
        const value = valueOf(f.id);
        return (
          <Field key={f.id} label={f.name}>
            {(a) => {
              switch (f.type) {
                case "NUMBER":
                  return <NumberInput a={a} value={typeof value === "number" ? value : null} disabled={!canEdit} onCommit={(v) => set(f, v)} />;
                case "DATE":
                  return <Input {...a} type="date" disabled={!canEdit} value={typeof value === "string" ? value : ""} onChange={(e) => set(f, e.target.value || null)} />;
                case "SELECT":
                  return (
                    <Select {...a} disabled={!canEdit} value={typeof value === "string" ? value : ""} onChange={(e) => set(f, e.target.value || null)}>
                      <option value="">{t("customFieldInputs.notSelected")}</option>
                      {f.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                      {typeof value === "string" && !f.options.includes(value) && <option value={value}>{value}</option>}
                    </Select>
                  );
                case "CHECKBOX":
                  return (
                    <div className="flex h-8 items-center">
                      <Checkbox checked={value === true} onChange={(v) => canEdit && set(f, v)} label={f.name} />
                    </div>
                  );
                default:
                  return <TextInput a={a} value={typeof value === "string" ? value : ""} disabled={!canEdit} onCommit={(v) => set(f, v || null)} />;
              }
            }}
          </Field>
        );
      })}
    </>
  );
}

// Saves on blur or Enter, not on every keystroke.
function TextInput({ a, value, disabled, onCommit }: { a: Record<string, unknown>; value: string; disabled: boolean; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <Input
      {...a}
      maxLength={500}
      disabled={disabled}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onCommit(text)}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur())}
    />
  );
}

function NumberInput({ a, value, disabled, onCommit }: { a: Record<string, unknown>; value: number | null; disabled: boolean; onCommit: (v: number | null) => void }) {
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => setText(value === null ? "" : String(value)), [value]);
  const commit = () => {
    const n = text.trim() === "" ? null : Number(text.replace(",", "."));
    if (n !== null && !Number.isFinite(n)) return setText(value === null ? "" : String(value));
    if (n !== value) onCommit(n);
  };
  return (
    <Input {...a} inputMode="decimal" disabled={disabled} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
  );
}
