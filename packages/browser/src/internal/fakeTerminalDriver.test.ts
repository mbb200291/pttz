// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  createLegacyFakePttAdapterForUi as createFakePttAdapter,
  FAKE_PTT_STORE_KEY,
} from "./fakeTerminalDriver.js";

describe("fake PTT adapter", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("migrates legacy records to unique opaque AIDs", async () => {
    const adapter = createFakePttAdapter();
    await adapter.listArticles("test");
    const legacy = JSON.parse(localStorage.getItem(FAKE_PTT_STORE_KEY) ?? "null");
    for (const board of Object.values(legacy.boards) as Array<{ articles: Array<{ aid?: string }> }>) {
      for (const article of board.articles) delete article.aid;
    }
    localStorage.setItem(FAKE_PTT_STORE_KEY, JSON.stringify(legacy));

    await adapter.listArticles("test");
    const migrated = JSON.parse(localStorage.getItem(FAKE_PTT_STORE_KEY) ?? "null");
    const aids = Object.values(migrated.boards).flatMap((board) =>
      (board as { articles: Array<{ aid: string; index: number }> }).articles.map((article) => article.aid));
    expect(aids.every((aid) => aid.length > 0 && !/^\d+$/u.test(aid))).toBe(true);
    expect(new Set(aids)).toHaveLength(aids.length);
    await expect(adapter.getArticleByAid("test", `#${migrated.boards.test.articles[0].aid}`))
      .resolves.toMatchObject({ title: "[測試] Fake PTT 多帳號互動測試" });
  });

  it("uses the login username as the author for replies", async () => {
    const adapter = createFakePttAdapter();

    await adapter.login("david", "anything");
    await adapter.getArticle("test", 1001);
    await adapter.replyToArticle("david 的測試回覆", "push", "test");

    const article = await adapter.getArticle("test", 1001);

    expect(article?.pushes.some((push) => (
      push.author === "david" && push.content === "david 的測試回覆"
    ))).toBe(true);
  });

  it("does not report a fake reply as successful without an exact open article", async () => {
    const adapter = createFakePttAdapter();
    await adapter.login("david", "anything");

    await expect(adapter.replyToArticle("不應寫入", "neutral", "test")).resolves.toEqual({
      ok: false,
      reason: "尚未開啟要回覆的文章",
    });

    const article = await adapter.getArticle("test", 1001);
    expect(article?.pushes.some((push) => push.content === "不應寫入")).toBe(false);
  });

  it("shares fake board data across adapter instances", async () => {
    const alice = createFakePttAdapter();
    await alice.login("alice", "pw");
    await alice.getArticle("test", 1001);
    await alice.replyToArticle("alice first", "push", "test");

    sessionStorage.clear();
    const bob = createFakePttAdapter();
    await bob.login("bob", "pw");
    await bob.getArticle("test", 1001);
    await bob.replyToArticle("bob second", "boo", "test");

    const article = await alice.getArticle("test", 1001);

    expect(article?.pushes.some((push) => push.author === "alice")).toBe(true);
    expect(article?.pushes.some((push) => push.author === "bob")).toBe(true);
  });

  it("lets mockUser query override a copied session identity for a new tab", async () => {
    sessionStorage.setItem("pttzzz_fake_ptt_user", "alice");
    window.history.replaceState(null, "", "/?mockPtt=1&mockUser=dora");

    const adapter = createFakePttAdapter();
    await adapter.getArticle("test", 1001);
    await adapter.replyToArticle("dora query identity", "push", "test");

    const article = await adapter.getArticle("test", 1001);

    expect(sessionStorage.getItem("pttzzz_fake_ptt_user")).toBe("dora");
    expect(article?.pushes.some((push) => (
      push.author === "dora" && push.content === "dora query identity"
    ))).toBe(true);
  });

  it("records push and boo votes against the target floor", async () => {
    const adapter = createFakePttAdapter();

    await adapter.login("pushVoter", "pw");
    await adapter.getArticle("test", 1001);
    await adapter.votePush(1, "push", "test");

    await adapter.login("booVoter", "pw");
    await adapter.votePush(1, "boo", "test");

    const article = await adapter.getArticle("test", 1001);
    const firstPush = article?.pushes.find((push) => push.sourceFloors.includes(1));

    expect(firstPush?.pushVoters).toContain("pushVoter");
    expect(firstPush?.booVoters).toContain("booVoter");
    expect(article?.score).toBe(1); // only the seeded visible PTT push; reply votes use →
  });

  it("withdraws a reply vote without changing the native article score", async () => {
    const adapter = createFakePttAdapter();
    await adapter.login("withdrawVoter", "pw");
    const before = await adapter.getArticle("test", 1001);
    await adapter.votePush(1, "push", "test");
    await adapter.withdrawPushVote(1, "push", "test");

    const article = await adapter.getArticle("test", 1001);
    const firstPush = article?.pushes.find((push) => push.sourceFloors.includes(1));
    expect(firstPush?.pushVoters).not.toContain("withdrawVoter");
    expect(article?.score).toBe(before?.score);
  });

  it("persists article body edits and structured revisions for the author", async () => {
    const adapter = createFakePttAdapter();
    await adapter.login("opUser", "pw");

    await expect(
      adapter.editArticle({
        boardName: "test",
        articleIndex: 1001,
        expectedAuthor: "opUser",
        expectedTitle: "[測試] Fake PTT 多帳號互動測試",
        body: "更新後的正文",
        editSummary: "修正測試說明",
      }),
    ).resolves.toEqual({ ok: true });

    const article = await adapter.getArticle("test", 1001);
    expect(article?.body).toBe("更新後的正文");
    expect(article?.revisions).toEqual([
      expect.objectContaining({ summary: "修正測試說明" }),
    ]);
  });

  it("preserves the existing signature and native edit footer", async () => {
    const adapter = createFakePttAdapter();
    await adapter.getArticle("test", 1001);
    const store = JSON.parse(localStorage.getItem(FAKE_PTT_STORE_KEY) ?? "null");
    store.boards.test.articles[0].body =
      "原正文\n--\n簽名檔\n※ 編輯: opUser (203.0.113.1), 07/16/2026 10:00:00";
    localStorage.setItem(FAKE_PTT_STORE_KEY, JSON.stringify(store));
    await adapter.login("opUser", "pw");

    await adapter.editArticle({
      boardName: "test",
      articleIndex: 1001,
      expectedAuthor: "opUser",
      expectedTitle: "[測試] Fake PTT 多帳號互動測試",
      body: "更新正文",
      editSummary: "保留 footer",
    });

    expect((await adapter.getArticle("test", 1001))?.body).toBe(
      "更新正文\n--\n簽名檔\n※ 編輯: opUser (203.0.113.1), 07/16/2026 10:00:00",
    );
  });

  it("preserves interleaved revision and native edit record order", async () => {
    const adapter = createFakePttAdapter();
    await adapter.getArticle("test", 1001);
    const store = JSON.parse(localStorage.getItem(FAKE_PTT_STORE_KEY) ?? "null");
    store.boards.test.articles[0].body = [
      "原正文",
      "--",
      "簽名檔",
      "※ PTTzzz 編輯摘要：第一次",
      "※ 編輯: opUser, 07/15/2026 10:00:00",
      "※ PTTzzz 編輯摘要：第二次",
      "※ 編輯: opUser, 07/16/2026 10:00:00",
    ].join("\n");
    localStorage.setItem(FAKE_PTT_STORE_KEY, JSON.stringify(store));
    await adapter.login("opUser", "pw");

    await adapter.editArticle({
      boardName: "test",
      articleIndex: 1001,
      expectedAuthor: "opUser",
      expectedTitle: "[測試] Fake PTT 多帳號互動測試",
      body: "更新正文",
      editSummary: "第三次",
    });

    const updated = JSON.parse(localStorage.getItem(FAKE_PTT_STORE_KEY) ?? "null")
      .boards.test.articles[0].body as string;
    expect(updated.indexOf("編輯摘要：第一次")).toBeLessThan(updated.indexOf("07/15/2026"));
    expect(updated.indexOf("07/15/2026")).toBeLessThan(updated.indexOf("編輯摘要：第二次"));
    expect(updated.indexOf("編輯摘要：第二次")).toBeLessThan(updated.indexOf("07/16/2026"));
    expect(updated.indexOf("07/16/2026")).toBeLessThan(updated.indexOf("編輯摘要：第三次"));
    expect(updated.match(/編輯摘要：第一次/gu)).toHaveLength(1);
    expect(updated.match(/編輯摘要：第二次/gu)).toHaveLength(1);
  });

  it("rejects article edits from a different fake user", async () => {
    const adapter = createFakePttAdapter();
    await adapter.login("mallory", "pw");

    const result = await adapter.editArticle({
      boardName: "test",
      articleIndex: 1001,
      expectedAuthor: "opUser",
      expectedTitle: "[測試] Fake PTT 多帳號互動測試",
      body: "不應寫入",
      editSummary: "未授權編輯",
    });

    expect(result).toEqual({ ok: false, reason: "只有文章作者可以編輯文章" });
    expect((await adapter.getArticle("test", 1001))?.body).not.toBe("不應寫入");
  });

  it("rejects article edits when the expected identity is stale", async () => {
    const adapter = createFakePttAdapter();
    await adapter.login("opUser", "pw");

    const result = await adapter.editArticle({
      boardName: "test",
      articleIndex: 1001,
      expectedAuthor: "opUser",
      expectedTitle: "錯誤標題",
      body: "不應寫入",
      editSummary: "過期快照",
    });

    expect(result).toEqual({ ok: false, reason: "文章身分已變更，請重新載入" });
  });

  it("creates a single-Re board article through the reply action", async () => {
    const adapter = createFakePttAdapter();
    await adapter.login("alice", "pw");

    await expect(adapter.replyArticleToBoard({
      boardName: "test",
      articleIndex: 1001,
      expectedAuthor: "opUser",
      expectedTitle: "[測試] Fake PTT 多帳號互動測試",
      body: "回應正文",
    })).resolves.toEqual({ ok: true });

    const store = JSON.parse(localStorage.getItem(FAKE_PTT_STORE_KEY) ?? "null");
    const created = store.boards.test.articles.at(-1);
    expect(created).toMatchObject({
      title: "Re: [測試] Fake PTT 多帳號互動測試",
      author: "alice",
      body: "回應正文",
      rawPushes: [],
    });

    await expect(adapter.replyArticleToBoard({
      boardName: "test",
      articleIndex: created.index,
      expectedAuthor: "alice",
      expectedTitle: created.title,
      body: "第二次回應",
    })).resolves.toEqual({ ok: true });

    const updatedStore = JSON.parse(localStorage.getItem(FAKE_PTT_STORE_KEY) ?? "null");
    expect(updatedStore.boards.test.articles.at(-1).title).toBe(
      "Re: [測試] Fake PTT 多帳號互動測試",
    );
  });

  it("rejects a board reply when the source identity is stale", async () => {
    const adapter = createFakePttAdapter();
    await adapter.login("alice", "pw");

    await expect(adapter.replyArticleToBoard({
      boardName: "test",
      articleIndex: 1001,
      expectedAuthor: "opUser",
      expectedTitle: "錯誤標題",
      body: "不應寫入",
    })).resolves.toEqual({
      ok: false,
      reason: "文章身分已變更，請重新載入",
    });
  });

  it("deletes an article owned by the current fake user", async () => {
    const adapter = createFakePttAdapter();
    await adapter.login("opUser", "pw");

    await expect(adapter.deleteArticle!({
      boardName: "test",
      articleIndex: 1001,
      expectedAuthor: "opUser",
      expectedTitle: "[測試] Fake PTT 多帳號互動測試",
    })).resolves.toEqual({ ok: true });

    await expect(adapter.getArticle("test", 1001)).resolves.toBeNull();
  });

  it("rejects article deletion from a different fake user", async () => {
    const adapter = createFakePttAdapter();
    await adapter.login("mallory", "pw");

    await expect(adapter.deleteArticle!({
      boardName: "test",
      articleIndex: 1001,
      expectedAuthor: "opUser",
      expectedTitle: "[測試] Fake PTT 多帳號互動測試",
    })).resolves.toEqual({
      ok: false,
      reason: "只有文章作者可以刪除文章",
    });

    await expect(adapter.getArticle("test", 1001)).resolves.not.toBeNull();
  });

  it("rejects article deletion when the expected identity is stale", async () => {
    const adapter = createFakePttAdapter();
    await adapter.login("opUser", "pw");

    await expect(adapter.deleteArticle!({
      boardName: "test",
      articleIndex: 1001,
      expectedAuthor: "opUser",
      expectedTitle: "錯誤標題",
    })).resolves.toEqual({
      ok: false,
      reason: "文章身分已變更，請重新載入",
    });

    await expect(adapter.getArticle("test", 1001)).resolves.not.toBeNull();
  });
});
