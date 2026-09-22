type ArticleStyle = Readonly<{
  color?: string;
  backgroundColor?: string;
  fontWeight?: "700";
}>;

interface TextRun {
  text: string;
  style: ArticleStyle;
}

const COLORS = ["#000000", "#aa0000", "#00aa00", "#aa5500", "#0000aa", "#aa00aa", "#00aaaa", "#aaaaaa"];
const BRIGHT_COLORS = ["#555555", "#ff5555", "#55ff55", "#ffff55", "#5555ff", "#ff55ff", "#55ffff", "#ffffff"];

/** Turns a terminal article into inert text and a small whitelist of authored styles. */
function articleTextRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let foreground: number | undefined;
  let background: number | undefined;
  let bold = false;

  const append = (value: string): void => {
    if (!value) return;
    const color = foreground === undefined ? undefined : (bold && foreground < 8 ? BRIGHT_COLORS[foreground] : (foreground < 8 ? COLORS[foreground] : BRIGHT_COLORS[foreground - 8]));
    const backgroundColor = background === undefined ? undefined : (background < 8 ? COLORS[background] : BRIGHT_COLORS[background - 8]);
    const style: ArticleStyle = {
      ...(color === undefined ? {} : { color }),
      ...(backgroundColor === undefined ? {} : { backgroundColor }),
      ...(bold ? { fontWeight: "700" as const } : {}),
    };
    const previous = runs.at(-1);
    if (previous && previous.style.color === style.color && previous.style.backgroundColor === style.backgroundColor && previous.style.fontWeight === style.fontWeight) previous.text += value;
    else runs.push({ text: value, style });
  };

  const sgr = (parameters: string): void => {
    if (!/^[0-9;]*$/.test(parameters)) return;
    const codes = parameters.split(";").map(Number);
    for (let index = 0; index < codes.length; index++) {
      const code = codes[index];
      if (code === 0) { foreground = undefined; background = undefined; bold = false; }
      else if (code === 1) bold = true;
      else if (code === 22) bold = false;
      else if (code >= 30 && code <= 37) foreground = code - 30;
      else if (code >= 90 && code <= 97) foreground = code - 90 + 8;
      else if (code === 39) foreground = undefined;
      else if (code >= 40 && code <= 47) background = code - 40;
      else if (code >= 100 && code <= 107) background = code - 100 + 8;
      else if (code === 49) background = undefined;
      else if (code === 38 || code === 48 || code === 58) {
        const mode = codes[index + 1];
        if (mode === 5) index += 2;
        else if (mode === 2) index += 4;
      }
    }
  };

  const stringEnd = (start: number, osc: boolean): number => {
    for (let index = start; index < text.length; index++) {
      if (text[index] === "\x9c" || (osc && text[index] === "\x07")) return index + 1;
      if (text[index] === "\x1b" && text[index + 1] === "\\") return index + 2;
    }
    return text.length;
  };
  const csiEnd = (start: number): number => {
    for (let index = start; index < text.length; index++) {
      const code = text.charCodeAt(index);
      if (code >= 0x40 && code <= 0x7e) {
        if (text[index] === "m") sgr(text.slice(start, index));
        return index + 1;
      }
      if (code < 0x20 || code > 0x3f) return index + 1;
    }
    return text.length;
  };

  let index = 0;
  let start = 0;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    if (code === 9 || code === 10 || (code >= 0x20 && (code < 0x7f || code > 0x9f))) { index++; continue; }
    append(text.slice(start, index));
    if (code === 0x1b) {
      const next = text[index + 1];
      if (next === "[") index = csiEnd(index + 2);
      else if (next === "]" || next === "P" || next === "X" || next === "^" || next === "_") index = stringEnd(index + 2, next === "]");
      else {
        index++;
        while (index < text.length && text.charCodeAt(index) >= 0x20 && text.charCodeAt(index) <= 0x2f) index++;
        if (text.charCodeAt(index) >= 0x30 && text.charCodeAt(index) <= 0x7e) index++;
      }
    } else if (code === 0x9b) index = csiEnd(index + 1);
    else if ([0x90, 0x98, 0x9d, 0x9e, 0x9f].includes(code)) index = stringEnd(index + 1, code === 0x9d);
    else index++;
    start = index;
  }
  append(text.slice(start));
  return runs;
}

/** Removes terminal controls without treating the article as HTML. */
export function plainArticleText(text: string): string {
  return articleTextRuns(text).map(run => run.text).join("");
}

/** Replaces an element's article body with safe text nodes and allowlisted SGR spans. */
export function renderArticleBody(element: HTMLElement, text: string): void {
  const nodes = articleTextRuns(text).map(run => {
    if (!Object.keys(run.style).length) return document.createTextNode(run.text);
    const span = document.createElement("span");
    span.textContent = run.text;
    if (run.style.color) span.style.color = run.style.color;
    if (run.style.backgroundColor) span.style.backgroundColor = run.style.backgroundColor;
    if (run.style.fontWeight) span.style.fontWeight = run.style.fontWeight;
    return span;
  });
  element.replaceChildren(...nodes);
}
