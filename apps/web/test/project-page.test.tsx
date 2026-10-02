import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectBoardPage from "@/app/projects/[id]/page";
import * as lib from "@/lib/api";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { billing, card, column, member, user } from "./fixtures";
import { nav } from "./nav";

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/board", () => ({
  Board: (p: { onOpenCard: (id: string) => void; onToggleSelect: (id: string) => void }) => (
    <div>
      board
      <button onClick={() => p.onOpenCard("c1")}>open</button>
      <button onClick={() => p.onToggleSelect("c1")}>sel</button>
    </div>
  ),
  BoardSkeleton: () => <div>skeleton</div>,
  ProjectFunnel: () => <div>funnel</div>,
}));
vi.mock("@/components/board-toolbar", () => ({ BoardToolbar: (p: { shown?: number }) => <div>toolbar {p.shown}</div> }));
vi.mock("@/components/bulk-bar", () => ({ BulkBar: (p: { ids: string[]; onClear: () => void }) => <button onClick={p.onClear}>bulk {p.ids.length}</button> }));
vi.mock("@/components/card-modal", () => ({ CardModal: (p: { cardId: string; onClose: (c: boolean) => void }) => <button onClick={() => p.onClose(true)}>modal {p.cardId}</button> }));
vi.mock("@/components/cards-calendar", () => ({ CardsCalendar: () => <div>calendar-view</div> }));
vi.mock("@/components/gantt-chart", () => ({ GanttChart: (p: { hasGantt: boolean | null }) => <div>gantt-view {String(p.hasGantt)}</div> }));
vi.mock("@/components/cards-views", () => ({
  CardsList: () => <div>list-view</div>,
  CardsTable: (p: { onSelectAll: (ids: string[], on: boolean) => void }) => (
    <div>
      table-view
      <button onClick={() => p.onSelectAll(["c1", "gone"], true)}>all</button>
    </div>
  ),
}));
vi.mock("@/components/project-overview", () => ({ ProjectOverview: () => <div>overview-view</div> }));

const project = { id: "p1", title: "Сайт", status: "ON_HOLD" } as never;
function setup(view?: string, canGantt = true) {
  nav.search = view ? `view=${view}` : "";
  vi.spyOn(api, "me").mockResolvedValue(user());
  vi.spyOn(api, "project").mockResolvedValue(project);
  vi.spyOn(api, "projectBoard").mockResolvedValue({ id: "b1", columns: [column({ cards: [card()] })] } as never);
  vi.spyOn(api, "billing").mockResolvedValue(billing({ plan: { ...billing().plan, features: canGantt ? ["gantt"] : [] } }));
  vi.spyOn(api, "users").mockResolvedValue([user(), member({ isActive: false })]);
}

describe("project page", () => {
  it("renders the board, opens a card and reloads on close", async () => {
    setup();
    render(<ProjectBoardPage params={{ id: "p1" }} />);
    expect(await screen.findByText("Сайт")).toBeInTheDocument();
    expect(screen.getByText("На паузе")).toBeInTheDocument();
    expect(await screen.findByText("board")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Настройки проекта" })).toHaveAttribute("href", "/projects/p1/settings");
    await userEvent.click(screen.getByText("open"));
    expect(nav.router.replace).toHaveBeenCalled();
    await userEvent.click(screen.getByText("sel"));
    expect(screen.getByText("bulk 1")).toBeInTheDocument();
    await userEvent.click(screen.getByText("bulk 1"));
    expect(screen.queryByText("bulk 1")).toBeNull();
  });

  it.each([
    ["table", "table-view"],
    ["list", "list-view"],
    ["calendar", "calendar-view"],
    ["gantt", "gantt-view true"],
    ["overview", "overview-view"],
  ])("shows the %s view", async (view, text) => {
    setup(view);
    render(<ProjectBoardPage params={{ id: "p1" }} />);
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it("selects many cards in the table", async () => {
    setup("table");
    render(<ProjectBoardPage params={{ id: "p1" }} />);
    await userEvent.click(await screen.findByText("all"));
    expect(await screen.findByText("bulk 2")).toBeInTheDocument();
  });

  it("marks gantt as unavailable on a plan without it", async () => {
    setup("gantt", false);
    render(<ProjectBoardPage params={{ id: "p1" }} />);
    expect(await screen.findByText("gantt-view false")).toBeInTheDocument();
  });

  it("shows a load error and exports CSV with error toast", async () => {
    setup();
    vi.spyOn(api, "projectBoard").mockRejectedValue(new Error("сбой"));
    vi.spyOn(lib, "downloadProjectCsv").mockRejectedValue(new Error("нет доступа"));
    const seen: string[] = [];
    const { onToast } = await import("@/lib/toast");
    onToast((t) => seen.push(t.message));
    render(<ProjectBoardPage params={{ id: "p1" }} />);
    expect(await screen.findByText(/Не удалось загрузить доску: сбой/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Выгрузить карточки в CSV" }));
    await waitFor(() => expect(seen).toContain("нет доступа"));
    void act; void toast;
  });

  it("falls back when billing and users fail", async () => {
    setup("gantt");
    vi.spyOn(api, "billing").mockRejectedValue(new Error("x"));
    vi.spyOn(api, "users").mockRejectedValue(new Error("x"));
    vi.spyOn(api, "project").mockRejectedValue(new Error("x"));
    render(<ProjectBoardPage params={{ id: "p1" }} />);
    expect(await screen.findByText("gantt-view false")).toBeInTheDocument();
    expect(screen.getByText("…")).toBeInTheDocument();
  });
});
