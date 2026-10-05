import { translate, YEAR_MONTHS_CHARGED, type Locale, type Params } from "@plano/shared";

// The public site (landing, pricing) is rendered on the server for search
// engines, with the language fixed by the address: Russian at the root,
// English under /en. So it takes the locale explicitly instead of reading the
// browser's choice like the app does.
export type Tr = (key: string, params?: Params) => string;
export const makeTr = (locale: Locale): Tr => (key, params) => translate(locale, key, params);

// "/" ↔ "/en", "/pricing" ↔ "/en/pricing".
export const sitePath = (locale: Locale, path = "/") => (locale === "en" ? (path === "/" ? "/en" : `/en${path}`) : path);
// Sign-up and sign-in are shared pages: the link carries the language.
export const appPath = (locale: Locale, path: "/register" | "/login") => (locale === "en" ? `${path}?lang=en` : path);

// The English site quotes dollars: per user per month, a year costs ten months
// like in roubles. Display prices of the public pages only.
export const USD_MONTHLY: Record<string, number> = { FREE: 0, PRO: 14.99, BUSINESS: 29.99 };

export function priceLabel(locale: Locale, plan: { id: string; priceKopecks: number }, interval: "MONTH" | "YEAR", rub: (kopecks: number) => string) {
  if (locale === "en") {
    const usd = USD_MONTHLY[plan.id] ?? 0;
    if (!usd) return "$0";
    const monthly = interval === "YEAR" ? (usd * YEAR_MONTHS_CHARGED) / 12 : usd;
    return `$${monthly.toFixed(2)}`;
  }
  return plan.priceKopecks ? rub(Math.round(interval === "YEAR" ? (plan.priceKopecks * YEAR_MONTHS_CHARGED) / 12 : plan.priceKopecks)) : "0 ₽";
}

// Schema.org offer for a plan, in the currency of the page.
export function offerPrice(locale: Locale, plan: { id: string; priceKopecks: number }) {
  return locale === "en" ? { price: (USD_MONTHLY[plan.id] ?? 0).toFixed(2), priceCurrency: "USD" } : { price: (plan.priceKopecks / 100).toFixed(2), priceCurrency: "RUB" };
}
