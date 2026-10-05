"use client";

import { Fragment, useRef, useState } from "react";
import { Paperclip, SendHorizontal, X } from "lucide-react";
import type { AttachmentDto, UserRefDto } from "@plano/shared";
import { toast } from "@/lib/toast";
import { Avatar } from "./avatar";
import { formatSize } from "./attachments";

type Pending = { key: string; name: string; size: number; progress: number; done?: AttachmentDto };

// "@" + letters right before the caret → the mention being typed.
const MENTION_AT_CARET = /(?:^|\s)@([\p{L}\d_-]*)$/u;

// Messenger-style input: grows with the text, Enter sends, Shift+Enter is a
// new line, "@" opens a people picker. Sends the ids of people whose
// "@Name" is still in the text.
export function MessageComposer({
  users,
  onSend,
  onUpload,
}: {
  users: UserRefDto[];
  onSend: (text: string, mentionIds: string[], attachmentIds: string[]) => void;
  // Uploads one file to the card and reports progress; enables the paperclip.
  onUpload?: (file: File, onProgress: (pct: number) => void) => Promise<AttachmentDto>;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const uploading = pending.some((p) => !p.done);

  async function attach(files: FileList | File[]) {
    if (!onUpload) return;
    for (const file of Array.from(files)) {
      const key = `${file.name}-${file.size}-${Math.random()}`;
      setPending((list) => [...list, { key, name: file.name, size: file.size, progress: 0 }]);
      onUpload(file, (progress) => setPending((list) => list.map((p) => (p.key === key ? { ...p, progress } : p))))
        .then((done) => setPending((list) => list.map((p) => (p.key === key ? { ...p, done, progress: 100 } : p))))
        .catch((e) => {
          setPending((list) => list.filter((p) => p.key !== key));
          toast((e as Error).message, "error");
        });
    }
  }
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<UserRefDto[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const suggestions =
    query === null ? [] : users.filter((u) => u.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  function resize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }

  function detect(value: string, caret: number) {
    const m = value.slice(0, caret).match(MENTION_AT_CARET);
    setQuery(m ? m[1] : null);
    setActive(0);
  }

  function choose(user: UserRefDto) {
    const el = ref.current!;
    const caret = el.selectionStart;
    const before = text.slice(0, caret).replace(/@([\p{L}\d_-]*)$/u, `@${user.name} `);
    const next = before + text.slice(caret);
    setText(next);
    setPicked((list) => (list.some((u) => u.id === user.id) ? list : [...list, user]));
    setQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(before.length, before.length);
      resize(el);
    });
  }

  function send() {
    const value = text.trim();
    const files = pending.filter((p) => p.done).map((p) => p.done!.id);
    if ((!value && !files.length) || uploading) return;
    onSend(
      value,
      picked.filter((u) => value.includes(`@${u.name}`)).map((u) => u.id),
      files,
    );
    setText("");
    setPicked([]);
    setPending([]);
    setQuery(null);
    if (ref.current) ref.current.style.height = "auto";
  }

  return (
    <form
      className="relative shrink-0 border-t border-border bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      {suggestions.length > 0 && (
        <div role="listbox" aria-label="Упомянуть" className="animate-dialog-in absolute bottom-full left-3 right-3 mb-1 rounded-lg border border-border bg-surface p-1 shadow-raised">
          {suggestions.map((u, i) => (
            <button
              key={u.id}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(u)}
              className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm ${i === active ? "bg-surface-soft" : "hover:bg-surface-soft"}`}
            >
              <Avatar user={u} size={18} /> {u.name}
            </button>
          ))}
        </div>
      )}
      {pending.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {pending.map((p) => (
            <span key={p.key} className="relative flex max-w-[220px] items-center gap-1.5 overflow-hidden rounded-md border border-border bg-surface-soft py-1 pl-2 pr-1 text-xs">
              <Paperclip size={12} className="shrink-0 text-ink-ghost" />
              <span className="truncate">{p.name}</span>
              <span className="shrink-0 text-ink-ghost">{p.done ? formatSize(p.size) : `${p.progress}%`}</span>
              <button
                type="button"
                aria-label={`Убрать ${p.name}`}
                onClick={() => setPending((list) => list.filter((x) => x.key !== p.key))}
                className="grid size-4 shrink-0 place-items-center rounded-sm text-ink-ghost hover:text-ink"
              >
                <X size={11} />
              </button>
              {!p.done && <span className="absolute bottom-0 left-0 h-0.5 bg-accent transition-all" style={{ width: `${p.progress}%` }} />}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 rounded-xl border border-border bg-surface py-1.5 pl-1.5 pr-1.5 transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15">
        {onUpload && (
          <>
            <button
              type="button"
              title="Прикрепить файл"
              aria-label="Прикрепить файл"
              onClick={() => fileRef.current?.click()}
              className="grid size-8 shrink-0 place-items-center rounded-full text-ink-ghost transition-colors hover:bg-surface-soft hover:text-ink"
            >
              <Paperclip size={16} strokeWidth={1.75} />
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) attach(e.target.files);
                e.target.value = "";
              }}
            />
          </>
        )}
        <textarea
          ref={ref}
          aria-label="Сообщение"
          rows={1}
          className="max-h-32 min-h-[28px] flex-1 resize-none bg-transparent py-1 text-base leading-5 outline-none placeholder:text-ink-ghost"
          placeholder="Сообщение, @ — упомянуть"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            resize(e.currentTarget);
            detect(e.target.value, e.target.selectionStart);
          }}
          onKeyDown={(e) => {
            if (suggestions.length) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => (a + (e.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                choose(suggestions[active]);
                return;
              }
              if (e.key === "Escape") {
                e.stopPropagation();
                setQuery(null);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          onBlur={() => setTimeout(() => setQuery(null), 120)}
          onPaste={(e) => {
            // Pasted screenshots become attachments.
            const files = Array.from(e.clipboardData.files);
            if (files.length && onUpload) {
              e.preventDefault();
              attach(files);
            }
          }}
        />
        <button
          disabled={(!text.trim() && !pending.some((p) => p.done)) || uploading}
          title="Отправить (Enter)"
          aria-label="Отправить"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-white transition-colors hover:bg-accent-hover disabled:bg-surface-sunken disabled:text-ink-ghost"
        >
          <SendHorizontal size={15} strokeWidth={2} />
        </button>
      </div>
      <p className="mt-1.5 px-1 text-xs text-ink-ghost">Enter — отправить, Shift+Enter — новая строка, @ — упомянуть{onUpload ? ", скриншот можно вставить" : ""}</p>
    </form>
  );
}

// Message text with "@Name" of known people highlighted.
export function MessageText({ text, users, mine }: { text: string; users: UserRefDto[]; mine?: boolean }) {
  const names = users.map((u) => u.name).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!names.length) return <>{text}</>;
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(@(?:${escaped.join("|")}))`, "g"));
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("@") && names.includes(part.slice(1)) ? (
          <span key={i} className={`font-medium ${mine ? "text-white underline decoration-white/50" : "text-accent"}`}>
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
