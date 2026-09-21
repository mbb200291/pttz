import type { ActionReceipt, GatewayReplyDraftInput, ReplyDelivery, ReplyDraftIssue } from "@pttzzz/core";
import { GatewayError } from "@pttzzz/core";
import { aggregatePushes, parsePushBuffer, pushContentCapacity, stripAnsi } from "@pttzzz/core/internal";
// @ts-expect-error uao-js is the transport codec and has no declarations.
import uao from "uao-js";

export function replyPreparationError(issue: ReplyDraftIssue, message: string, cause?: unknown): GatewayError {
  return new GatewayError("REPLY_DRAFT_NOT_SENT", message, true, cause, issue);
}

function validateDraft(draft: string): string {
  const content = draft.replace(/\r\n/g, "\n").trim();
  const unsupported = [...new Set(Array.from(content).filter(char => {
    try { return uao.decodeSync(uao.encodeSync(char)) !== char; }
    catch { return true; }
  }))];
  if (unsupported.length) throw replyPreparationError({ kind: "unsupported-characters", characters: unsupported }, "包含 PTT 不支援的字元");
  const columns = encodedReplyBytes(content);
  if (columns > 1000) throw replyPreparationError({ kind: "too-long", excessColumns: columns - 1000 }, "回文最多 500 全形字（1,000 半形字），請縮短內容後再送出");
  return content;
}

export function encodedReplyBytes(value: string): number {
  const encoded = uao.encodeSync(value) as string;
  if (uao.decodeSync(encoded) !== value) throw new Error("包含 PTT 不支援的字元");
  return encoded.length;
}

/** PTT bbs.c pads msg to maxlength before ' 確定[y/N]:'. getdata reserves NUL. */
export function readPushConfirmation(screen: string, separator?: "" | " "): { author: string; content: string; capacity: number } | null {
  for (const line of stripAnsi(screen).replace(/\r/g, "").split("\n").reverse()) {
    const match = line.match(/^(?:推|噓|→) ([^:]+):(.*) 確定\[y\/N\]:\s*$/u);
    if (!match) continue;
    // Live PTT includes a separator blank after the colon; local imageptt
    // does not. Draft pieces cannot start with whitespace, so the distinction
    // is unambiguous for outgoing confirmation screens.
    const actualSeparator = match[2].startsWith(" ") ? " " : "";
    if (separator !== undefined && actualSeparator !== separator) return null;
    const field = actualSeparator ? match[2].slice(1) : match[2];
    const capacity = encodedReplyBytes(field) - 1;
    if (capacity < 8 || capacity > 78) return null;
    return { author: match[1].trim(), content: field.trimEnd(), capacity };
  }
  return null;
}

function resolveReadbackLayout(author: string, capacity: number, separator: "" | " "): { authorField: string; ip: string } {
  if (!/^[A-Za-z0-9_]{2,12}$/u.test(author)) throw new Error("無法確認推文帳號欄位");
  // These are the PTT storage formats, not arbitrary capacity estimates.
  // A measurement must match one before any fragment may be published.
  for (const authorField of [author, author.padEnd(12)]) {
    for (const hasIp of [false, true]) {
      if (pushContentCapacity(encodedReplyBytes(authorField), hasIp, separator) === capacity) {
        return { authorField, ip: hasIp ? "192.0.2.1 " : "" };
      }
    }
  }
  throw replyPreparationError({ kind: "capacity" }, "推文容量與讀回格式不一致，請重新載入文章後再試");
}

