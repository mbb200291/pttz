import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { editorSaveKey } from "./editorPrompt.js";

describe("editor save prompt", () => {
  it.each(["024", "043", "056"])("accepts real file menu %s without requiring Yes/No", (name) => {
    const screen = readFileSync(`src/internal/__fixtures__/real-ptt/2026-09-13/kick-and-board/${name}.txt`, "utf8");
    expect(editorSaveKey(screen)).toBe("s\r");
  });
  it("does not treat article examples or unknown prompts as save permission", () => {
    expect(editorSaveKey("作者 alice 看板 Test\n[S]儲存 (A)放棄 (E)繼續\n瀏覽 第 1/1 頁")).toBeNull();
    expect(editorSaveKey("文章儲存功能教學")).toBeNull();
    expect(editorSaveKey("未知確認 [Y/n]")).toBeNull();
  });
});
