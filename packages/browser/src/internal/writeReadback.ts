import { parsePushBuffer, type PushType } from "@pttzzz/core/internal";

export interface PushWriteEvidence {
  author: string;
  content: string;
  pushType: PushType;
}

function normalizeAuthor(value: string): string {
  return value.trim().toLowerCase();
}

function matchingPushCount(rawText: string, expected: PushWriteEvidence): number {
  const author = normalizeAuthor(expected.author);
  const content = expected.content.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
  return parsePushBuffer(rawText).filter((push) =>
    normalizeAuthor(push.author) === author &&
    push.type === expected.pushType &&
    push.content === content
  ).length;
}

/**
 * Confirms a non-idempotent PTT push only when the exact raw event count grows.
 * An older identical event therefore cannot turn an uncertain write into success.
 */
export function verifyPushWriteDelta(
  beforeRawText: string,
  afterRawText: string,
  expected: PushWriteEvidence,
): boolean {
  return matchingPushCount(afterRawText, expected) >
    matchingPushCount(beforeRawText, expected);
}
