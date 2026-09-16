import { describe, expect, it } from "vitest";
import {
  GatewayError,
  PttzzzClient,
  type CoreEvent,
  type GatewayEvent,
  type PttGateway,
  type PttCommand,
  type RawArticleSource,
  type ActionReceipt,
} from "./index.js";

const indexKey = { board: "Test", index: 1 } as const;
const aidKey = { board: "Test", aid: "#1ABC" } as const;

const raw = (title: string, body: string, push = "") => [
  "作者  alice (Alice)                 看板  Test",
  `標題  ${title}`,
  "時間  Sat Aug 22 10:00:00 2026",
  "───────────────────────────────────────",
  body,
  push,
].filter(Boolean).join("\n");

class MemoryGateway implements PttGateway {
  listeners = new Set<(event: GatewayEvent) => void>();
  lastRemovedListener?: (event: GatewayEvent) => void;
  sources: RawArticleSource[] = [];
  error?: unknown;
  disconnectError?: unknown;
  disconnectShouldThrow = false;
  commands: PttCommand[] = [];
  receipt: ActionReceipt = { ok: true, outcome: "sent" };
  executeError?: unknown;

  async connect() { if (this.error) throw this.error; }
  async login(input: { username: string }) {
    if (this.error) throw this.error;
    return { userId: input.username };
  }
  async disconnect() {
    if (this.disconnectShouldThrow || this.disconnectError !== undefined) {
      throw this.disconnectError;
    }
  }
  async listBoards() { if (this.error) throw this.error; return { kind: "boards" as const, items: [] }; }
  async searchBoards() { if (this.error) throw this.error; return { kind: "boards" as const, items: [] }; }
  async filterBoards() { if (this.error) throw this.error; return { kind: "boards" as const, items: [] }; }
  async listArticles() { if (this.error) throw this.error; return { items: [] }; }
  async searchArticles() { if (this.error) throw this.error; return { items: [] }; }
  async filterArticles() { if (this.error) throw this.error; return { items: [] }; }
  async *readArticle() {
    if (this.error) throw this.error;
    for (const source of this.sources) yield source;
  }
  async execute(command: PttCommand) {
    this.commands.push(command);
    if (this.executeError !== undefined) throw this.executeError;
    return this.receipt;
  }
  subscribe(listener: (event: GatewayEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      this.lastRemovedListener = listener;
    };
  }
  emit(event: GatewayEvent) { for (const listener of this.listeners) listener(event); }
}

