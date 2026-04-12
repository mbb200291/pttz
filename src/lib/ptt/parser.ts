/**
 * PTT text parsing helpers still used by the adapter-backed flow.
 *
 * Kept on purpose:
 * - ANSI cleanup
 * - push parsing
 * - article body/push splitting
 * - shared data shapes
 */

const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
const PUSH_MARKER_PATTERN = "([推噓→])\\s+(\\S{2,12})\\s*:";
const PUSH_MARKER_RE = new RegExp(PUSH_MARKER_PATTERN, "u");
// PTT 推文內容區會受作者欄、IP 與時間欄擠壓；約 37 bytes 已會貼近 IP 欄。
const MIN_FULL_PUSH_BYTES = 37;
// 內容前綴（推/噓/→ + 作者 + 冒號）也會吃欄寬；48 columns 約剩一個半形 buffer。
const MIN_FULL_PUSH_ROW_BYTES = 48;

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

export interface ArticleSummary {
  index: number;
  mark: string;
  pushCount: string;
  date: string;
  author: string;
  title: string;
}

export type PushType = "push" | "boo" | "neutral" | "edit";

export interface RawPush {
  type: PushType;
  author: string;
  content: string;
  ipAddress?: string;
  time: string;
  isFullWidthLine?: boolean;
}

export interface ArticleEditRecord {
  marker: string;
  content: string;
  rawBlock: string;
  markerOffset: number;
}

export interface OpEditedReplySegment {
  marker: string;
  content: string;
  rawBlock: string;
  contentAnchorOffset: number;
  markerOffset: number;
}

export function parsePushLine(line: string): RawPush | null {
  const plain = stripAnsi(line).trim();
  const firstChar = plain.charAt(0);

  let type: PushType;
  if (firstChar === "推") type = "push";
  else if (firstChar === "噓") type = "boo";
  else if (firstChar === "→") type = "neutral";
  else return null;

  const rest = plain.slice(1).trimStart();
  const colonIndex = rest.indexOf(":");
  if (colonIndex === -1) return null;

  const author = rest.slice(0, colonIndex).trim();
  const middle = rest.slice(colonIndex + 1);
  const timeLength = 11;

  let content: string;
  let time: string;
  if (middle.length >= timeLength + 1) {
    time = middle.slice(-timeLength).trim();
    content = middle.slice(0, middle.length - timeLength).trim();
  } else {
    content = middle.trim();
    time = "";
  }

  return { type, author, content, time };
}

function countTrailingSpaces(value: string): number {
  const match = value.match(/[ \u3000]*$/u);
  return match?.[0].length ?? 0;
}

function approximateBytes(value: string): number {
  let count = 0;
  for (const char of value) {
    count += char.codePointAt(0)! > 127 ? 2 : 1;
  }
  return count;
}

function isFullWidthPushRemainder(
  remainder: string,
  timeStartIndex: number,
  marker: string,
  author: string,
): boolean {
  const beforeTime = remainder.slice(0, timeStartIndex);
  const ipMatch = beforeTime.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b\s*$/u);
  const contentField = ipMatch?.index === undefined
    ? beforeTime
    : beforeTime.slice(0, ipMatch.index);
  const content = contentField.trimEnd();

  if (content.length === 0) return false;

  return (
    countTrailingSpaces(contentField) <= 3 ||
    approximateBytes(content) >= MIN_FULL_PUSH_BYTES ||
    approximateBytes(`${marker} ${author}: ${content}`) >=
      MIN_FULL_PUSH_ROW_BYTES
  );
}

