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
  it("opens contextual help with h and blocks background shortcuts until closed", async () => {
    const { default: App } = await import("../../App");
    render(<App />);
    fireEvent.keyDown(document.body, { key: "h" });
    expect(screen.getByRole("dialog", { name: "快捷鍵" })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "s" });
    expect(document.activeElement).not.toBe(screen.getByRole("textbox"));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(document.body, { key: "s" });
    expect(document.activeElement).toBe(screen.getByRole("textbox"));
  });
  it("prevents Tab traversal throughout the app without blocking browser tab shortcuts", async () => {
    const { default: App } = await import("../../App");
    const { unmount } = render(<App />);
    const input = screen.getByRole("textbox");
    input.focus();
    for (const shiftKey of [false, true]) {
      expect(fireEvent.keyDown(input, { key: "Tab", shiftKey })).toBe(false);
      expect(document.activeElement).toBe(input);
      expect(fireEvent.keyDown(document.body, { key: "Tab", shiftKey })).toBe(false);
    }
    expect(fireEvent.keyDown(input, { key: "Tab", ctrlKey: true })).toBe(true);
    unmount();
    expect(fireEvent.keyDown(document.body, { key: "Tab" })).toBe(true);
  });
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
