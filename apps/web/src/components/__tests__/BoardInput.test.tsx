/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { BoardInput } from "../BoardInput";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BoardInput", () => {
  it("leaves search with Escape without selecting a board", () => {
    const enter = vi.fn();
    render(<BoardInput pttState="ready" wsStatus="connected" onEnter={enter} favoriteBoards={[]} popularBoards={[{ name: "Test" }]} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "Tes" } });
    fireEvent.keyDown(input, { key: "Escape", isComposing: true });
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(document.activeElement?.hasAttribute("data-navigation-item")).toBe(false);
    expect(input.value).toBe("Tes");
    expect(enter).not.toHaveBeenCalled();
  });
  it("focuses board input with s from cards or the page without submitting", () => {
    const enter = vi.fn();
    render(<BoardInput pttState="ready" wsStatus="connected" onEnter={enter} favoriteBoards={[]} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.keyDown(document.activeElement!, { key: "s" });
    expect(document.activeElement).toBe(input);
    input.blur();
    fireEvent.keyDown(document.body, { key: "s" });
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("");
    expect(enter).not.toHaveBeenCalled();
  });
  it("does not handle s while composing, using modifiers, or a dialog is open", () => {
    render(<BoardInput pttState="ready" wsStatus="connected" onEnter={() => {}} favoriteBoards={[]} />);
    const card = document.activeElement!;
    for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { isComposing: true }]) {
      fireEvent.keyDown(card, { key: "s", ...modifiers });
      expect(document.activeElement).toBe(card);
    }
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog"); document.body.append(dialog);
    try {
      fireEvent.keyDown(card, { key: "s" });
      expect(document.activeElement).toBe(card);
    } finally { dialog.remove(); }
  });
  it("does not autofocus a background card while a sibling dialog is open", () => {
    const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog"); document.body.append(dialog);
    try {
      render(<BoardInput pttState="ready" wsStatus="connected" onEnter={() => {}} favoriteBoards={[]} popularBoards={[{ name: "One" }]} />);
      expect(document.activeElement).toBe(document.body);
    } finally { dialog.remove(); }
  });
  it("offers logout only for a ready session without entering a board", () => {
    const logout = vi.fn(), open = vi.fn();
    const { rerender } = render(<BoardInput pttState="ready" wsStatus="connected" onEnter={open} onLogout={logout} favoriteBoards={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "登出" }));
    expect(logout).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
    rerender(<BoardInput pttState="closed" wsStatus="closed" onEnter={open} onLogout={logout} favoriteBoards={[]} />);
    expect(screen.queryByRole("button", { name: "登出" })).toBeNull();
    rerender(<BoardInput pttState="ready" wsStatus="connected" onEnter={open} favoriteBoards={[]} />);
    expect(screen.queryByRole("button", { name: "登出" })).toBeNull();
  });
  it.each(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"])("does not select boards or consume %s", (key) => {
    const open = vi.fn();
    const { unmount } = render(<BoardInput pttState="ready" wsStatus="connected" onEnter={open} favoriteBoards={[]}
      popularBoards={[{ name: "One" }, { name: "Two" }]} />);
    const first = screen.getByRole("button", { name: "One" });
    (document.activeElement as HTMLElement).blur();
    expect(fireEvent.keyDown(document.body, { key })).toBe(true);
    expect(document.activeElement).toBe(document.body);
    expect(open).not.toHaveBeenCalled();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(document.activeElement).toBe(document.body);
    unmount();
    expect(fireEvent.keyDown(document.body, { key })).toBe(true);
  });
  it("does not start body navigation during a dialog, selection, modifiers, composition or held key", () => {
    render(<BoardInput pttState="ready" wsStatus="connected" onEnter={() => {}} favoriteBoards={[]} popularBoards={[{ name: "One" }]} />);
    (document.activeElement as HTMLElement).blur();
    for (const extra of [{ repeat: true }, { isComposing: true }, { altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) {
      expect(fireEvent.keyDown(document.body, { key: "ArrowRight", ...extra })).toBe(true);
    }
    const selection = window.getSelection()!;
    selection.selectAllChildren(screen.getByRole("button", { name: "One" }));
    expect(fireEvent.keyDown(document.body, { key: "ArrowRight" })).toBe(true);
    selection.removeAllRanges();
    const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog"); document.body.append(dialog);
    expect(fireEvent.keyDown(document.body, { key: "ArrowRight" })).toBe(true);
    dialog.remove();
    expect(document.activeElement).toBe(document.body);
  });
  it("keeps native Enter activation without auto-selecting recent boards", async () => {
    const open = vi.fn();
    render(<BoardInput pttState="ready" wsStatus="connected" onEnter={open} favoriteBoards={[]}
      recentBoards={["Recent"]} popularBoards={[{ name: "Test" }]} />);
    const recent = screen.getByRole("button", { name: "Recent" });
    expect(document.activeElement).toBe(document.body);
    recent.focus();
    fireEvent.keyDown(recent, { key: "ArrowDown" });
    expect(document.activeElement).toBe(recent);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    await (await import("@testing-library/user-event")).default.keyboard("{Enter}");
    expect(open).toHaveBeenCalledWith("Recent");
  });
  it("preserves search focus when results update and ignores its arrow keys", () => {
    const open = vi.fn();
    const { rerender } = render(<BoardInput pttState="ready" wsStatus="connected" onEnter={open} favoriteBoards={[]}
      popularBoards={[{ name: "Test" }]} />);
    const input = screen.getByRole("textbox");
    input.focus();
    rerender(<BoardInput pttState="ready" wsStatus="connected" onEnter={open} favoriteBoards={[]}
      popularBoards={[{ name: "Test" }, { name: "Stock" }]} />);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(document.activeElement).toBe(input);
    expect(open).not.toHaveBeenCalled();
  });
  it("does not move card focus with horizontal arrows", () => {
    const open = vi.fn();
    render(<BoardInput pttState="ready" wsStatus="connected" onEnter={open} favoriteBoards={[]}
      popularBoards={[{ name: "Test", zh: "測試" }, { name: "Stock", zh: "股市" }]} />);
    const first = screen.getByRole("button", { name: "Test" });

    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(first);
    expect(open).not.toHaveBeenCalled();
  });
  it("does not use grid geometry to move keyboard focus", () => {
    const open = vi.fn();
    render(<BoardInput pttState="ready" wsStatus="connected" onEnter={open} favoriteBoards={[]}
      popularBoards={["One", "Two", "Three", "Four"].map((name) => ({ name }))} />);
    const buttons = ["One", "Two", "Three", "Four"].map((name) => screen.getByRole("button", { name }));
    buttons.forEach((button, index) => {
      vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
        x: (index % 2) * 250, y: Math.floor(index / 2) * 100,
        left: (index % 2) * 250, right: (index % 2) * 250 + 100,
        top: Math.floor(index / 2) * 100, bottom: Math.floor(index / 2) * 100 + 40,
        width: 100, height: 40, toJSON: () => ({}),
      });
    });
    buttons[0].focus();
    fireEvent.keyDown(buttons[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(buttons[0]);
    fireEvent.keyDown(buttons[1], { key: "ArrowDown" });
    expect(document.activeElement).toBe(buttons[0]);
    fireEvent.keyDown(buttons[3], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(buttons[0]);
    fireEvent.keyDown(buttons[2], { key: "ArrowUp" });
    expect(document.activeElement).toBe(buttons[0]);
    expect(open).not.toHaveBeenCalled();
  });
  it("uses the design-token home surface and product copy", () => {
    const html = renderToStaticMarkup(
      <BoardInput
        pttState="ready"
        wsStatus="connected"
        onEnter={() => {}}
      />,
    );

    expect(html).toContain("PTTZ");
    expect(html).toContain("計畫");
    expect(html).toContain("var(--bg)");
    expect(html).toContain("var(--surface)");
    expect(html).toContain("常用看板");
  });

  it("renders live popular board data when provided", () => {
    const html = renderToStaticMarkup(
      <BoardInput
        pttState="ready"
        wsStatus="connected"
        onEnter={() => {}}
        popularBoards={[
          { name: "LiveBoard", zh: "實際熱門", online: "123" },
        ]}
      />,
    );

    expect(html).toContain("LiveBoard");
    expect(html).toContain("實際熱門");
    expect(html).toContain("123 在線");
    expect(html).not.toContain("28,420");
  });

  it("renders favorite boards as a dedicated home section", () => {
    const html = renderToStaticMarkup(
      <BoardInput
        pttState="ready"
        wsStatus="connected"
        onEnter={() => {}}
        currentUser="pttzzz"
        favoriteBoards={["Stock", "C_Chat"]}
        popularBoards={[
          { name: "Stock", zh: "股票板", online: "123" },
          { name: "C_Chat", zh: "西恰", online: "456" },
        ]}
      />,
    );

    expect(html).toContain("我的最愛");
    expect(html).toContain("pttzzz · 2 個關注看板");
    expect(html).toContain("Stock");
    expect(html).toContain("C_Chat");
    expect(html).toContain("456 在線");
  });

  it("collapses long favorite board lists behind an expand button", () => {
    const favoriteBoards = Array.from({ length: 14 }, (_, index) => `Fav${index + 1}`);

    render(
      <BoardInput
        pttState="ready"
        wsStatus="connected"
        onEnter={() => {}}
        currentUser="pttzzz"
        favoriteBoards={favoriteBoards}
      />,
    );

    expect(screen.getByText("Fav1")).toBeTruthy();
    expect(screen.getByText("Fav6")).toBeTruthy();
    expect(screen.queryByText("Fav7")).toBeNull();
    expect(screen.getByText(/展開全部 14 個最愛/)).toBeTruthy();

    fireEvent.click(screen.getByText(/展開全部 14 個最愛/));

    expect(screen.getByText("Fav7")).toBeTruthy();
    expect(screen.getByText("收起")).toBeTruthy();
  });

  it("does not replace a loaded empty favorite list with fallback boards", () => {
    const html = renderToStaticMarkup(
      <BoardInput
        pttState="ready"
        wsStatus="connected"
        onEnter={() => {}}
        currentUser="pttzzz"
        favoriteBoards={[]}
        favoriteBoardsLoading={false}
      />,
    );

    expect(html).not.toContain("Tech_Job");
    expect(html).not.toContain("Lifeismoney");
    expect(html).not.toContain("我的最愛");
  });

  it("keeps fallback favorite boards only when no live favorite result is available", () => {
    const html = renderToStaticMarkup(
      <BoardInput
        pttState="ready"
        wsStatus="connected"
        onEnter={() => {}}
        currentUser="pttzzz"
      />,
    );

    expect(html).toContain("Tech_Job");
    expect(html).toContain("Lifeismoney");
  });

  it("updates the favorite section when a board star is toggled", () => {
    render(
      <BoardInput
        pttState="ready"
        wsStatus="connected"
        onEnter={() => {}}
        currentUser="pttzzz"
        favoriteBoards={["Stock"]}
        popularBoards={[
          { name: "Gossiping", zh: "八卦" },
          { name: "Stock", zh: "股票板" },
        ]}
      />,
    );

    fireEvent.click(screen.getByTitle("加入最愛"));

    expect(screen.getByText("pttzzz · 2 個關注看板")).toBeTruthy();
  });

  it("does not show fake online counts when live data is unavailable", () => {
    const html = renderToStaticMarkup(
      <BoardInput
        pttState="ready"
        wsStatus="connected"
        onEnter={() => {}}
      />,
    );

    expect(html).not.toContain("28,420");
    expect(html).not.toContain("12,880");
    expect(html).toContain("即時人數待同步");
  });

  it("updates the collapsed board count when the grid width changes", () => {
    let resize: (width: number) => void = () => {};
    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        resize = (width) => callback([
          { contentRect: { width } } as ResizeObserverEntry,
        ], this as unknown as ResizeObserver);
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);

    render(
      <BoardInput
        pttState="ready"
        wsStatus="connected"
        onEnter={() => {}}
        popularBoards={Array.from({ length: 10 }, (_, index) => ({
          name: `Board${index + 1}`,
        }))}
      />,
    );

    act(() => resize(1040));
    expect(screen.getByText("Board8")).toBeTruthy();
    expect(screen.queryByText("Board9")).toBeNull();

    act(() => resize(540));
    expect(screen.getByText("Board4")).toBeTruthy();
    expect(screen.queryByText("Board5")).toBeNull();
  });

  it("searches PTT boards outside the loaded hot-board list", async () => {
    const searchBoards = vi.fn(async () => [
      { name: "ColdBoard", zh: "不在熱門清單內" },
    ]);

    render(
      <BoardInput
        pttState="ready"
        wsStatus="connected"
        onEnter={() => {}}
        popularBoards={[{ name: "Gossiping", zh: "八卦" }]}
        onSearchBoards={searchBoards}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/輸入看板名稱/), {
      target: { value: "Cold" },
    });

    await waitFor(() => expect(searchBoards).toHaveBeenCalledWith("Cold"));
    expect(await screen.findByText("ColdBoard")).toBeTruthy();
    expect(screen.getByText("不在熱門清單內")).toBeTruthy();
  });
});
