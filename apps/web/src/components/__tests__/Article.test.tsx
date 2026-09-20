import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { projectThreadForDisplay, type AggregatedPush } from "../../lib/ptt/uiTypes";

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

  it("formats partial body while keeping the pending discussion lightweight", async () => {
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
              pushVoters: [],
              booVoters: [],
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
    expect(html).toContain("播放 YouTube 影片");
    expect(html).toContain("文章推噓與回覆");
    expect(html).not.toContain("已載入 1 則");
    expect(html).not.toContain(">噓</pre>");
    expect(html).toContain("討論載入中…");
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

  it("counts four visible aggregated replies at every depth but only one root discussion", async () => {
    vi.resetModules();
    const { Article } = await import("../Article");
    const push = (overrides: Partial<AggregatedPush>): AggregatedPush => ({
      id: "reply-1",
      type: "neutral",
      author: "alice",
      content: "第一層回覆",
      time: "12:00",
      ipAddresses: [],
      isOP: false,
      replyTo: null,
      structuralDepth: 1,
      score: 0,
      floorNumber: 1,
      anchorOrder: 0,
      sourceFloors: [1],
      pushVoters: [],
      booVoters: [],
      ...overrides,
    });
    const pushes = projectThreadForDisplay([
      // Two native floors are already aggregated into one visible reply.
      push({ sourceFloors: [1, 2] }),
      push({ id: "reply-2", content: "第二層回覆", replyTo: "reply-1", structuralDepth: 2, sourceFloors: [3] }),
      push({ id: "reply-3", content: "第三層回覆", replyTo: "reply-2", structuralDepth: 3, sourceFloors: [4] }),
      push({ id: "reply-4", content: "第四層回覆", replyTo: "reply-3", structuralDepth: 4, sourceFloors: [5] }),
      push({ id: "article-vote", content: "推", sourceFloors: [6], visible: false }),
      push({ id: "reply-vote", content: "推1樓", replyTo: "reply-1", sourceFloors: [7], visible: false }),
      push({ id: "withdraw", content: "撤回我對1樓的推", sourceFloors: [8], visible: false }),
      push({ id: "edit-command", content: "補充我在1樓說的：補充", sourceFloors: [9], visible: false }),
      push({ id: "edit", type: "edit", content: "編輯紀錄", replyTo: "reply-1", sourceFloors: [10] }),
    ]);
    expect(pushes.find((reply) => reply.id === "reply-4")).toMatchObject({
      replyTo: "reply-3", displayReplyTo: "reply-2",
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
          pushes,
          articleNotes: [],
          score: 0,
          nativePushCount: 1,
          nativeBooCount: 0,
          nativeNeutralCount: 99,
        } as never}
      />,
    );

    expect(html).toContain('aria-label="聚合後回覆 4"');
    expect(html).toContain("1 則討論");
    expect(html).not.toContain("4 則討論");
    expect(html).not.toContain("撤回我對1樓的推");
    expect(html).not.toContain("補充我在1樓說的：補充");
    expect(html).not.toContain(">中立<");
  });
});
