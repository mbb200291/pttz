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

export type PushType = "push" | "boo" | "neutral";

export interface RawPush {
  type: PushType;
  author: string;
  content: string;
  time: string;
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
