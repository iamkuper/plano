import type { Locale } from "./index";
import ru from "./locales/ru.json";
import en from "./locales/en.json";

// One catalogue for the whole product: the web app, the API (errors, emails,
// starter content) and the shared labels all read it from here.
//
// A message is a string with {placeholders}, or an object of plural forms
// (one / few / many / other) chosen by the `count` parameter.
export type Message = string | Partial<Record<Intl.LDMLPluralRule, string>>;
export type Params = Record<string, string | number | null | undefined>;
export type Catalogue = Record<string, Message>;

export const CATALOGUES: Record<Locale, Catalogue> = { ru: ru as Catalogue, en: en as Catalogue };

// Date formatting tags per locale.
export const INTL_TAG: Record<Locale, string> = { ru: "ru-RU", en: "en-GB" };

// In the browser the locale is the user's choice (kept in localStorage) or, until
// they choose, the browser language. Elsewhere (build, tests) it is Russian
// until a runtime installs its own resolver.
export const LOCALE_STORAGE_KEY = "plano.locale";
let browserChoice: Locale | null = null;
// The package builds without DOM typings; these are the only browser globals it touches.
const env = globalThis as unknown as { window?: unknown; localStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void }; navigator?: { language?: string } };

function browserLocale(): Locale {
  if (browserChoice) return browserChoice;
  let chosen: Locale = "ru";
  try {
    const stored = env.localStorage?.getItem(LOCALE_STORAGE_KEY);
    if (stored === "ru" || stored === "en") chosen = stored;
    else chosen = env.navigator?.language?.toLowerCase().startsWith("ru") ? "ru" : "en";
  } catch {
    // no storage: keep the default
  }
  return (browserChoice = chosen);
}

// Remember the choice; callers reload the page so every string is redrawn.
export function chooseBrowserLocale(locale: Locale) {
  browserChoice = locale;
  try {
    env.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // choice lasts until reload only
  }
}
export const resetBrowserLocale = () => (browserChoice = null);

let resolver: () => Locale = () => (!env.window ? "ru" : browserLocale());

// Each runtime says which locale is current: the browser reads its setting,
// the API reads the locale of the request being served.
export function setLocaleResolver(fn: () => Locale) {
  resolver = fn;
}
export const currentLocale = () => resolver();

function pick(message: Message, locale: Locale, count: number | undefined): string {
  if (typeof message === "string") return message;
  const rule = new Intl.PluralRules(INTL_TAG[locale]).select(count ?? 0);
  return message[rule] ?? message.other ?? Object.values(message)[0] ?? "";
}

export function translate(locale: Locale, key: string, params?: Params): string {
  const message = CATALOGUES[locale][key] ?? CATALOGUES.ru[key];
  if (message === undefined) return key;
  const text = pick(message, locale, typeof params?.count === "number" ? params.count : undefined);
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name] ?? "") : whole));
}

export const t = (key: string, params?: Params) => translate(resolver(), key, params);

// A label table whose values are catalogue keys, read lazily so it follows the
// current locale: lazyLabels({ HIGH: "shared.high" }).HIGH → "Высокий" / "High".
export function lazyLabels<K extends string>(keys: Record<K, string>): Record<K, string> {
  const target = {} as Record<K, string>;
  for (const [k, key] of Object.entries<string>(keys)) Object.defineProperty(target, k, { enumerable: true, get: () => t(key) });
  return target;
}

// BCP-47 tag for Intl / toLocale*String in the current locale.
export const intlTag = () => INTL_TAG[currentLocale()];
