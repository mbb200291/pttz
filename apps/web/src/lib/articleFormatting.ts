import type { ArticleTextStyle } from "@pttzzz/core";

export const ARTICLE_COLORS = ["#000000", "#aa0000", "#00aa00", "#aa5500", "#0000aa", "#aa00aa", "#00aaaa", "#aaaaaa"];
export const ARTICLE_BRIGHT_COLORS = ["#555555", "#ff5555", "#55ff55", "#ffff55", "#5555ff", "#ff55ff", "#55ffff", "#ffffff"];

export function applyArticleStyle(ranges: readonly ArticleTextStyle[], start: number, end: number, style: Omit<ArticleTextStyle, "start" | "end">): ArticleTextStyle[] {
  if (start >= end) return [...ranges];
  const next = ranges.flatMap((range) => {
    if (range.end <= start || range.start >= end) return [range];
    return [...(range.start < start ? [{ ...range, end: start }] : []), ...(range.end > end ? [{ ...range, start: end }] : [])];
  });
  if (style.bold || style.color !== undefined) next.push({ start, end, ...style });
  return next.sort((a, b) => a.start - b.start);
}

/** Editing a styled span clears it; unaffected following spans shift with the text. */
export function rebaseArticleStyles(before: string, after: string, ranges: readonly ArticleTextStyle[]): ArticleTextStyle[] {
  if (before === after) return [...ranges];
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let oldEnd = before.length;
  let newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
  const delta = after.length - before.length;
  return ranges.flatMap((range) => {
    if (range.end <= start) return [range];
    if (range.start >= oldEnd) return [{ ...range, start: range.start + delta, end: range.end + delta }];
    return [];
  });
}
