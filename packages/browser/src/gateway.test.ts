import { describe, expect, it, vi } from "vitest";
import { GatewayError, PttzzzClient, type ArticleKey, type PttCommand } from "@pttzzz/core";
import { ReplyDraftQueue, replyPreparationError } from "./internal/multipartReply.js";
import {
  BrowserPttGateway,
  createTerminalGatewayDriverForTesting,
  type GatewayTerminalDriver,
  type BrowserGatewayDriver,
} from "./gateway.js";

const articleByIndex: ArticleKey = { board: "Test", index: 42 };

function driver(overrides: Partial<BrowserGatewayDriver> = {}): BrowserGatewayDriver {
  return {
    connect: vi.fn(async () => undefined),
    login: vi.fn(async () => ({ ok: true as const })),
    disconnect: vi.fn(async () => undefined),
    subscribeStatus: vi.fn(() => () => undefined),
    readArticleSource: vi.fn(async (_key, emit) => {
      emit({ completeness: "incomplete", rawText: "partial", revision: 1 });
      emit({ completeness: "final", rawText: "final", revision: 2 });
    }),
    listBoards: vi.fn(async (source) =>
      source.kind === "category"
        ? [{ kind: "category" as const, title: "生活", route: [1] }]
        : [{ kind: "board" as const, board: { name: "Gossiping", title: "八卦" } }],
    ),
    searchBoards: vi.fn(async () => []),
    listArticles: vi.fn(async () => []),
    execute: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
}

describe("BrowserPttGateway", () => {
  it("does not guess a planner when the transport lacks preparation", async () => {
    const client = new PttzzzClient(new BrowserPttGateway(driver()));
    expect(await client.prepareReplyDraft({ article: articleByIndex })).toMatchObject({ ok: false, error: { code: "UNSUPPORTED", retryable: false } });
  });
  it("passes the caller fragment budget through core and gateway", async () => {
    const send = vi.fn();
    const queue = new ReplyDraftQueue();
    const client = new PttzzzClient(new BrowserPttGateway(driver({ sendReplyDraft: input => queue.run(input,
      async () => ({ author: "alice", capacity: 55 }), send) })));
    expect(await client.sendReplyDraft({ operationId: "budget", article: articleByIndex,
      content: Array(31).fill("短句。").join("\n"), pushType: "neutral", maxFragments: 30 }))
      .toMatchObject({ ok: false, error: { replyIssue: { kind: "too-many-fragments", total: 31 } } });
    expect(send).not.toHaveBeenCalled();
  });
  it.each([
    { content: "😀", failure: undefined, issue: { kind: "unsupported-characters", characters: ["😀"] } },
    { content: "第一行\n 第二行", failure: undefined, issue: { kind: "content-layout", reason: "leading-space" } },
    { content: "abc\tdef", failure: undefined, issue: { kind: "content-layout", reason: "control-characters" } },
    { content: "測試", failure: "connection" as const, issue: { kind: "connection" } },
    { content: "測試", failure: "article-unavailable" as const, issue: { kind: "article-unavailable" } },
  ])("retains preparation guidance across queue, gateway and core: $issue.kind", async ({ content, failure, issue }) => {
    const queue = new ReplyDraftQueue();
    const send = vi.fn();
    const gateway = new BrowserPttGateway(driver({ sendReplyDraft: input => queue.run(input, async () => {
      if (failure) throw replyPreparationError({ kind: failure }, "private diagnostic");
      return { author: "alice", capacity: 55 };
    }, send) }));
    const result = await new PttzzzClient(gateway).sendReplyDraft({ operationId: "guidance", article: articleByIndex, content, pushType: "neutral" });
    expect(result).toMatchObject({ ok: false, error: { outcome: "not-sent", replyIssue: issue } });
    expect(send).not.toHaveBeenCalled();
  });
  it("keeps a cursor for unread rows even when the terminal window reaches the bottom", async () => {
    const gateway = new BrowserPttGateway(driver({ listArticles: async () => ({ items: [
      { index: 2, author: "alice", title: "two", date: "9/21" },
      { index: 1, author: "alice", title: "one", date: "9/21" },
    ], exhausted: true }) }));
    expect((await gateway.listArticles({ board: "Test", limit: 1 })).nextCursor).toBeDefined();
  });
  it("rejects a cursor whose terminal AID anchor moved even when titles match", async () => {
    let moved = false;
    const terminal = {
      listArticles: async () => [
        { index: 5, author: "alice", title: "same", date: "9/21", pushCount: "", mark: "" },
        { index: 4, author: "alice", title: "same", date: "9/21", pushCount: "", mark: "" },
        { index: 3, author: "alice", title: "same", date: "9/21", pushCount: "", mark: "" },
      ],
      readArticleAidAtIndex: async () => moved ? "nextArticle" : "originalArticle",
    } as unknown as GatewayTerminalDriver;
    const gateway = new BrowserPttGateway(createTerminalGatewayDriverForTesting(terminal));
    const first = await gateway.listArticles({ board: "Test", limit: 1 });
    moved = true;
    await expect(gateway.listArticles({ board: "Test", limit: 1, cursor: first.nextCursor })).rejects.toMatchObject({ code: "STALE_CURSOR" });
  });
  it.each(["create-article", "edit-article", "reply-article-to-board"] as const)("rejects malformed %s formatting before terminal dispatch", async (type) => {
    const transport = driver();
    const gateway = new BrowserPttGateway(transport);
    const input = { content: "abc", formatting: [{ start: 0, end: 20, bold: true }] };
    const command: PttCommand = type === "create-article" ? { type, board: "Test", title: "title", ...input } : { type, article: articleByIndex, ...input };
    await expect(gateway.execute(command)).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT", outcome: "not-sent" });
    expect(transport.execute).not.toHaveBeenCalled();
  });
  it("translates object login input and status events, and unsubscribes", async () => {
    let statusListener: ((status: "connected") => void) | undefined;
    const unsubscribe = vi.fn();
    const transport = driver({
      subscribeStatus: vi.fn((listener) => {
        statusListener = listener as (status: "connected") => void;
        return unsubscribe;
      }),
    });
    const gateway = new BrowserPttGateway(transport);
    const events: unknown[] = [];
    const stop = gateway.subscribe((event) => events.push(event));

    await expect(gateway.login({
      username: "alice",
      password: "secret",
      disconnectExistingSession: true,
    })).resolves.toEqual({ userId: "alice" });
    expect(transport.login).toHaveBeenCalledWith("alice", "secret", true);
    statusListener?.("connected");
    expect(events).toContainEqual({ type: "connection.changed", status: "connected" });
    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("yields genuine raw partial and final sources with the exact operation key", async () => {
    const gateway = new BrowserPttGateway(driver());
    const sources = [];
    for await (const source of gateway.readArticle({ article: articleByIndex })) {
      sources.push(source);
    }
    expect(sources).toEqual([
      { articleKey: articleByIndex, completeness: "incomplete", rawText: "partial", revision: 1 },
      { articleKey: articleByIndex, completeness: "final", rawText: "final", revision: 2 },
    ]);
    expect(sources[0]?.articleKey).toBe(articleByIndex);
  });

  it("dispatches commands and normalizes all write outcomes without retrying", async () => {
    const execute = vi
      .fn<BrowserGatewayDriver["execute"]>()
      .mockResolvedValueOnce({ ok: false, code: "before-send", reason: "no", outcome: "not-sent" })
      .mockResolvedValueOnce({ ok: false, code: "timeout", reason: "check", outcome: "uncertain" });
    const gateway = new BrowserPttGateway(driver({ execute }));
    const command: PttCommand = {
      type: "vote-floor", article: articleByIndex, floor: 12, direction: "push",
    };
    await expect(gateway.execute(command)).resolves.toMatchObject({
      ok: false, outcome: "not-sent", retryable: false,
    });
    await expect(gateway.execute(command)).resolves.toMatchObject({
      ok: false, outcome: "uncertain", retryable: false,
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("passes raw nested-reply body to the private driver for final formatting", async () => {
    const execute = vi.fn<BrowserGatewayDriver["execute"]>(async () => ({ ok: true }));
    const gateway = new BrowserPttGateway(driver({ execute }));

    await gateway.execute({
      type: "reply-floor",
      article: articleByIndex,
      floor: 12,
      content: "  同意  ",
      pushType: "neutral",
    });

    expect(execute).toHaveBeenCalledWith({
      type: "reply-floor",
      article: articleByIndex,
      floor: 12,
      content: "  同意  ",
      pushType: "neutral",
    });
  });

  it("keeps a cursor for an explicitly non-terminal underfilled article batch", async () => {
    const listArticles = vi.fn(async () => ({
      items: [{ index: 10, title: "ten", author: "a", date: "9/06" }],
      exhausted: false,
    }));
    const gateway = new BrowserPttGateway(driver({
      listArticles: listArticles as unknown as BrowserGatewayDriver["listArticles"],
    }));

    const page = await gateway.listArticles({ board: "Test", limit: 20 });

    expect(page.items.map((item) => item.key.index)).toEqual([10]);
    expect(page.nextCursor).toEqual(expect.any(String));
  });

  it("omits the cursor only for an explicitly exhausted article batch", async () => {
    const listArticles = vi.fn(async () => ({
      items: [{ index: 1, title: "oldest", author: "a", date: "1/01" }],
      exhausted: true,
    }));
    const gateway = new BrowserPttGateway(driver({
      listArticles: listArticles as unknown as BrowserGatewayDriver["listArticles"],
    }));

    const page = await gateway.listArticles({ board: "Test", limit: 20 });

    expect(page.items.map((item) => item.key.index)).toEqual([1]);
    expect(page.nextCursor).toBeUndefined();
  });

  it("preserves a retryable terminal-stall explanation under the stable gateway error code", async () => {
    const stalled = Object.assign(new Error("文章列表尚未更新，請再試一次"), {
      code: "ARTICLE_PAGE_STALLED",
    });
    const gateway = new BrowserPttGateway(driver({
      listArticles: vi.fn(async () => { throw stalled; }),
    }));

    await expect(gateway.listArticles({ board: "Test" })).rejects.toMatchObject({
      code: "GATEWAY_FAILURE",
      message: "文章列表尚未更新，請再試一次",
      retryable: true,
    });
  });

  it("rejects an oversized final wire push before invoking the driver", async () => {
    const execute = vi.fn<BrowserGatewayDriver["execute"]>(async () => ({ ok: true }));
    const gateway = new BrowserPttGateway(driver({ execute }));

    await expect(gateway.execute({
      type: "reply-floor",
      article: articleByIndex,
      floor: 1,
      content: "中".repeat(37),
      pushType: "neutral",
    })).resolves.toMatchObject({
      ok: false, code: "INVALID_INPUT", outcome: "not-sent", retryable: false,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("validates and forwards structured section edits without UI control strings", async () => {
    const execute = vi.fn<BrowserGatewayDriver["execute"]>(async () => ({ ok: true }));
    const gateway = new BrowserPttGateway(driver({ execute }));
    const valid: PttCommand = {
      type: "edit-floor",
      article: articleByIndex,
      floor: 12,
      mode: "section",
      changes: [{ start: 1, end: 3, replacement: "新" }],
    };

    await expect(gateway.execute(valid)).resolves.toEqual({ ok: true, outcome: "sent" });
    expect(execute).toHaveBeenCalledWith(valid);
    await expect(gateway.execute({
      ...valid,
      changes: [
        { start: 1, end: 3, replacement: "x" },
        { start: 2, end: 4, replacement: "y" },
      ],
    })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT", outcome: "not-sent" });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("maps commands to the private positional terminal workflow", async () => {
    const executeArticleCommand = vi.fn(async () => ({
      ok: false,
      code: "push-confirm-timeout" as const,
      reason: "check",
    }));
    const transport = createTerminalGatewayDriverForTesting({
      executeArticleCommand,
    } as unknown as GatewayTerminalDriver);

    await expect(transport.execute({
      type: "vote-floor", article: articleByIndex, floor: 7, direction: "boo",
    })).resolves.toMatchObject({ ok: false, outcome: "uncertain" });
    expect(executeArticleCommand).toHaveBeenCalledWith({
      type: "vote-floor", article: articleByIndex, floor: 7, direction: "boo",
    });

    await expect(transport.execute({
      type: "reply-article", article: articleByIndex, content: "hi", pushType: "neutral",
    })).resolves.toMatchObject({ ok: false, outcome: "uncertain" });
    expect(executeArticleCommand).toHaveBeenLastCalledWith({
      type: "reply-article", article: articleByIndex, content: "hi", pushType: "neutral",
    });
  });

  it("uses opaque session cursors for pagination and rejects stale cursors", async () => {
    const gateway = new BrowserPttGateway(driver({
      listBoards: vi.fn(async () => [
        { kind: "board", board: { name: "A", title: "A" } },
        { kind: "board", board: { name: "B", title: "B" } },
      ]),
    }));
    const first = await gateway.listBoards({ limit: 1 });
    expect(first).toMatchObject({ kind: "boards", items: [{ name: "A" }] });
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await gateway.listBoards({ cursor: first.nextCursor, limit: 1 });
    expect(second).toMatchObject({ kind: "boards", items: [{ name: "B" }] });
    await gateway.disconnect();
    await expect(gateway.listBoards({ cursor: first.nextCursor })).rejects.toMatchObject({
      code: "INVALID_CURSOR",
    });
  });

  it("supports directories, empty prefix results, and favorite/category intersection", async () => {
    const searchBoards = vi.fn(async () => []);
    const listBoards = vi.fn(async (source: { kind: string; route?: readonly number[] }) => {
      if (source.kind === "favorite") {
        return [
          { kind: "board" as const, board: { name: "A", title: "A", favorite: true } },
          { kind: "board" as const, board: { name: "B", title: "B", favorite: true } },
        ];
      }
      if (source.kind === "category" && source.route?.[0] === 1) {
        return [{ kind: "board" as const, board: { name: "B", title: "B" } }];
      }
      return [{ kind: "category" as const, title: "生活", route: [1] }];
    });
    const gateway = new BrowserPttGateway(driver({ listBoards, searchBoards }));
    const root = await gateway.listBoards({ source: { kind: "category" } });
    expect(root.kind).toBe("directory");
    const categoryCursor = root.items[0]?.kind === "category"
      ? root.items[0].categoryCursor
      : "";
    await expect(gateway.searchBoards({ prefix: "NoSuch" })).resolves.toEqual({
      kind: "boards", items: [],
    });
    await expect(gateway.filterBoards({ favorite: true, categoryCursor })).resolves.toEqual({
      kind: "boards", items: [{ name: "B", title: "B", favorite: true }],
    });
    await expect(gateway.searchBoards({ prefix: "" })).rejects.toBeInstanceOf(GatewayError);
    await expect(gateway.filterBoards({} as never)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });

  it("normalizes unknown lifecycle and read failures as structured gateway errors", async () => {
    const gateway = new BrowserPttGateway(driver({
      connect: vi.fn(async () => { throw new Error("socket"); }),
      readArticleSource: vi.fn(async () => { throw new Error("screen"); }),
    }));
    await expect(gateway.connect()).rejects.toMatchObject({
      name: "GatewayError", code: "GATEWAY_FAILURE", retryable: true,
    });
    const iterator = gateway.readArticle({ article: articleByIndex })[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toMatchObject({
      name: "GatewayError", code: "GATEWAY_FAILURE", retryable: true,
    });
  });

  it("treats an unexpected write failure as uncertain and does not retry", async () => {
    const execute = vi.fn(async () => { throw new Error("lost confirmation"); });
    const gateway = new BrowserPttGateway(driver({ execute }));
    await expect(gateway.execute({
      type: "vote-floor", article: articleByIndex, floor: 1, direction: "push",
    })).resolves.toMatchObject({
      ok: false, code: "GATEWAY_FAILURE", outcome: "uncertain", retryable: false,
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("isolates listener exceptions from later listeners and operations", async () => {
    let statusListener: ((status: "connected") => void) | undefined;
    const transport = driver({
      subscribeStatus: vi.fn((listener) => {
        statusListener = listener as (status: "connected") => void;
        return () => undefined;
      }),
    });
    const gateway = new BrowserPttGateway(transport);
    gateway.subscribe(() => { throw new Error("bad listener"); });
    const good = vi.fn();
    gateway.subscribe(good);
    expect(() => statusListener?.("connected")).not.toThrow();
    expect(good).toHaveBeenCalledWith({ type: "connection.changed", status: "connected" });
    await expect(gateway.listBoards()).resolves.toMatchObject({ kind: "boards" });
  });

  it("uses opaque signed article cursors and preserves list/search/filter queries", async () => {
    const listArticles = vi.fn(async (input: {
      board: string;
      beforeIndex?: number;
      author?: string;
      keyword?: string;
      minimumNativeScore?: number;
    }) => [
      { index: input.beforeIndex ? 8 : 10, title: "one", author: input.author ?? "a", date: "1/1" },
      { index: input.beforeIndex ? 7 : 9, title: input.keyword ?? "two", author: input.author ?? "b", date: "1/1" },
    ]);
    const gateway = new BrowserPttGateway(driver({ listArticles }));

    const first = await gateway.listArticles({ board: "Test", limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await gateway.listArticles({ board: "Test", limit: 1, cursor: first.nextCursor });
    expect(second.items[0]?.key).toEqual({ board: "Test", index: 8 });
    expect(listArticles).toHaveBeenLastCalledWith({ board: "Test", beforeIndex: 10, limit: 2 });

    await gateway.searchArticles({ board: "Test", query: "hello", limit: 2 });
    expect(listArticles).toHaveBeenLastCalledWith({ board: "Test", keyword: "hello", limit: 3 });
    await gateway.filterArticles({ board: "Test", author: "alice", keyword: "topic", limit: 2 });
    expect(listArticles).toHaveBeenLastCalledWith({
      board: "Test", author: "alice", keyword: "topic", limit: 3,
    });
    await gateway.filterArticles({ board: "Test", minimumNativeScore: 10, limit: 2 });
    expect(listArticles).toHaveBeenLastCalledWith({
      board: "Test", minimumNativeScore: 10, limit: 3,
    });

    await expect(gateway.listArticles({ board: "Test", limit: 2, cursor: first.nextCursor }))
      .rejects.toMatchObject({ code: "INVALID_CURSOR" });

    await expect(gateway.searchArticles({
      board: "Test", query: "other", cursor: first.nextCursor,
    })).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    await expect(gateway.searchArticles({ board: "Test", query: "" }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(gateway.filterArticles({ board: "Test" }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("keeps cursors instance- and successful-session-owned", async () => {
    const boards = vi.fn(async () => [
      { kind: "board" as const, board: { name: "A", title: "A" } },
      { kind: "board" as const, board: { name: "B", title: "B" } },
    ]);
    const first = new BrowserPttGateway(driver({ listBoards: boards }));
    const second = new BrowserPttGateway(driver({ listBoards: boards }));
    const page = await first.listBoards({ limit: 1 });
    await second.listBoards({ limit: 1 });
    await expect(second.listBoards({ cursor: page.nextCursor })).rejects.toMatchObject({ code: "INVALID_CURSOR" });

    const failedLogin = driver({
      login: vi.fn(async () => ({ ok: false as const, reason: "no" })),
      listBoards: boards,
    });
    const third = new BrowserPttGateway(failedLogin);
    const retained = await third.listBoards({ limit: 1 });
    await expect(third.login({ username: "x", password: "bad" })).rejects.toMatchObject({ code: "LOGIN_FAILED" });
    await expect(third.listBoards({ cursor: retained.nextCursor, limit: 1 })).resolves.toMatchObject({
      items: [{ name: "B" }],
    });

    await first.login({ username: "a", password: "ok" });
    await expect(first.listBoards({ cursor: page.nextCursor })).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  });

  it("invalidates session cursors even when disconnect cleanup fails", async () => {
    const gateway = new BrowserPttGateway(driver({
      disconnect: vi.fn(async () => { throw new GatewayError("CLOSE_FAILED", "close", true); }),
      listBoards: vi.fn(async () => [
        { kind: "board" as const, board: { name: "A", title: "A" } },
        { kind: "board" as const, board: { name: "B", title: "B" } },
      ]),
    }));
    const page = await gateway.listBoards({ limit: 1 });
    await expect(gateway.disconnect()).rejects.toMatchObject({ code: "CLOSE_FAILED" });
    await expect(gateway.listBoards({ cursor: page.nextCursor })).rejects.toMatchObject({
      code: "INVALID_CURSOR",
    });
  });

  it("keeps a pagination snapshot when the backend changes", async () => {
    const listBoards = vi.fn()
      .mockResolvedValueOnce([
        { kind: "board", board: { name: "A", title: "A" } },
        { kind: "board", board: { name: "B", title: "B" } },
      ])
      .mockResolvedValue([{ kind: "board", board: { name: "X", title: "X" } }]);
    const gateway = new BrowserPttGateway(driver({ listBoards }));
    const first = await gateway.listBoards({ limit: 1 });
    const second = await gateway.listBoards({ limit: 1, cursor: first.nextCursor });
    expect(second.items).toEqual([{ name: "B", title: "B" }]);
    expect(listBoards).toHaveBeenCalledOnce();
  });

  it("keeps a mixed directory page shape across cursor pages", async () => {
    const gateway = new BrowserPttGateway(driver({
      listBoards: vi.fn(async () => [
        { kind: "category" as const, title: "分類", route: [1] },
        { kind: "board" as const, board: { name: "A", title: "A" } },
      ]),
    }));
    const first = await gateway.listBoards({ source: { kind: "category" }, limit: 1 });
    const second = await gateway.listBoards({
      source: { kind: "category" }, limit: 1, cursor: first.nextCursor,
    });
    expect(second).toMatchObject({
      kind: "directory",
      items: [{ kind: "board", board: { name: "A" } }],
    });
  });

  it("coalesces partial snapshots and aborts when the iterator closes", async () => {
    let emit!: (source: Omit<import("@pttzzz/core").RawArticleSource, "articleKey">) => void;
    let signal!: AbortSignal;
    let restored = false;
    const transport = driver({
      readArticleSource: vi.fn(async (_key, listener, abortSignal) => {
        emit = listener;
        signal = abortSignal!;
        await new Promise<void>((resolve) => abortSignal?.addEventListener("abort", () => {
          setTimeout(() => { restored = true; resolve(); }, 5);
        }, { once: true }));
      }),
      listBoards: vi.fn(async () => {
        expect(restored).toBe(true);
        return [];
      }),
    });
    const gateway = new BrowserPttGateway(transport);
    const events: unknown[] = [];
    gateway.subscribe((event) => events.push(event));
    const iterator = gateway.readArticle({ article: articleByIndex })[Symbol.asyncIterator]();
    const next = iterator.next();
    emit({ completeness: "incomplete", rawText: "one", revision: 1 });
    emit({ completeness: "incomplete", rawText: "latest", revision: 2 });
    await expect(next).resolves.toMatchObject({ value: { rawText: "latest" } });
    await iterator.return?.();
    expect(signal.aborted).toBe(true);
    expect(restored).toBe(true);
    await expect(gateway.listBoards()).resolves.toMatchObject({ items: [] });
    emit({ completeness: "final", rawText: "too late", revision: 3 });
    expect(events).not.toContainEqual(expect.objectContaining({ source: expect.objectContaining({ rawText: "too late" }) }));
  });
});
