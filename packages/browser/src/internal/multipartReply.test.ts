import { describe, expect, it, vi } from "vitest";
import { encodedReplyBytes, planReplyDraft, readPushConfirmation, ReplyDraftQueue } from "./multipartReply.js";
import { aggregatePushes, parsePushBuffer } from "@pttzzz/core/internal";

const input = { operationId: "one", article: { board: "Test", aid: "abc" }, content: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefgh", pushType: "neutral" as const };
const prepare = async () => ({ capacity: 55, author: "alice" });
describe("multipart reply", () => {
  it.each([
    { content: "中".repeat(501), issue: { kind: "too-long", excessColumns: 2 } },
    { content: "abc".repeat(334), issue: { kind: "too-long", excessColumns: 2 } },
    { content: "測試😀😀🚀", issue: { kind: "unsupported-characters", characters: ["😀", "🚀"] } },
  ])("reports actionable validation without preparing or writing: $issue.kind", async ({ content, issue }) => {
    const setup = vi.fn(prepare);
    const send = vi.fn();
    await expect(new ReplyDraftQueue().run({ ...input, content }, setup, send)).rejects.toMatchObject({
      code: "REPLY_DRAFT_NOT_SENT", replyIssue: issue,
    });
    expect(setup).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
  it("rejects an unsupported sender/receiver layout before publishing any fragment", async () => {
    const send = vi.fn().mockResolvedValue({ ok: true, outcome: "sent" });
    await expect(new ReplyDraftQueue().run(input, async () => ({ author: "alice", capacity: 20 }), send)).rejects.toThrow("容量");
    expect(send).not.toHaveBeenCalled();
  });
  it.each([
    { authorField: "MBB200291", capacity: 51, ip: "" },
    { authorField: "alice", capacity: 55, ip: "" },
    { authorField: "target", capacity: 54, ip: "" },
    { authorField: "alice       ", capacity: 48, ip: "" },
    { authorField: "alice", capacity: 40, ip: "192.0.2.1 " },
    { authorField: "alice       ", capacity: 33, ip: "192.0.2.1 " },
  ])("round-trips real receiver layout $authorField/$capacity with nested replies and blank lines", async ({ authorField, capacity, ip }) => {
    const author = authorField.trim();
    const content = "中♥♡abc".repeat(12) + "\n\n" + "下一段".repeat(14);
    const send = vi.fn().mockResolvedValue({ ok: true, outcome: "sent" });
    const receipt = await new ReplyDraftQueue().run({ ...input, content, floor: 1 }, async () => ({ author, capacity }), send);
    expect(receipt.status).toBe("complete");
    const raw = ["推 original: 目標。 09/20 10:00", ...send.mock.calls.map(([piece]) => {
      expect(encodedReplyBytes(piece)).toBeLessThanOrEqual(capacity);
      return `→ ${authorField}: ${piece} ${ip}09/20 10:01`;
    })].join("\n");
    const projected = aggregatePushes(parsePushBuffer(raw), "op").pushes.filter(reply => reply.author === author);
    expect(projected).toHaveLength(1);
    expect(projected[0].content).toBe(content);
    expect(projected[0].replyTo).not.toBeNull();
  });
  it("round-trips the live seven-line reply through the receiver parser without physical-line breaks", () => {
    const raw = [
      "→ MBB200291: 短句測試完成。                                       09/20 10:38",
      "→ MBB200291: 這是一段長回文測試，用來確認中文和English123混合時   09/20 10:43",
      "→ MBB200291: ，系統可以按照實際容量分段，讀回後仍然保留完整文字   09/20 10:43",
      "→ MBB200291: ，不會重複，也不會少字。|                            09/20 10:43",
      "→ MBB200291: |                                                    09/20 10:43",
      "→ MBB200291: 第二段保留空白行與相容符號♥♡，這一段也刻意寫長一   09/20 10:43",
      "→ MBB200291: 些，確認跨越終端輸入框後仍能接成同一則討論，測試完   09/20 10:43",
      "→ MBB200291: 成後會自行刪除文章。                                 09/20 10:43",
    ].join("\n");
    expect(aggregatePushes(parsePushBuffer(raw), "MBB200291").pushes.map(push => push.content)).toEqual([
      "短句測試完成。",
      "這是一段長回文測試，用來確認中文和English123混合時，系統可以按照實際容量分段，讀回後仍然保留完整文字，不會重複，也不會少字。\n\n第二段保留空白行與相容符號♥♡，這一段也刻意寫長一些，確認跨越終端輸入框後仍能接成同一則討論，測試完成後會自行刪除文章。",
    ]);
  });
  it("normalizes CRLF and outer whitespace while preserving internal blank lines", () => {
    expect(planReplyDraft(" \r\nfirst\r\n\r\nlast\r\n ", 20)).toEqual(["first", "|", "last_"]);
  });
  it.each(["literal|", "literal||"])("preserves literal intermediate pipes: %s", (content) => {
    expect(planReplyDraft(content + "\nnext", 20)).toEqual([content + "|", "next_"]);
  });
  it.each(["a".repeat(1000), "中".repeat(500), "中".repeat(250) + "a".repeat(500)])("THREAD-006.1–3: sends 1000 units excluding generated markers and rejects overflow", async (content) => {
    const send = vi.fn().mockResolvedValue({ ok: true, outcome: "sent" });
    const queue = new ReplyDraftQueue();
    const result = await queue.run({ ...input, content: " \r\n" + content + "\r\n " }, prepare, send);
    expect(result.status).toBe("complete");
    const projected = aggregatePushes(parsePushBuffer(send.mock.calls.map(([content]) =>
      `→ alice: ${content} 01/01 12:00`).join("\n")), "op");
    expect(projected.pushes[0].content).toBe(content);
    send.mockClear();
    await expect(queue.run({ ...input, operationId: "too-long", content: content + "a" }, prepare, send)).rejects.toThrow("500");
    expect(send).not.toHaveBeenCalled();
  });
  it("counts internal newlines and spaces toward the limit", () => {
    expect(() => planReplyDraft("a".repeat(998) + "\n b", 78)).toThrow("500");
  });
  it("THREAD-006.2: excludes repeated target prefixes from the draft budget", () => {
    const pieces = planReplyDraft("中".repeat(500), 78, 123);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.every((piece) => piece.startsWith("回123樓：") && encodedReplyBytes(piece) <= 78)).toBe(true);
  });
  it("rejects fragment-leading whitespace before any partial publication", () => {
    expect(() => planReplyDraft("a".repeat(20) + " bcdef", 20)).toThrow();
  });
  it("captures immutable input before awaiting preparation", async () => {
    const queue = new ReplyDraftQueue();
    const mutable = { ...input, article: { ...input.article } };
    const send = vi.fn().mockResolvedValue({ ok: true, outcome: "sent" });
    await queue.run(mutable, async () => { mutable.content = "changed"; mutable.article.board = "changed"; return prepare(); }, send);
    expect(send.mock.calls.map(([piece]) => piece)).toEqual(planReplyDraft(input.content, 55));
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
      expect(pieces.every((piece) => !piece.endsWith("||") && !piece.endsWith("|!"))).toBe(true);
      expect(pieces.at(-1)?.endsWith("_")).toBe(true);
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
    expect(queue.diagnostic).toMatchObject({ operationId: "one", index: 0, stage: "send", message: "closed" });
    await queue.run(input, prepare, send);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("rejects resume after account or capacity changes without sending another piece", async () => {
    const queue = new ReplyDraftQueue();
    const send = vi.fn().mockResolvedValue({ ok: false, outcome: "not-sent" });
    await queue.run(input, prepare, send);
    await expect(queue.run(input, async () => ({ capacity: 56, author: "alice" }), send)).rejects.toThrow("容量");
    await expect(queue.run(input, async () => ({ capacity: 55, author: "bob" }), send)).rejects.toThrow("帳號");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("measures the padded confirmation field, including aligned accounts and IP-sized capacity", () => {
    expect(readPushConfirmation(`→ alice       :${"x".padEnd(35)} 確定[y/N]:`)).toEqual({ author: "alice", content: "x", capacity: 34 });
    expect(readPushConfirmation("→ alice: x 09/16 23:21")).toBeNull();
  });
  it("excludes the live confirmation's leading separator from text and input capacity", () => {
    // Captured on Test: the submitted probe was exactly x, not space+x.
    expect(readPushConfirmation("→ MBB200291: x                                                    確定[y/N]:  "))
      .toEqual({ author: "MBB200291", content: "x", capacity: 51 });
    expect(readPushConfirmation(`→ MBB200291:${" 短句  測試。".padEnd(46)} 確定[y/N]:`))
      .toMatchObject({ author: "MBB200291", content: "短句  測試。" });
  });
  it("plans local no-separator replies using the measured 54-column field", () => {
    const confirmation = readPushConfirmation(`→ pttzzz2:${"x".padEnd(55)} 確定[y/N]:`);
    expect(confirmation).toEqual({ author: "pttzzz2", content: "x", capacity: 54 });
    const pieces = planReplyDraft("中".repeat(40), confirmation!.capacity, undefined, confirmation!.author, "");
    expect(pieces.every((piece) => encodedReplyBytes(piece) <= 54)).toBe(true);
    const projected = aggregatePushes(parsePushBuffer(pieces.map((piece) =>
      `→ pttzzz2:${piece} 09/20 10:43`).join("\n")), "op");
    expect(projected.pushes.map((push) => push.content)).toEqual(["中".repeat(40)]);
  });
  it("delivers a local multipart reply and reads it back as one discussion", async () => {
    const send = vi.fn().mockResolvedValue({ ok: true, outcome: "sent" });
    const draft = "甲乙".repeat(36);
    const receipt = await new ReplyDraftQueue("").run(
      { ...input, operationId: "local", content: draft },
      async () => ({ author: "pttzzz2", capacity: 54 }),
      send,
    );
    expect(receipt).toMatchObject({ status: "complete", confirmed: 3 });
    const raw = send.mock.calls.map(([piece]) => `→ pttzzz2:${piece} 09/20 10:43`).join("\n");
    expect(aggregatePushes(parsePushBuffer(raw), "op").pushes.map((push) => push.content)).toEqual([draft]);
  });
  it("rejects the opposite target's confirmation format before sending", () => {
    expect(readPushConfirmation(`→ pttzzz2:${"x".padEnd(55)} 確定[y/N]:`, " ")).toBeNull();
    expect(readPushConfirmation(`→ pttzzz2: ${"x".padEnd(54)} 確定[y/N]:`, "")).toBeNull();
  });
  it("does not plan a full-width character beyond the live field boundary", () => {
    const layout = readPushConfirmation("→ MBB200291: x                                                    確定[y/N]:  ")!;
    const pieces = planReplyDraft("這是一段長回文測試，用來確認中文和English123混合時，接續正文。", layout.capacity);
    expect(pieces[0]).toBe("這是一段長回文測試，用來確認中文和English123混合時");
    expect(pieces.every(piece => encodedReplyBytes(piece) <= 51)).toBe(true);
  });
  it("terminates a short reply without adding redundant marks to punctuation", () => {
    expect(planReplyDraft("hello", 20)).toEqual(["hello_"]);
    for (const mark of [".", "。", "!", "?", "！", "？", ";", "；"]) {
      expect(planReplyDraft(`hello${mark}`, 20)).toEqual([`hello${mark}`]);
    }
  });
  it("uses minimal continuation markers and closes the last line", () => {
    expect(planReplyDraft("第一行\n第二行", 20)).toEqual(["第一行", "第二行_"]);
    expect(planReplyDraft("第一行。\n第二行", 20)).toEqual(["第一行。|", "第二行_"]);
    expect(planReplyDraft("a".repeat(20) + "\nlast", 20)).toEqual(["a".repeat(20), "|", "last_"]);
    expect(planReplyDraft("first\n\nlast", 20)).toEqual(["first", "|", "last_"]);
  });
  it.each(["a".repeat(90), "a".repeat(20), "中♥♡✈".repeat(20), "a".repeat(19) + "\nnext", "first\n\nlast", "句號。\nnext", "literal_", "literal|", "literal|!"])('round-trips %s with the actual aggregator', (content) => {
    const pieces = planReplyDraft(content, 20);
    expect(pieces.at(-1)).toMatch(/[_!]$/u);
    const thread = aggregatePushes(pieces.map((content) => ({ author: "alice", content, type: "neutral" as const,
      time: "09/16 23:21", remainingContentColumns: 20 - encodedReplyBytes(content) })), "op");
    expect(thread.pushes).toHaveLength(1);
    expect(thread.pushes[0].content).toBe(content);
  });
  it("keeps separately sent short replies from aggregating together", () => {
    const pieces = [...planReplyDraft("one", 20), ...planReplyDraft("two", 20)];
    expect(aggregatePushes(pieces.map((content) => ({ author: "alice", content, type: "neutral" as const, time: "09/16 23:21" })), "op").pushes.map((reply) => reply.content)).toEqual(["one", "two"]);
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
