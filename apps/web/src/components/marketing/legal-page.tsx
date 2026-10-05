import Link from "next/link";
import { COMPANY, LEGAL_EDITION, LEGAL_PAGES } from "@/lib/company";
import { SiteFooter, SiteHeader } from "./site";

// Shell of a legal document: title, edition, side navigation between documents.
export function LegalPage({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <SiteHeader />
      <main className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Документы" className="text-sm lg:sticky lg:top-20 lg:self-start">
          <div className="mb-2 font-medium">Документы</div>
          <ul className="space-y-1">
            {LEGAL_PAGES.map((p) => (
              <li key={p.href}>
                <Link
                  href={p.href}
                  aria-current={p.href === href ? "page" : undefined}
                  className={`block rounded-md px-2 py-1.5 ${p.href === href ? "bg-surface-sunken font-medium text-ink" : "text-ink-faint hover:bg-surface-soft hover:text-ink"}`}
                >
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <article className="legal max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-ink-faint">
            Редакция от {LEGAL_EDITION}. {COMPANY.short}, ИНН {COMPANY.inn}.
          </p>
          <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-ink [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ol>li]:list-decimal [&_ul]:space-y-1">
            {children}
          </div>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
