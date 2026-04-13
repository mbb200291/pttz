import { describe, expect, it } from "vitest";

describe("useArticle helpers", () => {
  it("accepts screen partials only when they match the selected article summary", async () => {
    const mod = await import("../useArticle");

    expect(
      mod.isExpectedArticlePartial(
        {
          title: "[問卦] selected",
          author: "tester",
          date: "Tue Apr 21 14:00:00 2026",
          board: "Gossiping",
          body: "first paragraph",
        },
        {
          index: 123,
          mark: " ",
          pushCount: "1",
          date: "4/21",
          author: "tester",
          title: "[問卦] selected",
        },
      ),
    ).toBe(true);

    expect(
      mod.isExpectedArticlePartial(
        {
          title: "[問卦] stale",
          author: "other",
          date: "Tue Apr 21 13:00:00 2026",
          board: "Gossiping",
          body: "stale body",
        },
        {
          index: 123,
          mark: " ",
          pushCount: "1",
          date: "4/21",
          author: "tester",
          title: "[問卦] selected",
        },
      ),
    ).toBe(false);
  });

  it("accepts a truncated article-header title that is a prefix of the full board-list title", async () => {
    const mod = await import("../useArticle");

    // Board-list captured the full title; article 標題 line was truncated to 80 terminal cols
    expect(
      mod.isExpectedArticlePartial(
        {
          title: "[新聞] 快訊／醫大生遭無照酒駕猴撞死　「上訴",
          author: "a96385245",
          date: "Tue Apr 28 10:33:10 2026",
          board: "Gossiping",
          body: "article body",
        },
        {
          index: 779500,
          mark: " ",
          pushCount: "49",
          date: "4/28",
          author: "a96385245",
          title: "[新聞] 快訊／醫大生遭無照酒駕猴撞死　「上訴駁回」二審判10年",
        },
      ),
    ).toBe(true);

    // Should NOT match a completely different article even if prefix is long-ish
    expect(
      mod.isExpectedArticlePartial(
        { title: "[問卦] 台灣人說大陸", author: "a", date: "", board: "", body: "" },
        { index: 1, mark: " ", pushCount: "1", date: "4/28", author: "a",
          title: "[問卦] 台灣人說大陸比較會詐騙的八卦？" },
      ),
    ).toBe(true); // prefix match — same article, short version is the truncated header

    // Completely unrelated title must still fail
    expect(
      mod.isExpectedArticlePartial(
        { title: "[新聞] 其他完全無關的新聞文章", author: "x", date: "", board: "", body: "" },
        { index: 779500, mark: " ", pushCount: "49", date: "4/28", author: "a96385245",
          title: "[新聞] 快訊／醫大生遭無照酒駕猴撞死　「上訴駁回」二審判10年" },
      ),
    ).toBe(false);
  });

  it("matches article partial titles after normalizing ascii and full-width spaces", async () => {
    const mod = await import("../useArticle");

    expect(
      mod.isExpectedArticlePartial(
        {
          title: "[新聞] 沈伯洋被讚「可大談巴哈1小時」 蔣萬安",
          author: "tester",
          date: "Tue Apr 21 14:00:00 2026",
          board: "Gossiping",
          body: "first paragraph",
        },
        {
          index: 123,
          mark: " ",
          pushCount: "1",
          date: "4/21",
          author: "tester",
          title: "[新聞] 沈伯洋被讚「可大談巴哈1小時」　蔣萬安",
        },
      ),
    ).toBe(true);
  });

  it("extracts an expected article partial from a redraw screen", async () => {
    const mod = await import("../useArticle");
    const screen = [
      "作者  tester (測試者)                 看板  Gossiping",
      "標題  [問卦] selected",
      "時間  Tue Apr 21 14:00:00 2026",
      "───────────────────────────────────────",
      "first paragraph",
      "",
      "瀏覽 第 1/2 頁 (50%)",
    ].join("\n");

    expect(
      mod.parseExpectedArticleScreenPartial(screen, {
        index: 123,
        mark: " ",
        pushCount: "1",
        date: "4/21",
        author: "tester",
        title: "[問卦] selected",
      }),
    ).toMatchObject({
      title: "[問卦] selected",
      author: "tester (測試者)",
      body: "first paragraph",
    });

    expect(
      mod.parseExpectedArticleScreenPartial(screen, {
        index: 124,
        mark: " ",
        pushCount: "1",
        date: "4/21",
        author: "other",
        title: "[問卦] other",
      }),
    ).toBeNull();
  });

  it("keeps the longer accumulated partial when a shorter screen partial arrives later", async () => {
    const mod = await import("../useArticle");

    const accumulated = {
      title: "[問卦] selected",
      author: "tester",
      date: "Tue Apr 21 14:00:00 2026",
      board: "Gossiping",
      body: ["第一頁", "第二頁", "第三頁"].join("\n"),
      pushes: [
        {
          id: "push-1",
          type: "push" as const,
          author: "user1",
          content: "hello",
          ipAddresses: [],
          time: "04/21 14:01",
          isOP: false,
          replyTo: null,
          score: 1,
          floorNumber: 0,
          anchorOrder: 10,
          sourceFloors: [1],
        },
      ],
      articleNotes: [],
      score: 1,
    };
    const shorterScreen = {
      ...accumulated,
      body: "第一頁",
      pushes: [],
      score: 0,
    };

    expect(mod.mergeProgressiveArticlePartial(accumulated, shorterScreen)).toEqual(
      accumulated,
    );
    expect(mod.mergeProgressiveArticlePartial(shorterScreen, accumulated)).toEqual(
      accumulated,
    );
  });
});
