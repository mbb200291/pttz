// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { PttzzzClient, type ArticleKey, type PttCommand, type PttGateway } from "@pttzzz/core";
import { stripAnsi } from "@pttzzz/core/internal";
import { createFakeBrowserGateway } from "./testing.js";
import {
  BrowserPttGateway,
  createTerminalGatewayDriverForTesting,
  type GatewayTerminalDriver,
} from "./gateway.js";

type ContractHarness = {
  reset(): void;
  create(): PttGateway;
  articleKey: ArticleKey;
  aidKey: ArticleKey;
};

function allCommands(key: ArticleKey): PttCommand[] {
  return [
    { type: "create-article", board: key.board, category: "問卦", title: "t", content: "b" },
    { type: "edit-article", article: key, content: "new" },
    { type: "delete-article", article: key },
    { type: "reply-article", article: key, content: "push", pushType: "neutral" },
    { type: "reply-article-to-board", article: key, content: "board reply" },
    { type: "reply-floor", article: key, floor: 2, content: "nested", pushType: "push" },
    { type: "edit-floor", article: key, floor: 2, mode: "replace", content: "corrected" },
    { type: "withdraw-floor", article: key, ranges: [{ start: 2, end: 2 }] },
    { type: "vote-article", article: key, direction: "push" },
    { type: "withdraw-article-vote", article: key, direction: "push" },
    { type: "vote-floor", article: key, floor: 2, direction: "boo" },
    { type: "withdraw-floor-vote", article: key, floor: 2, direction: "boo" },
  ];
}

function contractTerminal(): GatewayTerminalDriver {
  let status: "connected" | "closed" = "connected";
  const listeners = new Set<(next: "connected" | "closed") => void>();
  const sent = async () => ({ ok: true as const, outcome: "sent" as const });
  const boards = [
    { name: "test", title: "測試板", category: "測試", favorite: true },
    { name: "topic", title: "主題板", category: "測試" },
  ];
  const rows = [
    { index: 1001, title: "Fake PTT 多帳號互動", author: "opUser", date: "06/01" },
    { index: 1000, title: "Fake PTT 舊文章", author: "opUser", date: "05/31" },
  ];
  return {
    getStatus: () => status,
    subscribeStatus: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    login: async () => {
      status = "connected";
      for (const listener of listeners) listener(status);
      return { ok: true };
    },
    disconnect: async () => {
      status = "closed";
      for (const listener of listeners) listener(status);
    },
    listBoardEntries: async (source) => {
      if (source.kind === "category" && !source.route?.length) {
        return [{ kind: "category", title: "測試", route: [1] }];
      }
      const selected = source.kind === "favorite"
        ? boards.filter((board) => board.favorite)
        : boards;
      return selected.map((board) => ({ kind: "board" as const, board }));
    },
    searchBoardsByPrefix: async (prefix) => boards.filter((board) =>
      board.name.toLowerCase().startsWith(prefix.toLowerCase())),
    listArticles: async (_board, beforeIndex) => rows.filter((row) =>
      beforeIndex === undefined || row.index < beforeIndex),
    searchArticles: async (_board, query, beforeIndex) => rows.filter((row) =>
      (beforeIndex === undefined || row.index < beforeIndex) && row.title.includes(query)),
    searchArticlesByAuthor: async (_board, author, beforeIndex) => rows.filter((row) =>
      (beforeIndex === undefined || row.index < beforeIndex) && row.author === author),
    searchArticlesByAuthorAndKeywords: async (_board, author, keywords, beforeIndex) => rows.filter((row) =>
      (beforeIndex === undefined || row.index < beforeIndex) && row.author === author &&
      keywords.every((keyword) => row.title.includes(keyword))),
    readArticleSource: async (_key, emit) => {
      emit({ completeness: "incomplete", rawText: "partial", revision: 1 });
      emit({ completeness: "final", rawText: "final", revision: 2 });
    },
    postArticle: sent,
    executeArticleCommand: sent,
  } as unknown as GatewayTerminalDriver;
}

