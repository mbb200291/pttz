import { describe, expect, it } from "vitest";
import { aggregatePushes, parsePushBuffer, stripAnsi } from "@pttzzz/core/internal";
import { appendUniqueArticleScreenLines, fetchArticleFromBotManually } from "./terminalDriver.js";

// User-reported Baseball case: distinct events must survive page assembly once.
const pushes = [
  "推 cpblnpb: 喬                                                     09/14 21:25",
  "推 imyaoyu: 喬                                                     09/14 21:25",
  "→ cpblnpb: 勝利打點                                               09/14 21:25",
  "推 GDSY: 喬                                                        09/14 21:25",
  "推 hao94: 曾之喬                                                   09/14 21:25",
  "→ ash9911911: 出棒過半沒抓 K變E                                   09/14 21:25",
  "推 cake10414: 我爪狀元又更穩了                                     09/14 21:25",
  "噓 hsuaninteen: 葡逃祐                                             09/14 21:26",
  "推 wearood: 難怪亞運不選 畢竟有3A的鄭可以打                        09/14 21:28",
  "推 hexokinase: 球也逃走了                                          09/14 21:28",
  "推 dbdudsorj: 當兵好嗎？                                           09/14 21:29",
  "噓 moneychen: 亞運天罰                                             09/14 21:29",
  "推 LieFang: 今年不知道幾場被失誤搞掉了 今天大概也涼了              09/14 21:30",
  "→ jonsir: 這個守備打亞運 也是會被噴死                             09/14 21:30",
];
function screen(rows: string[], start?: number) {
  return [...rows, ...Array(Math.max(0, 23 - rows.length)).fill(""),
    start === undefined ? "瀏覽 第 2/2 頁 (100%)" : `瀏覽 第 2/2 頁 (100%) 目前顯示: 第 ${start}~${start + rows.length - 1} 行`];
}
function checkTranscript(lines: string[]) {
  const raw = parsePushBuffer(lines.join("\n"));
  expect(raw).toHaveLength(14);
  const result = aggregatePushes(raw, "author");
  expect(result.nativePushCount).toBe(9);
  expect(result.nativeBooCount).toBe(2);
  expect(result.pushes.find((push) => push.author === "cpblnpb")?.content).toBe("喬\n勝利打點");
  expect(result.pushes.find((push) => push.author === "imyaoyu")?.content).toBe("喬");
}

describe("article screen overlap", () => {
  it("reads the repainted Baseball overlap through the actual progressive reader", async () => {
    const prefix = ["作者 author 看板 Baseball", "標題 [測試] 翻頁", "時間 Mon Sep 14 21:25:00 2026", "────────────────────", ...Array(12).fill("正文")];
    let current = screen([...prefix, ...pushes.slice(0, 7)], 1);
    const snapshots: string[] = [];
    const article = await fetchArticleFromBotManually({
      async enterBoardByName() { return true; },
      async send(key: string) {
        if (key === "\x1b[6~") current = screen(pushes.map((line) => `\x1b[33m${line}  \x1b[0m`), 17);
        return true;
      },
      getLine(index: number) { return { str: current[index] ?? "" }; },
    }, "Baseball", 1, undefined, (raw) => snapshots.push(raw));
    expect(article).not.toBeNull();
    checkTranscript(snapshots.at(-1)!.split("\n"));
    expect(article?.pushes.find((push) => push.author === "cpblnpb")?.content).toBe("喬\n勝利打點");
  });
  it("parses the supplied raw events correctly before paging", () => checkTranscript(pushes));
  it.each([false, true])("does not duplicate repainted overlap; footer positions: %s", (positioned) => {
    const lines: string[] = [];
    const position = {};
    const prefix = Array.from({ length: 16 }, (_, i) => `正文 ${i}`);
    appendUniqueArticleScreenLines(lines, screen([...prefix, ...pushes.slice(0, 7)], positioned ? 1 : undefined), position);
    appendUniqueArticleScreenLines(lines, screen(pushes.map((row) => `\x1b[33m${row}  \x1b[0m`), positioned ? 17 : undefined), position);
    checkTranscript(lines);
  });
  it("preserves identical real pushes at different article line positions", () => {
    const lines: string[] = [], position = {};
    const row = pushes[0];
    appendUniqueArticleScreenLines(lines, screen([...Array(22).fill("正文"), row], 1), position);
    appendUniqueArticleScreenLines(lines, screen([row, row], 23), position);
    expect(parsePushBuffer(lines.join("\n"))).toHaveLength(2);
  });
  it("replaces a repainted row at the same position without losing its color", () => {
    const lines: string[] = [], position = {};
    appendUniqueArticleScreenLines(lines, screen(["舊正文", pushes[0]], 1), position);
    appendUniqueArticleScreenLines(lines, screen(["\x1b[31m新正文\x1b[0m", pushes[0]], 1), position);
    expect(stripAnsi(lines[0])).toBe("新正文");
    expect(lines[0]).toContain("\x1b[31m");
    expect(parsePushBuffer(lines.join("\n"))).toHaveLength(1);
  });
  it("keeps blank rows between pages and pushes beyond a stale footer end", () => {
    const lines: string[] = [], position = {};
    appendUniqueArticleScreenLines(lines, screen(["正文", ...Array(22).fill("")], 1), position);
    const next = screen([pushes[0], pushes[1]], 24);
    next[23] = "目前顯示: 第 24~24 行";
    appendUniqueArticleScreenLines(lines, next, position);
    expect(lines.slice(1, 23)).toEqual(Array(22).fill(""));
    expect(parsePushBuffer(lines.join("\n"))).toHaveLength(2);
  });
  it("rejects skipped pages instead of silently changing reply floors", () => {
    const lines: string[] = [], position = {};
    appendUniqueArticleScreenLines(lines, screen(Array(23).fill("正文"), 1), position);
    expect(() => appendUniqueArticleScreenLines(lines, screen([pushes[0]], 48), position)).toThrow("翻頁不連續");
  });
});
