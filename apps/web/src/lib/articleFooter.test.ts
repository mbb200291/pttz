import { describe, expect, it } from "vitest";
import { parseArticleFooter } from "./articleFooter";

describe("article footer", () => {
  const url = "https://www.ptt.cc/bbs/Stock/M.1789390859.A.205.html";
  const footer = `--\n※ 發信站: 批踢踢實業坊(ptt.cc), 來自: 61.228.237.120 (臺灣)\n※ 文章網址: ${url}`;
  it("extracts a complete trailing footer without consuming the signature", () => {
    const text = `正文\n--\n我的簽名\n${footer}\n`;
    expect(parseArticleFooter(text)).toEqual({ start: text.indexOf(footer), station: "批踢踢實業坊(ptt.cc)", source: "61.228.237.120 (臺灣)", url });
  });
  it("accepts matching markdown links", () => {
    expect(parseArticleFooter(footer.replace(url, `[${url}](${url})`))?.url).toBe(url);
  });
  it("leaves incomplete, quoted, nonterminal and unsafe blocks untouched", () => {
    for (const text of [footer.split("\n").slice(0, 2).join("\n"), footer + "\n更多正文", footer.replace(/※/gu, "> ※"), footer.replace(url, "javascript:alert(1)"), footer.replace(url, `[${url}](https://evil.test)`)]) {
      expect(parseArticleFooter(text)).toBeNull();
    }
  });
});
