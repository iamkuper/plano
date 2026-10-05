"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { cardKey, type CardTileDto, t } from "@plano/shared";
import { api } from "@/lib/api";
import { LetterMark } from "./avatar";

// Top-bar search over cards (title, description, TSK-12). ⌘K focuses it.
export function HeaderSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CardTileDto[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => api.searchCards(q).then(setResults).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [q]);

  function openCard(card: CardTileDto) {
    setOpen(false);
    setQ("");
    router.push(`/projects/${card.project.id}?card=${card.id}`);
  }

  return (
    <div className="relative w-full">
      <Search size={14} strokeWidth={1.75} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-chrome-ink-faint" />
      <input
        ref={inputRef}
        className="h-8 w-full rounded-md border border-chrome-line bg-chrome-hover pl-8 pr-10 text-sm text-chrome-ink outline-none transition-colors placeholder:text-chrome-ink-faint hover:border-chrome-active focus:border-chrome-ink-faint focus:bg-chrome-active"
        placeholder={t("common.search")}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) openCard(results[0]);
          if (e.key === "Escape") {
            setQ("");
            e.currentTarget.blur();
          }
        }}
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-sm border border-chrome-line bg-chrome px-1 text-xs text-chrome-ink-faint">
        ⌘K
      </kbd>
      {open && q.trim() && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[360px] overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-raised">
          {results.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-ink-faint">{t("common.nothingFound")}</div>
          ) : (
            results.map((c) => (
              <button
                key={c.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => openCard(c)}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-soft"
              >
                <LetterMark name={c.project.title} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base">{c.title}</span>
                  <span className="block truncate text-xs text-ink-faint">
                    {cardKey(c)}, {c.project.title}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