const harnesses: readonly [string, ContractHarness][] = [
  ["real transcript", {
    reset: () => undefined,
    create: () => new BrowserPttGateway(
      createTerminalGatewayDriverForTesting(contractTerminal()),
    ),
    articleKey: { board: "test", index: 1001 },
    aidKey: { board: "test", aid: "#FAKE1001" },
  }],
  ["fake storage", {
    reset: () => {
      localStorage.clear();
      sessionStorage.clear();
    },
    create: createFakeBrowserGateway,
    articleKey: { board: "test", index: 1001 },
    aidKey: { board: "test", aid: "#FAKE1001" },
  }],
];

function runGatewayContract(name: string, harness: ContractHarness): void {
  describe(`${name} shared PttGateway contract`, () => {
    it("supports lifecycle and isolates subscribed listeners", async () => {
      harness.reset();
      const gateway = harness.create();
      const events: string[] = [];
      gateway.subscribe(() => { throw new Error("consumer failure"); });
      const stop = gateway.subscribe((event) => events.push(event.type));
      await gateway.connect();
      await expect(gateway.login({ username: "opUser", password: "pw" }))
        .resolves.toEqual({ userId: "opUser" });
      expect(events).toContain("connection.changed");
      expect(events).toContain("session.changed");
      stop();
      const before = events.length;
      await gateway.disconnect();
      expect(events).toHaveLength(before);
    });

    it("supports board list/search/filter pagination and session-scoped cursors", async () => {
      harness.reset();
      const gateway = harness.create();
      await gateway.login({ username: "alice", password: "pw" });
      const first = await gateway.listBoards({ source: { kind: "hot" }, limit: 1 });
      expect(first.kind).toBe("boards");
      expect(first.items).toHaveLength(1);
      expect(first.nextCursor).toBeTruthy();
      await expect(gateway.listBoards({
        source: { kind: "hot" }, limit: 1, cursor: first.nextCursor,
      })).resolves.toMatchObject({ kind: "boards", items: [expect.any(Object)] });
      await expect(gateway.listBoards({
        source: { kind: "hot" }, limit: 2, cursor: first.nextCursor,
      })).rejects.toMatchObject({ code: "INVALID_CURSOR" });
      await expect(gateway.searchBoards({ prefix: "te" }))
        .resolves.toMatchObject({ items: [expect.objectContaining({ name: "test" })] });
      await expect(gateway.searchBoards({ prefix: " " }))
        .rejects.toMatchObject({ code: "INVALID_INPUT", retryable: false });
      const root = await gateway.listBoards({ source: { kind: "category" } });
      expect(root.kind).toBe("directory");
      if (root.kind !== "directory") throw new Error("expected category directory");
      const category = root.items.find((entry) =>
        entry.kind === "category" && entry.title === "測試");
      if (!category || category.kind !== "category") throw new Error("missing test category");
      await expect(gateway.filterBoards({
        favorite: true, categoryCursor: category.categoryCursor,
      })).resolves.toMatchObject({ items: [expect.objectContaining({ name: "test" })] });
      await gateway.login({ username: "bob", password: "pw" });
      await expect(gateway.filterBoards({ categoryCursor: category.categoryCursor }))
        .rejects.toMatchObject({ code: "INVALID_CURSOR", retryable: false });
    });

    it("supports article list/search/filter and input validation", async () => {
      harness.reset();
      const gateway = harness.create();
      await gateway.login({ username: "alice", password: "pw" });
      await expect(gateway.listArticles({ board: "test", limit: 1 }))
        .resolves.toMatchObject({ items: [expect.objectContaining({ author: "opUser" })] });
      await expect(gateway.searchArticles({ board: "test", query: "多帳號" }))
        .resolves.toMatchObject({ items: [expect.objectContaining({ author: "opUser" })] });
      await expect(gateway.filterArticles({ board: "test", author: "opUser", keyword: "互動" }))
        .resolves.toMatchObject({
          items: [expect.objectContaining({ title: expect.stringContaining("互動") })],
        });
      await expect(gateway.searchArticles({ board: "test", query: " " }))
        .rejects.toMatchObject({ code: "INVALID_INPUT" });
    });

    it.each(["articleKey", "aidKey"] as const)(
      "streams incomplete/final with exact %s",
      async (keyName) => {
        harness.reset();
        const gateway = harness.create();
        const key = harness[keyName];
        const events: string[] = [];
        gateway.subscribe((event) => events.push(event.type));
        const sources = [];
        for await (const source of gateway.readArticle({ article: key })) sources.push(source);
        expect(sources.map((source) => source.completeness)).toEqual(["incomplete", "final"]);
        expect(sources.every((source) => source.articleKey === key)).toBe(true);
        expect(events).toEqual(["article.source", "article.source"]);
      },
    );

    it("dispatches all 12 commands with sent receipts", async () => {
      for (const command of allCommands(harness.articleKey)) {
        harness.reset();
        const gateway = harness.create();
        await gateway.login({ username: "opUser", password: "pw" });
        await expect(gateway.execute(command)).resolves.toEqual({ ok: true, outcome: "sent" });
      }
    });

    it("normalizes validation failures as non-retryable not-sent receipts", async () => {
      harness.reset();
      const gateway = harness.create();
      await expect(gateway.execute({
        type: "edit-floor", article: harness.articleKey, floor: 0,
        mode: "replace", content: "invalid",
      })).resolves.toMatchObject({
        ok: false, outcome: "not-sent", retryable: false,
      });
    });
  });
}

