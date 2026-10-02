import { vi } from "vitest";

// State behind the mocked next/navigation.
export const nav = {
  path: "/",
  search: "",
  params: {} as Record<string, string>,
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
  reset() {
    this.path = "/";
    this.search = "";
    this.params = {};
    Object.values(this.router).forEach((fn) => fn.mockReset());
  },
};
