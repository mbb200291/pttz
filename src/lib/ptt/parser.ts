/**
 * PTT 文字解析
 *
 * 1. 移除 ANSI escape codes，取得純文字
 * 2. 解析文章列表行
 * 3. 解析推文行
 */

// ANSI escape sequence regex
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
const PAGE_INFO_RE = /瀏覽 第\s*(\d+)\/(\d+)\s*頁/u;
const PAGE_INFO_GLOBAL_RE = /瀏覽 第\s*(\d+)\/(\d+)\s*頁/gu;
const ARTICLE_LINE_RE =
  /^\s*(?<index>\d{4,6})\s+(?<mark>.)(?<pushCount>\s*(?:爆|X\d+|\d+)?)\s+(?<date>\d{1,2}\/\d{2})\s+(?<author>\S{2,12})\s+(?<title>.+)$/u;
const ARTICLE_BLOCK_RE =
  /(?:^|[\r\n])\s*(?<index>\d{4,6})\s+(?<mark>.)\s*(?<pushCount>爆|X\d+|\d+)?\s+(?<date>\d{1,2}\/\d{2})\s+(?<author>\S{2,12})\s+(?<title>.+?)(?=(?:[\r\n]+\s*\d{4,6}\s+.\s*(?:爆|X\d+|\d+)?\s+\d{1,2}\/\d{2}\s+\S{2,12}\s+)|(?:[\r\n]\s*●\s)|(?:[\r\n]\s*文章選讀)|$)/gu;

function stripBackspaces(text: string): string {
  const chars: string[] = [];

  for (const char of text) {
    if (char === "\b") {
      while (chars.length > 0 && chars[chars.length - 1] === " ") {
        chars.pop();
      }
      continue;
    }
    chars.push(char);
  }

  return chars.join("");
}

export function stripAnsi(text: string): string {
  return stripBackspaces(text.replace(ANSI_RE, ""));
}

function normalizeText(raw: string): string {
  return stripAnsi(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
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

  const match = plain.match(ARTICLE_LINE_RE);
  if (!match?.groups) return null;

  const index = parseInt(match.groups.index, 10);
  if (isNaN(index)) return null;

  const mark = match.groups.mark.trim() || " ";
  const pushCount = match.groups.pushCount.trim();
  const date = match.groups.date.trim();
  const author = match.groups.author.trim();
  const title = match.groups.title.trim();

  if (!title) return null;

  return { index, mark, pushCount, date, author, title };
}

export function parseArticleBuffer(raw: string): ArticleSummary[] {
  const plain = stripAnsi(raw)
    .replace(/\r\n/g, "\n")
    .replace(/(?<!\n)(\d{4,6}\s+.\s*(?:爆|X\d+|\d+)?\s+\d{1,2}\/\d{2}\s+\S{2,12}\s+)/gu, "\n$1");
  const parsed: ArticleSummary[] = [];

  for (const match of plain.matchAll(ARTICLE_BLOCK_RE)) {
    const { index, mark, pushCount, date, author, title } = match.groups ?? {};
    if (!index || !mark || !date || !author || !title) continue;

    parsed.push({
      index: parseInt(index, 10),
      mark: mark.trim() || " ",
      pushCount: (pushCount ?? "").trim(),
      date: date.trim(),
      author: author.trim(),
      title: title.trim(),
    });
  }

  return parsed.filter((article) => !Number.isNaN(article.index));
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

export function parsePushBuffer(raw: string): RawPush[] {
  const plain = stripAnsi(raw)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/(?<!\n)([推噓→]\s+\S{2,12}:)/gu, "\n$1");
  const pushes: RawPush[] = [];
  const startRe = /(?:^|\n)([推噓→])\s+(\S{2,12}):/gu;
  const starts = Array.from(plain.matchAll(startRe));

  for (let index = 0; index < starts.length; index += 1) {
    const match = starts[index];
    const next = starts[index + 1];
    const segmentStart = match.index ?? 0;
    const segmentEnd = next?.index ?? plain.length;
    const segment = plain.slice(segmentStart, segmentEnd).trim();
    const headerMatch = segment.match(/^([推噓→])\s+(\S{2,12}):\s*([\s\S]*)$/u);
    if (!headerMatch) continue;

    const [, marker, author, remainder] = headerMatch;
    const timeMatch = remainder.match(/(\d{2}\/\d{2} \d{2}:\d{2})/u);
    if (!timeMatch || timeMatch.index === undefined) continue;

    const beforeTime = remainder.slice(0, timeMatch.index).trim();
    const afterTime = remainder.slice(timeMatch.index + timeMatch[1].length);
    const continuation = afterTime
      .replace(new RegExp(`^${author}`), "")
      .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/gu, "")
      .replace(/\d{2}\/\d{2} \d{2}:\d{2}/gu, "")
      .replace(/\s+/g, " ")
      .trim();
    const content = `${beforeTime}${continuation ? ` ${continuation}` : ""}`.trim();
    const normalized = `${marker} ${author}: ${content} ${timeMatch[1]}`;
    const parsed = parsePushLine(normalized);
    if (parsed) {
      pushes.push(parsed);
    }
  }

  return pushes;
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
  const firstPushIdx = lines.findIndex((line) => parsePushLine(line) !== null);

  if (firstPushIdx >= 0) {
    return {
      body: lines.slice(0, firstPushIdx).join("\n").trimEnd(),
      pushLines: lines.slice(firstPushIdx).filter((line) => line.trim()),
    };
  }

  const separatorIndexes = lines
    .map((line, index) =>
      /^─{10,}/.test(stripAnsi(line).trim()) ? index : -1,
    )
    .filter((index) => index >= 0);

  if (separatorIndexes.length < 2) {
    return { body: raw, pushLines: [] };
  }

  const separatorIdx = separatorIndexes[separatorIndexes.length - 1];
  const body = lines.slice(0, separatorIdx).join("\n");
  const pushLines = lines.slice(separatorIdx + 1).filter((line) => line.trim());

  return { body, pushLines };
}