for (const [name, harness] of harnesses) runGatewayContract(name, harness);

it("stores formatted fake create/edit/reply as ANSI with a lossless plain text projection", async () => {
  localStorage.clear();
  const gateway = createFakeBrowserGateway();
  const client = new PttzzzClient(gateway);
  await client.connect();
  await client.login({ username: "opUser", password: "fake" });
  const formatting = [{ start: 0, end: 3, color: 31 as const, bold: true }];
  const key = { board: "test", index: 1001 };
  for (const command of [
    { type: "create-article", board: "test", title: "formatted", content: "red text", formatting },
    { type: "edit-article", article: key, content: "red edit", formatting },
    { type: "reply-article-to-board", article: key, content: "red reply", formatting },
  ] satisfies PttCommand[]) {
    await expect(gateway.execute(command)).resolves.toEqual({ ok: true, outcome: "sent" });
    const page = await client.listArticles({ board: "test" });
    expect(page.ok).toBe(true);
    if (!page.ok) throw new Error("missing list");
    const target = command.type === "edit-article" ? key : page.value.items[0].key;
    const sources = [];
    for await (const source of gateway.readArticle({ article: target })) sources.push(source);
    expect(sources.at(-1)?.rawText).toContain("\x1b[0;1;31mred\x1b[0m");
    expect(sources.at(-1)?.rawText).not.toContain("\x15");
    const article = await client.getArticle({ article: target });
    expect(article.ok).toBe(true);
    if (!article.ok) throw new Error("missing article");
    // The public body preserves source ANSI; the reference UI strips it for plain reading.
    expect(stripAnsi(article.value.body)).toContain(command.content);
    expect(article.value.body).not.toContain("\x15");
  }
  await client.disconnect();
});

it("rejects caller terminal controls before mutating formatted fake storage", async () => {
  localStorage.clear();
  const gateway = createFakeBrowserGateway();
  await gateway.login({ username: "opUser", password: "fake" });
  const before = localStorage.getItem("pttzzz_fake_ptt_store_v1");
  await expect(gateway.execute({ type: "create-article", board: "test", title: "unsafe", content: "red\x15[31m", formatting: [{ start: 0, end: 3, color: 31 }] }))
    .resolves.toMatchObject({ ok: false, code: "INVALID_INPUT", outcome: "not-sent" });
  expect(localStorage.getItem("pttzzz_fake_ptt_store_v1")).toBe(before);
  await gateway.disconnect();
});

it.each(["edit-article", "reply-article-to-board"] as const)("rejects formatted blank fake %s before storage changes", async (type) => {
  localStorage.clear();
  const gateway = createFakeBrowserGateway();
  await gateway.login({ username: "opUser", password: "fake" });
  const before = localStorage.getItem("pttzzz_fake_ptt_store_v1");
  await expect(gateway.execute({ type, article: { board: "test", index: 1001 }, content: "   ", formatting: [{ start: 0, end: 3, bold: true }] }))
    .resolves.toMatchObject({ ok: false, outcome: "not-sent" });
  expect(localStorage.getItem("pttzzz_fake_ptt_store_v1")).toBe(before);
  await gateway.disconnect();
});

