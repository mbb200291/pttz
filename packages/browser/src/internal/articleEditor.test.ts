import { expect, it } from "vitest";
import { replaceEditorBody } from "./articleEditor.js";

function editor(body: string[], tail = ["--", "\x1b[32m簽名\x1b[m", "推 bob: keep 09/20 12:00"], rawHeader = false) {
  const header = rawHeader ? ["作者: alice (alice) 看板: Test", "標題: same", "時間: Sun Sep 20 12:00:00 2026", ""]
    : [" 作者 alice 看板 Test", " 標題 same", " 時間 Sun Sep 20 12:00:00 2026", "────────────────"];
  const lines = [...header, ...body, ...tail];
  let row = 0;
  const bot = {
    getCursor: () => ({ x: 0, y: Math.min(row, 22) }),
    getLine: (i: number) => ({ str: i === 23 ? `編輯文章 (^X/^Q)離開 ║插入│ ${row + 1}: 1` : lines[Math.max(0, row - 22) + i] ?? "" }),
    send: async (key: string) => {
      if (key === "\x1b,") row = 0;
      else if (key === "\x1b[B") row = Math.min(lines.length - 1, row + 1);
      else if (key.startsWith("\x19")) lines.splice(row, key.length);
      else if (key.endsWith("\r")) { lines.splice(row, 0, key.slice(0, -1)); row++; }
      return true;
    },
  };
  return { bot, lines, header, tail };
}

it("replaces only the editor body across multiple viewports, retaining exact header and colored footer", async () => {
  const { bot, lines, header, tail } = editor(Array.from({ length: 30 }, (_, i) => `old ${i}`));
  await replaceEditorBody(bot, "new\n\nbody", "alice", "same");
  expect(lines).toEqual([...header, "new", "", "body", ...tail]);
});

it("recognizes the actual editor file header, not only the rendered article header", async () => {
  const { bot, lines, header, tail } = editor(["old"], undefined, true);
  await replaceEditorBody(bot, "new", "alice", "same");
  expect(lines).toEqual([...header, "new", ...tail]);
});

it("does not mutate an editor with an unrecognized header", async () => {
  const { bot, lines } = editor(["old"]);
  lines[0] = "unexpected buffer";
  const original = [...lines];
  await expect(replaceEditorBody(bot, "new", "alice", "same")).rejects.toThrow();
  expect(lines).toEqual(original);
});
