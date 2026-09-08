// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
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
    vi.clearAllMocks();
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
