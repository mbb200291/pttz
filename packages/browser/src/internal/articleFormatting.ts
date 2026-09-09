import { articleTextRuns, type ArticleTextStyle } from "@pttzzz/core";

/** PTT edit.c maps Ctrl+U to a literal ESC; never transmit caller-supplied controls. */
export function formatEditorBody(content: string, formatting?: readonly ArticleTextStyle[]): string {
  return articleTextRuns(content, formatting).map((run) => {
    if (!run.bold && run.color === undefined) return run.text;
    const codes = [0, ...(run.bold ? [1] : []), ...(run.color === undefined ? [] : [run.color])];
    return `\x15[${codes.join(";")}m${run.text}\x15[0m`;
  }).join("");
}
