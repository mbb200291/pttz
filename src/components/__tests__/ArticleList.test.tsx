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

    expect(html).toContain("推文數 ≥100");
    expect(html).not.toContain(">看板<");
  });

  it("applies search filter label when initialFilter is a search filter", async () => {
    const { ArticleList } = await import("../ArticleList");
    const html = renderToStaticMarkup(
      <ArticleList
        boardName="Gossiping"
        initialFilter={{ type: "search", keyword: "花生" }}
        onBack={() => {}}
        onSelectArticle={() => {}}
        onSelectArticleByAid={() => {}}
        mockArticles={[]}
        mockLoading={false}
      />,
    );

    expect(html).toContain("系列《花生》");
    expect(html).not.toContain(">看板<");
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
