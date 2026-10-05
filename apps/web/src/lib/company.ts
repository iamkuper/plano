// The seller's public details: site footer and legal pages. Keep in sync
// with SELLER_* in apps/api/.env (those go on invoices).
export const COMPANY = {
  brand: "Plano",
  site: "plano.team",
  name: "Индивидуальный предприниматель Купреев Павел Александрович",
  short: "ИП Купреев П. А.",
  inn: "672907871558",
  ogrnip: "320673300012100",
  bank: "АО «ТБанк»",
  bik: "044525974",
  account: "40802810100001486115",
  corrAccount: "30101810145250000974",
  // Contact for legal and personal-data requests.
  email: "hello@plano.team",
};

export const LEGAL_PAGES = [
  { href: "/legal/offer", title: "Публичная оферта" },
  { href: "/legal/terms", title: "Пользовательское соглашение" },
  { href: "/legal/privacy", title: "Политика обработки персональных данных" },
  { href: "/legal/consent", title: "Согласие на обработку персональных данных" },
  { href: "/legal/requisites", title: "Реквизиты" },
] as const;

// Date of the current edition of the documents.
export const LEGAL_EDITION = "2 октября 2026 г.";
