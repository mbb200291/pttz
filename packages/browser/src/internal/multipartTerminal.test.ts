import { expect, it, vi } from "vitest";
import { createTerminalDriverForTesting, measurePushCapacity, submitPushFromCurrentArticle } from "./terminalDriver.js";

it("waits for the complete input echo before submitting a full-width fragment", async () => {
  const article = ["作者 alice 看板 Test", "標題 test", "時間 Sun Sep 20 12:00:00 2026", "body", "瀏覽 第 1/1 頁"];
  const content = "中".repeat(27);
  let rows = article;
  const sent: string[] = [];
  const bot = { getLine: (i: number) => ({ str: rows[i] ?? "" }), send: async (key: string) => {
    sent.push(key);
    if (key === "X") rows = [...article, "作者本人, 使用 → 加註方式", "→ alice:"];
    else if (key === content) rows = [...article, `→ alice:${content} `];
    else if (key === "\r") rows = [...article, `→ alice:${content}  確定[y/N]:`];
    else if (key === "y\r") rows = article;
    return true;
  } };
  const result = await submitPushFromCurrentArticle(bot, content, "neutral", undefined,
    { confirmMs: 20, pollMs: 1 }, () => true, () => true, true);
  expect(result).toMatchObject({ ok: true, outcome: "sent" });
  expect(sent).toEqual(["X", content, "\r", "y\r"]);
});

it("never submits or navigates when a fragment echo is truncated", async () => {
  const article = ["作者 alice 看板 Test", "標題 test", "時間 Sun Sep 20 12:00:00 2026", "body", "瀏覽 第 1/1 頁"];
  let rows = article;
  const sent: string[] = [];
  const bot = { getLine: (i: number) => ({ str: rows[i] ?? "" }), send: async (key: string) => {
    sent.push(key);
    if (key === "X") rows = [...article, "→ alice:"];
    else if (key === "完整內容") rows = [...article, "→ alice:完整內"];
    else if (key === "\x03") rows = article;
    return true;
  } };
  const result = await submitPushFromCurrentArticle(bot, "完整內容", "neutral", undefined,
    { confirmMs: 20, pollMs: 1 }, () => true, () => true, true);
  expect(result).toMatchObject({ ok: false, outcome: "not-sent", code: "push-input-echo-timeout" });
  expect(sent).toEqual(["X", "完整內容", "\x03"]);
});

function terminal(cancelRows?: string[], separator: "" | " " = " ") {
  const article = ["作者  alice 看板 Test", "標題  test", "時間  Thu Sep 17 00:00:00 2026", "───────────────────────────────────────", "body", "瀏覽 第 1/1 頁 (100%) 目前顯示: 第 01~05 行"];
  let rows = article;
  const send = vi.fn(async (value: string) => {
    if (value === "X") rows = [...article, "您覺得這篇文章 1.值得推薦 2.給它噓聲 3.只加→註解 [1]?"];
    else if (value === "3") rows = [...article, "→ alice:"];
    else if (value === "n\r") rows = cancelRows ?? article;
    else if (value === "y\r") rows = article;
    else if (value.endsWith("\r")) rows = [...article, `→ alice:${separator}${value.slice(0, -1).padEnd(separator ? 53 : 57)} 確定[y/N]:`];
    return true;
  });
  return { send, getLine: (index: number) => ({ str: rows[index] ?? "" }), getLines: async () => rows };
}
it("reports a login problem before entering push mode", async () => {
  const bot = { ...terminal(), state: { connect: true, login: false }, on() { return this; } };
  const driver = createTerminalDriverForTesting(bot);
  await expect(driver.sendReplyDraft!({ operationId: "login-expired", article: { board: "Test", index: 1 }, content: "測試", pushType: "neutral" }))
    .rejects.toMatchObject({ code: "REPLY_DRAFT_NOT_SENT", replyIssue: { kind: "connection" } });
  expect(bot.send).not.toHaveBeenCalled();
});
it("measures capacity only through a cancelled confirmation, never publishing the probe", async () => {
  const bot = terminal();
  await expect(measurePushCapacity(bot)).resolves.toEqual({ capacity: 52, author: "alice" });
  expect(bot.send).toHaveBeenCalledWith("n\r");
  expect(bot.send).not.toHaveBeenCalledWith("y\r");
});
it("measures the local no-space prompt without publishing the probe", async () => {
  const bot = terminal(undefined, "");
  await expect(measurePushCapacity(bot, () => true, "")).resolves.toEqual({ capacity: 56, author: "alice" });
  expect(bot.send).toHaveBeenCalledWith("n\r");
  expect(bot.send).not.toHaveBeenCalledWith("y\r");
  await expect(measurePushCapacity(terminal(undefined, ""))).rejects.toThrow("無法確認推文容量");
});
it("accepts a cancelled probe returning to the same board rather than the reader", async () => {
  const bot = terminal(["【板主:hank2579】 看板《Test》", "[←]離開 [→]閱讀 [Ctrl-P]發表文章", "   編號    日 期 作 者       文 章 標 題", "    360     9/20 alice        □ test article"]);
  await expect(measurePushCapacity(bot)).resolves.toEqual({ capacity: 52, author: "alice" });
  expect(bot.send).not.toHaveBeenCalledWith("y\r");
});
it("does not accept cancellation returning to a different board", async () => {
  const bot = terminal(["【板主:hank2579】 看板《Other》", "[←]離開 [→]閱讀 [Ctrl-P]發表文章", "    360     9/20 alice        □ test article"]);
  await expect(measurePushCapacity(bot)).rejects.toThrow("無法確認推文容量");
  expect(bot.send).not.toHaveBeenCalledWith("y\r");
});
it("does not accept board rows while the confirmation prompt remains", async () => {
  const bot = terminal(["看板《Test》", "[←]離開 [→]閱讀 [Ctrl-P]發表文章", "    360     9/20 alice        □ test article", "→ alice:x                                                     確定[y/N]:"]);
  await expect(measurePushCapacity(bot)).rejects.toThrow("無法確認推文容量");
  expect(bot.send).not.toHaveBeenCalledWith("y\r");
});
it("rejects capacity evidence if the session changes during cancellation", async () => {
  const bot = terminal();
  const valid = () => !bot.send.mock.calls.some(([command]) => command === "n\r");
  await expect(measurePushCapacity(bot, valid)).rejects.toThrow("無法確認推文容量");
  expect(bot.send).not.toHaveBeenCalledWith("y\r");
});
it("cancels rather than confirming when the caller rejects changed confirmation text", async () => {
  const bot = terminal();
  const result = await submitPushFromCurrentArticle(bot, "draft", "neutral", undefined, {}, () => true, () => false);
  expect(result).toMatchObject({ ok: false, outcome: "not-sent" });
  expect(bot.send).not.toHaveBeenCalledWith("y\r");
});