describe("PttzzzClient lifecycle", () => {
  it("keeps legacy gateways compatible and never treats unknown draft failures as not-sent", async () => {
    const gateway = new MemoryGateway();
    const input = { operationId: "draft", article: indexKey, content: "x".repeat(160), pushType: "neutral" as const };
    expect(await new PttzzzClient(gateway).sendReplyDraft(input)).toMatchObject({ ok: false, error: { code: "UNSUPPORTED", outcome: "not-sent" } });
    const extended: PttGateway = Object.assign(gateway, { sendReplyDraft: async () => { throw new Error("lost connection"); } });
    const client = new PttzzzClient(extended);
    expect(await client.sendReplyDraft(input)).toMatchObject({ ok: false, error: { outcome: "uncertain", retryable: false } });
    extended.sendReplyDraft = async () => { throw new GatewayError("REPLY_DRAFT_NOT_SENT", "unsupported symbol", true); };
    expect(await client.sendReplyDraft(input)).toMatchObject({ ok: false, error: { outcome: "not-sent", retryable: true } });
    expect(gateway.commands).toHaveLength(0);
  });
  it("projects partial and final articles using a copied aggregation profile", async () => {
    const gateway = new MemoryGateway();
    const rawText = raw("profile", "body", ["→ bob: first 08/22 10:00", "→ carol: aside。 08/22 10:01", "→ bob: last|! 08/22 10:04"].join("\n"));
    gateway.sources = [
      { articleKey: indexKey, completeness: "incomplete", revision: 1, rawText },
      { articleKey: indexKey, completeness: "final", revision: 2, rawText },
    ];
    const aggregation = { nonconsecutiveGapMinutes: 3 };
    const client = new PttzzzClient(gateway, { aggregation });
    aggregation.nonconsecutiveGapMinutes = 5;
    const lengths: number[] = [];
    client.subscribe((event) => {
      if (event.type === "article.partial" || event.type === "article.updated") lengths.push(event.article.replies.length);
    });
    expect((await client.getArticle({ article: indexKey })).ok).toBe(true);
    expect(lengths).toEqual([3, 3]);
    const defaultResult = await new PttzzzClient(gateway).getArticle({ article: indexKey });
    expect(defaultResult.ok && defaultResult.value.replies.length).toBe(2);
  });

  it("rejects invalid aggregation settings before subscribing", () => {
    const gateway = new MemoryGateway();
    expect(() => new PttzzzClient(gateway, { aggregation: { nonconsecutiveGapMinutes: -1 } })).toThrow(RangeError);
    expect(gateway.listeners.size).toBe(0);
  });

  it("normalizes expected and unknown gateway failures into Result", async () => {
    const gateway = new MemoryGateway();
    const cause = new Error("socket closed");
    gateway.error = new GatewayError("TIMEOUT", "逾時", true, cause);
    const client = new PttzzzClient(gateway);

    await expect(client.connect()).resolves.toEqual({
      ok: false,
      error: { code: "TIMEOUT", message: "逾時", retryable: true, cause },
    });

    gateway.error = cause;
    await expect(client.listBoards()).resolves.toEqual({
      ok: false,
      error: {
        code: "GATEWAY_FAILURE",
        message: "PTT gateway 操作失敗",
        retryable: false,
        cause,
      },
    });
  });

  it("forwards lifecycle events, isolates listeners, and unsubscribes", async () => {
    const gateway = new MemoryGateway();
    const client = new PttzzzClient(gateway);
    const events: CoreEvent[] = [];
    client.subscribe(() => { throw new Error("consumer bug"); });
    const unsubscribe = client.subscribe((event) => events.push(event));

    gateway.emit({ type: "connection.changed", status: "connecting" });
    expect(events).toEqual([{ type: "connection.changed", status: "connecting" }]);
    unsubscribe();
    gateway.emit({ type: "connection.changed", status: "connected" });
    expect(events).toHaveLength(1);
  });

  it("cleans local state and absorbs expected disconnect failure", async () => {
    const gateway = new MemoryGateway();
    const client = new PttzzzClient(gateway);
    const events: CoreEvent[] = [];
    client.subscribe((event) => events.push(event));
    gateway.emit({ type: "connection.changed", status: "connected" });
    gateway.emit({ type: "session.changed", session: { userId: "alice" } });
    gateway.disconnectError = new GatewayError("TIMEOUT", "cleanup timed out", true);

    await expect(client.disconnect()).resolves.toBeUndefined();
    expect(events.slice(-2)).toEqual([
      { type: "connection.changed", status: "disconnected" },
      { type: "session.changed", session: null },
    ]);
  });

  it("cleans local state before rethrowing an unknown disconnect failure", async () => {
    const gateway = new MemoryGateway();
    const client = new PttzzzClient(gateway);
    const events: CoreEvent[] = [];
    client.subscribe((event) => events.push(event));
    gateway.emit({ type: "connection.changed", status: "connected" });
    gateway.emit({ type: "session.changed", session: { userId: "alice" } });
    gateway.disconnectError = new Error("invariant broken");

    await expect(client.disconnect()).rejects.toThrow("invariant broken");
    expect(events.slice(-2)).toEqual([
      { type: "connection.changed", status: "disconnected" },
      { type: "session.changed", session: null },
    ]);
  });

  it.each([undefined, null, 0, ""])("rethrows falsy unknown disconnect failure %p after cleanup", async (thrown) => {
    const gateway = new MemoryGateway();
    const client = new PttzzzClient(gateway);
    const events: CoreEvent[] = [];
    client.subscribe((event) => events.push(event));
    gateway.emit({ type: "connection.changed", status: "connected" });
    gateway.emit({ type: "session.changed", session: { userId: "alice" } });
    gateway.disconnectShouldThrow = true;
    gateway.disconnectError = thrown;

    let caught = false;
    try { await client.disconnect(); }
    catch (error) {
      caught = true;
      expect(error).toBe(thrown);
    }
    expect(caught).toBe(true);
    expect(events.slice(-2)).toEqual([
      { type: "connection.changed", status: "disconnected" },
      { type: "session.changed", session: null },
    ]);
  });

  it("unsubscribes on disconnect and ignores a late event from the removed callback", async () => {
    const gateway = new MemoryGateway();
    const client = new PttzzzClient(gateway);
    const events: CoreEvent[] = [];
    client.subscribe((event) => events.push(event));
    gateway.emit({ type: "connection.changed", status: "connected" });
    gateway.emit({ type: "session.changed", session: { userId: "alice" } });

    await client.disconnect();
    const eventCount = events.length;
    expect(gateway.listeners.size).toBe(0);
    gateway.lastRemovedListener?.({ type: "session.changed", session: { userId: "late" } });
    gateway.lastRemovedListener?.({ type: "connection.changed", status: "connected" });
    expect(events).toHaveLength(eventCount);
  });

  it("reattaches exactly one gateway listener when reconnecting", async () => {
    const gateway = new MemoryGateway();
    const client = new PttzzzClient(gateway);
    const events: CoreEvent[] = [];
    client.subscribe((event) => events.push(event));
    await client.disconnect();

    await client.connect();
    await client.connect();
    expect(gateway.listeners.size).toBe(1);
    gateway.emit({ type: "connection.changed", status: "connected" });
    expect(events.filter((event) => event.type === "connection.changed" && event.status === "connected")).toHaveLength(1);
  });
});

