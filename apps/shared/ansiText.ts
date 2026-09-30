type CSSProperties = { color?: string; backgroundColor?: string; fontWeight?: number };
const ARTICLE_COLORS = ["#000000", "#aa0000", "#00aa00", "#aa5500", "#0000aa", "#aa00aa", "#00aaaa", "#aaaaaa"];
const ARTICLE_BRIGHT_COLORS = ["#555555", "#ff5555", "#55ff55", "#ffff55", "#5555ff", "#ff55ff", "#55ffff", "#ffffff"];

export interface AnsiTextRun {
  text: string;
  /** Exact terminal colors, including implicit defaults, for manual original layout. */
  style: CSSProperties;
  /** Sparse author intent: default/reset colors inherit the website in normal reading. */
  authoredStyle: CSSProperties;
}
export interface ParsedAnsiText { text: string; runs: AnsiTextRun[] }

/** Projects a terminal transcript to inert text and allowlisted CSS, never HTML. */
export function parseAnsiText(text: string): ParsedAnsiText {
  const runs: AnsiTextRun[] = [];
  let foreground = 7;
  let background = 0;
  let foregroundSpecified = false;
  let backgroundSpecified = false;
  let bold = false;
  let reverse = false;
  const color = (index: number) => index >= 8 ? ARTICLE_BRIGHT_COLORS[index - 8] : ARTICLE_COLORS[index];
  const append = (value: string) => {
    if (!value) return;
    const foregroundColor = color(bold && foreground < 8 ? foreground + 8 : foreground);
    const backgroundColor = color(background);
    const style: CSSProperties = {
      color: reverse ? backgroundColor : foregroundColor,
      backgroundColor: reverse ? foregroundColor : backgroundColor,
      fontWeight: bold ? 700 : 400,
    };
    const authoredStyle: CSSProperties = {
      ...((foregroundSpecified || reverse) ? { color: style.color } : {}),
      ...((backgroundSpecified || reverse) ? { backgroundColor: style.backgroundColor } : {}),
      ...(bold ? { fontWeight: 700 } : {}),
    };
    const last = runs[runs.length - 1];
    if (last && last.style.color === style.color && last.style.backgroundColor === style.backgroundColor && last.style.fontWeight === style.fontWeight &&
      last.authoredStyle.color === authoredStyle.color && last.authoredStyle.backgroundColor === authoredStyle.backgroundColor && last.authoredStyle.fontWeight === authoredStyle.fontWeight) {
      last.text += value;
    } else runs.push({ text: value, style, authoredStyle });
  };
  const sgr = (parameters: string) => {
    // Private/intermediate/colon syntax is unsupported; do not guess its meaning.
    if (!/^[0-9;]*$/.test(parameters)) return;
    const codes = parameters.split(";").map(Number);
    for (let index = 0; index < codes.length; index++) {
      const code = codes[index];
      if (code === 0) { foreground = 7; background = 0; foregroundSpecified = false; backgroundSpecified = false; bold = false; reverse = false; }
      else if (code === 1) bold = true;
      else if (code === 22) bold = false;
      else if (code === 7) reverse = true;
      else if (code === 27) reverse = false;
      else if (code >= 30 && code <= 37) { foreground = code - 30; foregroundSpecified = true; }
      else if (code >= 90 && code <= 97) { foreground = code - 90 + 8; foregroundSpecified = true; }
      else if (code === 39) { foreground = 7; foregroundSpecified = false; }
      else if (code >= 40 && code <= 47) { background = code - 40; backgroundSpecified = true; }
      else if (code >= 100 && code <= 107) { background = code - 100 + 8; backgroundSpecified = true; }
      else if (code === 49) { background = 0; backgroundSpecified = false; }
      else if (code === 38 || code === 48 || code === 58) {
        // Extended colors are outside the whitelist, including their numeric operands.
        const mode = codes[index + 1];
        if (mode === 5) index += 2;
        else if (mode === 2) index += 4;
        else return;
      }
    }
  };
  const skipString = (start: number, osc: boolean): number => {
    for (let index = start; index < text.length; index++) {
      if (text[index] === "\x9c" || (osc && text[index] === "\x07")) return index + 1;
      if (text[index] === "\x1b" && text[index + 1] === "\\") return index + 2;
    }
    return text.length;
  };
  const csi = (start: number): number => {
    let index = start;
    while (index < text.length) {
      const code = text.charCodeAt(index);
      if (code >= 0x40 && code <= 0x7e) {
        if (text[index] === "m") sgr(text.slice(start, index));
        return index + 1;
      }
      if (code < 0x20 || code > 0x3f) return index;
      index++;
    }
    return index;
  };
  let index = 0;
  let start = 0;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    if (code === 9 || code === 10 || (code >= 0x20 && (code < 0x7f || code > 0x9f))) { index++; continue; }
    append(text.slice(start, index));
    if (code === 0x1b) {
      const next = text[index + 1];
      if (next === "[") index = csi(index + 2);
      else if (next === "]" || next === "P" || next === "X" || next === "^" || next === "_") index = skipString(index + 2, next === "]");
      else {
        index++;
        while (index < text.length && text.charCodeAt(index) >= 0x20 && text.charCodeAt(index) <= 0x2f) index++;
        if (text.charCodeAt(index) >= 0x30 && text.charCodeAt(index) <= 0x7e) index++;
      }
    } else if (code === 0x9b) index = csi(index + 1);
    else if ([0x90, 0x98, 0x9d, 0x9e, 0x9f].includes(code)) index = skipString(index + 1, code === 0x9d);
    else index++;
    start = index;
  }
  append(text.slice(start));
  return { text: runs.map((run) => run.text).join(""), runs };
}
