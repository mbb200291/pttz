import { describe, expect, it, vi } from "vitest";
import { ArticleSessionTracker } from "./articleSession.js";

const article = {
  key: { board: "Test", index: 42 } as const,
  board: "Test",
  author: "Alice",
  title: "[問卦]  測試文章",
  snapshot: "作者 Alice\n標題 [問卦]  測試文章\n本文",
};

describe("ArticleSessionTracker", () => {
  it("records normalized evidence and matches an unchanged index article", () => {
    const tracker = new ArticleSessionTracker();

    tracker.record(article);

    expect(tracker.match({
      key: { board: "test", index: 42 },
      board: " TEST ",
      author: "alice",
      title: " [問卦]\t測試文章 ",
      snapshot: article.snapshot,
    })).toBe(true);
    expect(tracker.diagnostic).toEqual({ state: "article", reason: "matched" });
  });

  it("ignores an optional hash but preserves case-sensitive AID identity", () => {
    const tracker = new ArticleSessionTracker();
    tracker.record({ ...article, key: { board: "Test", aid: "#1AbCdEfG" } });

    expect(tracker.match({
      ...article,
      key: { board: "test", aid: "1aBcDeFg" },
    })).toBe(false);
  });

  it("normalizes ASCII I/i independently of the runtime locale", () => {
    const localeLowerCase = vi.spyOn(String.prototype, "toLocaleLowerCase")
      .mockImplementation(function localeSensitiveLowerCase() {
        return this.toString().replaceAll("I", "ı").toLowerCase();
      });
    const tracker = new ArticleSessionTracker();

    try {
      tracker.record({
        ...article,
        key: { board: "INDEX", aid: "#IABC" },
        board: "INDEX",
        author: "IVAN",
      });

      expect(tracker.match({
        ...article,
        key: { board: "index", aid: "IABC" },
        board: "index",
        author: "ivan",
      })).toBe(true);
    } finally {
      localeLowerCase.mockRestore();
    }
  });

  it.each([
    ["article key", { ...article, key: { board: "Test", index: 43 } }],
    ["key kind", { ...article, key: { board: "Test", aid: "1AbCdEfG" } }],
    ["board evidence", { ...article, board: "Other" }],
    ["author evidence", { ...article, author: "Bob" }],
    ["title evidence", { ...article, title: "不同文章" }],
    ["terminal snapshot", { ...article, snapshot: `${article.snapshot}\n更新` }],
  ])("rejects mismatched %s and invalidates the session", (_label, evidence) => {
    const tracker = new ArticleSessionTracker();
    tracker.record(article);

    expect(tracker.match(evidence)).toBe(false);
    expect(tracker.diagnostic).toEqual({ state: "unknown", reason: "mismatch" });
    expect(tracker.match(article)).toBe(false);
  });

  it("can be explicitly invalidated with a diagnostic reason", () => {
    const tracker = new ArticleSessionTracker();
    tracker.record(article);

    tracker.invalidate("disconnected");

    expect(tracker.diagnostic).toEqual({ state: "unknown", reason: "disconnected" });
    expect(tracker.match(article)).toBe(false);
  });
});
