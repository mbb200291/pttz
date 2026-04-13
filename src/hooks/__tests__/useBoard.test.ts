import { describe, expect, it } from "vitest";

describe("useBoard helpers", () => {
  it("computes load-more offset from normal rows instead of fixed announcements", async () => {
    const mod = await import("../useBoard");

    expect(
      mod.getNextBoardLoadMoreOffset([
        {
          index: 82140,
          mark: " ",
          pushCount: "爆",
          date: "2/14",
          author: "ubcs",
          title: "[公告] 豐川祥子誕生日八卦板主徵選報名開始",
          fixed: true,
        },
        {
          index: 782138,
          mark: " ",
          pushCount: "1",
          date: "4/23",
          author: "laidos",
          title: "[問卦] 複製人承接將死的你，你或更親友覺得可以",
        },
        {
          index: 782125,
          mark: " ",
          pushCount: "6",
          date: "4/23",
          author: "oopalmoo",
          title: "[問卦] 長官一句話累死馬鈴薯企業？",
        },
      ]),
    ).toBe(782124);
  });

  it("returns no load-more offset when only fixed announcements are present", async () => {
    const mod = await import("../useBoard");

    expect(
      mod.getNextBoardLoadMoreOffset([
        {
          index: 82140,
          mark: " ",
          pushCount: "爆",
          date: "2/14",
          author: "ubcs",
          title: "[公告] 豐川祥子誕生日八卦板主徵選報名開始",
          fixed: true,
        },
      ]),
    ).toBeNull();
  });

  it("defers cached board revalidation only when returning to a saved list anchor", async () => {
    const mod = await import("../useBoard");

    expect(mod.getBoardCacheRevalidateDelayMs(20, false, true)).toBe(
      mod.BOARD_CACHE_REVALIDATE_DELAY_MS,
    );
    expect(mod.getBoardCacheRevalidateDelayMs(20, false, false)).toBe(0);
    expect(mod.getBoardCacheRevalidateDelayMs(0, false, true)).toBe(0);
    expect(mod.getBoardCacheRevalidateDelayMs(20, true, true)).toBe(0);
  });

  it("merges refreshed first page into cached board articles without dropping older cached pages", async () => {
    const mod = await import("../useBoard");

    const merged = mod.mergeBoardArticles(
      [
        {
          index: 105,
          mark: " ",
          pushCount: "5",
          date: "4/19",
          author: "user5",
          title: "old 105",
        },
        {
          index: 104,
          mark: " ",
          pushCount: "4",
          date: "4/19",
          author: "user4",
          title: "old 104",
        },
        {
          index: 103,
          mark: " ",
          pushCount: "3",
          date: "4/19",
          author: "user3",
          title: "old 103",
        },
      ],
      [
        {
          index: 105,
          mark: " ",
          pushCount: "爆",
          date: "4/19",
          author: "user5",
          title: "fresh 105",
        },
        {
          index: 104,
          mark: " ",
          pushCount: "7",
          date: "4/19",
          author: "user4",
          title: "fresh 104",
        },
      ],
    );

    expect(merged).toEqual([
      {
        index: 105,
        mark: " ",
        pushCount: "爆",
        date: "4/19",
        author: "user5",
        title: "fresh 105",
      },
      {
        index: 104,
        mark: " ",
        pushCount: "7",
        date: "4/19",
        author: "user4",
        title: "fresh 104",
      },
      {
        index: 103,
        mark: " ",
        pushCount: "3",
        date: "4/19",
        author: "user3",
        title: "old 103",
      },
    ]);
  });

  it("merges visible board partial rows into the cached list instead of shrinking to the visible page", async () => {
    const mod = await import("../useBoard");

    const merged = mod.mergeBoardArticles(
      [
        {
          index: 105,
          mark: " ",
          pushCount: "5",
          date: "4/19",
          author: "user5",
          title: "cached 105",
        },
        {
          index: 104,
          mark: " ",
          pushCount: "4",
          date: "4/19",
          author: "user4",
          title: "cached 104",
        },
        {
          index: 103,
          mark: " ",
          pushCount: "3",
          date: "4/19",
          author: "user3",
          title: "cached 103",
        },
      ],
      [
        {
          index: 104,
          mark: " ",
          pushCount: "爆",
          date: "4/19",
          author: "user4",
          title: "visible 104",
        },
        {
          index: 103,
          mark: " ",
          pushCount: "7",
          date: "4/19",
          author: "user3",
          title: "visible 103",
        },
      ],
    );

    expect(merged).toEqual([
      {
        index: 105,
        mark: " ",
        pushCount: "5",
        date: "4/19",
        author: "user5",
        title: "cached 105",
      },
      {
        index: 104,
        mark: " ",
        pushCount: "爆",
        date: "4/19",
        author: "user4",
        title: "visible 104",
      },
      {
        index: 103,
        mark: " ",
        pushCount: "7",
        date: "4/19",
        author: "user3",
        title: "visible 103",
      },
    ]);
  });

  it("ignores incoming load-more rows that are disconnected from the current normal article window", async () => {
    const mod = await import("../useBoard");

    const merged = mod.mergeBoardArticles(
      [
        {
          index: 782099,
          mark: " ",
          pushCount: "",
          date: "4/23",
          author: "hjgx",
          title: "[問卦] 佛教人士插隊應如何處置。",
        },
        {
          index: 782098,
          mark: " ",
          pushCount: "3",
          date: "4/23",
          author: "skn60694",
          title: "[新聞] 忘了生日就抓狂！年薪2千萬竹科男控妻索",
        },
      ],
      [
        {
          index: 82099,
          mark: " ",
          pushCount: "67",
          date: "11/25",
          author: "chubby31190",
          title: "[問卦] CT可以改成Chinese Taiwan嗎？",
        },
      ],
    );

    expect(merged.map((article: { index: number }) => article.index)).toEqual([
      782099,
      782098,
    ]);
  });

  it("keeps adjacent incoming load-more rows", async () => {
    const mod = await import("../useBoard");

    const merged = mod.mergeBoardArticles(
      [
        {
          index: 782099,
          mark: " ",
          pushCount: "",
          date: "4/23",
          author: "hjgx",
          title: "[問卦] 佛教人士插隊應如何處置。",
        },
      ],
      [
        {
          index: 782098,
          mark: " ",
          pushCount: "3",
          date: "4/23",
          author: "skn60694",
          title: "[新聞] 忘了生日就抓狂！年薪2千萬竹科男控妻索",
        },
      ],
    );

    expect(merged.map((article: { index: number }) => article.index)).toEqual([
      782099,
      782098,
    ]);
  });

  it("refreshes cached board rows without appending a different terminal window", async () => {
    const mod = await import("../useBoard");

    const refreshed = mod.refreshCachedBoardArticles(
      [
        {
          index: 105,
          mark: " ",
          pushCount: "5",
          date: "4/19",
          author: "user5",
          title: "cached 105",
        },
        {
          index: 104,
          mark: " ",
          pushCount: "4",
          date: "4/19",
          author: "user4",
          title: "cached 104",
        },
        {
          index: 103,
          mark: " ",
          pushCount: "3",
          date: "4/19",
          author: "user3",
          title: "cached 103",
        },
      ],
      [
        {
          index: 200,
          mark: " ",
          pushCount: "9",
          date: "4/20",
          author: "user200",
          title: "different window 200",
        },
        {
          index: 104,
          mark: " ",
          pushCount: "爆",
          date: "4/19",
          author: "user4",
          title: "fresh 104",
        },
      ],
    );

    expect(refreshed).toEqual([
      {
        index: 105,
        mark: " ",
        pushCount: "5",
        date: "4/19",
        author: "user5",
        title: "cached 105",
      },
      {
        index: 104,
        mark: " ",
        pushCount: "爆",
        date: "4/19",
        author: "user4",
        title: "fresh 104",
      },
      {
        index: 103,
        mark: " ",
        pushCount: "3",
        date: "4/19",
        author: "user3",
        title: "cached 103",
      },
    ]);
  });

  it("drops stale cached rows that are far outside the refreshed first page window", async () => {
    const mod = await import("../useBoard");

    const refreshed = mod.refreshCachedBoardArticles(
      [
        {
          index: 781778,
          mark: " ",
          pushCount: "9",
          date: "4/22",
          author: "fresh",
          title: "cached current row",
        },
        {
          index: 624001,
          mark: " ",
          pushCount: "5",
          date: "11/25",
          author: "old2024",
          title: "[問卦] 12強全明星隊只挑一個台灣人入選？",
        },
      ],
      [
        {
          index: 781778,
          mark: " ",
          pushCount: "9",
          date: "4/22",
          author: "fresh",
          title: "refreshed current row",
        },
        {
          index: 781777,
          mark: " ",
          pushCount: "2",
          date: "4/22",
          author: "lionsbest",
          title: "[問卦] 這詐騙問茶園又是什麼梗？",
        },
      ],
    );

    expect(refreshed.map((article: { index: number }) => article.index)).toEqual([
      781778,
      781777,
    ]);
    expect(
      refreshed.some((article: { title: string }) =>
        article.title.includes("12強全明星隊"),
      ),
    ).toBe(false);
  });

  it("keeps the current cached window when a refresh returns a much older disconnected page", async () => {
    const mod = await import("../useBoard");

    const refreshed = mod.refreshCachedBoardArticles(
      [
        {
          index: 82144,
          mark: " ",
          pushCount: "14",
          date: "4/15",
          author: "longbow2",
          title: "[公告] 警察機關來信",
          fixed: true,
        },
        {
          index: 782138,
          mark: " ",
          pushCount: "",
          date: "4/23",
          author: "laidos",
          title: "[問卦] 複製人承接將死的你，你或更親友覺得可以",
        },
      ],
      [
        {
          index: 82100,
          mark: " ",
          pushCount: "3",
          date: "11/25",
          author: "old",
          title: "Re: [問卦] 中國有14億人居然打不進12強",
        },
        {
          index: 82099,
          mark: " ",
          pushCount: "5",
          date: "11/25",
          author: "old2",
          title: "[問卦] 棒球版怎麼九二共識",
        },
      ],
    );

    expect(refreshed.map((article: { index: number }) => article.index)).toEqual([
      82144,
      782138,
    ]);
  });

  it("does not use fixed announcement indexes to keep stale normal rows", async () => {
    const mod = await import("../useBoard");

    const refreshed = mod.refreshCachedBoardArticles(
      [
        {
          index: 82008,
          mark: " ",
          pushCount: "15",
          date: "4/15",
          author: "longbow2",
          title: "[公告] 警察機關來信",
          fixed: true,
        },
        {
          index: 81990,
          mark: " ",
          pushCount: "6",
          date: "11/25",
          author: "ansfan",
          title: "[問卦] 弱弱一問！等等要幫中華男籃加油嗎？",
        },
        {
          index: 781990,
          mark: " ",
          pushCount: "",
          date: "4/22",
          author: "mshuang",
          title: "cached current row",
        },
      ],
      [
        {
          index: 82008,
          mark: " ",
          pushCount: "15",
          date: "4/15",
          author: "longbow2",
          title: "[公告] 警察機關來信",
          fixed: true,
        },
        {
          index: 781990,
          mark: " ",
          pushCount: "",
          date: "4/22",
          author: "mshuang",
          title: "refreshed current row",
        },
        {
          index: 781989,
          mark: " ",
          pushCount: "4",
          date: "4/22",
          author: "iamshana",
          title: "[新聞] 中東戰爭害「小雨衣」快斷料 庫存拉警報",
        },
      ],
    );

    expect(refreshed.map((article: { index: number }) => article.index)).toEqual([
      82008,
      781990,
      781989,
    ]);
  });

  it("keeps fixed announcement rows above newer normal articles", async () => {
    const mod = await import("../useBoard");

    const merged = mod.mergeBoardArticles(
      [
        {
          index: 779794,
          mark: " ",
          pushCount: "15",
          date: "4/15",
          author: "longbow2",
          title: "[公告] 警察機關來信",
          fixed: true,
        },
      ],
      [
        {
          index: 900001,
          mark: " ",
          pushCount: "1",
          date: "4/21",
          author: "normal",
          title: "[問卦] newest normal",
        },
      ],
    );

    expect(merged.map((article: { title: string }) => article.title)).toEqual([
      "[公告] 警察機關來信",
      "[問卦] newest normal",
    ]);
  });
});
