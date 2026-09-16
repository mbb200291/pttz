import { expect, it, vi } from "vitest";
import { measurePushCapacity, submitPushFromCurrentArticle } from "./terminalDriver.js";

function terminal() {
  const article = ["作者  alice 看板 Test", "標題  test", "時間  Thu Sep 17 00:00:00 2026", "───────────────────────────────────────", "body", "瀏覽 第 1/1 頁 (100%) 目前顯示: 第 01~05 行"];
  let rows = article;
  const send = vi.fn(async (value: string) => {
    if (value === "X") rows = [...article, "您覺得這篇文章 1.值得推薦 2.給它噓聲 3.只加→註解 [1]?"];
    else if (value === "3") rows = [...article, "→ alice:"];
    else if (value === "n\r" || value === "y\r") rows = article;
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
it("cancels rather than confirming when the caller rejects changed confirmation text", async () => {
  const bot = terminal();
  const result = await submitPushFromCurrentArticle(bot, "draft", "neutral", undefined, {}, () => true, () => false);
  expect(result).toMatchObject({ ok: false, outcome: "not-sent" });
  expect(bot.send).not.toHaveBeenCalledWith("y\r");
});