export function planReplyDraft(draft: string, capacity: number, floor?: number, author?: string, separator: "" | " " = " "): string[] {
  if (!Number.isInteger(capacity) || capacity < 8 || capacity > 78) throw new Error("無法確認推文容量");
  const layout = author === undefined ? undefined : resolveReadbackLayout(author, capacity, separator);
  if (floor !== undefined && (!Number.isInteger(floor) || floor < 1)) throw new Error("回覆樓號無效");
  const content = validateDraft(draft);
  // UAO encodes half-width characters in one byte and full-width in two.
  // LF counts as one unit; generated prefixes and markers are not in content.
  if (!content || /[\x00-\x09\x0b-\x1f\x7f]/u.test(content)) throw replyPreparationError({ kind: "content-layout", reason: "control-characters" }, "回文包含無法送出的控制字元");
  encodedReplyBytes(content.replace(/\n/g, ""));
  const prefix = floor === undefined ? "" : `回${floor}樓：`;
  const room = capacity - encodedReplyBytes(prefix);
  if (room < 2) throw new Error("回覆前綴超過可用容量");
  const markerFor = (body: string, last: boolean): string => {
    if (last) return /[。.!?！？;；]$/u.test(body) ? "" : "_";
    // Escape meaningful suffixes, but do not decorate ordinary full/short lines.
    return !body || /[。.!?！？;；_|]$/u.test(body) ? "|" : "";
  };
  const pieces: string[] = [];
  const lines = content.split("\n");
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const chars = Array.from(lines[lineIndex]);
    let cursor = 0;
    do {
      const start = cursor;
      let bytes = 0;
      while (cursor < chars.length) {
        const size = encodedReplyBytes(chars[cursor]);
        if (bytes + size > room) break;
        cursor++;
        bytes += size;
      }
      let body = chars.slice(start, cursor).join("");
      let marker = markerFor(body, cursor === chars.length && lineIndex === lines.length - 1);
      while (bytes + marker.length > room) {
        bytes -= encodedReplyBytes(chars[--cursor]);
        body = chars.slice(start, cursor).join("");
        marker = markerFor(body, cursor === chars.length && lineIndex === lines.length - 1);
      }
      // Backing off a two-byte character for the final stop can leave two
      // columns. Fill one with continuation so the receiver still joins directly.
      if (cursor < chars.length && room - bytes - marker.length >= 2) marker = "|";
      if (cursor === start && chars.length > 0) throw new Error("回覆前綴超過可用容量");
      const endLine = cursor === chars.length;
      const endDraft = endLine && lineIndex === lines.length - 1;
      const piece = prefix + body + marker;
      pieces.push(piece);
      // A full line joins directly. An empty, non-full bridge restores an
      // explicit user newline without padding the user's text with spaces.
      if (endLine && !endDraft && capacity - encodedReplyBytes(piece) < 2) pieces.push(prefix + "|");
    } while (cursor < chars.length);
  }
  if (pieces.some((piece) => piece.trim() !== piece)) throw replyPreparationError({ kind: "content-layout", reason: "leading-space" }, "分段開頭的空白無法保留，請調整內容後再試");
  // Production planning must cross the parser boundary too. Supplying sender-
  // computed remaining columns here would conceal receiver layout regressions.
  // Layout-free callers can split abstract capacities; the delivery queue always
  // supplies the measured author layout for wire-format validation.
  const target = floor === undefined ? [] : [{ author: author === "target" ? "other" : "target", content: "target.", type: "neutral" as const,
    time: "01/01 12:00", rawFloor: floor }];
  const parsed = layout
    ? parsePushBuffer(pieces.map(piece => `→ ${layout.authorField}:${separator}${piece} ${layout.ip}01/01 12:00`).join("\n"))
      .map((push, index) => ({ ...push, rawFloor: (floor ?? 0) + index + 1 }))
    : pieces.map((content, index) => ({
    author: "sender", content, type: "neutral" as const, time: "01/01 12:00",
    rawFloor: (floor ?? 0) + index + 1, remainingContentColumns: capacity - encodedReplyBytes(content),
  }));
  const projected = aggregatePushes([...target, ...parsed], "op").pushes.filter((reply) => reply.author === (author ?? "sender"));
  if (projected.length !== 1 || projected[0].content !== content || (floor !== undefined && projected[0].replyTo === null)) {
    throw replyPreparationError({ kind: "content-layout" }, "此內容無法安全分段，請調整換行或段落後再試");
  }
  return pieces;
}

