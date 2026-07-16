// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createFakePttAdapter } from "../fakeAdapter";

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
});
