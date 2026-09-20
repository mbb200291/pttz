import { describe, expect, it } from "vitest";
import { parseAnsiText as parseWithAuthoredStyles } from "./ansiText";

// Existing terminal-palette assertions remain independent of the authored-style projection.
const parseAnsiText = (text: string) => {
  const parsed = parseWithAuthoredStyles(text);
  return { text: parsed.text, runs: parsed.runs.map(({ text, style }) => ({ text, style })) };
};

const normal = { color: "#aaaaaa", backgroundColor: "#000000", fontWeight: 400 };
const palette = ["#000000", "#aa0000", "#00aa00", "#aa5500", "#0000aa", "#aa00aa", "#00aaaa", "#aaaaaa"];
const bright = ["#555555", "#ff5555", "#55ff55", "#ffff55", "#5555ff", "#ff55ff", "#55ffff", "#ffffff"];

describe("safe ANSI text projection", () => {
  it("distinguishes implicit terminal defaults from explicitly authored white and black", () => {
    const runs = parseWithAuthoredStyles("普通\x1b[37m白\x1b[40m黑底\x1b[39m預設字\x1b[49m預設底").runs;
    expect(runs.map((run) => run.text)).toEqual(["普通", "白", "黑底", "預設字", "預設底"]);
    expect(runs.map((run) => run.authoredStyle)).toEqual([
      {}, { color: "#aaaaaa" }, { color: "#aaaaaa", backgroundColor: "#000000" }, { backgroundColor: "#000000" }, {},
    ]);
  });
  it("resets authored colors without losing bold and resets all author styling with SGR zero", () => {
    expect(parseWithAuthoredStyles("\x1b[1m亮\x1b[31;44m色\x1b[39;49m亮字\x1b[0m普通").runs.map((run) => run.authoredStyle)).toEqual([
      { fontWeight: 700 }, { color: "#ff5555", backgroundColor: "#0000aa", fontWeight: 700 }, { fontWeight: 700 }, {},
    ]);
  });
  it("keeps explicit reverse styling but returns to inherited defaults after inverse reset", () => {
    expect(parseWithAuthoredStyles("\x1b[7m反白\x1b[27m普通").runs.map((run) => run.authoredStyle)).toEqual([
      { color: "#000000", backgroundColor: "#aaaaaa" }, {},
    ]);
  });
  it("preserves literal HTML, tabs, whitespace, line breaks and Unicode", () => {
    const text = "  <img src=x onerror=alert(1)>\t中文😀\n  next\n";
    expect(parseAnsiText(text)).toEqual({ text, runs: [{ text, style: normal }] });
    expect(parseAnsiText("")).toEqual({ text: "", runs: [] });
  });
  it.each(Array.from({ length: 8 }, (_, index) => index))("projects normal and bright foreground/background color %i", (index) => {
    for (const [code, property, value] of [
      [30 + index, "color", palette[index]], [90 + index, "color", bright[index]],
      [40 + index, "backgroundColor", palette[index]], [100 + index, "backgroundColor", bright[index]],
    ] as const) {
      expect(parseAnsiText(`\x1b[${code}m字`).runs).toEqual([{ text: "字", style: { ...normal, [property]: value } }]);
    }
  });
  it("retains SGR state across lines and resets bold, colors and all attributes", () => {
    expect(parseAnsiText("\x1b[31;44;1m紅\n亮\x1b[22m暗\x1b[39m白\x1b[49m底\x1b[0m終")).toEqual({
      text: "紅\n亮暗白底終",
      runs: [
        { text: "紅\n亮", style: { color: "#ff5555", backgroundColor: "#0000aa", fontWeight: 700 } },
        { text: "暗", style: { color: "#aa0000", backgroundColor: "#0000aa", fontWeight: 400 } },
        { text: "白", style: { ...normal, backgroundColor: "#0000aa" } },
        { text: "底終", style: normal },
      ],
    });
    expect(parseAnsiText("\x1b[91;1m亮\x1b[22m仍亮").runs[1].style.color).toBe("#ff5555");
    expect(parseAnsiText("\x1b[1m亮\x1b[m普通").runs[1].style).toEqual(normal);
  });
  it("supports reverse video and restores the original colors without mutating old runs", () => {
    expect(parseAnsiText("\x1b[31;44mA\x1b[7mB\x1b[27mC\x1b[7;0mD").runs).toEqual([
      { text: "A", style: { ...normal, color: "#aa0000", backgroundColor: "#0000aa" } },
      { text: "B", style: { ...normal, color: "#0000aa", backgroundColor: "#aa0000" } },
      { text: "C", style: { ...normal, color: "#aa0000", backgroundColor: "#0000aa" } },
      { text: "D", style: normal },
    ]);
    expect(parseAnsiText("\x1b[7m反").runs[0].style).toEqual({ ...normal, color: "#000000", backgroundColor: "#aaaaaa" });
  });
  it("ignores unsupported styles and extended-color operands instead of interpreting them as SGR", () => {
    const result = parseAnsiText("\x1b[31mA\x1b[3;4;5;8;9mB\x1b[38;5;32mC\x1b[48;2;1;31;32mD\x1b[38:2::1:2:3mE");
    expect(result).toEqual({ text: "ABCDE", runs: [{ text: "ABCDE", style: { ...normal, color: "#aa0000" } }] });
  });
  it("removes OSC hyperlink/title/clipboard controls without creating links or leaking their payload", () => {
    const text = "A\x1b]8;;https://evil.test\x1b\\link\x1b]8;;\x1b\\B\x1b]0;title\x07C\x1b]52;c;secret\x07D";
    expect(parseAnsiText(text)).toEqual({ text: "AlinkBCD", runs: [{ text: "AlinkBCD", style: normal }] });
  });
  it("removes non-SGR CSI, escape controls, DCS and C0 without executing cursor movement", () => {
    const text = "A\x1b[2J\x1b[H\x1b[?25lB\x1b(BC\x1b7D\x1bPignored\x1b\\E\x00\x07\x08\x0c\r\x7fF";
    expect(parseAnsiText(text)).toEqual({ text: "ABCDEF", runs: [{ text: "ABCDEF", style: normal }] });
  });
  it("handles C1 forms and discards incomplete terminal sequences", () => {
    expect(parseAnsiText("\x9b32m綠\x9d8;;hidden\x9clink\x90hidden\x9c\x9b0m白\x1b[31")).toEqual({
      text: "綠link白", runs: [{ text: "綠link", style: { ...normal, color: "#00aa00" } }, { text: "白", style: normal }],
    });
    for (const suffix of ["\x1b", "\x1b]52;c;unfinished", "\x1bPunfinished", "\x1b[123;"]) {
      expect(parseAnsiText(`safe${suffix}`).text).toBe("safe");
    }
  });
  it("treats empty SGR operands as reset and does not leak styling into another parse", () => {
    expect(parseAnsiText("\x1b[31;;1m亮").runs[0].style).toEqual({ ...normal, color: "#ffffff", fontWeight: 700 });
    parseAnsiText("\x1b[1;31mred");
    expect(parseAnsiText("plain").runs[0].style).toEqual(normal);
  });
});
