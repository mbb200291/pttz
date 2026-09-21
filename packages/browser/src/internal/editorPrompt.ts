import { stripAnsi } from "@pttzzz/core/internal";

/** Match the active prompt, never an example quoted in article body. */
export function editorSaveKey(screen: string): "s\r" | "y\r" | null {
  const lines = stripAnsi(screen).replace(/\r/g, "").split("\n").map(line => line.trim()).filter(Boolean);
  const prompt = lines[lines.length - 1] ?? "";
  if (/瀏覽 第|目前顯示/u.test(prompt)) return null;
  const menu = /^【\s*檔案處理\s*】/u.test(lines[0] ?? "") ? lines[1] ?? "" : prompt;
  if (/\[S(?:\/V)?\](?:儲存|發文)/iu.test(menu) && /\(A\)放棄/iu.test(menu) && /\(E\)繼續/iu.test(menu)) return "s\r";
  if (/^(?:確定|是否|要).*(?:儲存|存檔).*\[[Yy]\/[Nn]\]/u.test(prompt)) return "y\r";
  return null;
}
