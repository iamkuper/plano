import type { Metadata } from "next";
import { fetchPlans } from "@/lib/seo";
import { SUPPORT } from "@/lib/support";
import { PricingTable } from "@/components/marketing/pricing-table";
import { SiteFooter, SiteHeader } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "Тарифы",
  alternates: { canonical: "/pricing" },
  description: "Free до 3 человек, Pro и Business — за пользователя в месяц. 14 дней бесплатно, оплата картой или по счёту.",
};

export default async function PricingPage() {
  const pricing = await fetchPlans();
  return (
    <div className="min-h-screen bg-bg">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h1 className="text-center text-4xl font-semibold tracking-tight">Тарифы Plano</h1>
        <p className="mx-auto mt-3 max-w-xl text-center text-ink-faint">Платите только за тех, кто работает. Год — по цене десяти месяцев.</p>
        <div className="mt-10">
          <PricingTable initial={pricing} />
        </div>
        {SUPPORT.url && (
          <p className="mt-10 text-center text-sm text-ink-faint">
            Большая команда или особые условия?{" "}
            <a href={SUPPORT.url} className="text-ink underline">
              Напишите нам
            </a>{" "}
            — поможем подобрать.
          </p>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
