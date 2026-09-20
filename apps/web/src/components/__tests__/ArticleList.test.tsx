// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("ArticleList", () => {
  it.each(["s", "/"])("focuses search with %s and exits search without selecting articles", async (key) => {
    const { ArticleList } = await import("../ArticleList");
    const open = vi.fn();
    const { container } = render(<ArticleList boardName="Test" onBack={() => {}} onSelectArticle={open} onSelectArticleByAid={open}
      mockArticles={[{ index: 1, title: "第一篇", author: "a", date: "9/14", pushCount: "", mark: "" }]} />);
    const row = container.querySelector<HTMLElement>('[data-article-index="1"]')!;
    const input = screen.getByPlaceholderText(/搜尋標題.*#AID/) as HTMLInputElement;
    row.focus();
    fireEvent.keyDown(row, { key, ctrlKey: true });
    expect(document.activeElement).toBe(row);
    fireEvent.keyDown(row, { key });
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "保留搜尋" } });
    fireEvent.keyDown(input, { key: "Escape", isComposing: true });
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(document.activeElement?.hasAttribute("data-navigation-item")).toBe(false);
    expect(input.value).toBe("保留搜尋");
    expect(open).not.toHaveBeenCalled();
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key });
    expect(document.activeElement).toBe(input);
  });
  it.each(["(本文已被刪除) [alice]", "(已被刪除) [alice]"])("disables deleted rows: %s", async (title) => {
    const { ArticleList } = await import("../ArticleList");
    const select = vi.fn();
    const { container } = render(<ArticleList boardName="Test" onBack={() => {}} onSelectArticle={select} onSelectArticleByAid={() => {}}
      mockArticles={[{ index: 286, mark: "", pushCount: "", date: "9/13", author: "-", title }]} />);
    const row = container.querySelector('[data-article-index="286"]') as HTMLButtonElement;
    expect(row.disabled).toBe(true);
    fireEvent.click(row);
    expect(select).not.toHaveBeenCalled();
  });
  it("presents the article index before PTT's yearless month/day label", async () => {
    const { ArticleList } = await import("../ArticleList");
    const { container } = render(
      <ArticleList
        boardName="Test"
        onBack={() => {}}
        onSelectArticle={() => {}}
        onSelectArticleByAid={() => {}}
        mockArticles={[{
          index: 216,
          mark: "",
          pushCount: "",
          date: "9/06",
          author: "author",
          title: "發文測試",
        }]}
      />,
    );
    const row = container.querySelector('[data-article-index="216"]');
    expect(row).not.toBeNull();
    expect(row!.textContent!.indexOf("#216")).toBeLessThan(row!.textContent!.indexOf("9/06"));
  });
  it("offers an inline retry when loading older articles temporarily fails", async () => {
    const retry = vi.fn();
    const { ArticleList } = await import("../ArticleList");
    render(
      <ArticleList
        boardName="Test"
        onBack={() => {}}
        onSelectArticle={() => {}}
        onSelectArticleByAid={() => {}}
        mockArticles={[{
          index: 216,
          mark: "",
          pushCount: "",
          date: "9/06",
          author: "author",
          title: "發文測試",
        }]}
        mockError="文章列表尚未更新，請再試一次"
        onMockLoadMore={retry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "再試一次" }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it("does not restore article focus behind an open sibling dialog", async () => {
    const { ArticleList } = await import("../ArticleList");
    const { writeBoardAnchorCache } = await import("../../lib/ptt/viewCache");
    writeBoardAnchorCache("KeyboardDialog", { articleIndex: 1, viewportTop: 0, scrollY: 0 });
    const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog"); document.body.append(dialog);
    let restore: FrameRequestCallback = () => {};
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { restore = callback; return 1; });
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    try {
      render(<ArticleList boardName="KeyboardDialog" onBack={() => {}} onSelectArticle={() => {}} onSelectArticleByAid={() => {}}
        mockLoading={false} mockArticles={[{ index: 1, title: "First", author: "a", date: "9/8", pushCount: "1", mark: " " }]} />);
      act(() => restore(0));
      expect(document.activeElement).toBe(document.body);
    } finally { dialog.remove(); raf.mockRestore(); scroll.mockRestore(); }
  });
  it.each(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"])("uses fixed arrow behavior from body: %s", async (key) => {
    const { ArticleList } = await import("../ArticleList");
    const open = vi.fn(), back = vi.fn();
    const { container, unmount } = render(<ArticleList boardName="Keyboard" onBack={back} onSelectArticle={open} onSelectArticleByAid={() => {}}
      mockLoading={false} mockArticles={[
        { index: 2, title: "First", author: "a", date: "9/8", pushCount: "1", mark: " " },
        { index: 1, title: "Second", author: "b", date: "9/8", pushCount: "1", mark: " " },
      ]} />);
    (document.activeElement as HTMLElement).blur();
    expect(fireEvent.keyDown(document.body, { key })).toBe(key !== "ArrowLeft");
    const first = container.querySelector<HTMLElement>('[data-article-index="2"]')!;
    expect(document.activeElement).toBe(document.body);
    expect(open).not.toHaveBeenCalled(); expect(back).toHaveBeenCalledTimes(key === "ArrowLeft" ? 1 : 0);
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(open).not.toHaveBeenCalled();
    unmount(); expect(fireEvent.keyDown(document.body, { key })).toBe(true);
  });
  it("opens threshold with z from body or a row, but not input/modifiers/dialog/selection", async () => {
    const { ArticleList } = await import("../ArticleList");
    const { container } = render(<ArticleList boardName="Keyboard" onBack={() => {}} onSelectArticle={() => {}} onSelectArticleByAid={() => {}}
      mockLoading={false} mockArticles={[{ index: 1, title: "First", author: "a", date: "9/8", pushCount: "1", mark: " " }]} />);
    const row = container.querySelector<HTMLElement>('[data-article-index="1"]')!;
    const input = container.querySelector("input")!;
    input.focus(); fireEvent.keyDown(input, { key: "z" });
    for (const extra of [{ repeat: true }, { isComposing: true }, { altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) fireEvent.keyDown(row, { key: "z", ...extra });
    const selection = window.getSelection()!; selection.selectAllChildren(row);
    fireEvent.keyDown(row, { key: "z" }); selection.removeAllRanges();
    expect(screen.queryByRole("dialog")).toBeNull();
    row.focus(); expect(fireEvent.keyDown(row, { key: "z" })).toBe(false);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.keyDown(document.body, { key: "z" });
    fireEvent.keyDown(row, { key: "ArrowRight" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: "z" });
    expect(screen.getByRole("dialog", { name: "自訂推文門檻" })).toBeTruthy();
  });
  it("opens compose with Ctrl+P without intercepting search or modified shortcuts", async () => {
    const { ArticleList } = await import("../ArticleList");
    const compose = vi.fn();
    const { container } = render(<ArticleList boardName="Test" onBack={() => {}} onSelectArticle={() => {}}
      onSelectArticleByAid={() => {}} onCompose={compose} mockLoading={false} mockArticles={[
        { index: 1, title: "[請益] 第一篇", author: "b", date: "9/8", pushCount: "1", mark: " " },
      ]} />);
    const row = container.querySelector<HTMLElement>('[data-article-index="1"]')!;
    expect(fireEvent.keyDown(row, { key: "p", ctrlKey: true })).toBe(false);
    expect(compose).toHaveBeenCalledWith(["請益"]);
    compose.mockClear();
    for (const extra of [{ repeat: true }, { isComposing: true }, { altKey: true }, { shiftKey: true }, { metaKey: true }]) {
      fireEvent.keyDown(row, { key: "p", ctrlKey: true, ...extra });
    }
    fireEvent.keyDown(container.querySelector("input")!, { key: "p", ctrlKey: true });
    expect(compose).not.toHaveBeenCalled();
  });
  it("keeps arrows from selecting or opening rows while Left always returns", async () => {
    const { ArticleList } = await import("../ArticleList");
    const open = vi.fn();
    const back = vi.fn();
    const { container } = render(<ArticleList boardName="Test" onBack={back} onSelectArticle={open}
      onSelectArticleByAid={() => {}} mockLoading={false} mockArticles={[
        { index: 2, title: "第二篇", author: "a", date: "9/8", pushCount: "1", mark: " " },
        { index: 1, title: "第一篇", author: "b", date: "9/8", pushCount: "1", mark: " " },
      ]} />);
    const first = container.querySelector<HTMLButtonElement>('[data-article-index="2"]')!;
    const second = container.querySelector<HTMLButtonElement>('[data-article-index="1"]')!;
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(document.activeElement).toBe(first);
    expect(open).not.toHaveBeenCalled();
    fireEvent.keyDown(second, { key: "ArrowRight" });
    expect(open).not.toHaveBeenCalled();
    fireEvent.keyDown(second, { key: "ArrowLeft" });
    expect(back).toHaveBeenCalledOnce();
  });
  it("preloads more articles before the list bottom reaches the viewport", async () => {
    const mod = await import("../ArticleList");

    expect(mod.ARTICLE_LIST_PRELOAD_ROOT_MARGIN).toBe("0px 0px 720px 0px");
  });

  it("shows the board error instead of the generic connecting message", async () => {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: {
        protocol: "http:",
        host: "127.0.0.1:4173",
      },
    });

    const { ArticleList } = await import("../ArticleList");
    const html = renderToStaticMarkup(
      <ArticleList
        boardName="Gossiping"
        onBack={() => {}}
        onSelectArticle={() => {}}
        onSelectArticleByAid={() => {}}
        mockArticles={[]}
        mockLoading={false}
        mockError="目前畫面尚未就緒，暫時無法進入看板（state=unknown）"
      />,
    );

    expect(html).toContain("目前畫面尚未就緒");
    expect(html).not.toContain("正在連線至 PTT");
  });

  it("visually distinguishes fixed announcement articles", async () => {
    const { ArticleList } = await import("../ArticleList");
    const html = renderToStaticMarkup(
      <ArticleList
        boardName="Gossiping"
        onBack={() => {}}
        onSelectArticle={() => {}}
        onSelectArticleByAid={() => {}}
        mockArticles={[
          {
            index: 82158,
            mark: " ",
            pushCount: "14",
            date: "4/15",
            author: "longbow2",
            title: "[公告] 警察機關來信，請使用者明辨言論真實性",
            fixed: true,
          },
          {
            index: 782152,
            mark: " ",
            pushCount: "2",
            date: "4/23",
            author: "sushi11",
            title: "[問卦] 為什麼女生都看不起比他差的男生？",
          },
        ]}
        mockLoading={false}
      />,
    );

    expect(html).toContain('data-fixed-article="true"');
    expect(html).toContain("置頂");
    // New design uses CSS var accent-soft for pinned background instead of Tailwind
    expect(html).toContain("var(--accent-soft)");
  });

  it("shows article indexes in list rows", async () => {
    const { ArticleList } = await import("../ArticleList");
    const html = renderToStaticMarkup(
      <ArticleList
        boardName="Gossiping"
        onBack={() => {}}
        onSelectArticle={() => {}}
        onSelectArticleByAid={() => {}}
        mockArticles={[
          {
            index: 782152,
            mark: " ",
            pushCount: "2",
            date: "4/23",
            author: "sushi11",
            title: "[問卦] 為什麼女生都看不起比他差的男生？",
          },
        ]}
        mockLoading={false}
      />,
    );

    expect(html).toContain("#782152");
    expect(html).toContain("font-mono");
  });

  it("applies push filter label when initialFilter is a push filter", async () => {
    const { ArticleList } = await import("../ArticleList");
    const html = renderToStaticMarkup(
      <ArticleList
        boardName="Gossiping"
        initialFilter={{ type: "push", threshold: 100 }}
        onBack={() => {}}
        onSelectArticle={() => {}}
        onSelectArticleByAid={() => {}}
        mockArticles={[]}
        mockLoading={false}
      />,
    );

    expect(html).toContain("推噓");
    expect(html).toContain("爆文");
    expect(html).not.toContain(">看板<");
  });

  it("applies search filter label when initialFilter is a search filter", async () => {
    const { ArticleList } = await import("../ArticleList");
    const html = renderToStaticMarkup(
      <ArticleList
        boardName="Gossiping"
        initialFilter={{ type: "search", keywords: ["花生"] }}
        onBack={() => {}}
        onSelectArticle={() => {}}
        onSelectArticleByAid={() => {}}
        mockArticles={[]}
        mockLoading={false}
      />,
    );

    expect(html).toContain("系列《花生》");
    expect(html).toContain("篩選中");
    expect(html).toContain("關鍵字");
    expect(html).toContain("「花生」");
    expect(html).toContain("清除全部");
    expect(html).not.toContain(">看板<");
  });

  it("shows an active push filter chip in the filter toolbar", async () => {
    const { ArticleList } = await import("../ArticleList");
    const html = renderToStaticMarkup(
      <ArticleList
        boardName="Gossiping"
        initialFilter={{ type: "push", threshold: 50 }}
        onBack={() => {}}
        onSelectArticle={() => {}}
        onSelectArticleByAid={() => {}}
        mockArticles={[]}
        mockLoading={false}
      />,
    );

    expect(html).toContain("篩選中");
    expect(html).toContain("推噓");
    expect(html).toContain("≥50");
    expect(html).toContain("清除全部");
  });

  it("applies a custom push threshold from the filter popover", async () => {
    const { ArticleList } = await import("../ArticleList");
    render(
      <ArticleList
        boardName="Gossiping"
        onBack={() => {}}
        onSelectArticle={() => {}}
        onSelectArticleByAid={() => {}}
        mockArticles={[]}
        mockLoading={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /自訂/ }));
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "75" } });
    fireEvent.click(screen.getByRole("button", { name: "套用" }));

    expect(screen.getAllByText("推噓 ≥75").length).toBeGreaterThan(0);
    expect(screen.getByTitle("自訂推文門檻").textContent).toContain("≥75");

    fireEvent.click(screen.getByTitle("清除推噓篩選"));

    expect(screen.queryByText("推噓 ≥75")).toBeNull();
  });

  it("keeps an existing push filter when applying a keyword search", async () => {
    const { ArticleList } = await import("../ArticleList");
    render(
      <ArticleList
        boardName="Gossiping"
        initialFilter={{ type: "push", threshold: 30 }}
        onBack={() => {}}
        onSelectArticle={() => {}}
        onSelectArticleByAid={() => {}}
        mockArticles={[]}
        mockLoading={false}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/搜尋標題/), {
      target: { value: "花生" },
    });
    fireEvent.click(screen.getByRole("button", { name: "搜尋" }));

    expect(screen.getByText("「花生」")).toBeTruthy();
    expect(screen.getAllByText("推噓 ≥30").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTitle("清除關鍵字 花生"));

    expect(screen.queryByText("「花生」")).toBeNull();
    expect(screen.getAllByText("推噓 ≥30").length).toBeGreaterThan(0);
  });

  it("adds multiple keyword filters and clears the search input after each commit", async () => {
    const { ArticleList } = await import("../ArticleList");
    render(
      <ArticleList
        boardName="Baseball"
        onBack={() => {}}
        onSelectArticle={() => {}}
        onSelectArticleByAid={() => {}}
        mockArticles={[]}
        mockLoading={false}
      />,
    );

    const input = screen.getByPlaceholderText(/搜尋標題/) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "今日" } });
    fireEvent.click(screen.getByRole("button", { name: "搜尋" }));

    expect(input.value).toBe("");
    expect(screen.getByText("「今日」")).toBeTruthy();

    fireEvent.change(input, { target: { value: "郭泓志" } });
    fireEvent.click(screen.getByRole("button", { name: "搜尋" }));

    expect(input.value).toBe("");
    expect(screen.getByText("「今日」")).toBeTruthy();
    expect(screen.getByText("「郭泓志」")).toBeTruthy();

    fireEvent.click(screen.getByTitle("清除關鍵字 今日"));

    expect(screen.queryByText("「今日」")).toBeNull();
    expect(screen.getByText("「郭泓志」")).toBeTruthy();
  });

  it("shows no filter label when initialFilter is absent", async () => {
    const { ArticleList } = await import("../ArticleList");
    const html = renderToStaticMarkup(
      <ArticleList
        boardName="Gossiping"
        onBack={() => {}}
        onSelectArticle={() => {}}
        onSelectArticleByAid={() => {}}
        mockArticles={[]}
        mockLoading={false}
      />,
    );

    expect(html).toContain("看板");
    expect(html).not.toContain("推文數");
    expect(html).not.toContain("系列《");
  });

  it("uses design-token surfaces for the board shell and toolbar", async () => {
    const { ArticleList } = await import("../ArticleList");
    const html = renderToStaticMarkup(
      <ArticleList
        boardName="Gossiping"
        onBack={() => {}}
        onSelectArticle={() => {}}
        onSelectArticleByAid={() => {}}
        onCompose={() => {}}
        mockArticles={[]}
        mockLoading={false}
      />,
    );

    expect(html).toContain("var(--bg)");
    expect(html).toContain("var(--surface)");
    expect(html).toContain("var(--accent)");
    expect(html).toContain("發文");
  });

  it("passes categories observed from the current board articles to compose", async () => {
    const { ArticleList } = await import("../ArticleList");
    const onCompose = vi.fn();
    render(
      <ArticleList
        boardName="Stock"
        onBack={() => {}}
        onSelectArticle={() => {}}
        onSelectArticleByAid={() => {}}
        onCompose={onCompose}
        mockArticles={[
          {
            index: 1,
            mark: "",
            pushCount: "10",
            date: "5/01",
            author: "a",
            title: "[標的] 2330 台積電",
          },
          {
            index: 2,
            mark: "",
            pushCount: "3",
            date: "5/01",
            author: "b",
            title: "[請益] 新手請問",
          },
          {
            index: 3,
            mark: "",
            pushCount: "1",
            date: "5/01",
            author: "c",
            title: "Re: [標的] 2330 台積電",
          },
        ]}
        mockLoading={false}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /發文/ }));

    expect(onCompose).toHaveBeenCalledWith(["標的", "請益"]);
  });

  it("calls refresh when the refresh button is clicked", async () => {
    const { ArticleList } = await import("../ArticleList");
    const onMockRefresh = vi.fn();

    render(
      <ArticleList
        boardName="Gossiping"
        onBack={() => {}}
        onSelectArticle={() => {}}
        onSelectArticleByAid={() => {}}
        mockArticles={[]}
        mockLoading={false}
        mockRefreshing={false}
        onMockRefresh={onMockRefresh}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "重新整理" }));

    expect(onMockRefresh).toHaveBeenCalledOnce();
  });

  it("calls refresh when dragging down from the top boundary", async () => {
    const { ArticleList } = await import("../ArticleList");
    const onMockRefresh = vi.fn();

    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 0,
    });

    const { container } = render(
      <ArticleList
        boardName="Gossiping"
        onBack={() => {}}
        onSelectArticle={() => {}}
        onSelectArticleByAid={() => {}}
        mockArticles={[]}
        mockLoading={false}
        mockRefreshing={false}
        onMockRefresh={onMockRefresh}
      />,
    );

    const shell = container.firstElementChild as HTMLElement;
    fireEvent.pointerDown(shell, {
      pointerId: 1,
      pointerType: "mouse",
      clientY: 12,
      button: 0,
    });
    fireEvent.pointerMove(shell, {
      pointerId: 1,
      pointerType: "mouse",
      clientY: 96,
      button: 0,
    });

    expect(screen.getByText("放開重新整理")).toBeTruthy();

    fireEvent.pointerUp(shell, {
      pointerId: 1,
      pointerType: "mouse",
      clientY: 96,
      button: 0,
    });

    expect(onMockRefresh).toHaveBeenCalledOnce();
    expect(screen.queryByText("放開重新整理")).toBeNull();
  });

  it("uses rubber-band resistance while revealing the pull refresh gap", async () => {
    const { ArticleList } = await import("../ArticleList");

    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 0,
    });

    const { container } = render(
      <ArticleList
        boardName="Gossiping"
        onBack={() => {}}
        onSelectArticle={() => {}}
        onSelectArticleByAid={() => {}}
        mockArticles={[]}
        mockLoading={false}
        mockRefreshing={false}
        onMockRefresh={() => {}}
      />,
    );

    const shell = container.firstElementChild as HTMLElement;
    fireEvent.pointerDown(shell, {
      pointerId: 1,
      pointerType: "mouse",
      clientY: 10,
      button: 0,
    });
    fireEvent.pointerMove(shell, {
      pointerId: 1,
      pointerType: "mouse",
      clientY: 130,
      button: 0,
    });

    const indicator = screen.getByTestId("pull-refresh-indicator");
    expect(screen.getByText("放開重新整理")).toBeTruthy();
    expect(parseFloat(indicator.style.height)).toBeGreaterThan(0);
    expect(parseFloat(indicator.style.height)).toBeLessThan(96);
  });

  it("shows a reserved pull refresh gap while refreshing", async () => {
    const { ArticleList } = await import("../ArticleList");

    render(
      <ArticleList
        boardName="Gossiping"
        onBack={() => {}}
        onSelectArticle={() => {}}
        onSelectArticleByAid={() => {}}
        mockArticles={[]}
        mockLoading={false}
        mockRefreshing
        onMockRefresh={() => {}}
      />,
    );

    const indicator = screen.getByTestId("pull-refresh-indicator");
    expect(screen.getAllByText("重新載入中").length).toBeGreaterThan(0);
    expect(parseFloat(indicator.style.height)).toBeGreaterThan(0);
  });

  it("calls refresh when a trackpad overscrolls upward at the top boundary", async () => {
    const { ArticleList } = await import("../ArticleList");
    const onMockRefresh = vi.fn();

    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 0,
    });

    const { container } = render(
      <ArticleList
        boardName="Gossiping"
        onBack={() => {}}
        onSelectArticle={() => {}}
        onSelectArticleByAid={() => {}}
        mockArticles={[]}
        mockLoading={false}
        mockRefreshing={false}
        onMockRefresh={onMockRefresh}
      />,
    );

    const shell = container.firstElementChild as HTMLElement;
    fireEvent.wheel(shell, { deltaY: -28 });
    fireEvent.wheel(shell, { deltaY: -28 });
    fireEvent.wheel(shell, { deltaY: -28 });

    expect(onMockRefresh).toHaveBeenCalledOnce();
  });

  it("snaps the pull refresh gap closed after a partial trackpad overscroll", async () => {
    vi.useFakeTimers();
    const { ArticleList } = await import("../ArticleList");

    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 0,
    });

    const { container } = render(
      <ArticleList
        boardName="Gossiping"
        onBack={() => {}}
        onSelectArticle={() => {}}
        onSelectArticleByAid={() => {}}
        mockArticles={[]}
        mockLoading={false}
        mockRefreshing={false}
        onMockRefresh={() => {}}
      />,
    );

    const shell = container.firstElementChild as HTMLElement;
    fireEvent.wheel(shell, { deltaY: -24 });

    const indicator = screen.getByTestId("pull-refresh-indicator");
    expect(parseFloat(indicator.style.height)).toBeGreaterThan(0);

    act(() => {
      vi.advanceTimersByTime(220);
    });

    expect(parseFloat(indicator.style.height)).toBe(0);
    expect(screen.queryByText("下拉重新整理")).toBeNull();
  });

  it("does not pull refresh when the list is scrolled away from the top", async () => {
    const { ArticleList } = await import("../ArticleList");
    const onMockRefresh = vi.fn();

    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 120,
    });

    const { container } = render(
      <ArticleList
        boardName="Gossiping"
        onBack={() => {}}
        onSelectArticle={() => {}}
        onSelectArticleByAid={() => {}}
        mockArticles={[]}
        mockLoading={false}
        mockRefreshing={false}
        onMockRefresh={onMockRefresh}
      />,
    );

    const shell = container.firstElementChild as HTMLElement;
    fireEvent.pointerDown(shell, {
      pointerId: 1,
      pointerType: "mouse",
      clientY: 12,
      button: 0,
    });
    fireEvent.pointerMove(shell, {
      pointerId: 1,
      pointerType: "mouse",
      clientY: 120,
      button: 0,
    });
    fireEvent.pointerUp(shell, {
      pointerId: 1,
      pointerType: "mouse",
      clientY: 120,
      button: 0,
    });
    fireEvent.wheel(shell, { deltaY: -96 });

    expect(onMockRefresh).not.toHaveBeenCalled();
  });
});