export function mergeArticlePage(existing: string, nextPage: string): string {
  if (!existing.trim()) return nextPage.trim();
  if (!nextPage.trim()) return existing.trim();

  const existingLines = existing.split("\n");
  const nextLines = nextPage.split("\n");
  const maxOverlap = Math.min(existingLines.length, nextLines.length);
  const normalizeForMerge = (text: string) =>
    stripAnsi(text).replace(/\s+/g, "").replace(/[^\p{L}\p{N}:/\[\]（）()！？。，、%+-]/gu, "");

  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const existingSuffix = existingLines.slice(-overlap).join("\n").trim();
    const nextPrefix = nextLines.slice(0, overlap).join("\n").trim();

    if (
      existingSuffix &&
      (existingSuffix === nextPrefix ||
        normalizeForMerge(existingSuffix) === normalizeForMerge(nextPrefix))
    ) {
      return [...existingLines, ...nextLines.slice(overlap)].join("\n").trim();
    }
  }

  for (let overlap = Math.min(6, nextLines.length); overlap >= 2; overlap -= 1) {
    const nextPrefix = nextLines.slice(0, overlap).join("\n").trim();
    if (!nextPrefix) continue;

    for (let start = 0; start <= existingLines.length - overlap; start += 1) {
      const existingWindow = existingLines
        .slice(start, start + overlap)
        .join("\n")
        .trim();

      if (
        existingWindow === nextPrefix ||
        normalizeForMerge(existingWindow) === normalizeForMerge(nextPrefix)
      ) {
        return [...existingLines.slice(0, start), ...nextLines].join("\n").trim();
      }
    }
  }

  return `${existing.trim()}\n${nextPage.trim()}`;
}

export function extractCurrentArticlePage(raw: string): string {
  const plain = normalizeText(raw);
  const lines = plain.split("\n");
  const footerIndexes = lines
    .map((line, index) => (PAGE_INFO_RE.test(line) ? index : -1))
    .filter((index) => index >= 0);

  if (footerIndexes.length === 0) {
    return plain;
  }

  const currentFooter = footerIndexes[footerIndexes.length - 1];
  const previousFooter =
    footerIndexes.length > 1 ? footerIndexes[footerIndexes.length - 2] : -1;

  let start = previousFooter + 1;
  if (previousFooter < 0) {
    for (let index = currentFooter; index >= 0; index -= 1) {
      const line = lines[index];
      if (
        line.trimStart().startsWith("作者") ||
        line.trimStart().startsWith("看板") ||
        line.trimStart().startsWith("標題") ||
        line.trimStart().startsWith("時間")
      ) {
        start = index;
      }
    }
  }

  return lines.slice(start, currentFooter).join("\n").trim();
}

export function getLastPageInfo(
  raw: string,
): { currentPage: number; totalPages: number } | null {
  const plain = normalizeText(raw);
  const matches = Array.from(plain.matchAll(PAGE_INFO_GLOBAL_RE));
  const lastMatch = matches[matches.length - 1];
  if (!lastMatch) return null;

  const currentPage = parseInt(lastMatch[1], 10);
  const totalPages = parseInt(lastMatch[2], 10);
  if (Number.isNaN(currentPage) || Number.isNaN(totalPages)) {
    return null;
  }

  return { currentPage, totalPages };
}

export function extractFirstArticlePage(raw: string): string {
  const plain = normalizeText(raw);
  const match = plain.match(
    /(作者[\s\S]*?標題[\s\S]*?時間[^\n]*\n[\s\S]*?)(?=\n\s*瀏覽 第\s*\d+\/\d+\s*頁)/u,
  );

  return match?.[1]?.trim() ?? "";
}
