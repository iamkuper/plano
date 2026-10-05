import type { Metadata } from "next";
import type { Locale } from "@plano/shared";
import { makeTr, sitePath } from "@/lib/marketing";
import { fetchPlans, SITE_NAME, SITE_URL } from "@/lib/seo";
import { SUPPORT } from "@/lib/support";
import { PricingTable } from "@/components/marketing/pricing-table";
import { SiteFooter, SiteHeader } from "@/components/marketing/site";

export function pricingMetadata(locale: Locale): Metadata {
  const tr = makeTr(locale);
  const title = tr("mk.shared.pricing");
  const description = tr("mk.pricingPage.freeForUpTo3");
  return {
    title,
    description,
    alternates: { canonical: sitePath(locale, "/pricing"), languages: { ru: "/pricing", en: "/en/pricing", "x-default": "/pricing" } },
    openGraph: { type: "website", locale: locale === "en" ? "en_US" : "ru_RU", url: `${SITE_URL}${sitePath(locale, "/pricing")}`, siteName: SITE_NAME, title, description },
  };
}

export async function PricingPage({ locale }: { locale: Locale }) {
  const tr = makeTr(locale);
  const pricing = await fetchPlans();
  return (
    <div lang={locale} className="min-h-screen bg-bg">
      <SiteHeader locale={locale} path="/pricing" />
      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h1 className="text-center text-4xl font-semibold tracking-tight">{tr("mk.pricingPage.planoPlans")}</h1>
        <p className="mx-auto mt-3 max-w-xl text-center text-ink-faint">{tr("mk.pricingPage.payOnlyForThePeople")}</p>
        <div className="mt-10">
          <PricingTable initial={pricing} locale={locale} />
        </div>
        {SUPPORT.url && (
          <p className="mt-10 text-center text-sm text-ink-faint">
            
            {tr("mk.pricingPage.aBigTeamOrSpecial")}{" "}
            <a href={SUPPORT.url} className="text-ink underline">
              
              {tr("mk.pricingPage.writeToUs")}
            </a>{" "}
            
            {tr("mk.pricingPage.weWillHelpYouChoose")}
          </p>
        )}
      </main>
      <SiteFooter locale={locale} />
    </div>
  );
}
