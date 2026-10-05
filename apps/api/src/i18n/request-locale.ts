import { AsyncLocalStorage } from "async_hooks";
import type { NextFunction, Request, Response } from "express";
import { DEFAULT_LOCALE, LOCALES, setLocaleResolver, type Locale } from "@plano/shared";

// The language of whatever is being served: the web app sends its UI language
// in X-Locale, other clients may send Accept-Language. Background work (emails)
// picks the recipient's own language with withLocale().
const storage = new AsyncLocalStorage<Locale>();

export const withLocale = <T>(locale: Locale, fn: () => T): T => storage.run(locale, fn);
export const asLocale = (value: unknown): Locale | undefined => LOCALES.find((l) => l === value);

setLocaleResolver(() => storage.getStore() ?? DEFAULT_LOCALE);

function fromRequest(req: Request): Locale {
  const explicit = asLocale(req.header("x-locale"));
  if (explicit) return explicit;
  const accept = (req.header("accept-language") ?? "").split(",").map((part) => part.trim().slice(0, 2).toLowerCase());
  return LOCALES.find((l) => accept.includes(l)) ?? DEFAULT_LOCALE;
}

export function localeMiddleware(req: Request, _res: Response, next: NextFunction) {
  withLocale(fromRequest(req), next);
}
