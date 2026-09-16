import type { ActionReceipt, GatewayReplyDraftInput, ReplyDelivery } from "@pttzzz/core";
import { GatewayError } from "@pttzzz/core";
import { aggregatePushes, stripAnsi } from "@pttzzz/core/internal";
// @ts-expect-error uao-js is the transport codec and has no declarations.
import uao from "uao-js";

export function encodedReplyBytes(value: string): number {
  const encoded = uao.encodeSync(value) as string;
  if (uao.decodeSync(encoded) !== value) throw new Error("包含 PTT 不支援的字元");
  return encoded.length;
}

/** PTT bbs.c pads msg to maxlength before ' 確定[y/N]:'. getdata reserves NUL. */
export function readPushConfirmation(screen: string): { author: string; content: string; capacity: number } | null {
  for (const line of stripAnsi(screen).replace(/\r/g, "").split("\n").reverse()) {
    const match = line.match(/^(?:推|噓|→) ([^:]+):(.*) 確定\[y\/N\]:\s*$/u);
    if (!match) continue;
    const capacity = encodedReplyBytes(match[2]) - 1;
    if (capacity < 8 || capacity > 78) return null;
    return { author: match[1].trim(), content: match[2].trimEnd(), capacity };
  }
  return null;
}

export function planReplyDraft(draft: string, capacity: number, floor?: number): string[] {
  if (!Number.isInteger(capacity) || capacity < 8 || capacity > 78) throw new Error("無法確認推文容量");
  if (floor !== undefined && (!Number.isInteger(floor) || floor < 1)) throw new Error("回覆樓號無效");
  const content = draft.replace(/\r\n/g, "\n").trim();
  if (!content || /[\x00-\x09\x0b-\x1f\x7f]/u.test(content)) throw new Error("回文包含無法送出的控制字元");
  encodedReplyBytes(content.replace(/\n/g, ""));
  const prefix = floor === undefined ? "" : `回${floor}樓：`;
  if (!content.includes("\n") && encodedReplyBytes(prefix + content) <= capacity) return [prefix + content];
  const room = capacity - encodedReplyBytes(prefix) - 2;
  if (room < 2) throw new Error("回覆前綴超過可用容量");
  const pieces: string[] = [];
  const lines = content.split("\n");
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const chars = Array.from(lines[lineIndex]);
    let cursor = 0;
    do {
      let body = "";
      let bytes = 0;
      while (cursor < chars.length) {
        const size = encodedReplyBytes(chars[cursor]);
        if (bytes + size > room) break;
        body += chars[cursor++];
        bytes += size;
      }
      const endLine = cursor === chars.length;
      const endDraft = endLine && lineIndex === lines.length - 1;
      const piece = prefix + body + (endDraft ? "|!" : "||");
      pieces.push(piece);
      // A full line joins directly. An empty, non-full bridge restores an
      // explicit user newline without padding the user's text with spaces.
      if (endLine && !endDraft && capacity - encodedReplyBytes(piece) < 2) pieces.push(prefix + "||");
    } while (cursor < chars.length);
  }
  if (pieces.length > 200) throw new Error("回文過長，請分次發送");
  if (pieces.some((piece) => piece.trim() !== piece)) throw new Error("分段開頭的空白無法保留，請調整內容後再試");
  // Use the real rules, including control recognition, not a second approximation.
  const target = floor === undefined ? [] : [{ author: "target", content: "target.", type: "neutral" as const,
    time: "01/01 12:00", rawFloor: floor }];
  const projected = aggregatePushes([...target, ...pieces.map((content, index) => ({
    author: "sender", content, type: "neutral" as const, time: "01/01 12:00",
    rawFloor: (floor ?? 0) + index + 1, remainingContentColumns: capacity - encodedReplyBytes(content),
  }))], "op").pushes.filter((reply) => reply.author === "sender");
  if (projected.length !== 1 || projected[0].content !== content || (floor !== undefined && projected[0].replyTo === null)) {
    throw new Error("此內容無法安全分段，請調整換行或段落後再試");
  }
  return pieces;
}

type State = { generation: number; signature: string; author: string; capacity: number; pieces: string[]; confirmed: number; status: ReplyDelivery["status"] };
export class ReplyDraftQueue {
  private readonly states = new Map<string, State>();
  private serial: Promise<unknown> = Promise.resolve();
  private generation = 0;

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
      const layout = await prepare();
      if (generation !== this.generation) throw new Error("登入工作階段已變更");
      if (state && state.author.toLowerCase() !== layout.author.toLowerCase()) throw new Error("登入帳號已變更");
      if (state && state.capacity !== layout.capacity) throw new Error("推文容量已變更，請先確認已送出的內容");
      if (!state) {
        state = { generation, signature, author: layout.author, capacity: layout.capacity, pieces: planReplyDraft(input.content, layout.capacity, input.floor), confirmed: 0, status: "paused" };
        this.states.set(input.operationId, state);
      }
      try { onProgress?.(result()); } catch { /* Observer isolation. */ }
      for (let i = state.confirmed; i < state.pieces.length; i++) {
        if (generation !== this.generation) return result();
        let receipt: ActionReceipt;
        try { receipt = await send(state.pieces[i], i, layout.capacity); }
        catch { state.status = "uncertain"; return result(); }
        if (!receipt.ok) {
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
      throw new GatewayError("REPLY_DRAFT_NOT_SENT", cause instanceof Error ? cause.message : "無法準備回文", true, cause);
    });
  }
}
