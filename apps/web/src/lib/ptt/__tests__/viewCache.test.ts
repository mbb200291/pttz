import { describe, expect, it } from "vitest";

describe("ptt view cache", () => {
  it("stores and retrieves board list entries by board name", async () => {
    const mod = await import("../viewCache");

    mod.clearPttViewCache();
    mod.writeBoardCache("Gossiping", [
      {
        key: { board: "Gossiping", index: 785692 },
        mark: " ",
        nativeScoreLabel: "爆",
        publishedAt: "4/17",
        author: "userB",
        title: "[問卦] 今天吃什麼",
      },
    ]);

    expect(mod.readBoardCache("Gossiping")).toEqual([
      {
        key: { board: "Gossiping", index: 785692 },
        mark: " ",
        nativeScoreLabel: "爆",
        publishedAt: "4/17",
        author: "userB",
        title: "[問卦] 今天吃什麼",
      },
    ]);
  });

  it("stores and retrieves article entries by board name and article index", async () => {
    const mod = await import("../viewCache");

    mod.clearPttViewCache();
    mod.writeArticleCache("Gossiping", 785692, {
      key: { board: "Gossiping", index: 785692 },
      completeness: "final",
      revision: 1,
      title: "[問卦] 今天吃什麼",
      author: "userB",
      publishedAt: "Fri Apr 17 20:00:00 2026",
      body: "第一行",
      replies: [],
      articleEdits: [],
      revisions: [],
      nativePushCount: 0,
      nativeBooCount: 0,
      nativeNeutralCount: 0,
    });

    expect(mod.readArticleCache("Gossiping", 785692)).toEqual({
      key: { board: "Gossiping", index: 785692 },
      completeness: "final",
      revision: 1,
      title: "[問卦] 今天吃什麼",
      author: "userB",
      publishedAt: "Fri Apr 17 20:00:00 2026",
      body: "第一行",
      replies: [],
      articleEdits: [],
      revisions: [],
      nativePushCount: 0,
      nativeBooCount: 0,
      nativeNeutralCount: 0,
    });
  });

  it("stores and retrieves board scroll positions by board name", async () => {
    const mod = await import("../viewCache");

    mod.clearPttViewCache();
    mod.writeBoardScrollCache("Gossiping", 1280);

    expect(mod.readBoardScrollCache("Gossiping")).toBe(1280);
  });

  it("stores and retrieves board anchors by board name", async () => {
    const mod = await import("../viewCache");

    mod.clearPttViewCache();
    mod.writeBoardAnchorCache("Gossiping", {
      articleIndex: 785692,
      scrollY: 1280,
      viewportTop: 312,
    });

    expect(mod.readBoardAnchorCache("Gossiping")).toEqual({
      articleIndex: 785692,
      scrollY: 1280,
      viewportTop: 312,
    });
  });
});
