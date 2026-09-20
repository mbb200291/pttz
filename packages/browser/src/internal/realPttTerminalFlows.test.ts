import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { current, fixture, legacy, nested, replay, runClock } from "../../test-support/realPttReplay.js";
import {
  loginThroughTerminal, parseArticleInfoAid, parsePartialBoardScreen,
  parsePostCategoryOptions, submitPushFromCurrentArticle,
} from "./terminalDriver.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const loginTimeouts = { promptMs: 100, passwordPromptMs: 100, loginMs: 200, pollMs: 5, postSendMs: 5 };
const pushTimeouts = { typePromptMs: 100, confirmMs: 100, pollMs: 5, afterTypeMs: 5, afterConfirmMs: 100, afterContinueMs: 5 };

describe("live capture terminal operations (offline replay)", () => {
  it.each([false, true])("resumes the real duplicate prompt with kickOthers=%s", async kickOthers => {
    const read = (n: number) => kickOthers ? current(n) : fixture(`2026-09-13/keep-others/${String(n).padStart(3, "0")}.txt`);
    const r = replay(read(4), [
      { key: `\b${kickOthers ? "y" : "n"}\r`, frames: [read(5), read(6)] },
      { key: "\r", frames: [read(7)] },
    ]);
    const markLoggedIn = vi.fn();
    expect(await runClock(loginThroughTerminal(r.bot, {
      username: "fixture-user", password: "fixture-password", kickOthers,
      readSnapshot: r.snapshot, markLoggedIn, timeouts: loginTimeouts,
    }))).toEqual({ ok: true });
    expect(markLoggedIn).toHaveBeenCalledOnce();
    r.done();
  });

  it("stops at the newly encountered duplicate prompt without silently choosing", async () => {
    const r = replay(current(1), [
      { key: "fixture-user\r", frames: [current(2)] },
      { key: "fixture-password\r", frames: [current(3), current(4)] },
    ]);
    const markLoggedIn = vi.fn();
    expect(await runClock(loginThroughTerminal(r.bot, {
      username: "fixture-user", password: "fixture-password", kickOthers: false,
      readSnapshot: r.snapshot, markLoggedIn, timeouts: loginTimeouts,
    }))).toEqual({ ok: false, reason: "duplicate_login" });
    expect(markLoggedIn).not.toHaveBeenCalled();
    r.done();
  });

  it("parses the captured category prompt and original/reply AIDs", () => {
    expect(parsePostCategoryOptions(current(18))).toEqual(["測試", "色彩", "控制", "簽名", "圖", "動畫", "互動", "公告"]);
    expect(parseArticleInfoAid(current(29))).toEqual({ aid: "1gfZPfeb", board: "Test" });
    expect(parseArticleInfoAid(current(48))).toEqual({ aid: "1gfZSfsx", board: "Test" });
    expect(parsePartialBoardScreen(current(72))).toEqual([
      expect.objectContaining({ index: 1, author: "askz0", title: "test test" }),
    ]);
  });

  it("uses the real menu and reports board-return uncertainty without resending", async () => {
    const text = "回2樓：pttzzz-R1357 第一層回覆測試。";
    const r = replay(nested(14), [
      { key: "X", frames: [nested(14), nested(15)] },
      { key: "3", frames: [nested(16)] },
      { key: `${text}\r`, frames: [nested(17)] },
      { key: "y\r", frames: [nested(18)] },
    ]);
    expect(await runClock(submitPushFromCurrentArticle(r.bot, text, "neutral", undefined, pushTimeouts))).toMatchObject({
      outcome: "uncertain", code: "push-confirm-timeout",
    });
    r.done();
  });

  it("uses the cooldown's neutral input without sending a category number", async () => {
    const text = "回3樓：pttzzz-R1357 第二層巢狀測試。";
    const r = replay(nested(19), [
      { key: "X", frames: [nested(20)] },
      { key: `${text}\r`, frames: [nested(21)] },
      { key: "y\r", frames: [nested(22)] },
    ]);
    expect(await runClock(submitPushFromCurrentArticle(r.bot, text, "neutral", undefined, pushTimeouts))).toMatchObject({ outcome: "uncertain" });
    r.done();
  });

  it("recognizes a delayed reader return (derived timing scenario)", async () => {
    const r = replay(nested(23), [
      { key: "X", frames: [nested(24)] },
      { key: "推2樓\r", frames: [nested(25)] },
      // Actual capture returns to the board; this variant tests a later reader return.
      { key: "y\r", frames: [nested(26), nested(27)], delayMs: 20 },
    ]);
    expect(await runClock(submitPushFromCurrentArticle(r.bot, "推2樓", "neutral", undefined, pushTimeouts))).toMatchObject({ outcome: "sent" });
    r.done();
  });

  it("does not resend when confirmation stays on screen (derived missing-response scenario)", async () => {
    const r = replay(nested(23), [
      { key: "X", frames: [nested(24)] },
      { key: "推2樓\r", frames: [nested(25)] },
      { key: "y\r", frames: [nested(25)] },
    ]);
    expect(await runClock(submitPushFromCurrentArticle(r.bot, "推2樓", "neutral", undefined, pushTimeouts))).toMatchObject({ outcome: "uncertain" });
    r.done();
  });

  it.each(["push", "boo"] as const)("rejects native %s at a cooldown-only neutral input", async type => {
    const r = replay(nested(19), [
      { key: "X", frames: [nested(20)] },
      // Cancellation is simulated; no live Ctrl-C cancellation was captured here.
      { key: "\x03", frames: [nested(19)] },
    ]);
    expect(await runClock(submitPushFromCurrentArticle(r.bot, "must-not-send", type, undefined, pushTimeouts))).toMatchObject({ outcome: "not-sent", code: "push-type-not-allowed" });
    r.done();
  });

  it.each(["new", "legacy"])("does not mistake %s historical confirmation content for a new input", async source => {
    const historical = source === "new" ? current(34) : legacy("filtered-write.txt", "push input while still in special-list mode (captured bug)");
    const r = replay(current(14), [{ key: "X", frames: [historical] }]);
    expect(await runClock(submitPushFromCurrentArticle(r.bot, "must-not-send", "neutral", undefined, pushTimeouts))).toMatchObject({ outcome: "not-sent", code: "push-entry-timeout" });
    r.done();
  });
});
