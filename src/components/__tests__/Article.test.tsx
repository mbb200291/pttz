import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

describe("Article", () => {
  it("shows the selected list row as an immediate fallback while loading", async () => {
    const { Article } = await import("../Article");

    const html = renderToStaticMarkup(
      <Article
        boardName="Gossiping"
        articleIndex={779001}
        onBack={() => {}}
        mockArticle={null}
        mockLoading={true}
        initialArticleSummary={{
          index: 779001,
          mark: " ",
          pushCount: "4",
          date: "4/21",
          author: "tester",
          title: "[問卦] optimistic header",
        }}
      />,
    );

    expect(html).toContain("[問卦] optimistic header");
    expect(html).not.toContain('text-center py-16 text-gray-400">載入中…');
  });

  it("uses lightweight article rendering while partial content is still loading", async () => {
    vi.resetModules();
    vi.doMock("../../hooks/useArticle", () => ({
      useArticle: () => ({
        article: null,
        partialArticle: {
          title: "[新聞] partial article",
          author: "tester",
          date: "4/24",
          board: "Gossiping",
          body: "第一段\nhttps://youtu.be/dQw4w9WgXcQ",
          pushes: [
            {
              id: "push-0",
              type: "push",
              author: "userA",
              content: "https://youtu.be/dQw4w9WgXcQ",
              time: "12:00",
              ipAddresses: [],
              isOP: false,
              replyTo: null,
              score: 0,
              floorNumber: 1,
              anchorOrder: 1,
              sourceFloors: [1],
            },
          ],
          articleNotes: [],
          score: 1,
        },
        cachedArticle: null,
        loading: true,
        reloading: false,
        error: null,
        reload: () => Promise.resolve(),
      }),
    }));

    const { Article } = await import("../Article");

    const html = renderToStaticMarkup(
      <Article
        boardName="Gossiping"
        articleIndex={783933}
        onBack={() => {}}
      />,
    );

    expect(html).toContain("[新聞] partial article");
    expect(html).toContain("https://youtu.be/dQw4w9WgXcQ");
    expect(html).not.toContain("播放 YouTube 影片");
    expect(html).not.toContain("時間");
    expect(html).not.toContain("推噓分");
    expect(html).not.toContain("舊到新");
    expect(html).toContain("回文");
    expect(html).toContain("完整討論串整理中…");
  });
});
