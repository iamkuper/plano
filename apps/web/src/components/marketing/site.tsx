"use client";

import Link from "next/link";
import type { Locale } from "@plano/shared";
import { COMPANY, LEGAL_PAGES } from "@/lib/company";
import { appPath, makeTr, sitePath } from "@/lib/marketing";
import { SUPPORT } from "@/lib/support";
import { SupportWidget } from "./support-widget";

// Header and footer of the public pages (landing, pricing).
// `path` is the page being shown, so the language links lead to its twin.
export function SiteHeader({ locale = "ru", path = "/" }: { locale?: Locale; path?: "/" | "/pricing" }) {
  const tr = makeTr(locale);
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href={sitePath(locale)} className="flex items-center gap-2 font-semibold">
          <img src="/plano.svg" alt="" className="size-6 rounded-md" /> Plano
        </Link>
        <nav className="hidden items-center gap-5 text-sm text-ink-faint sm:flex">
          <Link href={`${sitePath(locale)}#features`} className="hover:text-ink">
            
            {tr("mk.site.features")}
          </Link>
          <Link href={sitePath(locale, "/pricing")} className="hover:text-ink">
            {tr("mk.shared.pricing")}
          </Link>
          <Link href={`${sitePath(locale)}#faq`} className="hover:text-ink">
            
            {tr("mk.site.faq")}
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <nav aria-label={tr("mk.site.languageSwitch")} className="mr-1 hidden items-center gap-1 text-xs text-ink-ghost sm:flex">
            {(["ru", "en"] as const).map((l) => (
              <Link key={l} href={sitePath(l, path)} hrefLang={l} lang={l} aria-current={l === locale ? "true" : undefined} className={`rounded px-1.5 py-0.5 uppercase ${l === locale ? "font-medium text-ink" : "hover:text-ink"}`}>
                {l}
              </Link>
            ))}
          </nav>
          <Link href={appPath(locale, "/login")} className="rounded-md px-3 py-1.5 text-sm text-ink-faint hover:bg-surface-soft hover:text-ink">
            
            {tr("login.signIn2")}
          </Link>
          <Link href={appPath(locale, "/register")} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover">
            
            {tr("mk.site.tryIt")}
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ locale = "ru" }: { locale?: Locale }) {
  const tr = makeTr(locale);
  return (
    <footer className="border-t border-border bg-surface">
      <SupportWidget locale={locale} />
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:px-6 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <span className="flex items-center gap-2 font-semibold text-ink">
            <img src="/plano.svg" alt="" className="size-5 rounded" /> {COMPANY.brand}
          </span>
          <p className="mt-2 max-w-xs text-ink-faint">{tr("mk.site.kanbanForSmallTeamsAnd")}</p>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-ink-faint">
            <Link href={sitePath(locale, "/pricing")} className="hover:text-ink">
              {tr("mk.shared.pricing")}
            </Link>
            <Link href={appPath(locale, "/login")} className="hover:text-ink">
              
              {tr("mk.site.signIn")}
            </Link>
            <Link href={appPath(locale, "/register")} className="hover:text-ink">
              
              {tr("mk.site.signUp")}
            </Link>
            {SUPPORT.telegram && (
              <a href={SUPPORT.telegram} target="_blank" rel="noreferrer" className="hover:text-ink">
                
                {tr("mk.site.supportOnTelegram")}
              </a>
            )}
          </div>
        </div>
        <div>
          <div className="mb-2 font-medium text-ink">{locale === "en" ? tr("mk.site.documentsRu") : tr("mk.site.documents")}</div>
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
          <div className="mb-2 font-medium text-ink">{tr("mk.site.companyDetails")}</div>
          <p>{COMPANY.short}</p>
          <p>{tr("mk.site.taxId", { inn: COMPANY.inn })}</p>
          <p>{tr("mk.site.registrationNo", { ogrnip: COMPANY.ogrnip })}</p>
          <p className="mt-1">
            <a href={`mailto:${COMPANY.email}`} className="hover:text-ink">
              {COMPANY.email}
            </a>
          </p>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-ink-ghost sm:px-6"> {tr("mk.site.theSiteUsesCookiesAnd", { newDate: new Date().getFullYear(), brand: COMPANY.brand, short: COMPANY.short })} </div>
      </div>
    </footer>
  );
}