it.each([
  { pushFormat: "ptt" as const, separator: " " as const, published: true },
  { pushFormat: "ptt" as const, separator: " " as const, published: false },
  { pushFormat: "local" as const, separator: "" as const, published: true },
  { pushFormat: "local" as const, separator: "" as const, published: false },
])("confirms $pushFormat multipart writes by readback after returning to board (published=$published)", async ({ pushFormat, separator, published }) => {
  const board = ["看板《Test》", "[←]離開 [→]閱讀 [Ctrl-P]發表文章", "     360    9/20 alice         □ test article"];
  const writes: string[] = [];
  const actions: string[] = [];
  const article = () => ["作者  alice 看板 Test", "標題  test article", "時間  Thu Sep 17 00:00:00 2026", "───────────────────────────────────────", "body", "--", ...writes.map(content => `→ alice:${separator}${content} 09/20 10:38`), "瀏覽 第 1/1 頁 (100%) 目前顯示: 第 01~10 行"];
  let rows = board;
  let content = "";
  let input = false;
  const bot = {
    state: { connect: true, login: true },
    _state: { connect: true, login: true, position: { boardname: "Test" } },
    on() { return this; },
    getLine: (index: number) => ({ str: rows[index] ?? "" }),
    getLines: async () => rows,
    send: async (command: string) => {
      actions.push(command);
      if (command === "360\r\r") rows = article();
      else if (command === "q" || command === "n\r") rows = board;
      else if (command === "X") { rows = [`→ alice:${separator}`]; input = true; }
      else if (command === "y\r") { if (published) writes.push(content); rows = board; }
      else if (input && command.endsWith("\r")) {
        if (command !== "\r") content = command.slice(0, -1);
        rows = [`→ alice:${separator}${content.padEnd(separator ? 56 : 57)} 確定[y/N]:`];
        input = false;
      }
      else if (input) { content = command; rows = [`→ alice:${separator}${content}`]; }
      return true;
    },
  };
  const result = await createTerminalDriverForTesting(bot, pushFormat).sendReplyDraft({
    operationId: "board-return", article: { board: "Test", index: 360 }, content: "a".repeat(70), pushType: "neutral",
  });
  expect(result).toMatchObject(published ? { status: "complete", confirmed: 2 } : { status: "uncertain", confirmed: 0 });
  expect(writes.join("")).toBe(published ? "a".repeat(70) + "_" : "");
  expect(actions.filter(command => command === "y\r")).toHaveLength(published ? 2 : 1);
});
