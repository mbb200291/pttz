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
