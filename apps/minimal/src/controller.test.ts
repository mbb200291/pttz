import { describe, expect, it, vi } from "vitest";
import { ok, type Article, type ArticlePage, type CoreEvent, type PttzzzClient, type Result } from "@pttzzz/core";
import { Reader } from "./controller";

const article = (index: number): Article => ({
  key: { board: "Test", index }, title: `Article ${index}`, author: "author", body: "a  b\n c",
  completeness: "final", revision: 1, replies: [], articleEdits: [], revisions: [],
  nativePushCount: 0, nativeBooCount: 0, nativeNeutralCount: 0,
  nativeVotes: { pushCount: 0, booCount: 0, score: 0 }, articleVotes: { pushCount: 0, booCount: 0, score: 0 },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
function setup() {
  const listeners = new Set<(event: CoreEvent) => void>();
  const emit = (event: CoreEvent) => { for (const listener of listeners) listener(event); };
  const unsubscribe = vi.fn();
  const client = {
    connect: vi.fn(async () => ok(undefined)),
    login: vi.fn(async () => { emit({ type: "session.changed", session: { userId: "reader" } }); return ok({ userId: "reader" }); }),
    disconnect: vi.fn(async () => { emit({ type: "session.changed", session: null }); }),
    subscribe: vi.fn((listener: (event: CoreEvent) => void) => { listeners.add(listener); return () => { listeners.delete(listener); unsubscribe(); }; }),
    listBoards: vi.fn(async () => ok({ kind: "boards" as const, items: [{ name: "Test", title: "測試" }], nextCursor: "hot-opaque" })),
    listArticles: vi.fn(async (): Promise<Result<ArticlePage>> => ok({ items: [article(1)], nextCursor: "opaque" })),
    getArticle: vi.fn(async ({ article: key }: { article: { index?: number } }): Promise<Result<Article>> => ok(article(key.index ?? 1))),
  };
  const reader = new Reader(client as unknown as PttzzzClient, vi.fn());
  return { reader, client, emit: (e: CoreEvent) => emit(e), unsubscribe };
}
describe("read-only navigation", () => {
  it("keeps known article identity when a partial lacks headers and offers a retry after failure", async () => {
    const { reader, client, emit } = setup();
    await reader.login("reader", "demo");
    await reader.openBoard("Test");
    client.getArticle.mockImplementationOnce(async () => {
      emit({ type: "article.partial", articleKey: article(1).key, revision: 1,
        article: { key: article(1).key, completeness: "incomplete", revision: 1, body: "部分正文", replies: [] } });
      return { ok: false, error: { code: "GATEWAY_FAILURE", message: "PTT gateway 操作失敗", retryable: true } };
    });
    await reader.openArticle(article(1).key);
    expect(reader.state.article?.title).toBe("Article 1");
    expect(reader.state.article?.author).toBe("author");
    expect(reader.state.article?.completeness).toBe("incomplete");
    expect(reader.state.message).toBe("文章未完整載入，請重新載入。");
    expect(reader.state.busy).toBe(false);
    const pending = deferred<Result<Article>>();
    client.getArticle.mockReturnValueOnce(pending.promise);
    const retry = reader.openArticle(article(1).key);
    expect(reader.state.article?.body).toBe("部分正文");
    pending.resolve(ok(article(1)));
    await retry;
    expect(reader.state.article?.completeness).toBe("final");
    expect(reader.state.error).toBe(false);
  });
  it("returns to both loaded pages without rereading and continues the opaque cursor", async () => {
    const { reader, client } = setup();
    await reader.login("reader", "demo");
    client.listArticles.mockResolvedValueOnce(ok({ items: [article(1)], nextCursor: "page-two" }))
      .mockResolvedValueOnce(ok({ items: [article(2)], nextCursor: "page-three" }))
      .mockResolvedValueOnce(ok({ items: [article(3)] }));
    await reader.openBoard("Test");
    await reader.moreArticles();
    const loaded = reader.state.articles;
    await reader.openArticle(article(2).key);
    reader.returnToBoard();
    expect(reader.state.view).toBe("board");
    expect(reader.state.articles).toBe(loaded);
    expect(reader.state.articleCursor).toBe("page-three");
    expect(reader.state.article).toBeNull();
    expect(reader.state.busy).toBe(false);
    expect(client.listArticles).toHaveBeenCalledTimes(2);
    await reader.moreArticles();
    expect(client.listArticles).toHaveBeenLastCalledWith({ board: "Test", cursor: "page-three", limit: 30 });
    expect(reader.state.articles.map((item) => item.title)).toEqual(["Article 1", "Article 2", "Article 3"]);
    expect(reader.state.articleCursor).toBeUndefined();
  });
  it.each([true, false])("invalidates pending article events and result on return (success=%s)", async (success) => {
    const { reader, client, emit, unsubscribe } = setup();
    await reader.login("reader", "demo");
    await reader.openBoard("Test");
    const pending = deferred<Result<Article>>();
    client.getArticle.mockReturnValueOnce(pending.promise);
    const reading = reader.openArticle(article(1).key);
    reader.returnToBoard();
    const restored = { ...reader.state };
    expect(unsubscribe).toHaveBeenCalledOnce();
    emit({ type: "article.partial", articleKey: article(1).key, revision: 2, article: { ...article(1), completeness: "incomplete", revision: 2 } });
    emit({ type: "article.updated", articleKey: article(1).key, revision: 3, article: { ...article(1), revision: 3 } });
    pending.resolve(success ? ok(article(1)) : { ok: false, error: { code: "READ_FAILED", message: "late failure", retryable: true } });
    await reading;
    expect(reader.state).toEqual(restored);
    expect(client.listArticles).toHaveBeenCalledOnce();
  });
  it("fresh board navigation and session loss do not retain old list state", async () => {
    const { reader, client, emit } = setup();
    await reader.login("reader", "demo");
    await reader.openBoard("Test");
    await reader.openArticle(article(1).key);
    reader.returnToBoard();
    client.listArticles.mockResolvedValueOnce(ok({ items: [] }));
    await reader.openBoard("Other");
    expect(reader.state.articles).toEqual([]);
    expect(reader.state.articleCursor).toBeUndefined();
    emit({ type: "session.changed", session: null });
    reader.returnToBoard();
    expect(reader.state.view).toBe("login");
  });
  it("creates the client lazily and requires a page reload after logout", async () => {
    const first = setup();
    const second = setup();
    const factory = vi.fn().mockReturnValueOnce(first.client).mockReturnValueOnce(second.client);
    const reader = new Reader(factory, vi.fn());
    expect(factory).not.toHaveBeenCalled();
    await reader.login("reader", "demo");
    await reader.logout();
    await reader.login("reader", "demo");
    expect(factory).toHaveBeenCalledOnce();
    expect(second.client.login).not.toHaveBeenCalled();
    expect(reader.state.ended).toBe(true);
  });
  it("resumes an explicit keep decision on the same duplicate-login prompt", async () => {
    const { client } = setup();
    client.login.mockResolvedValueOnce({ ok: false, error: { code: "LOGIN_FAILED", message: "duplicate_login", retryable: false } } as never);
    const factory = vi.fn(() => client as unknown as PttzzzClient);
    const reader = new Reader(factory, vi.fn());
    await reader.login("reader", "demo");
    await reader.login("reader", "demo", false);
    expect(factory).toHaveBeenCalledOnce();
    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.login).toHaveBeenLastCalledWith(expect.objectContaining({ disconnectExistingSession: false }));
    expect(reader.state.user).toBe("reader");
  });
  it("does not revive a successful pending login after disconnection", async () => {
    const { reader, client, emit } = setup();
    const pending = deferred<Result<{ userId: string }>>();
    client.login.mockReturnValueOnce(pending.promise as never);
    const loggingIn = reader.login("reader", "demo");
    await Promise.resolve();
    emit({ type: "connection.changed", status: "disconnected" });
    pending.resolve(ok({ userId: "reader" }));
    await loggingIn;
    expect(reader.state.user).toBeNull();
    expect(reader.state.authenticating).toBe(false);
  });
  it("gates article partial revisions and never regresses a final article", async () => {
    const { reader, client, emit } = setup();
    await reader.login("reader", "demo");
    const pending = deferred<Result<Article>>();
    client.getArticle.mockReturnValueOnce(pending.promise);
    const reading = reader.openArticle(article(1).key);
    emit({ type: "article.partial", articleKey: article(1).key, revision: 2, article: { ...article(1), completeness: "incomplete", revision: 2, body: "partial" } });
    expect(reader.state.article?.body).toBe("partial");
    emit({ type: "article.partial", articleKey: article(1).key, revision: 1, article: { ...article(1), completeness: "incomplete", revision: 1, body: "old" } });
    expect(reader.state.article?.body).toBe("partial");
    pending.resolve(ok({ ...article(1), revision: 3 }));
    await reading;
    emit({ type: "article.partial", articleKey: article(1).key, revision: 4, article: { ...article(1), completeness: "incomplete", revision: 4, body: "late" } });
    expect(reader.state.article?.completeness).toBe("final");
  });
  it("preserves other sessions unless explicitly chosen and clears old data at login", async () => {
    const { reader, client } = setup();
    await reader.login("reader", "not-a-real-password");
    expect(client.login).toHaveBeenLastCalledWith({ username: "reader", password: "not-a-real-password", disconnectExistingSession: false });
    await reader.openBoard("Test");
    await reader.login("reader", "not-a-real-password", true);
    expect(reader.state.articles).toEqual([]);
    expect(reader.state.articleCursor).toBeUndefined();
    expect(client.login).toHaveBeenLastCalledWith(expect.objectContaining({ disconnectExistingSession: true }));
  });
  it("ignores previous articles after a newer navigation and permits same-revision revisits", async () => {
    const { reader, client } = setup();
    await reader.login("reader", "demo");
    const old = deferred<Result<Article>>();
    client.getArticle.mockReturnValueOnce(old.promise);
    const pending = reader.openArticle(article(1).key);
    await reader.openArticle(article(2).key);
    old.resolve(ok(article(1)));
    await pending;
    expect(reader.state.article?.title).toBe("Article 2");
    await reader.openArticle(article(1).key);
    expect(reader.state.article?.title).toBe("Article 1");
  });
  it("invalidates pending lists on logout and clears cursors", async () => {
    const { reader, client } = setup();
    await reader.login("reader", "demo");
    const old = deferred<Result<ArticlePage>>();
    client.listArticles.mockReturnValueOnce(old.promise);
    const pending = reader.openBoard("Test");
    await reader.logout();
    old.resolve(ok({ items: [article(1)], nextCursor: "stale" }));
    await pending;
    expect(reader.state.articles).toEqual([]);
    expect(reader.state.articleCursor).toBeUndefined();
    expect(reader.state.user).toBeNull();
  });
  it("keeps opaque pagination paired with its board and rejects stale board results", async () => {
    const { reader, client } = setup();
    await reader.login("reader", "demo");
    await reader.openBoard("Test");
    await reader.moreArticles();
    expect(client.listArticles).toHaveBeenLastCalledWith({ board: "Test", cursor: "opaque", limit: 30 });
    const old = deferred<Result<ArticlePage>>();
    client.listArticles.mockReturnValueOnce(old.promise);
    const pending = reader.openBoard("Old");
    await reader.openBoard("New");
    old.resolve(ok({ items: [article(3)], nextCursor: "wrong" }));
    await pending;
    expect(reader.state.board).toBe("New");
    expect(reader.state.articles.map((item) => item.title)).not.toContain("Article 3");
  });
  it("shows read errors without substituting other data and invalidates on session loss", async () => {
    const { reader, client, emit, unsubscribe } = setup();
    await reader.login("reader", "demo");
    client.listArticles.mockResolvedValueOnce({ ok: false, error: { code: "READ_FAILED", message: "讀取失敗", retryable: true } });
    await reader.openBoard("Missing");
    expect(reader.state.message).toContain("讀取失敗");
    expect(reader.state.articles).toEqual([]);
    emit({ type: "session.changed", session: null });
    expect(reader.state.view).toBe("login");
    await reader.dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
