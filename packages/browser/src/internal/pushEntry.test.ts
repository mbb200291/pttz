import { describe, expect, it } from "vitest";
import { submitPushFromCurrentArticle } from "./terminalDriver.js";

const menu = "您覺得這篇文章 1.值得推薦 2.給它噓聲 3.只加→註解 [1]?";
const noBooMenu = "您覺得這篇文章 1.值得推薦 3.只加→註解 [1]?";
const reading = "作者  alice 看板 Test\n正文\n瀏覽 第 1/1 頁 (100%)";
const fullArticle = "作者  alice 看板 Test\n標題  測試文章\n正文\n瀏覽 第 1/1 頁 (100%)";
const timeouts = { typePromptMs: 15, confirmMs: 15, pollMs: 1, afterTypeMs: 0, afterConfirmMs: 0, afterContinueMs: 0 };

type TranscriptAction = "X" | "1" | "2" | "3" | "content" | "confirm" | "continue" | "cancel";

function terminal(
  transcript: Partial<Record<TranscriptAction, readonly string[]>>,
  initial = reading,
) {
  let frames: readonly string[] = [initial];
  let frameIndex = 0;
  let activeAction: TranscriptAction | "initial" = "initial";
  const sent: string[] = [];
  const reads: string[] = [];
  const expose = (action: TranscriptAction) => {
    frames = transcript[action] ?? frames;
    frameIndex = -1;
    activeAction = action;
  };
  return {
    sent,
    reads,
    get activeAction() { return activeAction; },
    bot: {
      getLine(row: number) {
        if (row === 0) {
          frameIndex = Math.min(frameIndex + 1, frames.length - 1);
          reads.push(`${activeAction}:${frameIndex}`);
        }
        return { str: (frames[frameIndex] ?? "").split("\n")[row] ?? "" };
      },
      async send(value: string) {
        sent.push(value);
        if (value === "X") expose("X");
        else if (value === "1" || value === "2" || value === "3") expose(value);
        else if (value === "y\r") expose("confirm");
        else if (value === "\r") expose("continue");
        else if (value === "\x03") {
          const prompt = (frames[Math.max(frameIndex, 0)] ?? "").trim().split("\n").at(-1);
          expose(prompt === menu || prompt === noBooMenu ? "1" : "cancel");
        }
        else expose("content");
        return true;
      },
    },
  };
}

function pushActions() {
  const trace = (globalThis as typeof globalThis & {
    __pttzzzLastPushTrace?: { actions?: Array<Record<string, unknown>> };
  }).__pttzzzLastPushTrace;
  return trace?.actions ?? [];
}

function expectSemanticActions(expected: readonly string[]) {
  const actions = pushActions();
  expect(actions.map((entry) => entry.action)).toEqual(expected);
  for (const entry of actions) {
    expect(Object.keys(entry).sort()).toEqual(["action", "elapsedMs"]);
    expect(entry.elapsedMs).toEqual(expect.any(Number));
  }
}

