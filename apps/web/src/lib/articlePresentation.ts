import type { CSSProperties } from "react";
import type { AnsiTextRun } from "./ansiText";
import { ARTICLE_BRIGHT_COLORS, ARTICLE_COLORS } from "./articleFormatting";

/** A conservative whole-article hint, not a table parser; manual original layout remains available. */
export function isPreformattedArticle(text: string): boolean {
  const lines = text.split("\n").filter((line) => line.trim());
  if (lines.filter((line) => /[│┃║|].*[│┃║|]/u.test(line)).length >= 2) return true;
  if (lines.filter((line) => /[┌┐└┘├┤┬┴┼─━╔╗╚╝╠╣╦╩╬═]{2,}/u.test(line)).length >= 2) return true;
  const artLines = lines.filter((line) => {
    const compact = line.replace(/\s/g, "");
    const symbols = compact.match(/[+\-/\\|_=<>()[\]{}^]/g) ?? [];
    return symbols.length >= 3 && symbols.length / compact.length >= 0.6;
  });
  if (artLines.length >= 2 && lines.some((line) => /[|/\\()[\]{}]/.test(line))) return true;
  // Require multiple internal gaps on at least three rows, not indentation or one spaced sentence.
  return lines.filter((line) => line.trim().split(/ {2,}|\t+/).length >= 3).length >= 3;
}

const terminal = [...ARTICLE_COLORS, ...ARTICLE_BRIGHT_COLORS];
// The website uses a dark surface: lighten foregrounds and keep author backgrounds subdued.
const foreground = [
  "#aeb8c8", "#f28b82", "#81c995", "#fdd663", "#8ab4f8", "#d7aefb", "#78d9ec", "#e8eaed",
  "#c2c9d6", "#ffada5", "#a8dab5", "#ffe599", "#aecbfa", "#e5c9ff", "#a1e8f3", "#f1f3f4",
];
const background = [
  "#20242b", "#4b2528", "#203d2b", "#483a19", "#263753", "#3e2c52", "#1e3d43", "#343a44",
  "#2d333d", "#542c30", "#26412f", "#493c1b", "#2a3c57", "#48335e", "#233f45", "#363c46",
];

/** Remap only author-specified properties; never change parser state or original terminal colors. */
export function readableAnsiStyle(run: AnsiTextRun): CSSProperties {
  const style: CSSProperties = { ...run.authoredStyle };
  const colorIndex = terminal.indexOf(String(style.color));
  const backgroundIndex = terminal.indexOf(String(style.backgroundColor));
  if (colorIndex >= 0) style.color = foreground[colorIndex];
  if (backgroundIndex >= 0) style.backgroundColor = background[backgroundIndex];
  return style;
}
