/**
 * PTT 文字解析
 *
 * 1. 移除 ANSI escape codes，取得純文字
 * 2. 解析文章列表行
 * 3. 解析推文行
 */

// ANSI escape sequence regex
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

// ─── 文章列表 ────────────────────────────────────────────────────────────────

export interface ArticleSummary {
  index: number;
  mark: string; // 推文標記 (空白/"M"/"S"/"+"/"-"/"!" 等)
  pushCount: string; // 推文數顯示（可能是 "爆" 或數字）
  date: string; // "12/31"
  author: string;
  title: string;
}

/**
 * 解析 PTT 文章列表的單行
 * 格式範例（去掉 ANSI 後）：
 * " 12345 +  爆 12/31 user1234        Re: [問題] 標題"
 */
export function parseArticleLine(line: string): ArticleSummary | null {
  const plain = stripAnsi(line);

  // 簡單以空白分割，取固定欄位
  // PTT 文章列表行格式（寬 80 字）：
  // col 0-5: 編號
  // col 6: mark
  // col 7-10: 推文數
  // col 11-15: 日期
  // col 16-27: 作者
  // col 28-: 標題

  if (plain.length < 30) return null;

  const index = parseInt(plain.substring(0, 6).trim(), 10);
  if (isNaN(index)) return null;

  const mark = plain.charAt(6);
  const pushCount = plain.substring(7, 11).trim();
  const date = plain.substring(11, 16).trim();
  const author = plain.substring(17, 29).trim();
  const title = plain.substring(29).trim();

  if (!title) return null;

  return { index, mark, pushCount, date, author, title };
}

// ─── 推文 ────────────────────────────────────────────────────────────────────

export type PushType = "push" | "boo" | "neutral";

export interface RawPush {
  type: PushType;
  author: string;
  content: string;
  time: string; // "MM/DD HH:mm"
}

/**
 * 解析 PTT 推文行
 * 格式（去掉 ANSI 後）：
 * "推 author: content                            MM/DD HH:mm"
 * "噓 author: content                            MM/DD HH:mm"
 * "→ author: content                            MM/DD HH:mm"
 */
export function parsePushLine(line: string): RawPush | null {
  const plain = stripAnsi(line).trim();

  // 第一個字元判斷推/噓/→
  const firstChar = plain.charAt(0);
  let type: PushType;
  if (firstChar === "推") type = "push";
  else if (firstChar === "噓") type = "boo";
  else if (firstChar === "→") type = "neutral";
  else return null;

  // 去掉第一個字元與空白，剩下 "author: content   MM/DD HH:mm"
  const rest = plain.slice(1).trimStart();
  const colonIdx = rest.indexOf(":");
  if (colonIdx === -1) return null;

  const author = rest.slice(0, colonIdx).trim();

  // 時間在行末固定格式 "MM/DD HH:mm"（12 chars），從尾部截取
  const TIME_LEN = 11; // "12/31 23:59"
  const middle = rest.slice(colonIdx + 1);
  let content: string;
  let time: string;

  if (middle.length >= TIME_LEN + 1) {
    time = middle.slice(-(TIME_LEN)).trim();
    content = middle.slice(0, middle.length - TIME_LEN).trim();
  } else {
    content = middle.trim();
    time = "";
  }

  return { type, author, content, time };
}

// ─── 文章正文 ─────────────────────────────────────────────────────────────────

/**
 * 將 PTT 文章原始文字切成「正文」和「推文列表」兩段。
 * 推文區以 "─────" 分隔線開頭。
 */
export function splitArticleBody(raw: string): {
  body: string;
  pushLines: string[];
} {
  const lines = raw.split("\n");
  const separatorIdx = lines.findIndex((l) =>
    /^─{10,}/.test(stripAnsi(l).trim()),
  );

  if (separatorIdx === -1) {
    return { body: raw, pushLines: [] };
  }

  const body = lines.slice(0, separatorIdx).join("\n");
  const pushLines = lines.slice(separatorIdx + 1);
  return { body, pushLines };
}
