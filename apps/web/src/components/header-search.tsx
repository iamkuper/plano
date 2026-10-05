"use client";

import { Search } from "lucide-react";
import { t } from "@plano/shared";
import { openPalette } from "@/lib/palette";

// The search field of the sidebar. It opens the command palette (⌘K), which
// finds cards as well as sections, projects and actions.
export function HeaderSearch() {
  return (
    <button
      type="button"
      onClick={openPalette}
      aria-label={t("common.search")}
      className="relative flex h-8 w-full items-center rounded-md border border-chrome-line bg-chrome-hover pl-8 pr-10 text-left text-sm text-chrome-ink-faint outline-none transition-colors hover:border-chrome-active focus-visible:border-chrome-ink-faint"
    >
      <Search size={14} strokeWidth={1.75} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" />
      {t("common.search")}
      <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-sm border border-chrome-line bg-chrome px-1 text-xs text-chrome-ink-faint">⌘K</kbd>
    </button>
  );
}
