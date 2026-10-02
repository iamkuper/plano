"use client";

import Link from "next/link";
import { COMPANY, LEGAL_PAGES } from "@/lib/company";
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
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:px-6 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <span className="flex items-center gap-2 font-semibold text-ink">
            <img src="/plano.svg" alt="" className="size-5 rounded" /> {COMPANY.brand}
          </span>
          <p className="mt-2 max-w-xs text-ink-faint">Канбан для небольших команд и агентств.</p>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-ink-faint">
            <Link href="/pricing" className="hover:text-ink">
              Тарифы
            </Link>
            <Link href="/login" className="hover:text-ink">
              Вход
            </Link>
            <Link href="/register" className="hover:text-ink">
              Регистрация
            </Link>
            {SUPPORT.telegram && (
              <a href={SUPPORT.telegram} target="_blank" rel="noreferrer" className="hover:text-ink">
                Поддержка в Telegram
              </a>
            )}
          </div>
        </div>
        <div>
          <div className="mb-2 font-medium text-ink">Документы</div>
          <ul className="space-y-1 text-ink-faint">
            {LEGAL_PAGES.map((p) => (
              <li key={p.href}>
                <Link href={p.href} className="hover:text-ink">
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="text-ink-faint">
          <div className="mb-2 font-medium text-ink">Реквизиты</div>
          <p>{COMPANY.short}</p>
          <p>ИНН {COMPANY.inn}</p>
          <p>ОГРНИП {COMPANY.ogrnip}</p>
          <p className="mt-1">
            <a href={`mailto:${COMPANY.email}`} className="hover:text-ink">
              {COMPANY.email}
            </a>
          </p>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-ink-ghost sm:px-6">
          © {new Date().getFullYear()} {COMPANY.brand}, {COMPANY.short}. Сайт использует cookie и Яндекс Метрику для статистики посещений.
        </div>
      </div>
    </footer>
  );
}