describe("real PTT push entry variants", () => {
  it("stops a floor vote when X unexpectedly opens a native push input", async () => {
    const { bot, sent } = terminal({
      X: ["推 TEST", `${reading}\n推 TEST_USER:                                                     `],
      cancel: ["已取消"],
    });
    expect(await submitPushFromCurrentArticle(bot, "推1樓", "neutral", undefined, timeouts)).toMatchObject({ outcome: "not-sent", code: "push-type-not-allowed" });
    expect(sent).toEqual(["X", "\x03"]);
    expectSemanticActions(["open-push-menu", "cancel"]);
  });
  it("chooses annotation then recognizes the bare empty input after a non-author menu", async () => {
    const { bot, sent } = terminal({
      X: ["您覺得這篇文章 1.值得", `${reading}\n${menu}`],
      3: ["→ TEST", "→ TEST_USER:     "],
      content: ["→ TEST_USER: 推1樓", "→ TEST_USER   : 推1樓    確定[y/N]:"],
      confirm: ["請按任意鍵繼續"],
      continue: [reading],
    });
    expect(await submitPushFromCurrentArticle(bot, "推1樓", "neutral", undefined, timeouts)).toMatchObject({ outcome: "sent" });
    expect(sent).toEqual(["X", "3", "推1樓\r", "y\r", "\r"]);
    expectSemanticActions(["open-push-menu", "select-neutral", "submit-content", "confirm", "continue"]);
  });

  it("waits for the same article to reappear after confirming a push", async () => {
    const { bot, sent, reads } = terminal({
      X: [menu],
      3: ["→ TEST_USER: "],
      content: ["→ TEST_USER: 推1樓 確定[y/N]:"],
      confirm: ["→ TEST_USER: 推1樓 確定[y/N]:", reading],
    });

    expect(await submitPushFromCurrentArticle(bot, "推1樓", "neutral", undefined, {
      ...timeouts,
      afterConfirmMs: 15,
    })).toMatchObject({ outcome: "sent" });
    expect(sent).toEqual(["X", "3", "推1樓\r", "y\r"]);
    expect(reads).toContain("confirm:1");
  });

  it("reports uncertainty when PTT does not leave the confirmation or error screen", async () => {
    const rejection = "系統拒絕推文，請稍後再試";
    const { bot, sent } = terminal({
      X: [menu],
      3: ["→ TEST_USER: "],
      content: ["→ TEST_USER: 推1樓 確定[y/N]:"],
      confirm: [rejection],
    });

    expect(await submitPushFromCurrentArticle(bot, "推1樓", "neutral", undefined, {
      ...timeouts,
      afterConfirmMs: 5,
    })).toMatchObject({ outcome: "uncertain", code: "push-confirm-timeout" });
    expect(sent).toEqual(["X", "3", "推1樓\r", "y\r"]);
    expectSemanticActions(["open-push-menu", "select-neutral", "submit-content", "confirm"]);
  });

  it.each([
    `${fullArticle}\n${menu}`,
    "作者  alice 看板 Test\n標題  測試文章\n正文",
  ])("does not accept an article-shaped overlay or header without a reader footer after confirmation", async (afterConfirm) => {
    const { bot, sent } = terminal({
      X: [menu],
      3: ["→ TEST_USER: "],
      content: ["→ TEST_USER: 推1樓 確定[y/N]:"],
      confirm: [afterConfirm],
    }, fullArticle);

    expect(await submitPushFromCurrentArticle(bot, "推1樓", "neutral", undefined, {
      ...timeouts,
      afterConfirmMs: 5,
    })).toMatchObject({ outcome: "uncertain" });
    expect(sent).toEqual(["X", "3", "推1樓\r", "y\r"]);
  });

  it.each([
    ["neutral", "3", "→ TEST_USER   : ", "select-neutral"],
    ["push", "1", "推 TEST_USER   : ", "select-push"],
  ] as const)("selects %s from the official menu without a boo option", async (pushType, key, input, action) => {
    const { bot, sent } = terminal({
      X: ["您覺得這篇文章 1.值得推薦", noBooMenu],
      [key]: [input],
      content: [`${input}推1樓    確定[y/N]:`],
      confirm: [reading],
    });
    expect(await submitPushFromCurrentArticle(bot, "推1樓", pushType, undefined, timeouts)).toMatchObject({ outcome: "sent" });
    expect(sent).toEqual(["X", key, "推1樓\r", "y\r"]);
    expectSemanticActions(["open-push-menu", action, "submit-content", "confirm"]);
  });

  it("safely rejects boo when the official menu has no boo option", async () => {
    const simulated = terminal({
      X: [noBooMenu],
      3: ["正在切換推文類別", "→ TEST_USER   : "],
      cancel: ["已取消"],
      1: ["推 TEST_USER: "],
    });
    const { bot, sent } = simulated;
    expect(await submitPushFromCurrentArticle(bot, "不可送出", "boo", undefined, timeouts)).toMatchObject({
      outcome: "not-sent",
      code: "push-type-not-allowed",
    });
    expect(sent).toEqual(["X", "3", "\x03"]);
    expect(sent).not.toContain("2");
    expect(sent).not.toContain("不可送出\r");
    expect(simulated.activeAction).toBe("cancel");
    expectSemanticActions(["open-push-menu", "select-neutral", "cancel"]);
  });

  it("does not send a blind cleanup key when neutral input never appears", async () => {
    const simulated = terminal({
      X: [noBooMenu],
      3: ["正在切換推文類別"],
      cancel: ["不應抵達取消畫面"],
    });
    const { bot, sent } = simulated;
    expect(await submitPushFromCurrentArticle(bot, "不可送出", "boo", undefined, timeouts)).toMatchObject({
      outcome: "not-sent",
      code: "push-content-prompt-timeout",
      retryable: true,
    });
    expect(sent).toEqual(["X", "3"]);
    expect(simulated.activeAction).toBe("3");
    expectSemanticActions(["open-push-menu", "select-neutral"]);
  });

  it("does not choose a type again in the author's direct annotation input", async () => {
    const { bot, sent, reads } = terminal({
      X: ["作者本人, 使用 → 加註方式", `${reading}\n作者本人, 使用 → 加註方式\n→ TEST_USER   : `],
      content: ["→ TEST_USER: 推1樓    確定[y/N]:"],
      confirm: [reading],
    });
    expect(await submitPushFromCurrentArticle(bot, "推1樓", "neutral", undefined, timeouts)).toMatchObject({ outcome: "sent" });
    expect(sent).toEqual(["X", "推1樓\r", "y\r"]);
    expect(reads).toContain("X:1");
    expectSemanticActions(["open-push-menu", "submit-content", "confirm"]);
  });

  it.each([
    ["push", "1", "推 TEST_USER: ", "select-push"],
    ["boo", "2", "噓 TEST_USER: ", "select-boo"],
  ] as const)("records the semantic %s selection without its content", async (pushType, key, input, action) => {
    const { bot, reads } = terminal({
      X: [menu],
      [key]: ["文章提醒：請輸入推文內容: 但這是說明", input],
      content: ["文章內容提到是否送出或儲存", `${input}PRIVATE_DRAFT 確定[y/N]:`],
      confirm: [reading],
    });
    expect(await submitPushFromCurrentArticle(bot, "PRIVATE_DRAFT", pushType, undefined, timeouts)).toMatchObject({ outcome: "sent" });
    expect(reads).toContain(`${key}:1`);
    expect(reads).toContain("content:1");
    expectSemanticActions(["open-push-menu", action, "submit-content", "confirm"]);
    const trace = (globalThis as typeof globalThis & { __pttzzzLastPushTrace?: unknown }).__pttzzzLastPushTrace;
    expect(JSON.stringify(trace)).not.toContain("PRIVATE_DRAFT");
  });

  it("does not confirm from article text containing confirmation words", async () => {
    const { bot, sent } = terminal({
      X: [menu],
      3: ["→ TEST_USER: "],
      content: ["舊文寫著是否確定送出或儲存"],
    });
    expect(await submitPushFromCurrentArticle(bot, "推1樓", "neutral", undefined, timeouts)).toMatchObject({
      outcome: "uncertain",
      code: "push-confirm-timeout",
    });
    expect(sent).toEqual(["X", "3", "推1樓\r"]);
    expectSemanticActions(["open-push-menu", "select-neutral", "submit-content"]);
  });

  it("does not submit content when the caller invalidates the article session", async () => {
    const { bot, sent } = terminal({
      X: [menu],
      3: ["→ TEST_USER: "],
      cancel: ["已取消"],
    });

    expect(await submitPushFromCurrentArticle(
      bot,
      "PRIVATE_DRAFT",
      "neutral",
      undefined,
      timeouts,
      () => false,
    )).toMatchObject({ outcome: "not-sent", retryable: true });
    expect(sent).toEqual(["X", "3"]);
    expect(JSON.stringify(pushActions())).not.toContain("PRIVATE_DRAFT");
    expectSemanticActions(["open-push-menu", "select-neutral"]);
  });

  it("does not confirm when the caller invalidates the session after content submission", async () => {
    let checks = 0;
    const { bot, sent } = terminal({
      X: [menu],
      3: ["→ TEST_USER: "],
      content: ["→ TEST_USER: PRIVATE_DRAFT 確定[y/N]:"],
    });

    expect(await submitPushFromCurrentArticle(
      bot,
      "PRIVATE_DRAFT",
      "neutral",
      undefined,
      timeouts,
      () => ++checks === 1,
    )).toMatchObject({ outcome: "uncertain" });
    expect(sent).toEqual(["X", "3", "PRIVATE_DRAFT\r"]);
    expect(sent).not.toContain("y\r");
  });

  it.each([
    `${menu}\n正文提到推文方式\n瀏覽 第 1/1 頁 (100%)`,
    "→ TEST_USER: 舊留言 09/11 22:00\n瀏覽 第 1/1 頁 (100%)",
    "→ TEST_USER: test 確定[y/N]:",
    "正文說推文方式可選值得推薦或只加註解",
  ])("does not treat article text or confirmation as a new entry: %s", async (entry) => {
    const { bot, sent } = terminal({ X: [entry], cancel: ["已取消"] });
    expect(await submitPushFromCurrentArticle(bot, "推1樓", "neutral", undefined, timeouts)).toMatchObject({ outcome: "not-sent", code: "push-entry-timeout" });
    expect(sent).toEqual(["X"]);
  });

  it("rejects a stale empty input that was already present before X", async () => {
    const { bot, sent } = terminal({ X: ["→ TEST_USER: "], cancel: ["已取消"] }, "→ TEST_USER: ");
    expect(await submitPushFromCurrentArticle(bot, "推1樓", "neutral", undefined, timeouts)).toMatchObject({ outcome: "not-sent" });
    expect(sent).toEqual(["X"]);
  });

  it.each([
    "推 TEST_USER: ",
    "噓 TEST_USER: ",
    "→ TEST_USER: 已有文字",
    "→ TEST_USER: test 確定[y/N]:",
    "請輸入推文內容:",
    "作者本人，使用 → 加註方式",
  ])("does not write a neutral vote into an incompatible input: %s", async (input) => {
    const { bot, sent } = terminal({ X: [menu], 3: [input], cancel: ["已取消"] });
    expect(await submitPushFromCurrentArticle(bot, "推1樓", "neutral", undefined, timeouts)).toMatchObject({ outcome: "not-sent", code: "push-content-prompt-timeout" });
    expect(sent).toEqual(["X", "3"]);
  });

  it("keeps the author's neutral-only restriction for a native boo", async () => {
    const { bot, sent } = terminal({ X: ["作者本人, 使用 → 加註方式\n→ TEST_USER: "], cancel: ["已取消"] });
    expect(await submitPushFromCurrentArticle(bot, "噓", "boo", undefined, timeouts)).toMatchObject({ outcome: "not-sent", code: "push-type-not-allowed" });
    expect(sent).toEqual(["X", "\x03"]);
  });

  it("omits sensitive terminal screens from diagnostics", async () => {
    const { bot } = terminal({ X: ["請輸入密碼：SECRET_VALUE"], cancel: ["已取消"] });
    await submitPushFromCurrentArticle(bot, "推1樓", "neutral", undefined, timeouts);
    const trace = (globalThis as typeof globalThis & { __pttzzzLastPushTrace?: unknown }).__pttzzzLastPushTrace;
    expect(JSON.stringify(trace)).not.toContain("SECRET_VALUE");
    expect(JSON.stringify(trace)).toContain("sensitive screen omitted");
  });

  it("captures the failed entry screen before cancellation, without storing draft content", async () => {
    const { bot } = terminal({ X: ["系統忙碌，請稍後再試"], cancel: ["已取消"] });
    await submitPushFromCurrentArticle(bot, "PRIVATE_DRAFT", "neutral", undefined, timeouts);
    const trace = (globalThis as typeof globalThis & { __pttzzzLastPushTrace?: unknown }).__pttzzzLastPushTrace;
    expect(trace).toMatchObject({ outcome: "push-entry-timeout" });
    expect(JSON.stringify(trace)).toContain("系統忙碌，請稍後再試");
    expect(JSON.stringify(trace)).toContain("before-X");
    expect(JSON.stringify(trace)).not.toContain("PRIVATE_DRAFT");
    expect(JSON.stringify(trace)).not.toContain("已取消");
    expectSemanticActions(["open-push-menu"]);
  });
});
