import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { articleTerminalLine } from "./terminalLine.js";

const Terminal = createRequire(import.meta.url)("terminal.js");
function pttTerminal() {
  const terminal = new Terminal();
  terminal.state.setMode("stringWidth", "dbcs");
  return terminal;
}

describe("article terminal attributes", () => {
  it("keeps plain text and its spacing unchanged", () => {
    expect(articleTerminalLine({ str: "文章  欄位 " })).toBe("文章  欄位 ");
    expect(articleTerminalLine()).toBe("");
    const terminal = pttTerminal();
    terminal.write("文章  欄位 ");
    expect(articleTerminalLine(terminal.state.getLine(0))).toBe("文章  欄位 ");
  });

  it.each([30, 31, 32, 33, 34, 35, 36, 37, 90, 91, 92, 93, 94, 95, 96, 97])(
    "round-trips foreground %i across Chinese and inline resets", (color) => {
      const terminal = pttTerminal();
      terminal.write(`中文\x1b[${color}m色\x1b[0m:0`);
      expect(articleTerminalLine(terminal.state.getLine(0)))
        .toBe(`中文\x1b[0;${color}m色\x1b[0m:0`);
    },
  );

  it("preserves bold, black background, inverse and styles inherited across lines", () => {
    const terminal = pttTerminal();
    terminal.write("\x1b[1;7;32;40m甲\r\n乙\x1b[0m丙");
    expect(articleTerminalLine(terminal.state.getLine(0)))
      .toBe("\x1b[0;1;7;32;40m甲\x1b[0m");
    expect(articleTerminalLine(terminal.state.getLine(1)))
      .toBe("\x1b[0;1;7;32;40m乙\x1b[0m丙");
  });
});
