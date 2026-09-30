// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PttzzzClient } from "@pttzzz/core";
import { useBoard } from "../useBoard";
import { usePttSocketStore } from "../usePttSocket";
import {
  clearPttViewCache,
  writeBoardAnchorCache,
  writeBoardCache,
} from "../../lib/ptt/viewCache";

const listArticles = vi.fn();
const searchArticles = vi.fn();
const filterArticles = vi.fn();
const client = { listArticles, searchArticles, filterArticles } as unknown as PttzzzClient;
const summary = (index: number) => ({
  key: { board: "Test", index } as const,
  title: `article-${index}`,
  author: "author",
});

describe("useBoard public client reads", () => {
  beforeEach(() => {
    cleanup();
    vi.resetAllMocks();
    clearPttViewCache();
    usePttSocketStore.setState({ client, pttState: "ready" });
  });

  it("uses Result pagination cursors without terminal offsets", async () => {
    listArticles
      .mockResolvedValueOnce({ ok: true, value: { items: [summary(2)], nextCursor: "next" } })
      .mockResolvedValueOnce({ ok: true, value: { items: [summary(1)] } });
    const { result } = renderHook(() => useBoard("Test"));
    await waitFor(() => expect(result.current.articles).toHaveLength(1));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.articles).toHaveLength(2));
    expect(listArticles).toHaveBeenNthCalledWith(2, { board: "Test", cursor: "next" });
  });

  it("sorts out-of-order load-more results by article index", async () => {
    listArticles
      .mockResolvedValueOnce({ ok: true, value: { items: [summary(10)], nextCursor: "next" } })
      .mockResolvedValueOnce({ ok: true, value: { items: [summary(8), summary(9)] } });
    const { result } = renderHook(() => useBoard("Test"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.articles).toHaveLength(3));

    expect(result.current.articles.map((item) => item.key.index)).toEqual([10, 9, 8]);
  });

  it("sorts out-of-order refresh results before retaining proven older rows", async () => {
    listArticles
      .mockResolvedValueOnce({ ok: true, value: { items: [summary(10), summary(9)], nextCursor: "older" } })
      .mockResolvedValueOnce({ ok: true, value: { items: [summary(10), summary(11)], nextCursor: "older" } });
    const { result } = renderHook(() => useBoard("Test"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.refreshing).toBe(false));

    expect(result.current.articles.map((item) => item.key.index)).toEqual([11, 10, 9]);
  });

  it("discards older cached pages when deletion reassigns an overlapping index", async () => {
    listArticles
      .mockResolvedValueOnce({ ok: true, value: { items: [summary(10), summary(9), summary(8)], nextCursor: "old" } })
      .mockResolvedValueOnce({ ok: true, value: { items: [{ ...summary(9), title: "article-10" }], nextCursor: "fresh" } })
      .mockResolvedValueOnce({ ok: true, value: { items: [{ ...summary(8), title: "article-9" }] } });
    const { result } = renderHook(() => useBoard("Test"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.refreshing).toBe(false));
    expect(result.current.articles.map(item => item.title)).toEqual(["article-10"]);
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.articles).toHaveLength(2));
    expect(listArticles).toHaveBeenLastCalledWith({ board: "Test", cursor: "fresh" });
    expect(result.current.articles.map(item => item.title)).toEqual(["article-10", "article-9"]);
  });

  it("reloads the latest page when load-more detects an index reassignment", async () => {
    listArticles
      .mockResolvedValueOnce({ ok: true, value: { items: [summary(10), summary(9)], nextCursor: "old" } })
      .mockResolvedValueOnce({ ok: true, value: { items: [{ ...summary(9), title: "moved" }], nextCursor: "stale" } })
      .mockResolvedValueOnce({ ok: true, value: { items: [{ ...summary(9), title: "moved" }, summary(8)], nextCursor: "fresh" } });
    const { result } = renderHook(() => useBoard("Test"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(listArticles).toHaveBeenCalledTimes(3);
    expect(listArticles).toHaveBeenLastCalledWith({ board: "Test", cursor: undefined });
    expect(result.current.articles.map(item => item.title)).toEqual(["moved", "article-8"]);
  });

  it("reloads the latest page when the gateway rejects a moved cursor anchor", async () => {
    listArticles
      .mockResolvedValueOnce({ ok: true, value: { items: [summary(10), summary(9)], nextCursor: "old" } })
      .mockResolvedValueOnce({ ok: false, error: { code: "STALE_CURSOR", message: "文章列表已變更", retryable: true } })
      .mockResolvedValueOnce({ ok: true, value: { items: [{ ...summary(9), title: "moved" }], nextCursor: "fresh" } });
    const { result } = renderHook(() => useBoard("Test"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(listArticles).toHaveBeenCalledTimes(3);
    expect(result.current.articles.map(item => item.title)).toEqual(["moved"]);
    expect(result.current.error).toBeNull();
  });

  it("keeps pagination retryable and clears a transient load-more error after recovery", async () => {
    listArticles
      .mockResolvedValueOnce({ ok: true, value: { items: [summary(10)], nextCursor: "next" } })
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "ARTICLE_PAGE_STALLED", message: "文章列表尚未更新，請再試一次", retryable: true },
      })
      .mockResolvedValueOnce({ ok: true, value: { items: [summary(9)], nextCursor: "older" } });
    const { result } = renderHook(() => useBoard("Test"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.error).toBe("文章列表尚未更新，請再試一次"));
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.articles).toHaveLength(2));
    expect(result.current.error).toBeNull();
    expect(result.current.hasMore).toBe(true);
  });

  it("maps search and score filters to public commands", async () => {
    searchArticles.mockResolvedValue({ ok: true, value: { items: [] } });
    filterArticles.mockResolvedValue({ ok: true, value: { items: [] } });
    const searchFilter = { type: "search" as const, keywords: ["one", "two"] };
    const search = renderHook(() => useBoard("Test", searchFilter));
    await waitFor(() => expect(searchArticles).toHaveBeenCalledWith({
      board: "Test", query: "one two", cursor: undefined,
    }));
    search.unmount();

    const pushFilter = { type: "push" as const, threshold: 10 };
    renderHook(() => useBoard("Test", pushFilter));
    await waitFor(() => expect(filterArticles).toHaveBeenCalledWith({
      board: "Test", minimumNativeScore: 10, cursor: undefined,
    }));
  });

  it("deduplicates load-more callbacks before React renders loading state", async () => {
    listArticles.mockResolvedValueOnce({ ok: true, value: { items: [summary(10)], nextCursor: "older" } });
    listArticles.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useBoard("Test"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.loadMore(); result.current.loadMore(); });
    expect(listArticles).toHaveBeenCalledTimes(2);
  });

  it("retains the usable older cursor when refresh fails", async () => {
    listArticles
      .mockResolvedValueOnce({ ok: true, value: { items: [summary(10)], nextCursor: "older" } })
      .mockResolvedValueOnce({ ok: false, error: { message: "temporary failure" } })
      .mockResolvedValueOnce({ ok: true, value: { items: [summary(9)] } });
    const { result } = renderHook(() => useBoard("Test"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.error).toBe("temporary failure"));
    act(() => result.current.loadMore());
    await waitFor(() => expect(listArticles).toHaveBeenCalledTimes(3));
    expect(listArticles).toHaveBeenLastCalledWith({ board: "Test", cursor: "older" });
    expect(result.current.articles.map((item) => item.key.index)).toEqual([10, 9]);
  });

  it("preserves pagination when an empty refresh keeps the displayed articles", async () => {
    listArticles
      .mockResolvedValueOnce({ ok: true, value: { items: [summary(10)], nextCursor: "older" } })
      .mockResolvedValueOnce({ ok: true, value: { items: [] } })
      .mockResolvedValueOnce({ ok: true, value: { items: [summary(9)] } });
    const { result } = renderHook(() => useBoard("Test"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.refresh(); result.current.refresh(); });
    expect(listArticles).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.refreshing).toBe(false));
    act(() => result.current.loadMore());
    await waitFor(() => expect(listArticles).toHaveBeenCalledTimes(3));
    expect(listArticles).toHaveBeenLastCalledWith({ board: "Test", cursor: "older" });
  });

  it("does not declare cached articles exhausted before deferred revalidation has supplied a cursor", async () => {
    writeBoardCache("Test", [summary(10)]);
    writeBoardAnchorCache("Test", { articleIndex: 10, scrollY: 0, viewportTop: 0 });
    const { result, unmount } = renderHook(() => useBoard("Test"));
    act(() => result.current.loadMore());
    expect(result.current.hasMore).toBe(true);
    unmount();
  });

  it("does not declare cached articles exhausted when revalidation temporarily fails", async () => {
    writeBoardCache("Test", [summary(10)]);
    listArticles.mockResolvedValueOnce({
      ok: false,
      error: { code: "TEMPORARY", message: "temporary failure", retryable: true },
    });
    const { result } = renderHook(() => useBoard("Test"));

    await waitFor(() => expect(result.current.error).toBe("temporary failure"));

    expect(result.current.articles.map((item) => item.key.index)).toEqual([10]);
    expect(result.current.hasMore).toBe(true);
  });

  it("puts authoritative refresh order first and retains only older cached rows", async () => {
    writeBoardCache("Test", [
      { ...summary(13), pinned: true },
      summary(12),
      summary(10),
      summary(9),
    ]);
    listArticles.mockResolvedValue({
      ok: true,
      value: { items: [{ ...summary(11), pinned: true }, summary(10)] },
    });

    const { result } = renderHook(() => useBoard("Test"));
    await waitFor(() => expect(result.current.articles.map((item) =>
      "index" in item.key ? item.key.index : 0)).toEqual([11, 10, 9]));
    expect(result.current.articles[0]?.pinned).toBe(true);
  });

  it("ignores a delayed revalidation after a manual refresh supersedes it", async () => {
    vi.useFakeTimers();
    writeBoardCache("Test", [summary(10)]);
    writeBoardAnchorCache("Test", { articleIndex: 10, scrollY: 0, viewportTop: 0 });
    const resolvers: Array<(value: unknown) => void> = [];
    listArticles.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    const { result } = renderHook(() => useBoard("Test"));

    await act(async () => { vi.advanceTimersByTime(15000); });
    expect(resolvers).toHaveLength(1);
    act(() => result.current.refresh());
    expect(resolvers).toHaveLength(2);
    await act(async () => resolvers[1]({ ok: true, value: { items: [summary(11)] } }));
    expect(result.current.articles.map((item) => "index" in item.key ? item.key.index : 0)).toEqual([11, 10]);
    await act(async () => resolvers[0]({ ok: true, value: { items: [summary(8)] } }));
    expect(result.current.articles.map((item) => "index" in item.key ? item.key.index : 0)).toEqual([11, 10]);
    vi.useRealTimers();
  });

  it("surfaces Result errors and ignores late completion after unmount", async () => {
    let resolve!: (value: unknown) => void;
    listArticles.mockReturnValue(new Promise((next) => { resolve = next; }));
    const hook = renderHook(() => useBoard("Test"));
    hook.unmount();
    resolve({ ok: false, error: { code: "FAIL", message: "late", retryable: true } });
    await Promise.resolve();
    expect(listArticles).toHaveBeenCalledOnce();
  });
});
