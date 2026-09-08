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

    // New design: category shown as chip, title shown in h1 — check both parts
    expect(html).toContain("問卦");
    expect(html).toContain("optimistic header");
    expect(html).not.toContain(">載入中…<");
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
              id: "article-boo",
              type: "neutral",
              author: "voter",
              content: "噓",
              time: "11:59",
              ipAddresses: [],
              isOP: false,
              replyTo: null,
              score: 0,
              floorNumber: 1,
              anchorOrder: 0,
              sourceFloors: [1],
              pushVoters: [],
              booVoters: [],
              visible: false,
            },
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

    // New design: category chip + h1 title shown separately
    expect(html).toContain("新聞");
    expect(html).toContain("partial article");
    expect(html).toContain("https://youtu.be/dQw4w9WgXcQ");
    expect(html).not.toContain("播放 YouTube 影片");
    expect(html).not.toContain("時間");
    expect(html).not.toContain("推噓分");
    expect(html).not.toContain("舊到新");
    expect(html).toContain("回文");
    expect(html).not.toContain(">噓</pre>");
    expect(html).toContain("完整討論串整理中…");
  });

  it("renders structured revisions after the article body", async () => {
    vi.resetModules();
    const { Article } = await import("../Article");
    const html = renderToStaticMarkup(
      <Article
        boardName="Test"
        articleIndex={123}
        onBack={() => {}}
        mockArticle={{
          title: "[測試] revisions",
          author: "alice",
          date: "07/16",
          board: "Test",
          body: "正文",
          pushes: [],
          articleNotes: [],
          revisions: [
            {
              summary: "修正來源",
              rawBlock: "※ PTTzzz 編輯摘要：修正來源",
              markerOffset: 4,
            },
          ],
          score: 0,
        }}
      />,
    );

    expect(html.indexOf("正文")).toBeLessThan(html.indexOf("編輯紀錄"));
    expect(html).toContain("修正來源");
  });

  it("shows visible aggregated replies instead of the native neutral count", async () => {
    vi.resetModules();
    const { Article } = await import("../Article");
    const push = (overrides: Record<string, unknown>) => ({
      id: "reply-1",
      type: "neutral",
      author: "alice",
      content: "第一層回覆",
      time: "12:00",
      ipAddresses: [],
      isOP: false,
      replyTo: null,
      score: 0,
      floorNumber: 1,
      anchorOrder: 0,
      sourceFloors: [1],
      pushVoters: [],
      booVoters: [],
      ...overrides,
    });

    const html = renderToStaticMarkup(
      <Article
        boardName="Test"
        articleIndex={123}
        onBack={() => {}}
        mockArticle={{
          title: "[測試] reply count",
          author: "op",
          date: "08/22",
          board: "Test",
          body: "正文",
          pushes: [
            push({}),
            push({ id: "reply-2", content: "巢狀回覆", replyTo: "reply-1", sourceFloors: [2] }),
            push({ id: "article-vote", content: "推", sourceFloors: [3], visible: false }),
            push({ id: "edit", type: "edit", content: "編輯紀錄", sourceFloors: [4] }),
          ],
          articleNotes: [],
          score: 0,
          nativePushCount: 1,
          nativeBooCount: 0,
          nativeNeutralCount: 99,
        } as never}
      />,
    );

    expect(html).toContain('aria-label="聚合後回覆 2"');
    expect(html).not.toContain(">中立<");
  });
});
