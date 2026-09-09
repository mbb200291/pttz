import { describe, expect, it } from "vitest";
import { articleTextRuns } from "./articleFormatting.js";

describe("article text formatting", () => {
  it("keeps plain text and emits selected high intensity and foreground runs", () => {
    expect(articleTextRuns("前紅字\n後", [{ start: 1, end: 3, bold: true, color: 31 }])).toEqual([
      { text: "前" }, { text: "紅字", bold: true, color: 31 }, { text: "\n後" },
    ]);
    expect(articleTextRuns("**literal**")).toEqual([{ text: "**literal**" }]);
  });
  it.each([
    [{ start: -1, end: 1, bold: true }],
    [{ start: 0, end: 9, bold: true }],
    [{ start: 1, end: 1, bold: true }],
    [{ start: 0, end: 2, bold: true }, { start: 1, end: 3, color: 31 }],
    [{ start: 0, end: 1, color: 99 }],
    [{ start: 0, end: 1, bold: "yes" }],
  ])("rejects malformed formatting %j", (ranges) => {
    expect(() => articleTextRuns("文字正文", ranges as never)).toThrow();
  });
  it("rejects offsets inside surrogate pairs and terminal controls", () => {
    expect(() => articleTextRuns("   ", [{ start: 0, end: 3, bold: true }])).toThrow();
    expect(() => articleTextRuns("😀字", [{ start: 1, end: 2, bold: true }])).toThrow();
    expect(() => articleTextRuns("a\x1bb", [{ start: 0, end: 1, bold: true }])).toThrow();
    expect(() => articleTextRuns("a\rb", [{ start: 0, end: 1, bold: true }])).toThrow();
  });
});
