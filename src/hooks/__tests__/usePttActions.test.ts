import { describe, expect, it } from "vitest";

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