export function parsePushBuffer(raw: string): RawPush[] {
  const plain = stripAnsi(raw)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(new RegExp(`(?<!\\n)${PUSH_MARKER_PATTERN}`, "gu"), "\n$1 $2:");
  const pushes: RawPush[] = [];
  const startRe = new RegExp(`(?:^|\\n)${PUSH_MARKER_PATTERN}`, "gu");
  const starts = Array.from(plain.matchAll(startRe));

  for (let index = 0; index < starts.length; index += 1) {
    const match = starts[index];
    const next = starts[index + 1];
    const segmentStart = match.index ?? 0;
    const segmentEnd = next?.index ?? plain.length;
    const segment = plain.slice(segmentStart, segmentEnd).trim();
    const headerMatch = segment.match(
      new RegExp(`^${PUSH_MARKER_PATTERN}\\s*([\\s\\S]*)$`, "u"),
    );
    if (!headerMatch) continue;

    const [, marker, author, remainder] = headerMatch;
    const timeMatch = remainder.match(/(\d{2}\/\d{2} \d{2}:\d{2})/u);
    if (!timeMatch || timeMatch.index === undefined) continue;

    const beforeTime = remainder.slice(0, timeMatch.index).trim();
    const ipMatch = beforeTime.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b$/u);
    const ipAddress = ipMatch?.[0];
    const contentBeforeIp = ipAddress
      ? beforeTime.slice(0, beforeTime.length - ipAddress.length).trimEnd()
      : beforeTime;
    const afterTime = remainder.slice(timeMatch.index + timeMatch[1].length);
    const continuation = afterTime
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith(author))
      .map((line) => line.slice(author.length).trim())
      .join(" ")
      .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/gu, "")
      .replace(/\d{2}\/\d{2} \d{2}:\d{2}/gu, "")
      .replace(/\s+/g, " ")
      .trim();
    const content = `${contentBeforeIp}${continuation ? ` ${continuation}` : ""}`.trim();
    const normalized = `${marker} ${author}: ${content} ${timeMatch[1]}`;
    const parsed = parsePushLine(normalized);
    if (parsed) {
      pushes.push({
        ...parsed,
        ipAddress,
        isFullWidthLine: isFullWidthPushRemainder(
          remainder,
          timeMatch.index,
          marker,
          author,
        ),
      });
    }
  }

  return pushes;
}

function splitLinesWithOffsets(
  raw: string,
): Array<{ line: string; start: number; end: number; lineEnd: number }> {
  const lines: Array<{ line: string; start: number; end: number; lineEnd: number }> = [];

  if (raw.length === 0) {
    return [{ line: "", start: 0, end: 0, lineEnd: 0 }];
  }

  let start = 0;
  while (start < raw.length) {
    let end = start;
    while (end < raw.length && raw[end] !== "\n" && raw[end] !== "\r") {
      end += 1;
    }

    let lineEnd = end;
    if (end < raw.length) {
      if (raw[end] === "\r" && raw[end + 1] === "\n") {
        lineEnd = end + 2;
      } else {
        lineEnd = end + 1;
      }
    }

    lines.push({ line: raw.slice(start, end), start, end, lineEnd });

    if (end >= raw.length) break;
    if (raw[end] === "\r" && raw[end + 1] === "\n") {
      start = end + 2;
    } else {
      start = end + 1;
    }
  }

  return lines;
}

function findEmbeddedPushMarkerRawIndex(line: string): number | null {
  const visibleChars: Array<{ char: string; rawIndex: number }> = [];

  for (let rawIndex = 0; rawIndex < line.length; ) {
    if (line[rawIndex] === "\x1b" && line[rawIndex + 1] === "[") {
      rawIndex += 2;
      while (rawIndex < line.length) {
        const code = line.charCodeAt(rawIndex);
        rawIndex += 1;
        if (code >= 0x40 && code <= 0x7e) break;
      }
      continue;
    }

    const char = line[rawIndex];
    if (char === "\b") {
      while (
        visibleChars.length > 0 &&
        visibleChars[visibleChars.length - 1].char === " "
      ) {
        visibleChars.pop();
      }
      rawIndex += 1;
      continue;
    }

    visibleChars.push({ char, rawIndex });
    rawIndex += 1;
  }

  const visible = visibleChars.map((entry) => entry.char).join("");
  const match = visible.match(PUSH_MARKER_RE);
  if (!match || match.index === undefined || match.index === 0) return null;
  return visibleChars[match.index]?.rawIndex ?? null;
}

function isEditMarkerLine(line: string): boolean {
  return /^※\s*編輯:/u.test(stripAnsi(line).trimStart());
}

function isTerminalStatusLine(line: string): boolean {
  const plain = stripAnsi(line).trim();
  return (
    plain.includes("100%") ||
    plain.includes("瀏覽 第") ||
    plain.includes("目前顯示") ||
    plain.includes("此文章無內容")
  );
}

