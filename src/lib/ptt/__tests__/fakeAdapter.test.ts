// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createFakePttAdapter, FAKE_PTT_STORE_KEY } from "../fakeAdapter";

describe("fake PTT adapter", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, "", "/");
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
});
