// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePttSocketStore } from "../usePttSocket";
import type { PttAdapter } from "../../lib/ptt/adapter";

describe("usePttActions format helpers", () => {
  it("formatReplyToPush formats a reply to a floor", async () => {
    const mod = await import("../usePttActions");
    expect(mod.formatReplyToPush(3, "我同意")).toBe("回3樓：我同意");
  });

  it("formatReplyToPush trims whitespace from content", async () => {
    const mod = await import("../usePttActions");
    expect(mod.formatReplyToPush(5, "  content  ")).toBe("回5樓：content");
  });

  it("formatEditPush formats 補充 mode with single floor", async () => {
    const mod = await import("../usePttActions");
    expect(mod.formatEditPush("補充", 5, null, "更多說明")).toBe(
      "補充我在5樓發言：更多說明",
    );
  });

  it("formatEditPush formats 更正 mode with single floor", async () => {
    const mod = await import("../usePttActions");
    expect(mod.formatEditPush("更正", 5, null, "正確說法")).toBe(
      "更正我在5樓發言：正確說法",
    );
  });

  it("formatEditPush formats 撤回 mode with floor range", async () => {
    const mod = await import("../usePttActions");
    expect(mod.formatEditPush("撤回", 3, 5, "")).toBe("撤回我在3~5樓的發言");
  });

  it("formatEditPush formats 撤回 mode with single floor", async () => {
    const mod = await import("../usePttActions");
    expect(mod.formatEditPush("撤回", 7, null, "")).toBe("撤回我在7樓的發言");
  });

  it("formatEditPush trims content for 補充 and 更正", async () => {
    const mod = await import("../usePttActions");
    expect(mod.formatEditPush("補充", 2, null, "  trimmed  ")).toBe(
      "補充我在2樓發言：trimmed",
    );
    expect(mod.formatEditPush("更正", 3, null, "  also trimmed  ")).toBe(
      "更正我在3樓發言：also trimmed",
    );
  });

  it("formatArticleVote formats push vote", async () => {
    const mod = await import("../usePttActions");
    expect(mod.formatArticleVote(1, "push")).toBe("推1樓");
  });

  it("formatArticleVote formats boo vote", async () => {
    const mod = await import("../usePttActions");
    expect(mod.formatArticleVote(3, "boo")).toBe("噓3樓");
  });

  it("formatPushVote formats push vote", async () => {
    const mod = await import("../usePttActions");
    expect(mod.formatPushVote(1, "push")).toBe("推1樓");
  });

  it("formatPushVote formats boo vote", async () => {
    const mod = await import("../usePttActions");
    expect(mod.formatPushVote(3, "boo")).toBe("噓3樓");
  });
});

describe("canVote", () => {
  it("returns true when no previous vote and direction is push", async () => {
    const { canVote } = await import("../usePttActions");
    expect(canVote(0, "push")).toBe(true);
  });

  it("returns true when no previous vote and direction is boo", async () => {
    const { canVote } = await import("../usePttActions");
    expect(canVote(0, "boo")).toBe(true);
  });

  it("returns false when already pushed and direction is push", async () => {
    const { canVote } = await import("../usePttActions");
    expect(canVote(1, "push")).toBe(false);
  });

  it("returns true when already pushed and direction is boo", async () => {
    const { canVote } = await import("../usePttActions");
    expect(canVote(1, "boo")).toBe(true);
  });

  it("returns false when already booed and direction is boo", async () => {
    const { canVote } = await import("../usePttActions");
    expect(canVote(-1, "boo")).toBe(false);
  });

  it("returns true when already booed and direction is push", async () => {
    const { canVote } = await import("../usePttActions");
    expect(canVote(-1, "push")).toBe(true);
  });
});

describe("usePttActions adapter integration", () => {
  it("sends article replies through the PTT adapter", async () => {
    const replyToArticle = vi.fn().mockResolvedValue({ ok: true });
    usePttSocketStore.setState({
      client: {
        isLoggedIn: vi.fn().mockReturnValue(true),
        replyToArticle,
      } as unknown as PttAdapter,
      pttState: "ready",
    });

    const { usePttActions } = await import("../usePttActions");
    const { result } = renderHook(() => usePttActions());

    await expect(result.current.replyToArticle("測試回文", "push")).resolves.toEqual({
      ok: true,
    });
    expect(replyToArticle).toHaveBeenCalledWith("測試回文", "push", undefined);
  });

  it("forwards the complete article edit request to the adapter", async () => {
    const editArticle = vi.fn().mockResolvedValue({ ok: true });
    usePttSocketStore.setState({
      client: {
        isLoggedIn: vi.fn().mockReturnValue(true),
        editArticle,
      } as unknown as PttAdapter,
      pttState: "ready",
    });

    const { usePttActions } = await import("../usePttActions");
    const { result } = renderHook(() => usePttActions());
    const request = {
      boardName: "Test",
      articleIndex: 123,
      expectedAuthor: "alice",
      expectedTitle: "[測試] 原標題",
      body: "更新正文",
      editSummary: "修正來源",
    };

    await expect(result.current.editArticle(request)).resolves.toEqual({ ok: true });
    expect(editArticle).toHaveBeenCalledWith(request);
  });

  it("sends a formatted push edit as a neutral article reply", async () => {
    const replyToArticle = vi.fn().mockResolvedValue({ ok: true });
    usePttSocketStore.setState({
      client: {
        isLoggedIn: vi.fn().mockReturnValue(true),
        replyToArticle,
      } as unknown as PttAdapter,
      pttState: "ready",
    });

    const { usePttActions } = await import("../usePttActions");
    const { result } = renderHook(() => usePttActions());

    await expect(
      result.current.editPush("更正", 12, null, "新內容", "push", "Test"),
    ).resolves.toEqual({ ok: true });
    expect(replyToArticle).toHaveBeenCalledWith(
      "更正我在12樓發言：新內容",
      "neutral",
      "Test",
    );
  });
});
