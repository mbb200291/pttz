import { expect, it } from "vitest";
import { createTerminalDriverForTesting, fetchArticleByAidFromBotManually, parseArticleInfoAid, readOpenedArticleAid } from "./terminalDriver.js";
import { setTerminalProtocol } from "./terminalProtocol.js";

it("ignores AID text in a board title above the actual information panel", () => {
  const screen = "  12  9/20 alice □ 文章代碼(AID): #WRONG (Test)\n┌───────┐\n│ 文章代碼(AID): #Actual1 (Test) [ptt.cc] title │\n│ 文章網址: https://www.ptt.cc/ │\n└───────┘\n請按任意鍵繼續";
  expect(parseArticleInfoAid(screen)).toEqual({ aid: "Actual1", board: "Test" });
  expect(parseArticleInfoAid("作者 alice 看板 Test\n標題 test\n文章代碼(AID): #WRONG (Test)\n瀏覽 第 1/1 頁")).toBeNull();
  expect(parseArticleInfoAid("作者 alice 看板 Test\n文章代碼(AID): #WRONG (Test)\n請按任意鍵繼續")).toBeNull();
});

it("opens a valid article whose body quotes a missing-article error", async () => {
  const rows = ["作者 alice 看板 Test", "標題 same", "時間 Mon Sep 21 00:00:00 2026", "───────────────────────────────────────", "這個畫面顯示「找不到文章」", "瀏覽 第 1/1 頁 (100%)"];
  const bot = { enterBoardByName: async () => true, send: async () => true, getLines: async () => rows, getLine: (i: number) => ({ str: rows[i] ?? "" }) };
  expect(await fetchArticleByAidFromBotManually(bot, "Test", "Actual1")).toMatchObject({ title: "same" });
});

it("uses the local AID protocol without opening a different selected row after Q", async () => {
  const article = ["作者 alice 看板 Test", "標題 same", "時間 Sun Sep 20 12:00:00 2026", "───────────────────────────────────────", "body", "瀏覽 第 1/1 頁 (100%) 目前顯示: 第 01~05 行"];
  const board = ["看板《Test》", "[←]離開 [→]閱讀 [Ctrl-P]發表文章", "   編號    日 期 作  者       文  章  標  題", "      2     9/20 alice        □ same"];
  let rows = board;
  const sent: string[] = [];
  const bot = { getLine: (i: number) => ({ str: rows[i] ?? "" }), getLines: async () => rows,
    send: async (key: string) => {
      sent.push(key);
      if (key === "#1AbCdEf\r\r") rows = article;
      else if (key === "Q") rows = ["文章代碼(AID): #1AbCdEf (Test)"];
      else if (key === "q") rows = board;
      else if (key === "\r") throw new Error("Opening the unrelated selected row is unsafe");
      return true;
    } };
  setTerminalProtocol(bot, "local");
  expect(await fetchArticleByAidFromBotManually(bot, "Test", "1AbCdEf")).toMatchObject({ author: "alice", title: "same" });
  rows = article;
  expect(await readOpenedArticleAid(bot)).toEqual({ aid: "1AbCdEf", board: "Test" });
  expect(rows).toEqual(article);
  expect(sent).not.toContain("\r");
});

it("pins a normal local article to AID before an index can be reassigned", async () => {
  const article = ["作者 alice 看板 Test", "標題 same", "時間 Sun Sep 20 12:00:00 2026", "───────────────────────────────────────", "body", "瀏覽 第 1/1 頁 (100%) 目前顯示: 第 01~05 行"];
  const board = ["看板《Test》", "[←]離開 [→]閱讀 [Ctrl-P]發表文章", "      1     9/20 alice        □ same"];
  let rows = board;
  let indexReassigned = false;
  const sent: string[] = [];
  const bot = {
    state: { connect: true, login: true }, on() { return this; },
    getLine: (i: number) => ({ str: rows[i] ?? "" }), getLines: async () => rows,
    getArticles: async () => [], getArticle: async () => ({}),
    send: async (key: string) => {
      sent.push(key);
      if (key === "1\r\r") { if (indexReassigned) throw Error("stale index opened"); rows = article; }
      else if (key === "#original\r\r") rows = article;
      else if (key === "Q") rows = ["文章代碼(AID): #original (Test)"];
      else if (key === "q") rows = board;
      else if (key === "X") rows = ["→ alice:"];
      else if (key === "hello\r") rows = ["→ alice:hello 確定[y/N]:"];
      else if (key === "y\r") rows = article;
      return true;
    },
  };
  const driver = createTerminalDriverForTesting(bot, "local", "local");
  await driver.readArticleSource({ board: "Test", index: 1 }, () => {});
  indexReassigned = true;
  rows = board;
  sent.length = 0;
  expect(await driver.executeArticleCommand({ type: "reply-article", article: { board: "Test", index: 1 }, content: "hello", pushType: "neutral" })).toMatchObject({ ok: true });
  expect(sent).toContain("#original\r\r");
  expect(sent).not.toContain("1\r\r");
});
