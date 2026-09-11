import { describe, expect, it } from "vitest";
import { submitPushFromCurrentArticle } from "./terminalDriver.js";

const menu = "您覺得這篇文章 1.值得推薦 2.給它噓聲 3.只加→註解 [1]?";
const reading = "作者  alice 看板 Test\n正文\n瀏覽 第 1/1 頁 (100%)";
const timeouts = { typePromptMs: 15, confirmMs: 15, pollMs: 1, afterTypeMs: 0, afterConfirmMs: 0, afterContinueMs: 0 };

function terminal(entry: string, input = "→ TEST_USER:     ", initial = reading) {
  let screen = initial;
  const sent: string[] = [];
  return {
    sent,
    bot: {
      getLine(row: number) { return { str: screen.split("\n")[row] ?? "" }; },
      async send(value: string) {
        sent.push(value);
        if (value === "X") screen = entry;
        else if (value === "3") screen = input;
        else if (value === "推1樓\r") screen = "→ TEST_USER: 推1樓    確定[y/N]:";
        else if (value === "y\r") screen = reading;
        else if (value === "\x03") screen = "已取消";
        return true;
      },
    },
  };
}

describe("real PTT push entry variants", () => {
  it("chooses annotation then recognizes the bare empty input after a non-author menu", async () => {
    const { bot, sent } = terminal(`${reading}\n${menu}`);
    expect(await submitPushFromCurrentArticle(bot, "推1樓", "neutral", undefined, timeouts)).toMatchObject({ outcome: "sent" });
    expect(sent).toEqual(["X", "3", "推1樓\r", "y\r"]);
  });

  it("does not choose a type again in the author's direct annotation input", async () => {
    const { bot, sent } = terminal(`${reading}\n作者本人, 使用 → 加註方式\n→ TEST_USER: `);
    expect(await submitPushFromCurrentArticle(bot, "推1樓", "neutral", undefined, timeouts)).toMatchObject({ outcome: "sent" });
    expect(sent).toEqual(["X", "推1樓\r", "y\r"]);
  });

  it.each([
    `${menu}\n正文提到推文方式\n瀏覽 第 1/1 頁 (100%)`,
    "→ TEST_USER: 舊留言 09/11 22:00\n瀏覽 第 1/1 頁 (100%)",
    "→ TEST_USER: test 確定[y/N]:",
  ])("does not treat article text or confirmation as a new entry: %s", async (entry) => {
    const { bot, sent } = terminal(entry);
    expect(await submitPushFromCurrentArticle(bot, "推1樓", "neutral", undefined, timeouts)).toMatchObject({ outcome: "not-sent", code: "push-entry-timeout" });
    expect(sent).toEqual(["X", "\x03"]);
  });

  it("rejects a stale empty input that was already present before X", async () => {
    const { bot, sent } = terminal("→ TEST_USER: ", undefined, "→ TEST_USER: ");
    expect(await submitPushFromCurrentArticle(bot, "推1樓", "neutral", undefined, timeouts)).toMatchObject({ outcome: "not-sent" });
    expect(sent).toEqual(["X", "\x03"]);
  });

  it.each(["推 TEST_USER: ", "噓 TEST_USER: ", "→ TEST_USER: 已有文字", "→ TEST_USER: test 確定[y/N]:"])("does not write a neutral vote into an incompatible input: %s", async (input) => {
    const { bot, sent } = terminal(menu, input);
    expect(await submitPushFromCurrentArticle(bot, "推1樓", "neutral", undefined, timeouts)).toMatchObject({ outcome: "not-sent", code: "push-content-prompt-timeout" });
    expect(sent).toEqual(["X", "3", "\x03"]);
  });

  it("keeps the author's neutral-only restriction for a native boo", async () => {
    const { bot, sent } = terminal("作者本人, 使用 → 加註方式\n→ TEST_USER: ");
    expect(await submitPushFromCurrentArticle(bot, "噓", "boo", undefined, timeouts)).toMatchObject({ outcome: "not-sent", code: "push-type-not-allowed" });
    expect(sent).toEqual(["X", "\x03"]);
  });

  it("omits sensitive terminal screens from diagnostics", async () => {
    const { bot } = terminal("請輸入密碼：SECRET_VALUE");
    await submitPushFromCurrentArticle(bot, "推1樓", "neutral", undefined, timeouts);
    const trace = (globalThis as typeof globalThis & { __pttzzzLastPushTrace?: unknown }).__pttzzzLastPushTrace;
    expect(JSON.stringify(trace)).not.toContain("SECRET_VALUE");
    expect(JSON.stringify(trace)).toContain("sensitive screen omitted");
  });

  it("captures the failed entry screen before cancellation, without storing draft content", async () => {
    const { bot } = terminal("系統忙碌，請稍後再試");
    await submitPushFromCurrentArticle(bot, "PRIVATE_DRAFT", "neutral", undefined, timeouts);
    const trace = (globalThis as typeof globalThis & { __pttzzzLastPushTrace?: unknown }).__pttzzzLastPushTrace;
    expect(trace).toMatchObject({ outcome: "push-entry-timeout" });
    expect(JSON.stringify(trace)).toContain("系統忙碌，請稍後再試");
    expect(JSON.stringify(trace)).toContain("before-X");
    expect(JSON.stringify(trace)).not.toContain("PRIVATE_DRAFT");
    expect(JSON.stringify(trace)).not.toContain("已取消");
  });
});
