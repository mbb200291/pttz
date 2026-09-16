import { describe, expect, it, vi } from "vitest";
import { encodedReplyBytes, planReplyDraft, readPushConfirmation, ReplyDraftQueue } from "./multipartReply.js";
import { aggregatePushes } from "@pttzzz/core/internal";

const input = { operationId: "one", article: { board: "Test", aid: "abc" }, content: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefgh", pushType: "neutral" as const };
const prepare = async () => ({ capacity: 20, author: "alice" });
describe("multipart reply", () => {
  it("rejects fragment-leading whitespace before any partial publication", () => {
    expect(() => planReplyDraft("a".repeat(18) + " bcdef", 20)).toThrow();
  });
  it("captures immutable input before awaiting preparation", async () => {
    const queue = new ReplyDraftQueue();
    const mutable = { ...input, article: { ...input.article } };
    const send = vi.fn().mockResolvedValue({ ok: true, outcome: "sent" });
    await queue.run(mutable, async () => { mutable.content = "changed"; mutable.article.board = "changed"; return prepare(); }, send);
    expect(send.mock.calls.map(([piece]) => piece)).toEqual(planReplyDraft(input.content, 20));
  });
  it("rejects a paused operation after authentication generation changes", async () => {
    const queue = new ReplyDraftQueue();
    const send = vi.fn().mockResolvedValue({ ok: false, outcome: "not-sent" });
    await queue.run(input, prepare, send);
    queue.invalidate();
    await expect(queue.run({ ...input, resume: true }, prepare, send)).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("fits exact codec capacities across account layouts without losing symbols", () => {
    for (let capacity = 20; capacity <= 60; capacity++) {
      const pieces = planReplyDraft("甲乙♥♡✈abc".repeat(20), capacity, 12);
      expect(pieces.every((piece) => encodedReplyBytes(piece) <= capacity)).toBe(true);
      expect(pieces.slice(0, -1).every((piece) => piece.endsWith("||"))).toBe(true);
      expect(pieces.at(-1)?.endsWith("|!")).toBe(true);
    }
  });
  it("serializes duplicate submissions and isolates throwing progress observers", async () => {
    const queue = new ReplyDraftQueue();
    const send = vi.fn().mockResolvedValue({ ok: true, outcome: "sent" });
    const observer = () => { throw new Error("UI observer"); };
    const [first, second] = await Promise.all([queue.run(input, prepare, send, observer), queue.run(input, prepare, send)]);
    expect(first).toEqual(second);
    expect(send).toHaveBeenCalledTimes(first.total);
  });
  it("never advances on a thrown write and never retries it", async () => {
    const queue = new ReplyDraftQueue();
    const send = vi.fn().mockRejectedValue(new Error("closed"));
    expect(await queue.run(input, prepare, send)).toMatchObject({ confirmed: 0, status: "uncertain" });
    await queue.run(input, prepare, send);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("rejects resume after account or capacity changes without sending another piece", async () => {
    const queue = new ReplyDraftQueue();
    const send = vi.fn().mockResolvedValue({ ok: false, outcome: "not-sent" });
    await queue.run(input, prepare, send);
    await expect(queue.run(input, async () => ({ capacity: 21, author: "alice" }), send)).rejects.toThrow("容量");
    await expect(queue.run(input, async () => ({ capacity: 20, author: "bob" }), send)).rejects.toThrow("帳號");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("measures the padded confirmation field, including aligned accounts and IP-sized capacity", () => {
    expect(readPushConfirmation(`→ alice       :${"x".padEnd(35)} 確定[y/N]:`)).toEqual({ author: "alice", content: "x", capacity: 34 });
    expect(readPushConfirmation("→ alice: x 09/16 23:21")).toBeNull();
  });
  it("leaves a single physical reply unmarked", () => {
    expect(planReplyDraft("hello", 20)).toEqual(["hello"]);
  });
  it.each(["a".repeat(90), "中♥♡✈".repeat(20), "a".repeat(18) + "\nnext", "first\n\nlast", "句號。\nnext"])('round-trips %s with the actual aggregator', (content) => {
    const pieces = planReplyDraft(content, 20);
    expect(pieces.at(-1)?.endsWith("|!")).toBe(true);
    const thread = aggregatePushes(pieces.map((content) => ({ author: "alice", content, type: "neutral" as const,
      time: "09/16 23:21", remainingContentColumns: 20 - Array.from(content).reduce((n, c) => n + (c.codePointAt(0)! > 127 ? 2 : 1), 0) })), "op");
    expect(thread.pushes).toHaveLength(1);
    expect(thread.pushes[0].content).toBe(content);
  });
  it("reserves repeated target prefixes and strips them from the reconstructed body", () => {
    const pieces = planReplyDraft("測試".repeat(30), 30, 123);
    expect(pieces.every((piece) => piece.startsWith("回123樓："))).toBe(true);
  });
  it("rejects unsupported emoji and unsafe terminal controls before sending", () => {
    expect(() => planReplyDraft("hello😀", 20)).toThrow();
    expect(() => planReplyDraft("x\x1b[31my", 20)).toThrow();
  });
  it("does not silently interpret a split fragment as a command", () => {
    // A target prefix would change nesting, so this draft must not be sent.
    expect(() => planReplyDraft("a".repeat(18) + "\n回1樓：test", 20)).toThrow();
  });
  it("resumes only unconfirmed pieces and never resends completed operations", async () => {
    const queue = new ReplyDraftQueue();
    const send = vi.fn().mockResolvedValueOnce({ ok: true, outcome: "sent" }).mockResolvedValueOnce({ ok: false, outcome: "not-sent" }).mockResolvedValue({ ok: true, outcome: "sent" });
    const paused = await queue.run(input, prepare, send);
    expect(paused).toMatchObject({ status: "paused", confirmed: 1 });
    const done = await queue.run({ ...input, resume: true }, prepare, send);
    expect(done.status).toBe("complete");
    const count = send.mock.calls.length;
    await queue.run({ ...input, resume: true }, prepare, send);
    expect(send).toHaveBeenCalledTimes(count);
    expect(send.mock.calls.filter(([piece]) => piece === send.mock.calls[0][0])).toHaveLength(1);
  });
  it("locks uncertain writes and rejects changed drafts or missing resume state", async () => {
    const queue = new ReplyDraftQueue();
    const send = vi.fn().mockResolvedValue({ ok: false, outcome: "uncertain" });
    expect((await queue.run(input, prepare, send)).status).toBe("uncertain");
    await queue.run({ ...input, resume: true }, prepare, send);
    expect(send).toHaveBeenCalledTimes(1);
    await expect(queue.run({ ...input, content: "changed" }, prepare, send)).rejects.toThrow();
    await expect(new ReplyDraftQueue().run({ ...input, resume: true }, prepare, send)).rejects.toThrow();
  });
});