type State = { generation: number; signature: string; author: string; capacity: number; pieces: string[]; confirmed: number; status: ReplyDelivery["status"] };
export class ReplyDraftQueue {
  diagnostic?: Readonly<{ operationId: string; index: number; stage: "send"; message: string }>;
  private readonly states = new Map<string, State>();
  private serial: Promise<unknown> = Promise.resolve();
  private generation = 0;

  constructor(private readonly separator: "" | " " = " ") {}

  invalidate(): void { this.generation++; }

  run(input: GatewayReplyDraftInput, prepare: () => Promise<{ capacity: number; author: string }>,
    send: (piece: string, index: number, capacity: number) => Promise<ActionReceipt>,
    onProgress?: (progress: ReplyDelivery) => void): Promise<ReplyDelivery> {
    input = { ...input, article: { ...input.article } };
    const generation = this.generation;
    const work = this.serial.then(async () => {
      if (!input.operationId || input.operationId.length > 200) throw new Error("傳送識別碼無效");
      const signature = JSON.stringify([input.article, input.content, input.pushType, input.floor]);
      let state = this.states.get(input.operationId);
      if (generation !== this.generation || (state && state.generation !== generation)) throw new Error("登入工作階段已變更，請先確認已送出的內容");
      if (state && state.signature !== signature) throw new Error("已開始發送的回文不可變更");
      if (!state && input.resume) throw new Error("傳送紀錄已失效，請先重新整理確認");
      const result = (): ReplyDelivery => ({ operationId: input.operationId, status: state!.status,
        confirmed: state!.confirmed, total: state!.pieces.length });
      if (state && (state.status === "complete" || state.status === "uncertain")) return result();
      if (!state) validateDraft(input.content);
      const layout = await prepare();
      if (generation !== this.generation) throw new Error("登入工作階段已變更");
      if (state && state.author.toLowerCase() !== layout.author.toLowerCase()) throw new Error("登入帳號已變更");
      if (state && state.capacity !== layout.capacity) throw new Error("推文容量已變更，請先確認已送出的內容");
      if (!state) {
        state = { generation, signature, author: layout.author, capacity: layout.capacity, pieces: planReplyDraft(input.content, layout.capacity, input.floor, layout.author, this.separator), confirmed: 0, status: "paused" };
        this.states.set(input.operationId, state);
      }
      try { onProgress?.(result()); } catch { /* Observer isolation. */ }
      for (let i = state.confirmed; i < state.pieces.length; i++) {
        if (generation !== this.generation) return result();
        let receipt: ActionReceipt;
        try { receipt = await send(state.pieces[i], i, layout.capacity); }
        catch (cause) {
          this.diagnostic = { operationId: input.operationId, index: i, stage: "send",
            message: cause instanceof Error ? cause.message : "Unknown delivery failure" };
          state.status = "uncertain";
          return result();
        }
        if (!receipt.ok) {
          this.diagnostic = { operationId: input.operationId, index: i, stage: "send", message: receipt.message ?? receipt.code };
          state.status = receipt.outcome === "not-sent" ? "paused" : "uncertain";
          return result();
        }
        state.confirmed++;
        state.status = state.confirmed === state.pieces.length ? "complete" : "paused";
        // Progress observers must never interrupt or alter a non-idempotent write.
        try { onProgress?.(result()); } catch { /* Observer isolation. */ }
      }
      return result();
    });
    this.serial = work.catch(() => undefined);
    // Every awaited write above is caught and returned as an uncertain delivery.
    // Exceptions escaping here are preflight/resume failures, never a write retry.
    return work.catch((cause: unknown) => {
      throw new GatewayError("REPLY_DRAFT_NOT_SENT", cause instanceof Error ? cause.message : "無法準備回文", true, cause,
        cause instanceof GatewayError ? cause.replyIssue : undefined);
    });
  }
}
