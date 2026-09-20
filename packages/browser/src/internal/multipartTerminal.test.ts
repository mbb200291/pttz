import { expect, it, vi } from "vitest";
import { createTerminalDriverForTesting, measurePushCapacity, submitPushFromCurrentArticle } from "./terminalDriver.js";

function terminal(cancelRows?: string[]) {
  const article = ["作者  alice 看板 Test", "標題  test", "時間  Thu Sep 17 00:00:00 2026", "───────────────────────────────────────", "body", "瀏覽 第 1/1 頁 (100%) 目前顯示: 第 01~05 行"];
  let rows = article;
  const send = vi.fn(async (value: string) => {
    if (value === "X") rows = [...article, "您覺得這篇文章 1.值得推薦 2.給它噓聲 3.只加→註解 [1]?"];
    else if (value === "3") rows = [...article, "→ alice:"];
    else if (value === "n\r") rows = cancelRows ?? article;
    else if (value === "y\r") rows = article;
    else if (value.endsWith("\r")) rows = [...article, `→ alice:${value.slice(0, -1).padEnd(53)} 確定[y/N]:`];
    return true;
  });
  return { send, getLine: (index: number) => ({ str: rows[index] ?? "" }), getLines: async () => rows };
}
it("measures capacity only through a cancelled confirmation, never publishing the probe", async () => {
  const bot = terminal();
  await expect(measurePushCapacity(bot)).resolves.toEqual({ capacity: 52, author: "alice" });
  expect(bot.send).toHaveBeenCalledWith("n\r");
  expect(bot.send).not.toHaveBeenCalledWith("y\r");
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

it.each([true, false])("confirms each multipart write by readback after returning to board (published=%s)", async (published) => {
  const board = ["看板《Test》", "[←]離開 [→]閱讀 [Ctrl-P]發表文章", "     360    9/20 alice         □ test article"];
  const writes: string[] = [];
  const actions: string[] = [];
  const article = () => ["作者  alice 看板 Test", "標題  test article", "時間  Thu Sep 17 00:00:00 2026", "───────────────────────────────────────", "body", "--", ...writes.map(content => `→ alice: ${content} 09/20 10:38`), "瀏覽 第 1/1 頁 (100%) 目前顯示: 第 01~10 行"];
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
      else if (command === "X") { rows = ["→ alice:"]; input = true; }
      else if (command === "y\r") { if (published) writes.push(content); rows = board; }
      else if (input && command.endsWith("\r")) {
        content = command.slice(0, -1);
        rows = [`→ alice:${(" " + content).padEnd(57)} 確定[y/N]:`];
        input = false;
      }
      return true;
    },
  };
  const result = await createTerminalDriverForTesting(bot).sendReplyDraft({
    operationId: "board-return", article: { board: "Test", index: 360 }, content: "a".repeat(70), pushType: "neutral",
  });
  expect(result).toMatchObject(published ? { status: "complete", confirmed: 2 } : { status: "uncertain", confirmed: 0 });
  expect(writes.join("")).toBe(published ? "a".repeat(70) + "_" : "");
  expect(actions.filter(command => command === "y\r")).toHaveLength(published ? 2 : 1);
});