function supplementalTerminal() {
  const methods = {
    getStatus: () => "connected" as const,
    subscribeStatus: () => () => undefined,
    login: vi.fn(async () => ({ ok: true as const })),
    disconnect: vi.fn(async () => undefined),
    postArticle: vi.fn(async () => ({ ok: true as const, outcome: "sent" as const })),
    executeArticleCommand: vi.fn(async () => ({ ok: true as const, outcome: "sent" as const })),
  };
  return { methods, driver: methods as unknown as GatewayTerminalDriver };
}

describe("real terminal gateway supplemental contract", () => {
  it("preserves not-sent and uncertain outcomes for every command", async () => {
    for (const outcome of ["not-sent", "uncertain"] as const) {
      const { methods, driver } = supplementalTerminal();
      const failure = { ok: false as const, outcome, reason: outcome, retryable: false };
      methods.postArticle.mockResolvedValue(failure as never);
      methods.executeArticleCommand.mockResolvedValue(failure as never);
      const gateway = new BrowserPttGateway(createTerminalGatewayDriverForTesting(driver));
      for (const command of allCommands({ board: "Test", index: 12 })) {
        await expect(gateway.execute(command)).resolves.toMatchObject({
          ok: false, outcome, retryable: false,
        });
      }
    }
  });

  it("normalizes legacy ambiguity and enforces retryability boundaries", async () => {
    const { methods, driver } = supplementalTerminal();
    methods.executeArticleCommand
      .mockResolvedValueOnce({ ok: false, outcome: "not-sent", reason: "invalid" } as never)
      .mockResolvedValueOnce({ ok: false, outcome: "not-sent", reason: "prompt", retryable: true } as never)
      .mockResolvedValueOnce({ ok: false, reason: "legacy ambiguity" } as never)
      .mockResolvedValueOnce({ ok: false, outcome: "uncertain", reason: "timeout", retryable: true } as never)
      .mockResolvedValueOnce({ ok: false, outcome: "sent", reason: "rejected", retryable: true } as never);
    const gateway = new BrowserPttGateway(createTerminalGatewayDriverForTesting(driver));
    const command: PttCommand = {
      type: "reply-article", article: { board: "Test", index: 1 },
      content: "x", pushType: "neutral",
    };
    await expect(gateway.execute(command)).resolves.toMatchObject({ outcome: "not-sent", retryable: false });
    await expect(gateway.execute(command)).resolves.toMatchObject({ outcome: "not-sent", retryable: true });
    await expect(gateway.execute(command)).resolves.toMatchObject({ outcome: "uncertain", retryable: false });
    await expect(gateway.execute(command)).resolves.toMatchObject({ outcome: "uncertain", retryable: false });
    await expect(gateway.execute(command)).resolves.toMatchObject({ outcome: "sent", retryable: false });
  });

  it("forwards category, edit summary, and board-reply commands exactly", async () => {
    const { methods, driver } = supplementalTerminal();
    const gateway = new BrowserPttGateway(createTerminalGatewayDriverForTesting(driver));
    const key = { board: "Test", aid: "#abc" } as const;
    await gateway.execute({
      type: "create-article", board: "Test", category: "問卦", title: "title", content: "body",
    });
    await gateway.execute({ type: "edit-article", article: key, content: "new" });
    await gateway.execute({ type: "reply-article-to-board", article: key, content: "response" });
    expect(methods.postArticle).toHaveBeenCalledWith("Test", "問卦", "title", "body", undefined);
    expect(methods.executeArticleCommand).toHaveBeenNthCalledWith(1, {
      type: "edit-article", article: key, content: "new",
    });
    expect(methods.executeArticleCommand).toHaveBeenNthCalledWith(2, {
      type: "reply-article-to-board", article: key, content: "response",
    });
  });

  it("preserves optional article formatting through create, edit and board-reply dispatch", async () => {
    const { methods, driver } = supplementalTerminal();
    const gateway = new BrowserPttGateway(createTerminalGatewayDriverForTesting(driver));
    const article = { board: "Test", index: 12 };
    const formatting = [{ start: 0, end: 2, bold: true, color: 31 as const }];
    await gateway.execute({ type: "create-article", board: "Test", title: "title", content: "body", formatting });
    expect(methods.postArticle).toHaveBeenCalledWith("Test", "", "title", "body", formatting);
    for (const type of ["edit-article", "reply-article-to-board"] as const) {
      const command = { type, article, content: "body", formatting };
      await gateway.execute(command);
      expect(methods.executeArticleCommand).toHaveBeenLastCalledWith(command);
    }
  });

  it("routes native author and combined author/title searches", async () => {
    const author = vi.fn(async () => []);
    const combined = vi.fn(async () => []);
    const transport = createTerminalGatewayDriverForTesting({
      searchArticlesByAuthor: author,
      searchArticlesByAuthorAndKeywords: combined,
    } as unknown as GatewayTerminalDriver);
    await transport.listArticles?.({ board: "Test", author: "alice", beforeIndex: 10 });
    await transport.listArticles?.({ board: "Test", author: "alice", keyword: "topic" });
    expect(author).toHaveBeenCalledWith("Test", "alice", 10);
    expect(combined).toHaveBeenCalledWith("Test", "alice", ["topic"], undefined);
  });

  it("routes native score and combined title/score filters", async () => {
    const score = vi.fn(async () => []);
    const combined = vi.fn(async () => []);
    const transport = createTerminalGatewayDriverForTesting({
      filterArticlesByPush: score,
      filterArticlesByTitleAndPush: combined,
    } as unknown as GatewayTerminalDriver);
    await transport.listArticles?.({ board: "Test", minimumNativeScore: 10, beforeIndex: 20 });
    await transport.listArticles?.({ board: "Test", keyword: "topic", minimumNativeScore: 5 });
    expect(score).toHaveBeenCalledWith("Test", 10, 20);
    expect(combined).toHaveBeenCalledWith("Test", ["topic"], 5, undefined);
  });

  it("continues terminal pages until the requested gateway page is filled", async () => {
    const listArticles = vi.fn(async (_board: string, before?: number) => before
      ? [{ index: 9, title: "older", author: "b", date: "date" }]
      : [{ index: 10, title: "newer", author: "a", date: "date" }]);
    const transport = createTerminalGatewayDriverForTesting({
      listArticles,
    } as unknown as GatewayTerminalDriver);
    await expect(transport.listArticles?.({ board: "Test", limit: 2 })).resolves.toHaveLength(2);
    expect(listArticles).toHaveBeenNthCalledWith(1, "Test", undefined);
    expect(listArticles).toHaveBeenNthCalledWith(2, "Test", 10);
  });

  it("excludes overlapping terminal rows and pinned rows from older cursor pages", async () => {
    const row = (index: number, fixed = false) => ({ index, fixed, title: String(index), author: "a", date: "1/1" });
    const listArticles = vi.fn(async (_board: string, before?: number) => {
      if (before === undefined) return [row(999, true), row(10), row(9)];
      if (before >= 9) return [row(999, true), row(10), row(9), row(8), row(7)];
      return [row(8), row(7), row(6), row(5), row(4)];
    });
    const gateway = new BrowserPttGateway(createTerminalGatewayDriverForTesting({ listArticles } as unknown as GatewayTerminalDriver));
    const first = await gateway.listArticles({ board: "Test", limit: 3 });
    expect(first.items.map((item) => item.key.index)).toEqual([999, 10, 9]);
    const second = await gateway.listArticles({ board: "Test", limit: 3, cursor: first.nextCursor });
    expect(second.items.map((item) => item.key.index)).toEqual([8, 7, 6]);
    expect(second.nextCursor).toBeTruthy();
    const third = await gateway.listArticles({ board: "Test", limit: 3, cursor: second.nextCursor });
    expect(third.items.map((item) => item.key.index)).toEqual([5, 4]);
    expect(third.nextCursor).toBeUndefined();
  });

  it("intersects author with native score filtering across terminal pages", async () => {
    const score = vi.fn(async (_board: string, _keywords: string[], _minimum: number, before?: number) => before
      ? [
          { index: 10, title: "topic older", author: "alice", date: "date" },
          { index: 9, title: "topic other", author: "bob", date: "date" },
        ]
      : [
          { index: 12, title: "topic newest", author: "bob", date: "date" },
          { index: 11, title: "topic match", author: "alice", date: "date" },
        ]);
    const gateway = new BrowserPttGateway(createTerminalGatewayDriverForTesting({
      filterArticlesByTitleAndPush: score,
    } as unknown as GatewayTerminalDriver));

    const first = await gateway.filterArticles({
      board: "Test",
      author: " Alice ",
      keyword: "topic",
      minimumNativeScore: 10,
      limit: 1,
    });
    expect(first.items).toMatchObject([{ key: { index: 11 }, author: "alice" }]);
    expect(first.nextCursor).toEqual(expect.any(String));
    await expect(gateway.filterArticles({
      board: "Test",
      author: " ALICE ",
      keyword: "topic",
      minimumNativeScore: 10,
      limit: 1,
      cursor: first.nextCursor,
    })).resolves.toMatchObject({ items: [{ key: { index: 10 }, author: "alice" }] });
    expect(score).toHaveBeenNthCalledWith(1, "Test", ["topic"], 10, undefined);
    expect(score).toHaveBeenNthCalledWith(2, "Test", ["topic"], 10, 11);
  });

  it("keeps noncontiguous withdrawal ranges in one atomic driver command", async () => {
    const { methods, driver } = supplementalTerminal();
    const gateway = new BrowserPttGateway(createTerminalGatewayDriverForTesting(driver));
    const ranges = [{ start: 2, end: 2 }, { start: 4, end: 4 }];
    await gateway.execute({
      type: "withdraw-floor", article: { board: "Test", index: 12 }, ranges,
    });
    expect(methods.executeArticleCommand).toHaveBeenCalledOnce();
    expect(methods.executeArticleCommand).toHaveBeenCalledWith(expect.objectContaining({ ranges }));
  });

  it("rejects invalid withdrawal ranges before invoking the driver", async () => {
    const { methods, driver } = supplementalTerminal();
    const gateway = new BrowserPttGateway(createTerminalGatewayDriverForTesting(driver));
    await expect(gateway.execute({
      type: "withdraw-floor", article: { board: "Test", index: 12 },
      ranges: [{ start: 4, end: 2 }],
    })).resolves.toMatchObject({ ok: false, outcome: "not-sent", retryable: false });
    expect(methods.executeArticleCommand).not.toHaveBeenCalled();
  });
});

