import { describe, expect, it } from "vitest";
import { applyArticleStyle, rebaseArticleStyles } from "./articleFormatting";

describe("article draft formatting", () => {
  it("replaces only the selected portion of a style", () => {
    expect(applyArticleStyle([{ start: 0, end: 5, bold: true }], 1, 3, { color: 31 })).toEqual([
      { start: 0, end: 1, bold: true }, { start: 1, end: 3, color: 31 }, { start: 3, end: 5, bold: true },
    ]);
  });
  it("clears a selection without altering text", () => {
    expect(applyArticleStyle([{ start: 0, end: 3, bold: true }], 0, 3, {})).toEqual([]);
  });
  it("shifts later styles and drops only ranges intersecting edited text", () => {
    expect(rebaseArticleStyles("abc def", "aXbc def", [{ start: 4, end: 7, bold: true }]))
      .toEqual([{ start: 5, end: 8, bold: true }]);
    expect(rebaseArticleStyles("abc def", "abc dog", [{ start: 0, end: 3, bold: true }, { start: 4, end: 7, color: 31 }]))
      .toEqual([{ start: 0, end: 3, bold: true }]);
  });
});
