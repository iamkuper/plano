import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = { title: "Реквизиты — Plano" };

const ROWS: [string, string][] = [
  ["Наименование", COMPANY.name],
  ["ИНН", COMPANY.inn],
  ["ОГРНИП", COMPANY.ogrnip],
  ["Расчётный счёт", COMPANY.account],
  ["Банк", COMPANY.bank],
  ["БИК", COMPANY.bik],
  ["Корреспондентский счёт", COMPANY.corrAccount],
  ["Почта", COMPANY.email],
];

export default function RequisitesPage() {
  return (
    <LegalPage href="/legal/requisites" title="Реквизиты">
      <dl className="overflow-hidden rounded-xl border border-border">
        {ROWS.map(([k, v]) => (
          <div key={k} className="grid gap-1 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[220px_1fr]">
            <dt className="text-sm text-ink-faint">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </LegalPage>
  );
}
