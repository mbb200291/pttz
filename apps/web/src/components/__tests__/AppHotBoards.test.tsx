// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const searchBoards = vi.hoisted(() => vi.fn());

vi.mock("../../hooks/usePttSocket", () => ({
  usePttSocket: () => ({
    wsStatus: "connected",
    pttState: "ready",
    client: { searchBoards },
  }),
  useHotBoards: () => ({
    boards: [
      {
        name: "Gossiping",
        title: "◎[八卦] 測試熱門看板",
        onlineUsers: 4027,
        popularityLabel: "4027",
      },
    ],
    loading: false,
  }),
  useFavoriteBoards: () => ({ boards: [], loading: false }),
  useRecentBoards: () => ({ recent: [], addRecent: vi.fn() }),
  usePttSocketStore: (selector: (state: unknown) => unknown) => selector({
    credentials: { username: "pttzzz" },
  }),
}));

vi.mock("../../hooks/usePttActions", () => ({
  usePttActions: () => ({}),
}));

vi.mock("../LoginModal", () => ({ LoginModal: () => null }));

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  searchBoards.mockReset();
  searchBoards.mockResolvedValue({ ok: true, value: { kind: "boards", items: [] } });
});

afterEach(cleanup);

describe("App hot boards", () => {
  it("passes the implementation-layer online count to the home UI", async () => {
    const { default: App } = await import("../../App");
    render(<App />);

    expect(screen.getByText("Gossiping")).toBeTruthy();
    expect(screen.getByText("4,027 在線")).toBeTruthy();
  });

  it("searches the implementation layer by board-name prefix", async () => {
    searchBoards.mockResolvedValue({
      ok: true,
      value: {
        kind: "boards",
        items: [{ name: "Soft_Job", title: "軟體工作板" }],
      },
    });
    const { default: App } = await import("../../App");
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText(/輸入看板名稱/), {
      target: { value: "Soft" },
    });

    await waitFor(() => expect(searchBoards).toHaveBeenCalledWith({ prefix: "Soft" }));
    expect(await screen.findByText("Soft_Job")).toBeTruthy();
    expect(screen.getByText("軟體工作板")).toBeTruthy();
  });
});
