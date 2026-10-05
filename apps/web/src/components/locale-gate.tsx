"use client";

import { useEffect, useState } from "react";
import { LOCALES, chooseBrowserLocale, currentLocale, t, type Locale } from "@plano/shared";

// The interface language is only known in the browser (the user's choice or the
// browser's own), so nothing is drawn until it is: server-rendered HTML in the
// wrong language would be replaced on hydration anyway.
export function LocaleGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Links from the public site carry the visitor's language: /register?lang=en.
    const asked = new URLSearchParams(window.location.search).get("lang");
    const wanted = LOCALES.find((l) => l === asked);
    if (wanted) chooseBrowserLocale(wanted);
    document.documentElement.lang = currentLocale();
    setReady(true);
  }, []);
  return ready ? <>{children}</> : null;
}

// Switches the language and redraws every string by reloading the page.
export function setUiLanguage(locale: Locale) {
  chooseBrowserLocale(locale);
  window.location.reload();
}

const NAMES: Record<Locale, string> = { ru: "Русский", en: "English" };

// Small language links for pages without an account yet (sign in, sign up).
export function LanguageSwitch() {
  const current = currentLocale();
  return (
    <div className="flex justify-center gap-3 text-xs text-ink-faint" role="group" aria-label={t("localeGate.language")}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === current}
          onClick={() => l !== current && setUiLanguage(l)}
          className={l === current ? "font-medium text-ink" : "hover:text-ink"}
        >
          {NAMES[l]}
        </button>
      ))}
    </div>
  );
}

export const languageName = (l: Locale) => NAMES[l];
