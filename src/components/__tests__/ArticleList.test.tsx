import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

describe("ArticleList", () => {
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
        mockArticles={[]}
        mockLoading={false}
        mockError="目前畫面尚未就緒，暫時無法進入看板（state=unknown）"
      />,
    );

    expect(html).toContain("目前畫面尚未就緒");
    expect(html).not.toContain("正在連線至 PTT");
  });
});
