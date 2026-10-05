import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { api, setToken } from "@/lib/api";
import { resetBrowserLocale } from "@plano/shared";
import { afterEach, beforeEach, vi } from "vitest";

// Components talk to the API only through lib/api; tests spy on its methods.
// Anything not stubbed would hit fetch, which fails loudly instead.
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    throw new Error(`Unexpected request in a test: ${url}`);
  }));
  localStorage.clear();
  resetBrowserLocale(); // the UI language follows the (Russian) browser unless a test picks one
  setToken(null); // drops every per-account cache between tests
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// jsdom lacks these.
window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
// jsdom has no PointerEvent; a MouseEvent carries the coordinates the code reads.
window.PointerEvent ??= MouseEvent as never;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver ??= ResizeObserverStub as never;

// next/navigation without a Next runtime: tests steer it through `nav`.
import { nav } from "./nav";
vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  usePathname: () => nav.path,
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => nav.params,
}));
beforeEach(() => nav.reset());

// The suite reads Russian texts: pretend the browser is Russian.
Object.defineProperty(window.navigator, "language", { value: "ru-RU", configurable: true });
