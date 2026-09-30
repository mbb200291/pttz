export interface EditorPort {
  send(text: string): Promise<boolean>;
  getLine(index: number): { str: string };
  getCursor(): { x: number; y: number };
}

const MAX_LINES = 2000;
const plain = (text: string) => stripAnsi(text).trimEnd();
const pause = () => new Promise(resolve => setTimeout(resolve, 20));

function position(bot: EditorPort): { line: number; column: number } | null {
  const status = plain(bot.getLine(23).str);
  const match = /(?:文章編輯|編輯文章).*?(\d+)\s*:\s*(\d+)\s*$/u.exec(status);
  return match ? { line: Number(match[1]), column: Number(match[2]) } : null;
}

async function waitAt(bot: EditorPort, line: number, expected?: string): Promise<void> {
  const until = Date.now() + 2000;
  while (Date.now() < until) {
    const pos = position(bot);
    const cursor = bot.getCursor();
    if (pos?.line === line && pos.column === 1 && cursor.y >= 0 && cursor.y < 23 &&
      (expected === undefined || plain(bot.getLine(cursor.y).str) === expected)) return;
    await pause();
  }
  throw new Error("無法確認編輯器位置，已停止修改");
}

/** Replace body rows only; do not reconstruct or transmit the retained footer. */
export async function replaceEditorBody(bot: EditorPort, body: string, author: string, title: string): Promise<void> {
  await bot.send("\x1b,");
  await waitAt(bot, 1);
  const first = plain(bot.getLine(bot.getCursor().y).str);
  if (first.match(/^\s*作者[:：]?\s+(\S+)/u)?.[1]?.toLowerCase() !== author.split(/[\s(]/u)[0].toLowerCase()) {
    throw new Error("編輯器文章身分不符");
  }
  const top = bot.getCursor().y;
  if (plain(bot.getLine(top + 1).str).replace(/^\s*標題[:：]?\s*/u, "").trim() !== title.trim() ||
      !/^\s*時間[:：]?\s+/u.test(plain(bot.getLine(top + 2).str)) ||
      !/^(?:─{5,})?\s*$/u.test(plain(bot.getLine(top + 3).str))) throw new Error("無法辨識文章標頭");
  for (let line = 2; line <= 5; line++) {
    await bot.send("\x1b[B");
    await waitAt(bot, line);
  }
  let count = 0;
  let footer = "";
  for (; count < MAX_LINES; count++) {
    const current = plain(bot.getLine(bot.getCursor().y).str);
    if (current === "--" || /^※\s*(?:發信站|編輯:)/u.test(current) || /^(?:推|噓|→)\s+\w+:.*\d\d\/\d\d\s+\d\d:\d\d\s*$/u.test(current)) {
      footer = current;
      break;
    }
    await bot.send("\x1b[B");
    await waitAt(bot, 6 + count);
  }
  if (!footer || body.split("\n").length > MAX_LINES) throw new Error("無法確認正文邊界");
  await bot.send("\x1b,");
  await waitAt(bot, 1, first);
  for (let line = 2; line <= 5; line++) {
    await bot.send("\x1b[B");
    await waitAt(bot, line);
  }
  if (count) await bot.send("\x19".repeat(count));
  await waitAt(bot, 5, footer);
  let row = 5;
  for (const line of body.split("\n")) {
    await bot.send(`${line}\r`);
    await waitAt(bot, ++row, footer);
  }
}
import { stripAnsi } from "@pttzzz/core/internal";
