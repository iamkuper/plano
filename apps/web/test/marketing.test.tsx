import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { chooseBrowserLocale, currentLocale } from "@plano/shared";
import { Landing, landingMetadata } from "@/components/marketing/landing";
import { ApiDocsPage, apiDocsMetadata } from "@/components/marketing/api-docs";
import { PricingPage, pricingMetadata } from "@/components/marketing/pricing-page";
import { ProductPreview } from "@/components/marketing/product-preview";
import { PricingTable } from "@/components/marketing/pricing-table";
import { LocaleGate } from "@/components/locale-gate";
import { offerPrice, priceLabel, sitePath, appPath } from "@/lib/marketing";
import AppSitemap from "@/app/sitemap";
import { plans } from "./fixtures";

vi.mock("@/lib/seo", async (orig) => ({ ...(await orig<typeof import("@/lib/seo")>()), fetchPlans: vi.fn(async () => ({ plans, trialDays: 14 })) }));

const CYRILLIC = /[А-Яа-яЁё]/;

// The landing is an async server component: await it, then draw what it returned.
async function landing(locale: "ru" | "en") {
  return render(await Landing({ locale }));
}

describe("public landing", () => {
  it("is Russian at the root and links within the Russian site", async () => {
    await landing("ru");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Задачи команды в одном спокойном месте");
    expect(screen.getAllByRole("link", { name: "Тарифы" })[0]).toHaveAttribute("href", "/pricing");
    expect(screen.getAllByRole("link", { name: /Попробовать 14 дней бесплатно/ })[0]).toHaveAttribute("href", "/register");
    expect(screen.getByRole("link", { name: "en" })).toHaveAttribute("href", "/en");
    expect(document.querySelector('[lang="ru"]')).not.toBeNull();
  });

  it("is English under /en, with English links and a way back to Russian", async () => {
    await landing("en");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your team's tasks in one calm place");
    expect(screen.getAllByRole("link", { name: "Pricing" })[0]).toHaveAttribute("href", "/en/pricing");
    expect(screen.getAllByRole("link", { name: /Try free for 14 days/ })[0]).toHaveAttribute("href", "/register?lang=en");
    expect(screen.getByRole("link", { name: "ru" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Features" })).toHaveAttribute("href", "/en#features");
    expect(screen.getByText("Documents (in Russian)")).toBeInTheDocument();
    expect(document.querySelector('[lang="en"]')).not.toBeNull();
  });

  it("has no Russian left in the English page body, including the demo board", async () => {
    await landing("en");
    const body = document.querySelector("main")!.innerText ?? document.querySelector("main")!.textContent ?? "";
    const left = body.split(/\n|(?<=[a-z.!?])(?=[А-Я])/).filter((l) => CYRILLIC.test(l));
    expect(left).toEqual([]);
    expect(within(document.querySelector("main")!).getByText("Client brief and requirements")).toBeInTheDocument();
    expect(document.querySelector("main")!.textContent).not.toMatch(CYRILLIC);
  });

  it("presents the AI agents as a Business feature, in the features and in the FAQ", async () => {
    await landing("en");
    const main = document.querySelector("main")!;
    expect(within(main).getByRole("heading", { name: "AI agents on your team" })).toBeInTheDocument();
    expect(within(main).getByText("On the Business plan")).toBeInTheDocument();
    expect(within(main).getByText("What are AI agents and how much do they cost?")).toBeInTheDocument();
    expect(main.textContent).toContain("AI agents on your own key"); // the Business plan card
    expect(main.textContent).toContain("Deadlines, dependencies, control and AI agents");
    document.body.innerHTML = "";
    await landing("ru");
    const ru = document.querySelector("main")!;
    expect(within(ru).getByRole("heading", { name: "ИИ-агенты в команде" })).toBeInTheDocument();
    expect(ru.textContent).toContain("ИИ-агенты на вашем ключе");
    expect(ru.textContent).toContain("Что такое ИИ-агенты и сколько они стоят?");
  });

  it("describes itself to search engines in both languages", async () => {
    const ru = landingMetadata("ru");
    const en = landingMetadata("en");
    expect(en.alternates).toMatchObject({ canonical: "/en", languages: { ru: "/", en: "/en", "x-default": "/" } });
    expect(ru.alternates?.canonical).toBe("/");
    expect(en.openGraph).toMatchObject({ locale: "en_US" });
    expect(ru.openGraph).toMatchObject({ locale: "ru_RU" });
    expect((en.title as { absolute: string }).absolute).toBe("Plano — kanban and task tracker for teams and agencies");
    expect(String(en.description)).toContain("kanban and task tracker");

    const { container } = await landing("en");
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
    const app = ld.find((x: { "@type": string }) => x["@type"] === "SoftwareApplication");
    expect(app.inLanguage).toBe("en");
    expect(app.offers.map((o: { price: string; priceCurrency: string }) => [o.price, o.priceCurrency])).toEqual([["0.00", "USD"], ["14.99", "USD"], ["29.99", "USD"]]);
    const faq = ld.find((x: { "@type": string }) => x["@type"] === "FAQPage");
    expect(faq.mainEntity.at(-1).name).toBe("What are AI agents and how much do they cost?");
  });

  it("lists both languages in the sitemap", () => {
    const urls = AppSitemap().map((e) => e.url);
    expect(urls).toEqual(expect.arrayContaining([expect.stringMatching(/\/en$/), expect.stringMatching(/\/en\/pricing$/), expect.stringMatching(/\/pricing$/), expect.stringMatching(/\/docs\/api$/), expect.stringMatching(/\/en\/docs\/api$/)]));
  });
});

describe("pricing", () => {
  it("quotes dollars on the English page: Pro 14.99, Business 29.99, a year is ten months", async () => {
    render(await PricingPage({ locale: "en" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Plano plans");
    const text = (name: string) => screen.getByRole("heading", { level: 3, name }).closest("div")!.parentElement!.textContent!;
    expect(text("Pro")).toContain("$14.99");
    expect(text("Business")).toContain("$29.99");
    expect(text("Free")).toContain("$0");
    expect(document.body.textContent).not.toContain("₽");
    expect(text("Business")).toContain("AI agents on your own key");
    expect(text("Pro")).not.toContain("AI agents");
    expect(screen.getByText(/AI agents \(Business plan\) run on your own provider key/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Yearly — 2 months free" }));
    expect(text("Pro")).toContain("$12.49");
    expect(text("Business")).toContain("$24.99");
    expect(screen.getAllByRole("link", { name: "Try free for 14 days" })[0]).toHaveAttribute("href", "/register?lang=en");
  });

  it("keeps roubles on the Russian page", async () => {
    render(await PricingPage({ locale: "ru" }));
    expect(document.body.textContent).toContain("490");
    expect(document.body.textContent).toContain("₽");
    expect(document.body.textContent).not.toContain("$");
    expect(document.body.textContent).toContain("ИИ-агенты на вашем ключе");
    expect(pricingMetadata("en").alternates).toMatchObject({ canonical: "/en/pricing" });
  });

  it("formats prices for each currency", () => {
    const rub = (k: number) => `${k / 100} ₽`;
    expect(priceLabel("en", { id: "PRO", priceKopecks: 49000 }, "MONTH", rub)).toBe("$14.99");
    expect(priceLabel("en", { id: "BUSINESS", priceKopecks: 99000 }, "YEAR", rub)).toBe("$24.99");
    expect(priceLabel("en", { id: "FREE", priceKopecks: 0 }, "MONTH", rub)).toBe("$0");
    expect(priceLabel("en", { id: "TEAM", priceKopecks: 100 }, "MONTH", rub)).toBe("$0"); // unknown plan
    expect(priceLabel("ru", { id: "PRO", priceKopecks: 49000 }, "MONTH", rub)).toBe("490 ₽");
    expect(priceLabel("ru", { id: "FREE", priceKopecks: 0 }, "MONTH", rub)).toBe("0 ₽");
    expect(offerPrice("en", { id: "PRO", priceKopecks: 49000 })).toEqual({ price: "14.99", priceCurrency: "USD" });
    expect(offerPrice("ru", { id: "PRO", priceKopecks: 49000 })).toEqual({ price: "490.00", priceCurrency: "RUB" });
    expect(sitePath("en", "/pricing")).toBe("/en/pricing");
    expect(sitePath("ru")).toBe("/");
    expect(appPath("en", "/login")).toBe("/login?lang=en");
    expect(appPath("ru", "/login")).toBe("/login");
  });

  it("loads the plans itself when none were rendered on the server", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ plans, trialDays: 7 }))));
    render(<PricingTable locale="en" />);
    expect(await screen.findByText("$29.99")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Try free for 7 days" }).length).toBeGreaterThan(0);
  });
});

describe("the demo board follows the page's language, not the browser's", () => {
  it("shows English cards in an English page even when the browser prefers Russian, and clears the pin afterwards", async () => {
    chooseBrowserLocale("ru");
    const { unmount } = render(<ProductPreview locale="en" />);
    expect(screen.getAllByText("Client brief and requirements").length).toBeGreaterThan(0);
    expect(currentLocale()).toBe("en"); // pinned while the demo is on screen
    unmount();
    expect(currentLocale()).toBe("ru");
  });
});

describe("links from the public site carry the language", () => {
  it("?lang=en switches the sign-up page to English", async () => {
    window.history.pushState({}, "", "/register?lang=en");
    render(<LocaleGate><p>{currentLocale()}</p></LocaleGate>);
    await waitFor(() => expect(currentLocale()).toBe("en"));
    window.history.pushState({}, "", "/");
  });
});

describe("API documentation", () => {
  it("is Russian at /docs/api: access, reference, webhooks, calendar", () => {
    render(<ApiDocsPage locale="ru" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("API Plano");
    for (const h of ["Доступ", "Быстрый старт", "Основные методы", "Вебхуки", "Календарь задач"]) expect(screen.getByRole("heading", { level: 2, name: h })).toBeInTheDocument();
    expect(screen.getByText("/cards/{id}/move")).toBeInTheDocument();
    expect(screen.getByText("card.moved")).toBeInTheDocument();
    expect(screen.getAllByLabelText("curl")[0]).toHaveTextContent("Authorization: Bearer <token>");
    expect(screen.getByRole("link", { name: "en" })).toHaveAttribute("href", "/en/docs/api");
  });

  it("is English at /en/docs/api, with no Russian in the text", () => {
    render(<ApiDocsPage locale="en" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Plano API");
    expect(screen.getByRole("link", { name: "ru" })).toHaveAttribute("href", "/docs/api");
    const main = document.querySelector("main")!;
    expect(main.textContent).not.toMatch(CYRILLIC);
    expect(apiDocsMetadata("en").alternates?.languages).toMatchObject({ ru: "/docs/api", en: "/en/docs/api" });
    expect(apiDocsMetadata("ru").alternates?.canonical).toBe("/docs/api");
  });
});
