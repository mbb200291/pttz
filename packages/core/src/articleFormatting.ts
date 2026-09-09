import type { ArticleTextStyle } from "./contracts.js";

export interface ArticleTextRun { text: string; bold?: boolean; color?: ArticleTextStyle["color"] }

/** Validates the opt-in formatting contract without interpreting text as markup. */
export function articleTextRuns(content: string, formatting: readonly ArticleTextStyle[] = []): ArticleTextRun[] {
  if (!Array.isArray(formatting)) throw new Error("文章格式必須是範圍陣列");
  if (!formatting.length) return [{ text: content }];
  if (!content.trim()) throw new Error("格式化文章正文不可為空白");
  if (content.length > 50000 || /[\x00-\x08\x0b-\x1f\x7f-\x9f]/u.test(content)) {
    throw new Error("格式化正文不可含終端控制字元，且不可超過 50000 字元");
  }
  const boundary = (index: number) => !(index > 0 && index < content.length &&
    /[\uD800-\uDBFF]/u.test(content[index - 1]) && /[\uDC00-\uDFFF]/u.test(content[index]));
  const runs: ArticleTextRun[] = [];
  let previous = 0;
  for (const style of formatting) {
    if (!style || !Number.isInteger(style.start) || !Number.isInteger(style.end) ||
      style.start < previous || style.end <= style.start || style.end > content.length ||
      !boundary(style.start) || !boundary(style.end) ||
      (style.bold !== undefined && typeof style.bold !== "boolean") ||
      (style.color !== undefined && (!Number.isInteger(style.color) || style.color < 30 || style.color > 37))) {
      throw new Error("文章格式範圍或樣式無效");
    }
    if (style.start > previous) runs.push({ text: content.slice(previous, style.start) });
    runs.push({ text: content.slice(style.start, style.end), ...(style.bold ? { bold: true } : {}),
      ...(style.color === undefined ? {} : { color: style.color }) });
    previous = style.end;
  }
  if (previous < content.length) runs.push({ text: content.slice(previous) });
  return runs;
}
