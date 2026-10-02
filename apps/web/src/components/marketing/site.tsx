"use client";

import Link from "next/link";
import { SUPPORT } from "@/lib/support";

// Header and footer of the public pages (landing, pricing).
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <img src="/plano.svg" alt="" className="size-6 rounded-md" /> Plano
        </Link>
        <nav className="hidden items-center gap-5 text-sm text-ink-faint sm:flex">
          <Link href="/#features" className="hover:text-ink">
            Возможности
          </Link>
          <Link href="/pricing" className="hover:text-ink">
            Тарифы
          </Link>
          <Link href="/#faq" className="hover:text-ink">
            Вопросы
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/login" className="rounded-md px-3 py-1.5 text-sm text-ink-faint hover:bg-surface-soft hover:text-ink">
            Войти
          </Link>
          <Link href="/register" className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover">
            Попробовать
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 text-sm text-ink-faint sm:px-6">
        <span className="flex items-center gap-2 text-ink">
          <img src="/plano.svg" alt="" className="size-5 rounded" /> Plano
        </span>
        <Link href="/pricing" className="hover:text-ink">
          Тарифы
        </Link>
        <Link href="/login" className="hover:text-ink">
          Вход
        </Link>
        {SUPPORT.telegram && (
          <a href={SUPPORT.telegram} target="_blank" rel="noreferrer" className="hover:text-ink">
            Поддержка в Telegram
          </a>
        )}
        {SUPPORT.email && (
          <a href={SUPPORT.email} className="hover:text-ink">
            {SUPPORT.emailAddress}
          </a>
        )}
        <span className="ml-auto">© {new Date().getFullYear()} Plano</span>
      </div>
    </footer>
  );
}
