import { describe, expect, it } from "vitest";
import { formatEditorBody } from "./articleFormatting.js";

describe("PTT editor formatting transport", () => {
  it("inserts only whitelisted SGR through Ctrl+U and resets after each run", () => {
    expect(formatEditorBody("前紅\n字後", [{ start: 1, end: 4, bold: true, color: 31 }]))
      .toBe("前\x15[0;1;31m紅\n字\x15[0m後");
  });
  it("does not interpret Markdown or literal escape-like text", () => {
    expect(formatEditorBody("**hi** *[31m")).toBe("**hi** *[31m");
  });
  it("rejects arbitrary terminal input in formatted payloads", () => {
    expect(() => formatEditorBody("text\x18", [{ start: 0, end: 4, bold: true }])).toThrow();
    expect(() => formatEditorBody("text", [{ start: 0, end: 4, color: 99 } as never])).toThrow();
  });
});
