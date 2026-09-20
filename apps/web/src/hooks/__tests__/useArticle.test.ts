// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Article, CoreEvent, PttzzzClient } from "@pttzzz/core";
import { usePttSocketStore } from "../usePttSocket";
import { useArticle } from "../useArticle";
import { clearPttViewCache, readArticleCache } from "../../lib/ptt/viewCache";

const listeners = new Set<(event: CoreEvent) => void>();
const getArticle = vi.fn();
const client = {
  getArticle,
  subscribe: vi.fn((listener: (event: CoreEvent) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }),
} as unknown as PttzzzClient;

function article(board: string, index: number, revision: number, body: string): Article {
  return {
    key: { board, index },
    completeness: "final",
    revision,
    title: `article-${index}`,
    author: "author",
    body,
    replies: [],
    articleEdits: [],
    revisions: [],
    nativePushCount: 0,
    nativeBooCount: 0,
    nativeNeutralCount: 0,
    nativeScore: 0,
    nativeVotes: { pushCount: 0, booCount: 0, score: 0 },
    articleVotes: { pushCount: 0, booCount: 0, score: 0 },
  };
}

describe("useArticle public event bridge", () => {
  it("keeps withdrawn placeholders and traverses their children", async () => {
    const source = article("Test", 10, 1, "body");
    const child = { replyId: "child", author: "bob", content: "child body", pushType: "neutral" as const,
      depth: 2, score: 0, votes: { pushCount: 0, booCount: 0, score: 0 }, isOp: false,
      visible: true, children: [], edits: [], replyTo: "gone" };
    source.replies = [{ ...child, replyId: "gone", author: "alice", content: " ",
      depth: 1, replyTo: undefined, visible: false, children: [child] }];
    getArticle.mockResolvedValue({ ok: true, value: source });
    const { result } = renderHook(() => useArticle("Test", 10));
    await waitFor(() => expect(result.current.article).not.toBeNull());
    expect(result.current.article?.pushes).toMatchObject([
      { id: "gone", visible: false }, { id: "child", replyTo: "gone", displayReplyTo: "gone" },
    ]);
  });
  it("prepends the original version to operation-only edit history", async () => {
    const source = article("Test", 10, 1, "body");
    source.replies = [{ replyId: "reply:5", author: "MBB200291", content: "♥♡♥♡♥♡", pushType: "neutral",
      depth: 1, score: 0, votes: { pushCount: 0, booCount: 0, score: 0 }, isOp: false, visible: true, children: [],
      originalVersion: { content: "♥♥♥♥♥", createdAt: "09/16 23:30" },
      edits: [
        { kind: "replace", author: "MBB200291", content: "♡♥♡", resultContent: "♥♡♥♡♥", createdAt: "09/16 23:31" },
        { kind: "replace", author: "MBB200291", content: "♡", resultContent: "♥♡♥♡♥♡", createdAt: "09/16 23:35" },
      ] }];
    getArticle.mockResolvedValue({ ok: true, value: source });
    const { result } = renderHook(() => useArticle("Test", 10));
    await waitFor(() => expect(result.current.article).not.toBeNull());
    expect(result.current.article?.pushes[0].editHistory).toMatchObject([
      { kind: "original", content: "♥♥♥♥♥", time: "09/16 23:30", resultContent: "♥♥♥♥♥" },
      { kind: "replace", time: "09/16 23:31", resultContent: "♥♡♥♡♥" },
      { kind: "replace", time: "09/16 23:35", resultContent: "♥♡♥♡♥♡" },
    ]);
  });
  beforeEach(() => {
    listeners.clear();
    vi.clearAllMocks();
    clearPttViewCache();
    usePttSocketStore.setState({ client, pttState: "ready" });
  });

  it("accepts only matching monotonic partial/final revisions", async () => {
    let resolve!: (value: { ok: true; value: Article }) => void;
    getArticle.mockReturnValue(new Promise((next) => { resolve = next; }));
    const { result } = renderHook(() => useArticle("Test", 10));
    await waitFor(() => expect(getArticle).toHaveBeenCalledOnce());
    expect(getArticle).toHaveBeenCalledWith({
      article: { board: "Test", index: 10 },
      includeDebugMetadata: true,
    });

    act(() => {
      for (const listener of listeners) {
        listener({
          type: "article.partial",
          articleKey: { board: "Other", index: 10 },
          revision: 9,
          article: { key: { board: "Other", index: 10 }, completeness: "incomplete", revision: 9, body: "wrong", replies: [] },
        });
        listener({
          type: "article.partial",
          articleKey: { board: "Test", index: 10 },
          revision: 2,
          article: { key: { board: "Test", index: 10 }, completeness: "incomplete", revision: 2, body: "new partial", replies: [], articleVotes: { pushCount: 12, booCount: 2, score: 10 } },
        });
        listener({
          type: "article.partial",
          articleKey: { board: "Test", index: 10 },
          revision: 1,
          article: { key: { board: "Test", index: 10 }, completeness: "incomplete", revision: 1, body: "stale", replies: [] },
        });
      }
    });
    expect(result.current.partialArticle?.body).toBe("new partial");
    expect(result.current.partialArticle?.articleVotes).toEqual({ pushCount: 12, booCount: 2, score: 10 });

    resolve({ ok: true, value: article("Test", 10, 3, "final") });
    await waitFor(() => expect(result.current.article?.body).toBe("final"));
    expect(listeners.size).toBe(0);
  });

  it("surfaces Result errors without throwing", async () => {
    getArticle.mockResolvedValue({
      ok: false,
      error: { code: "READ_FAILED", message: "cannot read", retryable: true },
    });
    const { result } = renderHook(() => useArticle("Test", 10));
    await waitFor(() => expect(result.current.error).toBe("cannot read"));
    expect(result.current.loading).toBe(false);
  });

  it("reports whether reload received authoritative article data", async () => {
    getArticle
      .mockResolvedValueOnce({ ok: true, value: article("Test", 10, 1, "initial") })
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "READ_FAILED", message: "cannot read", retryable: true },
      })
      .mockResolvedValueOnce({ ok: true, value: article("Test", 10, 2, "fresh") });
    const { result } = renderHook(() => useArticle("Test", 10));
    await waitFor(() => expect(result.current.article?.body).toBe("initial"));

    await expect(act(() => result.current.reload())).resolves.toBe(false);
    await expect(act(() => result.current.reload())).resolves.toBe(true);
    expect(result.current.article?.body).toBe("fresh");
  });

  it("does not let an older article request overwrite a newer key", async () => {
    const resolvers: Array<(value: { ok: true; value: Article }) => void> = [];
    getArticle.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve as never)));
    const { result, rerender } = renderHook(
      ({ index }) => useArticle("Test", index),
      { initialProps: { index: 10 } },
    );
    await waitFor(() => expect(resolvers).toHaveLength(1));
    rerender({ index: 11 });
    await waitFor(() => expect(resolvers).toHaveLength(2));

    resolvers[1]({ ok: true, value: article("Test", 11, 1, "new") });
    await waitFor(() => expect(result.current.article?.body).toBe("new"));
    resolvers[0]({ ok: true, value: article("Test", 10, 1, "old") });
    await Promise.resolve();
    expect(result.current.article?.body).toBe("new");
  });

  it("does not let an older final Result overwrite a newer final event", async () => {
    let resolve!: (value: { ok: true; value: Article }) => void;
    getArticle.mockReturnValue(new Promise((next) => { resolve = next; }));
    const { result } = renderHook(() => useArticle("Test", 10));
    await waitFor(() => expect(getArticle).toHaveBeenCalledOnce());
    act(() => {
      for (const listener of listeners) listener({
        type: "article.updated",
        articleKey: { board: "Test", index: 10 },
        revision: 2,
        article: article("Test", 10, 2, "event-new"),
      });
    });
    resolve({ ok: true, value: article("Test", 10, 1, "result-old") });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.article?.body).toBe("event-new");
    expect(readArticleCache("Test", 10)?.body).toBe("event-new");
  });

  it("keeps stable reply identity without exposing raw source floors to the UI", async () => {
    const withReply: Article = { ...article("Test", 10, 1, "body"), replies: [{
      replyId: "reply:12",
      author: "alice",
      content: "reply",
      pushType: "neutral",
      depth: 1,
      score: 0,
      votes: { pushCount: 0, booCount: 0, score: 0 },
      isOp: false,
      visible: true,
      edits: [{
        kind: "replace",
        author: "alice",
        content: "replacement command",
        resultContent: "replacement result",
      }],
      children: [],
      metadata: { sourceFloors: [12] },
    }] };
    getArticle.mockResolvedValue({ ok: true, value: withReply });

    const { result } = renderHook(() => useArticle("Test", 10));
    await waitFor(() => expect(result.current.article).not.toBeNull());
    expect(result.current.article?.pushes[0]).toMatchObject({
      id: "reply:12",
      floorNumber: 0,
      sourceFloors: [],
      editHistory: [{ content: "replacement command", resultContent: "replacement result" }],
    });
  });

  it("projects authoritative native, article, and reply vote totals", async () => {
    const withVotes: Article = {
      ...article("Test", 10, 1, "body"),
      nativePushCount: 8,
      nativeBooCount: 3,
      nativeScore: 5,
      nativeVotes: { pushCount: 8, booCount: 3, score: 5, viewerVote: "push" },
      articleVotes: { pushCount: 5, booCount: 2, score: 3, viewerVote: "boo" },
      replies: [{
        replyId: "reply:12",
        author: "alice",
        content: "reply",
        pushType: "neutral",
        depth: 1,
        score: 4,
        votes: { pushCount: 6, booCount: 2, score: 4, viewerVote: "push" },
        isOp: false,
        visible: true,
        edits: [],
        children: [],
      }],
    };
    getArticle.mockResolvedValue({ ok: true, value: withVotes });

    const { result } = renderHook(() => useArticle("Test", 10));
    await waitFor(() => expect(result.current.article).not.toBeNull());
    expect(result.current.article).toMatchObject({
      score: 3,
      nativeVotes: { pushCount: 8, booCount: 3, score: 5, viewerVote: "push" },
      articleVotes: { pushCount: 5, booCount: 2, score: 3, viewerVote: "boo" },
      pushes: [{ votes: { pushCount: 6, booCount: 2, score: 4, viewerVote: "push" } }],
    });
  });
});
