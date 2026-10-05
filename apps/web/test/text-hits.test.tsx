import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { api } from "@/lib/api";
import { useFilters } from "@/lib/use-filters";
import { useTextHits } from "@/lib/use-text-hits";

describe("text search on the server", () => {
  it("asks after a pause, keeps the answer for its own text only, and clears with the text", async () => {
    const match = vi.spyOn(api, "matchCards").mockImplementation((async (q: string) => ({ ids: q === "договор" ? ["a", "b"] : ["z"] })) as never);
    const { result, rerender } = renderHook(({ q }) => useTextHits(q, "p1"), { initialProps: { q: "" } });
    expect(result.current).toBeNull();
    expect(match).not.toHaveBeenCalled();

    rerender({ q: "  договор " });
    expect(result.current).toBeNull(); // nothing yet
    await waitFor(() => expect(result.current).toEqual(new Set(["a", "b"])));
    expect(match).toHaveBeenCalledTimes(1);
    expect(match).toHaveBeenCalledWith("договор", "p1");

    rerender({ q: "акт" });
    expect(result.current).toBeNull(); // the old answer is not used for the new text
    await waitFor(() => expect(result.current).toEqual(new Set(["z"])));
    rerender({ q: "" });
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("ignores an answer that arrives late, and a failed request", async () => {
    let release: (v: { ids: string[] }) => void = () => {};
    vi.spyOn(api, "matchCards").mockImplementationOnce((() => new Promise((r) => (release = r))) as never).mockRejectedValue(new Error("x"));
    const { result, rerender } = renderHook(({ q }) => useTextHits(q), { initialProps: { q: "один" } });
    await waitFor(() => expect(release).not.toBe(undefined));
    await new Promise((r) => setTimeout(r, 300));
    rerender({ q: "два" });
    await act(async () => release({ ids: ["old"] }));
    expect(result.current).toBeNull();
    await new Promise((r) => setTimeout(r, 300));
    expect(result.current).toBeNull(); // the second request failed: titles and keys still filter
  });

  it("gives the filters the server's answer without storing it", async () => {
    vi.spyOn(api, "matchCards").mockResolvedValue({ ids: ["a"] });
    const { result } = renderHook(() => useFilters("plano.filters.test", "p1"));
    act(() => result.current[1]({ ...result.current[0], q: "бриф" }));
    await waitFor(() => expect(result.current[2].hits).toEqual(new Set(["a"])));
    expect(JSON.parse(localStorage.getItem("plano.filters.test")!)).toEqual(expect.objectContaining({ q: "бриф" }));
    expect(localStorage.getItem("plano.filters.test")).not.toContain("hits");
  });
});
