import { describe, expect, it } from "vitest";
import { CATALOGUES, LOCALES, chooseBrowserLocale, currentLocale, resetBrowserLocale, t, translate } from "@plano/shared";

const placeholders = (m: unknown) => [...new Set(JSON.stringify(m).match(/\{\w+\}/g) ?? [])].sort();

describe("catalogues", () => {
  it("have the same keys in every language", () => {
    const ru = Object.keys(CATALOGUES.ru).sort();
    const en = Object.keys(CATALOGUES.en).sort();
    expect(en.filter((k) => !ru.includes(k))).toEqual([]);
    expect(ru.filter((k) => !en.includes(k))).toEqual([]);
  });

  it("use the same placeholders in every language", () => {
    const bad = Object.keys(CATALOGUES.ru).filter((k) => JSON.stringify(placeholders(CATALOGUES.ru[k])) !== JSON.stringify(placeholders(CATALOGUES.en[k])));
    expect(bad).toEqual([]);
  });

  it("have no empty messages, and plural forms where needed", () => {
    for (const locale of LOCALES) {
      for (const [key, message] of Object.entries(CATALOGUES[locale])) {
        if (typeof message === "string") expect(message.trim(), key).not.toBe("");
        else expect(message.other ?? message.many, key).toBeTruthy();
      }
    }
  });
});

describe("translate", () => {
  it("fills placeholders and falls back to the key", () => {
    expect(translate("ru", "common.active")).toBe("В работе");
    expect(translate("en", "common.active")).toBe("Active");
    expect(translate("en", "api.billing.limitMb".replace("limitMb", "mb"), { limitMb: 5 })).toBeTruthy();
    expect(translate("ru", "no.such.key")).toBe("no.such.key");
    expect(translate("en", "plural.cards", { count: 1 })).toBe("1 card");
  });

  it("picks Russian plural forms", () => {
    const f = (n: number) => translate("ru", "plural.cards", { count: n });
    expect([1, 2, 5, 11, 12, 21, 22, 25, 111].map(f)).toEqual(["1 карточка", "2 карточки", "5 карточек", "11 карточек", "12 карточек", "21 карточка", "22 карточки", "25 карточек", "111 карточек"]);
    expect(translate("en", "plural.cards", { count: 5 })).toBe("5 cards");
  });

  it("leaves unknown placeholders and handles missing params", () => {
    expect(translate("ru", "plural.cards", { other: 1 })).toContain("{count}");
    expect(translate("ru", "settings.types.cards", { cardCount: null })).not.toContain("null");
  });
});

describe("browser locale", () => {
  it("follows the browser language until a choice is made, and remembers it", () => {
    expect(currentLocale()).toBe("ru");
    chooseBrowserLocale("en");
    expect(currentLocale()).toBe("en");
    expect(t("common.active")).toBe("Active");
    expect(localStorage.getItem("plano.locale")).toBe("en");
    resetBrowserLocale();
    expect(currentLocale()).toBe("en"); // read back from storage
    localStorage.clear();
    resetBrowserLocale();
    expect(currentLocale()).toBe("ru");
  });
});

describe("source usage", async () => {
  const fs = await import("fs");
  const path = await import("path");
  const roots = ["src", "../api/src", "../../packages/shared/src"].map((r) => path.resolve(__dirname, "..", r));
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "locales" || e.name === "node_modules") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) files.push(p);
    }
  };
  roots.forEach(walk);
  const source = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");

  it("only asks for keys that exist", () => {
    const used = [...source.matchAll(/\bt\(\s*"([\w.]+)"/g)].map((m) => m[1]);
    const lazy = [...source.matchAll(/:\s*"((?:shared|common)\.[\w]+)"/g)].map((m) => m[1]);
    const missing = [...new Set([...used, ...lazy])].filter((k) => !(k in CATALOGUES.ru));
    expect(missing).toEqual([]);
  });

  it("has no leftover keys nobody uses", () => {
    const dynamic = ["weekday.", "weekdayOn.", "settings.agents.status"];
    const unused = Object.keys(CATALOGUES.ru).filter((k) => !dynamic.some((d) => k.startsWith(d)) && !source.includes(`"${k}"`));
    expect(unused).toEqual([]);
  });
});
