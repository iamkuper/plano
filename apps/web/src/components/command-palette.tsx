"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, FolderKanban, Search } from "lucide-react";
import { cardKey, type CardTileDto, type ProjectListItemDto, t } from "@plano/shared";
import { api, setToken } from "@/lib/api";
import { GO_KEYS, isTyping, onPaletteOpen } from "@/lib/palette";
import { Dialog } from "./ui";
import { LetterMark } from "./avatar";

interface Command {
  id: string;
  label: string;
  // Extra words the search also matches (the other language, synonyms).
  keywords?: string;
  keys?: string;
  group: "go" | "project" | "action";
  run: () => void;
}

export const SHORTCUTS: { keys: string[]; label: () => string }[] = [
  { keys: ["⌘", "K"], label: () => t("palette.openPalette") },
  { keys: ["/"], label: () => t("palette.openSearch") },
  { keys: ["?"], label: () => t("palette.showShortcuts") },
  { keys: ["["], label: () => t("palette.toggleSidebar") },
  ...Object.entries(GO_KEYS).map(([k, v]) => ({ keys: ["G", k.toUpperCase()], label: () => t(v.label) })),
  { keys: ["Esc"], label: () => t("palette.closeDialogs") },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title={t("palette.shortcuts")} description={t("palette.shortcutsHint")} onClose={onClose}>
      <ul className="divide-y divide-border text-sm">
        {SHORTCUTS.map((s) => (
          <li key={s.keys.join("+")} className="flex items-center justify-between gap-4 py-2">
            <span>{s.label()}</span>
            <span className="flex shrink-0 items-center gap-1">
              {s.keys.map((k) => (
                <kbd key={k} className="min-w-6 rounded-sm border border-border bg-surface-soft px-1.5 py-0.5 text-center text-xs text-ink-soft">
                  {k}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

const GROUPS: Command["group"][] = ["go", "action", "project"];
const groupTitle = (g: Command["group"] | "card") => ({ go: t("palette.groupGo"), action: t("palette.groupActions"), project: t("palette.groupProjects"), card: t("palette.groupCards") })[g];

// ⌘K: jump to a section or a project, run an action, or find a card.
// Also owns the keyboard shortcuts of the app (G then a letter, ?, /).
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [cards, setCards] = useState<CardTileDto[]>([]);
  const [projects, setProjects] = useState<ProjectListItemDto[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  // Shortcuts.
  useEffect(() => {
    let armed = 0; // time of the last "g"
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      if (armed && Date.now() - armed < 1500) {
        armed = 0;
        const target = GO_KEYS[key];
        if (target) {
          e.preventDefault();
          router.push(target.href);
          return;
        }
      }
      if (key === "g" && !e.shiftKey) armed = Date.now();
      else if (e.key === "?") {
        e.preventDefault();
        setHelp(true);
      } else if (e.key === "/") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    const off = onPaletteOpen(() => setOpen(true));
    return () => {
      window.removeEventListener("keydown", onKey);
      off();
    };
  }, [router]);

  // Reset and load projects each time it opens.
  useEffect(() => {
    if (!open) return;
    setQ("");
    setActive(0);
    setCards([]);
    api.projects("ACTIVE").then(setProjects).catch(() => {});
  }, [open]);

  // Card search while typing.
  useEffect(() => {
    if (!open || !q.trim()) {
      setCards([]);
      return;
    }
    const timer = setTimeout(() => api.searchCards(q).then(setCards).catch(() => {}), 200);
    return () => clearTimeout(timer);
  }, [q, open]);

  const commands = useMemo<Command[]>(() => {
    const go = (id: string, label: string, href: string, keywords = "", keys?: string): Command => ({ id, label, keywords, keys, group: "go", run: () => router.push(href) });
    const goKeys = (letter: string) => `G ${letter.toUpperCase()}`;
    return [
      go("home", t("palette.goHome"), "/dashboard", "home dashboard главная обзор", goKeys("d")),
      go("projects", t("palette.goProjects"), "/projects", "projects проекты", goKeys("p")),
      go("team", t("palette.goTeam"), "/team", "team tasks задачи команда", goKeys("t")),
      go("time", t("palette.goTime"), "/reports/time", "time report время отчёт учёт", goKeys("r")),
      go("settings", t("palette.goSettings"), "/settings", "settings настройки", goKeys("s")),
      go("staff", t("palette.goStaff"), "/settings/users", "staff users roles permissions сотрудники права роли"),
      go("templates", t("palette.goTemplates"), "/settings/templates", "templates шаблоны"),
      go("agents", t("palette.goAgents"), "/settings/agents", "agents ai агенты ии"),
      go("integrations", t("palette.goIntegrations"), "/settings/integrations", "integrations api tokens webhooks интеграции токены вебхуки"),
      go("fields", t("palette.goFields"), "/settings/fields", "fields custom поля"),
      go("audit", t("palette.goAudit"), "/settings/audit", "audit log журнал"),
      go("billing", t("palette.goBilling"), "/settings/billing", "billing plan payment биллинг тариф оплата"),
      go("profile", t("palette.goProfile"), "/profile", "profile account calendar профиль календарь", goKeys("u")),
      { id: "new-project", label: t("palette.newProject"), keywords: "new create project создать новый проект", group: "action", run: () => router.push("/projects?new=1") },
      { id: "shortcuts", label: t("palette.showShortcuts"), keywords: "shortcuts keys help горячие клавиши справка", keys: "?", group: "action", run: () => setHelp(true) },
      {
        id: "sign-out",
        label: t("appShell.signOut"),
        keywords: "sign out logout выйти выход",
        group: "action",
        run: () => {
          setToken(null);
          router.replace("/login");
        },
      },
      ...projects.map((p): Command => ({ id: `project-${p.id}`, label: p.title, keywords: "project проект", group: "project", run: () => router.push(`/projects/${p.id}`) })),
    ];
  }, [projects, router]);

  const rows = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = commands.filter((c) => words.every((w) => `${c.label} ${c.keywords ?? ""}`.toLowerCase().includes(w)));
    const items: { id: string; group: Command["group"] | "card"; run: () => void; render: React.ReactNode }[] = [];
    for (const g of GROUPS) {
      // Without a query only the first projects are listed, to keep the list short.
      const list = matches.filter((c) => c.group === g).slice(0, g === "project" ? (words.length ? 8 : 5) : undefined);
      for (const c of list) {
        items.push({
          id: c.id,
          group: g,
          run: c.run,
          render: (
            <>
              {g === "project" ? <FolderKanban size={15} className="shrink-0 text-ink-ghost" /> : null}
              <span className="min-w-0 flex-1 truncate">{c.label}</span>
              {c.keys && (
                <span className="flex gap-1">
                  {c.keys.split(" ").map((k) => (
                    <kbd key={k} className="rounded-sm border border-border bg-surface-soft px-1 text-xs text-ink-faint">
                      {k}
                    </kbd>
                  ))}
                </span>
              )}
            </>
          ),
        });
      }
    }
    for (const c of cards) {
      items.push({
        id: `card-${c.id}`,
        group: "card",
        run: () => router.push(`/projects/${c.project.id}?card=${c.id}`),
        render: (
          <>
            <LetterMark name={c.project.title} />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{c.title}</span>
              <span className="block truncate text-xs text-ink-faint">
                {cardKey(c)}, {c.project.title}
              </span>
            </span>
          </>
        ),
      });
    }
    return items;
  }, [commands, cards, q, router]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  function run(index: number) {
    const row = rows[index];
    if (!row) return;
    setOpen(false);
    row.run();
  }

  return (
    <>
      {help && <ShortcutsDialog onClose={() => setHelp(false)} />}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-overlay p-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={t("palette.title")} className="animate-dialog-in w-full max-w-xl overflow-hidden rounded-xl border border-border bg-surface shadow-raised">
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search size={16} className="shrink-0 text-ink-ghost" />
              <input
                autoFocus
                role="combobox"
                aria-expanded="true"
                aria-controls="palette-list"
                aria-activedescendant={rows[active] ? `palette-${rows[active].id}` : undefined}
                aria-label={t("palette.inputLabel")}
                className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-ghost"
                placeholder={t("palette.placeholder")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((i) => (rows.length ? (i + 1) % rows.length : 0));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    run(active);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setOpen(false);
                  }
                }}
              />
              <kbd className="rounded-sm border border-border bg-surface-soft px-1 text-xs text-ink-faint">Esc</kbd>
            </div>
            <div ref={listRef} id="palette-list" role="listbox" aria-label={t("palette.title")} className="max-h-[50vh] overflow-y-auto p-1.5">
              {rows.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-ink-faint">{t("common.nothingFound")}</div>
              ) : (
                rows.map((row, i) => (
                  <div key={row.id}>
                    {(i === 0 || rows[i - 1].group !== row.group) && <div className="px-2.5 pb-1 pt-2 text-xs font-medium text-ink-ghost">{groupTitle(row.group)}</div>}
                    <div
                      id={`palette-${row.id}`}
                      role="option"
                      aria-selected={i === active}
                      onMouseMove={() => i !== active && setActive(i)}
                      onClick={() => run(i)}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-base ${i === active ? "bg-surface-soft" : ""}`}
                    >
                      {row.render}
                      {i === active && <CornerDownLeft size={13} className="shrink-0 text-ink-ghost" />}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