describe("fake gateway supplemental contract", () => {
  it("targets writes by opaque AID and rejects an unknown AID without mutation", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const gateway = createFakeBrowserGateway();
    await gateway.login({ username: "alice", password: "pw" });
    for await (const _source of gateway.readArticle({
      article: { board: "test", aid: "#FAKE1001" },
    })) { /* consume */ }
    await expect(gateway.execute({
      type: "reply-article", article: { board: "test", aid: "FAKE1001" },
      content: "opaque aid reply", pushType: "neutral",
    })).resolves.toEqual({ ok: true, outcome: "sent" });
    const afterWrite = JSON.parse(localStorage.getItem("pttzzz_fake_ptt_store_v1") ?? "null");
    const target = afterWrite.boards.test.articles.find((item: { aid: string }) =>
      item.aid === "FAKE1001");
    expect(target.rawPushes.at(-1).content).toBe("opaque aid reply");
    const count = target.rawPushes.length;
    await expect(gateway.execute({
      type: "reply-article", article: { board: "test", aid: "#missing-aid" },
      content: "must not write", pushType: "neutral",
    })).resolves.toMatchObject({ ok: false, outcome: "not-sent" });
    const afterReject = JSON.parse(localStorage.getItem("pttzzz_fake_ptt_store_v1") ?? "null");
    expect(afterReject.boards.test.articles.find((item: { aid: string }) =>
      item.aid === "FAKE1001").rawPushes).toHaveLength(count);
  });

  it("returns non-retryable not-sent for a missing article target", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const gateway = createFakeBrowserGateway();
    await gateway.login({ username: "alice", password: "pw" });
    await expect(gateway.execute({
      type: "reply-article", article: { board: "test", index: 9999 },
      content: "missing", pushType: "neutral",
    })).resolves.toMatchObject({
      ok: false, outcome: "not-sent", retryable: false,
    });
  });
});