describe("PttzzzClient article reads", () => {
  it.each(["\n", "\r\n"])("preserves body ANSI in partial events and final getArticle results after a colored header separator (%j)", async (newline) => {
    const gateway = new MemoryGateway();
    const partialBody = "\x1b[31m紅字\x1b[0m\n正文  保留空格";
    const finalBody = `${partialBody}\n\x1b[1;44m高亮藍底\x1b[0m`;
    const source = (body: string, push = "") => raw("彩色主題", body, push)
      .replace("───────────────────────────────────────", "\x1b[36m───────────────────────────────────────\x1b[0m")
      .replace(/\n/g, newline);
    gateway.sources = [
      { articleKey: indexKey, completeness: "incomplete", revision: 1, rawText: source(partialBody) },
      { articleKey: indexKey, completeness: "final", revision: 2, rawText: source(finalBody, "→ bob: 回覆 08/22 10:01") },
    ];
    const client = new PttzzzClient(gateway);
    const events: CoreEvent[] = [];
    client.subscribe((event) => events.push(event));

    const result = await client.getArticle({ article: indexKey });

    const partial = events.find((event) => event.type === "article.partial");
    expect(partial?.type === "article.partial" && partial.article.body).toBe(partialBody);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.body).toBe(finalBody);
    expect(result.value.title).toBe("彩色主題");
    expect(result.value.replies[0].content).toBe("回覆");
    const final = events.find((event) => event.type === "article.updated");
    expect(final?.type === "article.updated" && final.article.body).toBe(finalBody);
  });
  it("parses partial and final raw sources into nested public DTOs", async () => {
    const gateway = new MemoryGateway();
    gateway.sources = [
      { articleKey: indexKey, completeness: "incomplete", revision: 4, rawText: raw("主題", "正文") },
      { articleKey: indexKey, completeness: "final", revision: 5, rawText: raw("主題", "正文", "→ bob: 第一則 08/22 10:01\n→ carol: 回1樓：收到 08/22 10:02") },
    ];
    const client = new PttzzzClient(gateway);
    const events: CoreEvent[] = [];
    client.subscribe((event) => events.push(event));

    const result = await client.getArticle({ article: indexKey });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      key: indexKey,
      title: "主題",
      author: "alice (Alice)",
      body: "正文",
      completeness: "final",
      revision: 2,
    });
    expect(result.value.replies).toHaveLength(1);
    expect(result.value.replies[0]).toMatchObject({ author: "bob", depth: 1 });
    expect(result.value.replies[0].children[0]).toMatchObject({ author: "carol", depth: 2 });
    expect(events.map((event) => event.type)).toEqual(["article.partial", "article.updated"]);
    expect(events.filter((event) => "articleKey" in event).map((event) => event.articleKey)).toEqual([indexKey, indexKey]);
  });

  it("preserves exact aid keys and ignores stale or duplicate source revisions", async () => {
    const gateway = new MemoryGateway();
    gateway.sources = [
      { articleKey: indexKey, completeness: "incomplete", revision: 8, rawText: raw("new", "new") },
      { articleKey: indexKey, completeness: "incomplete", revision: 7, rawText: raw("old", "old") },
      { articleKey: indexKey, completeness: "incomplete", revision: 8, rawText: raw("duplicate", "duplicate") },
      { articleKey: indexKey, completeness: "final", revision: 9, rawText: raw("final", "final") },
    ];
    const client = new PttzzzClient(gateway);
    const revisions: number[] = [];
    client.subscribe((event) => {
      if (event.type.startsWith("article.")) revisions.push(event.revision);
    });

    const first = await client.getArticle({ article: aidKey });
    expect(first.ok && first.value.key).toEqual(aidKey);
    expect(revisions).toEqual([1, 2]);
  });

  it("returns an error when a stream ends without a final source", async () => {
    const gateway = new MemoryGateway();
    gateway.sources = [
      { articleKey: indexKey, completeness: "incomplete", revision: 1, rawText: raw("partial", "body") },
    ];

    await expect(new PttzzzClient(gateway).getArticle({ article: indexKey })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: "INCOMPLETE_ARTICLE" }),
    });
  });

  it("lets a superseded request finish without emitting its stale update", async () => {
    const resolvers: Array<(source: RawArticleSource) => void> = [];
    const gateway = new MemoryGateway();
    gateway.readArticle = async function* () {
      yield await new Promise<RawArticleSource>((resolve) => resolvers.push(resolve));
    };
    const client = new PttzzzClient(gateway);
    const titles: string[] = [];
    client.subscribe((event) => {
      if (event.type === "article.updated") titles.push(event.article.title);
    });

    const older = client.getArticle({ article: indexKey });
    const newer = client.getArticle({ article: indexKey });
    resolvers[1]({ articleKey: indexKey, completeness: "final", revision: 1, rawText: raw("newer", "body") });
    await newer;
    resolvers[0]({ articleKey: indexKey, completeness: "final", revision: 1, rawText: raw("older", "body") });

    await expect(older).resolves.toMatchObject({ ok: true, value: { title: "older" } });
    expect(titles).toEqual(["newer"]);
  });

  it("does not regress from a final source back to an incomplete source", async () => {
    const gateway = new MemoryGateway();
    gateway.sources = [
      { articleKey: indexKey, completeness: "final", revision: 4, rawText: raw("final", "final") },
      { articleKey: indexKey, completeness: "incomplete", revision: 5, rawText: raw("late partial", "partial") },
    ];
    const client = new PttzzzClient(gateway);
    const events: string[] = [];
    client.subscribe((event) => events.push(event.type));

    const result = await client.getArticle({ article: indexKey });

    expect(result).toMatchObject({ ok: true, value: { title: "final" } });
    expect(events).toEqual(["article.updated"]);
  });

  it("projects article and reply viewer votes from the current session case-insensitively", async () => {
    const gateway = new MemoryGateway();
    gateway.sources = [{
      articleKey: indexKey,
      completeness: "final",
      revision: 1,
      rawText: raw("votes", "body", [
        "推 ALICE: 推 08/22 10:01",
        "→ bob: reply 08/22 10:02",
        "噓 alice: 噓2樓 08/22 10:03",
      ].join("\n")),
    }];
    const client = new PttzzzClient(gateway);
    const sessionEvents: CoreEvent[] = [];
    client.subscribe((event) => sessionEvents.push(event));

    await client.login({ username: "Alice", password: "secret" });
    const mine = await client.getArticle({ article: indexKey });
    expect(mine).toMatchObject({
      ok: true,
      value: {
        viewerVote: "push",
        nativeVotes: { pushCount: 1, booCount: 1, score: 0 },
        articleVotes: { pushCount: 1, booCount: 0, score: 1, viewerVote: "push" },
        replies: [{
          viewerVote: "boo",
          votes: { pushCount: 0, booCount: 1, score: -1, viewerVote: "boo" },
        }],
      },
    });
    expect(sessionEvents.filter((event) => event.type === "session.changed")).toEqual([
      { type: "session.changed", session: { userId: "Alice" } },
    ]);

    gateway.emit({ type: "session.changed", session: { userId: "bob" } });
    gateway.sources[0] = { ...gateway.sources[0], revision: 2 };
    const other = await client.getArticle({ article: indexKey });
    expect(other.ok && other.value.viewerVote).toBeUndefined();
    expect(other.ok && other.value.replies[0].viewerVote).toBeUndefined();

    gateway.emit({ type: "session.changed", session: null });
    gateway.sources[0] = { ...gateway.sources[0], revision: 3 };
    const loggedOut = await client.getArticle({ article: indexKey });
    expect(loggedOut.ok && loggedOut.value.viewerVote).toBeUndefined();
    expect(sessionEvents.filter((event) => event.type === "session.changed").at(-1)).toEqual({
      type: "session.changed",
      session: null,
    });
  });

  it("stops consuming and closes the source iterator immediately after final", async () => {
    const gateway = new MemoryGateway();
    let cleaned = false;
    gateway.readArticle = async function* () {
      try {
        yield { articleKey: indexKey, completeness: "final", revision: 1, rawText: raw("final", "body") };
        await new Promise(() => {});
      } finally {
        cleaned = true;
      }
    };
    const result = await Promise.race([
      new PttzzzClient(gateway).getArticle({ article: indexKey }),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 30)),
    ]);

    expect(result).not.toBe("timeout");
    expect(result).toMatchObject({ ok: true, value: { title: "final" } });
    expect(cleaned).toBe(true);
  });

  it("does not observe a gateway throw after the first final source", async () => {
    const gateway = new MemoryGateway();
    gateway.readArticle = async function* () {
      yield { articleKey: indexKey, completeness: "final", revision: 1, rawText: raw("final", "body") };
      throw new Error("must not be observed");
    };

    await expect(new PttzzzClient(gateway).getArticle({ article: indexKey })).resolves.toMatchObject({
      ok: true,
      value: { title: "final" },
    });
  });

  it("maps real append and replace edit kinds while excluding the original snapshot", async () => {
    const gateway = new MemoryGateway();
    gateway.sources = [{
      articleKey: indexKey,
      completeness: "final",
      revision: 1,
      rawText: raw("edits", "body", [
        "→ alice: original. 08/22 10:01",
        "→ alice: 補充我在1樓發言：more 08/22 10:02",
        "→ alice: 更正我在1樓發言：replacement 08/22 10:03",
      ].join("\n")),
    }];

    const result = await new PttzzzClient(gateway).getArticle({ article: indexKey });

    expect(result).toMatchObject({
      ok: true,
      value: { replies: [{ edits: [
        { kind: "append", content: "more", resultContent: "original.\nmore" },
        { kind: "replace", content: "replacement", resultContent: "replacement" },
      ] }] },
    });
  });

  it("preserves the original nested heart reply separately from its two section edits", async () => {
    const gateway = new MemoryGateway();
    gateway.sources = [{ articleKey: indexKey, completeness: "final", revision: 1,
      rawText: raw("hearts", "body", [
        "→ askz0: 測試 09/16 23:21",
        "→ askz0: 喔喔 09/16 23:22",
        "→ MBB200291: 推1樓 09/16 23:24",
        "→ MBB200291: 回1樓：♡ 09/16 23:26",
        "→ MBB200291: 回4樓：♥♥♥♥♥ 09/16 23:30",
        "→ MBB200291: 更正我在5樓發言：^1:4=♡♥♡ 09/16 23:31",
        "→ MBB200291: 更正我在5樓發言：^5:5=♡ 09/16 23:35",
      ].join("\n")) }];
    const result = await new PttzzzClient(gateway).getArticle({ article: indexKey });
    expect(result).toMatchObject({ ok: true, value: { replies: [{ children: [{ children: [{
      content: "♥♡♥♡♥♡",
      originalVersion: { content: "♥♥♥♥♥", createdAt: "09/16 23:30" },
      edits: [
        { kind: "replace", resultContent: "♥♡♥♡♥", createdAt: "09/16 23:31" },
        { kind: "replace", resultContent: "♥♡♥♡♥♡", createdAt: "09/16 23:35" },
      ],
    }] }] }] } });
  });

  it("keeps withdrawn parents between the root and edited nested replies", async () => {
    const gateway = new MemoryGateway();
    gateway.sources = [{ articleKey: indexKey, completeness: "final", revision: 1,
      rawText: raw("hearts", "body", [
        "→ askz0: 測試 09/16 23:21", "→ askz0: 喔喔 09/16 23:22",
        "→ MBB200291: 推1樓 09/16 23:24", "→ MBB200291: 回1樓：♡ 09/16 23:26",
        "→ MBB200291: 回4樓：♥♥♥♥♥ 09/16 23:30",
        "→ MBB200291: 更正我在5樓發言：^1:4=♡♥♡ 09/16 23:31",
        "→ MBB200291: 更正我在5樓發言：^5:5=♡ 09/16 23:35",
        "→ MBB200291: 撤回我在4樓的發言 09/16 23:43",
      ].join("\n")) }];
    const result = await new PttzzzClient(gateway).getArticle({ article: indexKey });
    expect(result).toMatchObject({ ok: true, value: { replies: [{ replyId: "reply:1", children: [{
      replyId: "reply:4", visible: false, content: " ", replyTo: "reply:1", depth: 2,
      children: [{ replyId: "reply:5", content: "♥♡♥♡♥♡", replyTo: "reply:4", depth: 3 }],
    }] }] } });
    if (result.ok) expect(result.value.replies).toHaveLength(1);
  });

  it("keeps a withdrawn root in its original order", async () => {
    const gateway = new MemoryGateway();
    gateway.sources = [{ articleKey: indexKey, completeness: "final", revision: 1,
      rawText: raw("roots", "body", [
        "→ alice: first. 09/16 23:21", "→ bob: middle. 09/16 23:22",
        "→ carol: last. 09/16 23:23", "→ bob: 撤回我在2樓的發言 09/16 23:24",
      ].join("\n")) }];
    const result = await new PttzzzClient(gateway).getArticle({ article: indexKey });
    if (!result.ok) throw new Error("read failed");
    expect(result.value.replies.map((reply) => reply.replyId)).toEqual(["reply:1", "reply:2", "reply:3"]);
  });

  it("publishes one hidden reply for a withdrawn aggregate with blank withdraw content", async () => {
    const gateway = new MemoryGateway();
    gateway.sources = [{
      articleKey: indexKey,
      completeness: "final",
      revision: 1,
      rawText: raw("withdraw", "body", [
        "→ alice: first 08/22 10:01",
        "→ alice: second. 08/22 10:02",
        "→ alice: 撤回我在1~2樓的發言 08/22 10:03",
      ].join("\n")),
    }];

    const result = await new PttzzzClient(gateway).getArticle({
      article: indexKey,
      includeDebugMetadata: true,
    });

    expect(result).toMatchObject({ ok: true, value: { replies: [{
      replyId: "reply:1",
      visible: false,
      metadata: { sourceFloors: [1, 2] },
      edits: [{ kind: "withdraw", content: " ", resultContent: " " }],
    }] } });
  });

  it("publishes grouped edits in raw command order instead of constituent floor order", async () => {
    const gateway = new MemoryGateway();
    gateway.sources = [{
      articleKey: indexKey,
      completeness: "final",
      revision: 1,
      rawText: raw("grouped edits", "body", [
        "→ alice: first 08/22 10:01",
        "→ alice: second. 08/22 10:02",
        "→ alice: 補充我在2樓發言：edit-second 08/22 10:03",
        "→ alice: 更正我在1樓發言：edit-first 08/22 10:03",
      ].join("\n")),
    }];

    const result = await new PttzzzClient(gateway).getArticle({ article: indexKey });

    expect(result).toMatchObject({
      ok: true,
      value: { replies: [{ edits: [
        { kind: "append", content: "edit-second", resultContent: "first\nsecond.\nedit-second" },
        { kind: "replace", content: "edit-first", resultContent: "edit-first\nsecond.\nedit-second" },
      ] }] },
    });
  });

  it("publishes structured article edits, revisions, and native counts", async () => {
    const gateway = new MemoryGateway();
    gateway.sources = [{
      articleKey: indexKey,
      completeness: "final",
      revision: 1,
      rawText: raw("metadata", [
        "body",
        "※ PTTzzz 編輯摘要：修正標題",
        "※ 編輯: alice (1.2.3.4), 08/22/2026 10:03:00",
      ].join("\n"), "推 bob: hello 08/22 10:04\n噓 carol: no 08/22 10:05\n→ dave: note 08/22 10:06"),
    }];

    const result = await new PttzzzClient(gateway).getArticle({ article: indexKey });

    expect(result).toMatchObject({ ok: true, value: {
      articleEdits: [{ marker: expect.stringContaining("編輯"), sequence: 0 }],
      revisions: [{ summary: "修正標題", sequence: 0 }],
      nativePushCount: 1,
      nativeBooCount: 1,
      nativeNeutralCount: 1,
    } });
  });

  it("preserves arbitrary structural reply depth in the public article", async () => {
    const gateway = new MemoryGateway();
    gateway.sources = [{
      articleKey: indexKey,
      completeness: "final",
      revision: 1,
      rawText: raw("deep", "body", [
        "→ alice: first. 08/22 10:01",
        "→ bob: 回1樓：second. 08/22 10:02",
        "→ carol: 回2樓：third. 08/22 10:03",
        "→ dave: 回3樓：fourth. 08/22 10:04",
      ].join("\n")),
    }];

    const result = await new PttzzzClient(gateway).getArticle({ article: indexKey });

    expect(result).toMatchObject({ ok: true, value: { replies: [{
      depth: 1,
      children: [{ depth: 2, children: [{
        depth: 3,
        children: [{ depth: 4, replyTo: "reply:3" }],
      }] }],
    }] } });
  });
});

