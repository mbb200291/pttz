/** ptt-client configures terminal.js attribute boundaries in DBCS columns. */
export interface TerminalLine {
  str?: string;
  attr?: Record<number, {
    fg?: number | null;
    bg?: number | null;
    bold?: boolean;
    inverse?: boolean;
  }>;
}

/** Reconstruct only the SGR attributes supported by the article renderer. */
export function articleTerminalLine(line?: TerminalLine): string {
  const text = line?.str ?? "";
  if (!line?.attr || !text) return text;
  let result = "";
  let previous = "0";
  let column = 0;
  for (let offset = 0; offset < text.length; offset += 1) {
    const attr = line.attr[column];
    if (attr) {
      const codes = [0];
      if (attr.bold) codes.push(1);
      if (attr.inverse) codes.push(7);
      for (const [value, base, bright] of [[attr.fg, 30, 90], [attr.bg, 40, 100]] as const) {
        if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 16) {
          codes.push(value < 8 ? base + value : bright + value - 8);
        }
      }
      const next = codes.join(";");
      if (next !== previous) result += `\x1b[${next}m`;
      previous = next;
    }
    result += text[offset];
    // Match terminal.js dbcswidth exactly, including its UTF-16 code-unit semantics.
    column += text.charCodeAt(offset) > 255 ? 2 : 1;
  }
  // Each captured line is independent, including when a page starts mid-style.
  return result + (previous === "0" ? "" : "\x1b[0m");
}
