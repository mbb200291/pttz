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
}

export interface ArticleEditNote {
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
    const ipMatch = beforeTime.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b$/u);
    const ipAddress = ipMatch?.[0];
    const contentBeforeIp = ipAddress
      ? beforeTime.slice(0, beforeTime.length - ipAddress.length).trimEnd()
      : beforeTime;
    const afterTime = remainder.slice(timeMatch.index + timeMatch[1].length);
    const continuation = afterTime
      .replace(new RegExp(`^${author}`), "")
      .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/gu, "")
      .replace(/\d{2}\/\d{2} \d{2}:\d{2}/gu, "")
      .replace(/\s+/g, " ")
      .trim();
    const content = `${contentBeforeIp}${continuation ? ` ${continuation}` : ""}`.trim();
    const normalized = `${marker} ${author}: ${content} ${timeMatch[1]}`;
    const parsed = parsePushLine(normalized);
    if (parsed) {
      pushes.push({ ...parsed, ipAddress });
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
  const match = visible.match(/[推噓→]\s+\S{2,12}:/u);
  if (!match || match.index === undefined || match.index === 0) return null;
  return visibleChars[match.index]?.rawIndex ?? null;
}

function collectPrecedingBodyParagraph(
  lines: Array<{ line: string; start: number; end: number; lineEnd: number }>,
  markerIndex: number,
): { content: string; contentAnchorOffset: number; rawBlockStart: number } | null {
  const collected: Array<{ text: string; start: number }> = [];

  for (let index = markerIndex - 1; index >= 0; index -= 1) {
    const current = lines[index];
    const plain = stripAnsi(current.line);
    const trimmed = plain.trim();

    if (trimmed.length === 0) {
      if (collected.length > 0) break;
      continue;
    }

    if (/^※\s*編輯:/u.test(trimmed) || parsePushLine(current.line) !== null) {
      break;
    }

    collected.push({ text: plain.trimEnd(), start: current.start });
  }

  if (collected.length === 0) return null;

  collected.reverse();
  return {
    content: collected.map((line) => line.text).join("\n").trim(),
    contentAnchorOffset: collected[0].start,
    rawBlockStart: collected[0].start,
  };
}

export function extractArticleThreadEvents(raw: string): {
  editNotes: ArticleEditNote[];
} {
  const lines = splitLinesWithOffsets(raw);
  const editNotes: ArticleEditNote[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index];
    const marker = stripAnsi(current.line).trimStart();
    if (!/^※\s*編輯:/u.test(marker)) continue;

    let endIndex = index + 1;
    let rawBlockEnd = current.lineEnd;
    const contentLines: string[] = [];
    let contentAnchorOffset = current.lineEnd;
    while (endIndex < lines.length) {
      const next = lines[endIndex];
      const nextPlain = stripAnsi(next.line).trimStart();
      if (/^※\s*編輯:/u.test(nextPlain)) break;
      if (parsePushLine(next.line) !== null) break;

      const embeddedPushMarkerRawIndex = findEmbeddedPushMarkerRawIndex(next.line);
      if (embeddedPushMarkerRawIndex !== null) {
        if (contentLines.length === 0) {
          contentAnchorOffset = next.start;
        }
        contentLines.push(
          stripAnsi(next.line.slice(0, embeddedPushMarkerRawIndex)).trimEnd(),
        );
        rawBlockEnd = next.start + embeddedPushMarkerRawIndex;
        endIndex += 1;
        break;
      }

      if (contentLines.length === 0) {
        contentAnchorOffset = next.start;
      }
      contentLines.push(stripAnsi(next.line).trimEnd());
      rawBlockEnd = next.lineEnd;
      endIndex += 1;
    }
    let content = contentLines.join("\n").trim();
    let rawBlockStart = current.start;

    if (content.length === 0) {
      const precedingParagraph = collectPrecedingBodyParagraph(lines, index);
      if (precedingParagraph) {
        content = precedingParagraph.content;
        contentAnchorOffset = precedingParagraph.contentAnchorOffset;
        rawBlockStart = precedingParagraph.rawBlockStart;
      }
    }

    editNotes.push({
      marker: "※ 編輯:",
      content,
      rawBlock: raw.slice(rawBlockStart, rawBlockEnd),
      contentAnchorOffset,
      markerOffset: current.start,
    });

    index = endIndex - 1;
  }

  return { editNotes };
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
