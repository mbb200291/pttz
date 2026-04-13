import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

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
    expect(html).toContain("bg-amber-950/20");
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
});
