"use client";

import Link from "next/link";
import { Cookie } from "lucide-react";
import { giveConsent, useConsent } from "@/lib/consent";

// Notice required before using cookies and analytics. Shown until accepted.
export function CookieBanner() {
  const consent = useConsent();
  if (consent !== false) return null;
  return (
    <div role="dialog" aria-label="Использование cookie" className="fixed inset-x-0 bottom-0 z-50 p-3 sm:bottom-4 sm:left-4 sm:right-auto sm:p-0">
      <div className="lp-rise flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-raised sm:max-w-[420px]">
        <div className="flex gap-3">
          <Cookie size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink-faint" />
          <p className="text-sm text-ink-faint">
            Мы используем cookie и Яндекс Метрику, чтобы сайт работал и чтобы понимать, как им пользуются. Продолжая, вы соглашаетесь с{" "}
            <Link href="/legal/privacy" className="text-ink underline underline-offset-2">
              политикой обработки персональных данных
            </Link>
            .
          </p>
        </div>
        <button
          onClick={giveConsent}
          className="self-end rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Принять
        </button>
      </div>
    </div>
  );
}
