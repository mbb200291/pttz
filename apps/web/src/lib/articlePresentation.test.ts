import { describe, expect, it } from "vitest";
import { isPreformattedArticle, readableAnsiStyle } from "./articlePresentation";
import { parseAnsiText } from "./ansiText";

describe("article presentation policy", () => {
  it.each([
    "普通中文段落。\n下一段仍是一般文章。", "English prose with  two spaces.\nAnother paragraph follows.",
    "標題\n--------------------\n正文", "a | b | c", ":)\n:D", "  縮排引言\n  並不是表格",
  ])("keeps ordinary prose in the website font: %s", (text) => {
    expect(isPreformattedArticle(text)).toBe(false);
  });
  it.each([
    "| 球隊 | 勝 |\n| 桃猿 | 8 |", "┌────┐\n│中文│\n└────┘", "+----+----+\n| A  | B  |\n+----+----+",
    "RK  TEAM  W\n1   桃猿  8\n2   兄弟  7", " /\\_/\\\n( o.o )\n > ^ <", "項目\t數量\t單價\n蘋果\t2\t30\n香蕉\t3\t20",
  ])("uses a conservative monospace hint for table/art: %s", (text) => {
    expect(isPreformattedArticle(text)).toBe(true);
  });
  it("maps only author-specified colors without mutating the original terminal colors", () => {
    const runs = parseAnsiText("普通\x1b[31m紅\x1b[44m藍底\x1b[0m普通").runs;
    const rawStyles = runs.map((run) => ({ ...run.style }));
    expect(readableAnsiStyle(runs[0])).toEqual({});
    expect(readableAnsiStyle(runs[1])).toEqual({ color: "#f28b82" });
    expect(readableAnsiStyle(runs[2])).toEqual({ color: "#f28b82", backgroundColor: "#263753" });
    expect(readableAnsiStyle(runs[3])).toEqual({});
    expect(runs.map((run) => run.style)).toEqual(rawStyles);
  });
  it("inherits theme colors for bold-only text and resets", () => {
    const runs = parseAnsiText("\x1b[1m亮\x1b[22m普通").runs;
    expect(readableAnsiStyle(runs[0])).toEqual({ fontWeight: 700 });
    expect(readableAnsiStyle(runs[1])).toEqual({});
  });
  it("keeps every mapped author foreground/background pair readable", () => {
    const luminance = (hex: string) => {
      const [r, g, b] = hex.slice(1).match(/../g)!.map((value) => parseInt(value, 16) / 255)
        .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const foregrounds = Array.from({ length: 16 }, (_, i) => i < 8 ? 30 + i : 90 + i - 8);
    const backgrounds = Array.from({ length: 16 }, (_, i) => i < 8 ? 40 + i : 100 + i - 8);
    for (const fg of foregrounds) for (const bg of backgrounds) {
      const style = readableAnsiStyle(parseAnsiText(`\x1b[${fg};${bg}m字`).runs[0]);
      expect((luminance(String(style.color)) + 0.05) / (luminance(String(style.backgroundColor)) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
