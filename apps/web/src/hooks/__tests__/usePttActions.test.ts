// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { PttzzzClient } from "@pttzzz/core";
import { usePttActions } from "../usePttActions";
import { usePttSocketStore } from "../usePttSocket";

const methods = {
  createArticle: vi.fn(), editArticle: vi.fn(), deleteArticle: vi.fn(),
  replyToArticle: vi.fn(), replyArticleToBoard: vi.fn(),
  voteArticle: vi.fn(), withdrawArticleVote: vi.fn(),
  replyToReply: vi.fn(), editReply: vi.fn(), withdrawReply: vi.fn(),
  voteReply: vi.fn(), withdrawReplyVote: vi.fn(),
};

describe("usePttActions public client delegation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const method of Object.values(methods)) method.mockResolvedValue({ ok: true, value: undefined });
    usePttSocketStore.setState({
      client: methods as unknown as PttzzzClient,
      pttState: "ready",
      credentials: { username: "alice", password: "pw" },
    });
  });

  it("delegates article writes as public DTOs", async () => {
    const { result } = renderHook(() => usePttActions());
    const article = { board: "Test", index: 12 } as const;
    await result.current.createArticle({ board: "Test", category: "問卦", title: "title", content: "body" });
    await result.current.editArticle({ article, content: "new", editSummary: "fix" });
    await result.current.deleteArticle({ article });
    await result.current.replyToArticle({ article, content: "reply", pushType: "neutral" });
    await result.current.replyArticleToBoard({ article, content: "board reply" });
    await result.current.voteArticle({ article, direction: "push" });
    await result.current.withdrawArticleVote({ article, direction: "push" });

    expect(methods.createArticle).toHaveBeenCalledWith({ board: "Test", category: "問卦", title: "title", content: "body" });
    expect(methods.editArticle).toHaveBeenCalledWith({ article, content: "new", editSummary: "fix" });
    expect(methods.deleteArticle).toHaveBeenCalledWith({ article });
    expect(methods.replyToArticle).toHaveBeenCalledWith({ article, content: "reply", pushType: "neutral" });
    expect(methods.replyArticleToBoard).toHaveBeenCalledWith({ article, content: "board reply" });
  });

  it("delegates every reply write by stable replyId", async () => {
    const { result } = renderHook(() => usePttActions());
    const article = { board: "Test", aid: "#aid" } as const;
    const target = { article, replyId: "reply:stable" };
    await result.current.replyToReply({ ...target, content: "reply", pushType: "boo" });
    await result.current.editReply({ ...target, mode: "replace", content: "new" });
    await result.current.withdrawReply(target);
    await result.current.voteReply({ ...target, direction: "push" });
    await result.current.withdrawReplyVote({ ...target, direction: "boo" });

    expect(methods.replyToReply).toHaveBeenCalledWith({ ...target, content: "reply", pushType: "boo" });
    expect(methods.editReply).toHaveBeenCalledWith({ ...target, mode: "replace", content: "new" });
    expect(methods.withdrawReply).toHaveBeenCalledWith(target);
    expect(methods.voteReply).toHaveBeenCalledWith({ ...target, direction: "push" });
    expect(methods.withdrawReplyVote).toHaveBeenCalledWith({ ...target, direction: "boo" });
  });

  it("returns a not-sent Result without a client", async () => {
    usePttSocketStore.setState({ client: null, pttState: "closed", credentials: null });
    const { result } = renderHook(() => usePttActions());
    await expect(result.current.deleteArticle({ article: { board: "Test", index: 1 } }))
      .resolves.toMatchObject({ ok: false, error: { outcome: "not-sent" } });
    expect(result.current.isLoggedIn).toBe(false);
  });
});