function parseEditRecord(
  line: { line: string; start: number },
): ArticleEditRecord {
  const plain = stripAnsi(line.line).trim();
  return {
    marker: "※ 編輯:",
    content: plain.replace(/^※\s*編輯:\s*/u, ""),
    rawBlock: line.line,
    markerOffset: line.start,
  };
}

function lineContentBeforeEmbeddedPush(line: string): {
  text: string;
  rawEndOffset: number;
  hasEmbeddedPush: boolean;
} {
  const embeddedPushMarkerRawIndex = findEmbeddedPushMarkerRawIndex(line);
  if (embeddedPushMarkerRawIndex === null) {
    return {
      text: stripAnsi(line).trimEnd(),
      rawEndOffset: line.length,
      hasEmbeddedPush: false,
    };
  }

  return {
    text: stripAnsi(line.slice(0, embeddedPushMarkerRawIndex)).trimEnd(),
    rawEndOffset: embeddedPushMarkerRawIndex,
    hasEmbeddedPush: true,
  };
}

export function extractArticleThreadEvents(raw: string): {
  editRecords: ArticleEditRecord[];
  opReplySegments: OpEditedReplySegment[];
} {
  const lines = splitLinesWithOffsets(raw);
  const editRecords: ArticleEditRecord[] = [];
  const opReplySegments: OpEditedReplySegment[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index];
    if (isEditMarkerLine(current.line)) {
      editRecords.push(parseEditRecord(current));
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const startLine = lines[index];
    if (parsePushLine(startLine.line) === null) continue;

    let endIndex = index + 1;
    while (endIndex < lines.length) {
      const next = lines[endIndex];
      if (parsePushLine(next.line) !== null) break;
      if (findEmbeddedPushMarkerRawIndex(next.line) !== null) break;
      endIndex += 1;
    }

    const contentLines: Array<{ text: string; start: number; end: number }> = [];
    const markerOffset =
      lines
        .slice(index + 1, endIndex + 1)
        .find((line) => isEditMarkerLine(line.line))?.start ?? startLine.lineEnd;

    for (
      let cursor = index + 1;
      cursor <= endIndex && cursor < lines.length;
      cursor += 1
    ) {
      const current = lines[cursor];
      if (
        parsePushLine(current.line) !== null ||
        isEditMarkerLine(current.line) ||
        isTerminalStatusLine(current.line)
      ) {
        continue;
      }

      const contentPart = lineContentBeforeEmbeddedPush(current.line);
      const text = contentPart.text.trim();
      if (text.length > 0) {
        contentLines.push({
          text,
          start: current.start,
          end: current.start + contentPart.rawEndOffset,
        });
      }
      if (contentPart.hasEmbeddedPush) break;
    }

    if (contentLines.length > 0) {
      const rawBlockStart = contentLines[0].start;
      const rawBlockEnd = contentLines[contentLines.length - 1].end;
      opReplySegments.push({
        marker: "作者編輯",
        content: contentLines.map((line) => line.text).join("\n").trim(),
        rawBlock: raw.slice(rawBlockStart, rawBlockEnd),
        contentAnchorOffset: rawBlockStart,
        markerOffset,
      });
    }

    index = endIndex - 1;
  }

  return { editRecords, opReplySegments };
}

export function splitArticleBody(raw: string): {
  body: string;
  pushLines: string[];
} {
  const lines = raw.split("\n");
  const firstPushIndex = lines.findIndex((line) => parsePushLine(line) !== null);

  if (firstPushIndex >= 0) {
    return {
      body: lines.slice(0, firstPushIndex).join("\n").trimEnd(),
      pushLines: lines.slice(firstPushIndex).filter((line) => line.trim()),
    };
  }

  const separatorIndexes = lines
    .map((line, index) => (/^─{10,}/.test(stripAnsi(line).trim()) ? index : -1))
    .filter((index) => index >= 0);

  if (separatorIndexes.length < 2) {
    return { body: raw, pushLines: [] };
  }

  const separatorIndex = separatorIndexes[separatorIndexes.length - 1];
  return {
    body: lines.slice(0, separatorIndex).join("\n"),
    pushLines: lines.slice(separatorIndex + 1).filter((line) => line.trim()),
  };
}