describe("PttzzzClient writes", () => {
  it("rejects invalid article styles before gateway writes and preserves valid formatting", async () => {
    const gateway = new MemoryGateway();
    const client = new PttzzzClient(gateway);
    const invalid = { content: "abc", formatting: [{ start: 0, end: 20, bold: true }] };
    expect(await client.createArticle({ board: "Test", title: "title", ...invalid })).toMatchObject({ ok: false });
    expect(await client.editArticle({ article: indexKey, ...invalid })).toMatchObject({ ok: false });
    expect(await client.replyArticleToBoard({ article: indexKey, ...invalid })).toMatchObject({ ok: false });
    expect(gateway.commands).toHaveLength(0);
    const formatting = [{ start: 0, end: 2, bold: true }];
    await client.createArticle({ board: "Test", title: "title", content: "abc", formatting });
    expect(gateway.commands[0]).toMatchObject({ content: "abc", formatting });
  });
  it("maps every article-level write to one gateway command", async () => {
    const gateway = new MemoryGateway();
    const client = new PttzzzClient(gateway);

    await client.createArticle({ board: "Test", category: "閒聊", title: "title", content: "body" });
    await client.editArticle({ article: indexKey, content: "updated" });
    await client.deleteArticle({ article: indexKey });
    await client.replyToArticle({ article: indexKey, content: "comment", pushType: "neutral" });
    await client.replyArticleToBoard({ article: indexKey, content: "board reply" });
    await client.voteArticle({ article: indexKey, direction: "push" });
    await client.withdrawArticleVote({ article: indexKey, direction: "boo" });

    expect(gateway.commands).toEqual([
      { type: "create-article", board: "Test", category: "閒聊", title: "title", content: "body" },
      { type: "edit-article", article: indexKey, content: "updated" },
      { type: "delete-article", article: indexKey },
      { type: "reply-article", article: indexKey, content: "comment", pushType: "neutral" },
      { type: "reply-article-to-board", article: indexKey, content: "board reply" },
      { type: "vote-article", article: indexKey, direction: "push" },
      { type: "withdraw-article-vote", article: indexKey, direction: "boo" },
    ]);
  });

  it("resolves a replyId to the primary source floor for reply, edit, and votes", async () => {
    const gateway = new MemoryGateway();
    gateway.sources = [{
      articleKey: indexKey, completeness: "final", revision: 1,
      rawText: raw("thread", "body", "→ bob: first 08/22 10:01\n→ bob: second. 08/22 10:02"),
    }];
    const client = new PttzzzClient(gateway);
    const article = await client.getArticle({ article: indexKey });
    if (!article.ok) throw new Error("fixture article missing");
    const replyId = article.value.replies[0].replyId;

    await client.replyToReply({ article: indexKey, replyId, content: " 同意 ", pushType: "push" });
    await client.editReply({ article: indexKey, replyId, mode: "append", content: "more" });
    await client.editReply({
      article: indexKey,
      replyId,
      mode: "section",
      changes: [{ start: 2, end: 2, replacement: "新增" }],
    });
    await client.voteReply({ article: indexKey, replyId, direction: "boo" });
    await client.withdrawReplyVote({ article: indexKey, replyId, direction: "push" });
    await client.withdrawReply({ article: indexKey, replyId });

    expect(gateway.commands).toEqual([
      { type: "reply-floor", article: indexKey, floor: 1, content: " 同意 ", pushType: "push" },
      { type: "edit-floor", article: indexKey, floor: 1, mode: "append", content: "more" },
      {
        type: "edit-floor",
        article: indexKey,
        floor: 1,
        mode: "section",
        changes: [{ start: 2, end: 2, replacement: "新增" }],
      },
      { type: "vote-floor", article: indexKey, floor: 1, direction: "boo" },
      { type: "withdraw-floor-vote", article: indexKey, floor: 1, direction: "push" },
      { type: "withdraw-floor", article: indexKey, ranges: [{ start: 1, end: 2 }] },
    ]);
  });

  it("rejects invalid structured section edits before reaching the gateway", async () => {
    const gateway = new MemoryGateway();
    gateway.sources = [{
      articleKey: indexKey, completeness: "final", revision: 1,
      rawText: raw("thread", "body", "→ bob: target. 08/22 10:01"),
    }];
    const client = new PttzzzClient(gateway);
    const loaded = await client.getArticle({ article: indexKey });
    if (!loaded.ok) throw new Error("fixture article missing");
    const replyId = loaded.value.replies[0].replyId;

    await expect(client.editReply({
      article: indexKey,
      replyId,
      mode: "section",
      changes: [
        { start: 1, end: 3, replacement: "x" },
        { start: 2, end: 4, replacement: "y" },
      ],
    })).resolves.toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(gateway.commands).toEqual([]);
  });

  it("validates the normalized final wire push with the PTT Big5 approximation", async () => {
    const gateway = new MemoryGateway();
    gateway.sources = [{
      articleKey: indexKey, completeness: "final", revision: 1,
      rawText: raw("thread", "body", "→ bob: target. 08/22 10:01"),
    }];
    const client = new PttzzzClient(gateway);
    const article = await client.getArticle({ article: indexKey });
    if (!article.ok) throw new Error("fixture article missing");
    const replyId = article.value.replies[0].replyId;

    await expect(client.replyToReply({
      article: indexKey, replyId, content: `  ${"中".repeat(36)}  `, pushType: "neutral",
    })).resolves.toEqual({ ok: true, value: undefined });
    await expect(client.replyToReply({
      article: indexKey, replyId, content: "中".repeat(37), pushType: "neutral",
    })).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT", outcome: "not-sent", retryable: false },
    });
    await expect(client.editReply({
      article: indexKey, replyId, mode: "append", content: ` ${"中".repeat(31)} `,
    })).resolves.toEqual({ ok: true, value: undefined });
    await expect(client.editReply({
      article: indexKey, replyId, mode: "append", content: "中".repeat(32),
    })).resolves.toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    await expect(client.replyToArticle({
      article: indexKey, content: "中".repeat(40), pushType: "neutral",
    })).resolves.toEqual({ ok: true, value: undefined });
    await expect(client.replyToArticle({
      article: indexKey, content: "中".repeat(41), pushType: "neutral",
    })).resolves.toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });

    expect(gateway.commands).toEqual([
      expect.objectContaining({ type: "reply-floor", content: `  ${"中".repeat(36)}  ` }),
      expect.objectContaining({ type: "edit-floor", content: ` ${"中".repeat(31)} ` }),
      expect.objectContaining({ type: "reply-article" }),
    ]);
  });

  it("splits noncontiguous aggregate source floors into safe withdrawal ranges", async () => {
    const gateway = new MemoryGateway();
    gateway.sources = [{
      articleKey: indexKey, completeness: "final", revision: 1,
      rawText: raw("thread", "body", [
        "→ bob: first 08/22 10:01",
        "→ alice: other. 08/22 10:02",
        "→ bob: last. 08/22 10:03",
      ].join("\n")),
    }];
    const client = new PttzzzClient(gateway);
    const article = await client.getArticle({ article: indexKey });
    if (!article.ok) throw new Error("fixture article missing");
    const bob = article.value.replies.find((reply) => reply.author === "bob")!;

    await client.withdrawReply({ article: indexKey, replyId: bob.replyId });

    expect(gateway.commands).toEqual([{
      type: "withdraw-floor",
      article: indexKey,
      ranges: [{ start: 1, end: 1 }, { start: 3, end: 3 }],
    }]);
  });

  it("returns REPLY_NOT_FOUND without executing for missing or invalidated mappings", async () => {
    const gateway = new MemoryGateway();
    gateway.sources = [{
      articleKey: indexKey, completeness: "final", revision: 1,
      rawText: raw("thread", "body", "→ bob: reply. 08/22 10:01"),
    }];
    const client = new PttzzzClient(gateway);
    const article = await client.getArticle({ article: indexKey });
    if (!article.ok) throw new Error("fixture article missing");
    const replyId = article.value.replies[0].replyId;

    await expect(client.voteReply({ article: indexKey, replyId: "missing", direction: "push" })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: "REPLY_NOT_FOUND", outcome: "not-sent", retryable: false }),
    });
    gateway.sources = [{
      articleKey: indexKey, completeness: "incomplete", revision: 2,
      rawText: raw("partial", "body"),
    }];
    await client.getArticle({ article: indexKey });
    await expect(client.voteReply({ article: indexKey, replyId, direction: "push" })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: "REPLY_NOT_FOUND" }),
    });
    expect(gateway.commands).toEqual([]);
  });

  it("clears reply mappings on disconnect", async () => {
    const gateway = new MemoryGateway();
    gateway.sources = [{
      articleKey: indexKey, completeness: "final", revision: 1,
      rawText: raw("thread", "body", "→ bob: reply. 08/22 10:01"),
    }];
    const client = new PttzzzClient(gateway);
    const article = await client.getArticle({ article: indexKey });
    if (!article.ok) throw new Error("fixture article missing");
    await client.disconnect();

    const result = await client.editReply({
      article: indexKey, replyId: article.value.replies[0].replyId, mode: "replace", content: "x",
    });
    expect(result).toMatchObject({ ok: false, error: { code: "REPLY_NOT_FOUND" } });
    expect(gateway.commands).toEqual([]);
  });

  it("does not let a superseded final overwrite the newer reply mapping", async () => {
    const resolvers: Array<(source: RawArticleSource) => void> = [];
    const gateway = new MemoryGateway();
    gateway.readArticle = async function* () {
      yield await new Promise<RawArticleSource>((resolve) => resolvers.push(resolve));
    };
    const client = new PttzzzClient(gateway);
    const older = client.getArticle({ article: indexKey });
    const newer = client.getArticle({ article: indexKey });
    resolvers[1]({
      articleKey: indexKey, completeness: "final", revision: 1,
      rawText: raw("new", "body", "→ alice: first. 08/22 10:01\n→ bob: target. 08/22 10:02"),
    });
    const newArticle = await newer;
    if (!newArticle.ok) throw new Error("new fixture missing");
    const bob = newArticle.value.replies.find((reply) => reply.author === "bob")!;
    resolvers[0]({
      articleKey: indexKey, completeness: "final", revision: 1,
      rawText: raw("old", "body", "→ bob: stale target. 08/22 10:01"),
    });
    await older;

    await client.voteReply({ article: indexKey, replyId: bob.replyId, direction: "push" });
    expect(gateway.commands).toEqual([{
      type: "vote-floor", article: indexKey, floor: 2, direction: "push",
    }]);
  });

  it("never rebinds an old replyId when a leading card is withdrawn on reload", async () => {
    const gateway = new MemoryGateway();
    gateway.sources = [{
      articleKey: indexKey, completeness: "final", revision: 1,
      rawText: raw("before", "body", "→ alice: remove me. 08/22 10:01\n→ bob: keep me. 08/22 10:02"),
    }];
    const client = new PttzzzClient(gateway);
    const before = await client.getArticle({ article: indexKey });
    if (!before.ok) throw new Error("before fixture missing");
    const removedId = before.value.replies[0].replyId;
    expect(removedId).toBe("reply:1");

    gateway.sources = [{
      articleKey: indexKey, completeness: "final", revision: 2,
      rawText: raw("after", "body", [
        "→ alice: remove me. 08/22 10:01",
        "→ bob: keep me. 08/22 10:02",
        "→ alice: 撤回我在1樓的發言 08/22 10:03",
      ].join("\n")),
    }];
    const after = await client.getArticle({ article: indexKey });
    if (!after.ok) throw new Error("after fixture missing");
    expect(after.value.replies.filter((reply) => reply.visible)).toMatchObject([
      { author: "bob", replyId: "reply:2" },
    ]);

    await expect(client.voteReply({ article: indexKey, replyId: removedId, direction: "push" })).resolves.toMatchObject({
      ok: false,
      error: { code: "REPLY_NOT_FOUND" },
    });
    expect(gateway.commands).toEqual([]);
  });

  it("keeps replyId stable when the raw source-floor membership is unchanged", async () => {
    const gateway = new MemoryGateway();
    gateway.sources = [{
      articleKey: indexKey, completeness: "final", revision: 1,
      rawText: raw("same", "body", "→ alice: same. 08/22 10:01"),
    }];
    const client = new PttzzzClient(gateway);
    const first = await client.getArticle({ article: indexKey });
    gateway.sources = [{ ...gateway.sources[0], revision: 2 }];
    const second = await client.getArticle({ article: indexKey });

    expect(first.ok && first.value.replies[0].replyId).toBe("reply:1");
    expect(second.ok && second.value.replies[0].replyId).toBe("reply:1");
  });

  it("keeps the anchor replyId while continuation expands its target floors", async () => {
    const gateway = new MemoryGateway();
    gateway.sources = [{
      articleKey: indexKey, completeness: "final", revision: 1,
      rawText: raw("partial group", "body", "→ alice: first 08/22 10:01"),
    }];
    const client = new PttzzzClient(gateway);
    const first = await client.getArticle({ article: indexKey });
    if (!first.ok) throw new Error("first fixture missing");
    const replyId = first.value.replies[0].replyId;

    gateway.sources = [{
      articleKey: indexKey, completeness: "final", revision: 2,
      rawText: raw("full group", "body", "→ alice: first 08/22 10:01\n→ alice: second. 08/22 10:02"),
    }];
    const expanded = await client.getArticle({ article: indexKey });
    expect(expanded.ok && expanded.value.replies[0]).toMatchObject({ replyId });

    await client.withdrawReply({ article: indexKey, replyId });
    expect(gateway.commands).toEqual([{
      type: "withdraw-floor", article: indexKey, ranges: [{ start: 1, end: 2 }],
    }]);
  });

  it("preserves write outcomes and never retries uncertain or thrown writes", async () => {
    const gateway = new MemoryGateway();
    const client = new PttzzzClient(gateway);
    const cause = new Error("confirmation timeout");
    gateway.receipt = {
      ok: false, code: "TIMEOUT", message: "請重新載入確認", outcome: "uncertain", retryable: false, cause,
    };

    await expect(client.voteArticle({ article: indexKey, direction: "push" })).resolves.toEqual({
      ok: false,
      error: { code: "TIMEOUT", message: "請重新載入確認", outcome: "uncertain", retryable: false, cause },
    });
    expect(gateway.commands).toHaveLength(1);

    gateway.executeError = new Error("unknown transport failure");
    await expect(client.deleteArticle({ article: indexKey })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: "GATEWAY_FAILURE", outcome: "uncertain", retryable: false }),
    });
    expect(gateway.commands).toHaveLength(2);
  });

  it("preserves safe not-sent retryability from the receipt", async () => {
    const gateway = new MemoryGateway();
    gateway.receipt = {
      ok: false, code: "NOT_CONNECTED", message: "尚未連線", outcome: "not-sent", retryable: true,
    };

    await expect(new PttzzzClient(gateway).createArticle({
      board: "Test", title: "title", content: "body",
    })).resolves.toEqual({
      ok: false,
      error: { code: "NOT_CONNECTED", message: "尚未連線", outcome: "not-sent", retryable: true },
    });
    expect(gateway.commands).toHaveLength(1);
  });
});
