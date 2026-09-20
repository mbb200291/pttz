/**
 * useBoard
 *
 * 透過 public PttzzzClient DTO 讀取看板文章列表。
 * 支援一般列表、標題搜尋（/keyword）、推噓文數篩選（Z threshold）。
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { articleKeyId, type ArticlePage, type ArticleSummary } from "@pttzzz/core";
import { usePttSocketStore } from "./usePttSocket";
import type { ArticleSummary as LegacyArticleSummary } from "../lib/ptt/uiArticle";
import {
  readBoardAnchorCache,
  readBoardCache,
  writeBoardCache,
  readFilteredBoardCache,
  writeFilteredBoardCache,
} from "../lib/ptt/viewCache";
import type { BoardFilter } from "../lib/ptt/viewState";

export type { BoardFilter };

export interface UseBoardReturn {
  articles: ArticleSummary[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
}

export const BOARD_CACHE_REVALIDATE_DELAY_MS = 15000;
const BOARD_WINDOW_INDEX_GAP_LIMIT = 1000;

export function getBoardCacheRevalidateDelayMs(
  cachedArticleCount: number,
  hasFilter: boolean,
  hasReturnAnchor = false,
): number {
  return cachedArticleCount > 0 && !hasFilter && hasReturnAnchor
    ? BOARD_CACHE_REVALIDATE_DELAY_MS
    : 0;
}

export function mergeBoardArticles(
  previous: LegacyArticleSummary[],
  incoming: LegacyArticleSummary[],
): LegacyArticleSummary[] {
  const previousNormalIndexes = previous
    .filter((article) => !article.fixed)
    .map((article) => article.index);
  const incomingToMerge =
    previousNormalIndexes.length === 0
      ? incoming
      : incoming.filter((article) => {
          if (article.fixed) return true;
          return previousNormalIndexes.some(
            (index) =>
              Math.abs(article.index - index) <= BOARD_WINDOW_INDEX_GAP_LIMIT,
          );
        });
  const map = new Map(previous.map((article) => [article.index, article]));
  incomingToMerge.forEach((article) => map.set(article.index, article));
  return sortBoardArticles(Array.from(map.values()));
}

export function refreshCachedBoardArticles(
  cached: LegacyArticleSummary[],
  incoming: LegacyArticleSummary[],
): LegacyArticleSummary[] {
  if (incoming.length === 0) return cached;

  const cachedByIndex = new Map(cached.map((article) => [article.index, article]));
  const incomingByIndex = new Map(
    incoming.map((article) => [article.index, article]),
  );
  const cachedNormalIndexes = cached
    .filter((article) => !article.fixed)
    .map((article) => article.index);
  const incomingNormalIndexes = incoming
    .filter((article) => !article.fixed)
    .map((article) => article.index);
  const overlappingIndexes = incoming
    .filter((article) => !article.fixed)
    .map((article) => article.index)
    .filter((index) => cachedByIndex.has(index));

  if (overlappingIndexes.length === 0) {
    const cachedNormalMin = Math.min(...cachedNormalIndexes);
    const incomingNormalMax = Math.max(...incomingNormalIndexes);
    if (
      cachedNormalIndexes.length > 0 &&
      incomingNormalIndexes.length > 0 &&
      cachedNormalMin - incomingNormalMax > BOARD_WINDOW_INDEX_GAP_LIMIT
    ) {
      return sortBoardArticles(cached);
    }
    return sortBoardArticles(incoming);
  }

  const visibleWindowRadius = 40;
  const isNearVisibleWindow = (article: LegacyArticleSummary) =>
    Boolean(article.fixed) ||
    overlappingIndexes.some(
      (index) => Math.abs(article.index - index) <= visibleWindowRadius,
    );

  const refreshed = cached
    .map((article) => incomingByIndex.get(article.index) ?? article)
    .filter(isNearVisibleWindow);

  const refreshedByIndex = new Map(
    refreshed.map((article) => [article.index, article]),
  );
  for (const article of incoming) {
    if (refreshedByIndex.has(article.index) || !isNearVisibleWindow(article)) {
      continue;
    }
    refreshedByIndex.set(article.index, article);
  }

  return sortBoardArticles(Array.from(refreshedByIndex.values()));
}

export function sortBoardArticles(articles: LegacyArticleSummary[]): LegacyArticleSummary[] {
  return [...articles].sort((a, b) => {
    if (Boolean(a.fixed) !== Boolean(b.fixed)) {
      return a.fixed ? -1 : 1;
    }
    return b.index - a.index;
  });
}

export function getNextBoardLoadMoreOffset(
  articles: LegacyArticleSummary[],
): number | null {
  const normalIndexes = articles
    .filter((article) => !article.fixed)
    .map((article) => article.index);
  if (normalIndexes.length === 0) return null;
  return Math.min(...normalIndexes) - 1;
}

function appendCoreArticles(
  previous: ArticleSummary[],
  incoming: readonly ArticleSummary[],
): ArticleSummary[] {
  const merged = new Map(previous.map((article) => [articleKeyId(article.key), article]));
  for (const article of incoming) merged.set(articleKeyId(article.key), article);
  return sortCoreArticles([...merged.values()]);
}

function sortCoreArticles(articles: readonly ArticleSummary[]): ArticleSummary[] {
  return articles
    .map((article, order) => ({ article, order }))
    .sort((left, right) => {
      const leftPinned = Boolean(left.article.pinned);
      const rightPinned = Boolean(right.article.pinned);
      if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
      const leftIndex = "index" in left.article.key ? left.article.key.index : undefined;
      const rightIndex = "index" in right.article.key ? right.article.key.index : undefined;
      if (typeof leftIndex === "number" && typeof rightIndex === "number") {
        return rightIndex - leftIndex;
      }
      return left.order - right.order;
    })
    .map(({ article }) => article);
}

function refreshCoreArticles(
  previous: ArticleSummary[],
  incoming: readonly ArticleSummary[],
): ArticleSummary[] {
  const incomingIds = new Set(incoming.map((article) => articleKeyId(article.key)));
  const incomingIndexes = incoming.flatMap((article) =>
    !article.pinned && typeof article.key.index === "number" ? [article.key.index] : []
  );
  const oldestIncoming = incomingIndexes.length ? Math.min(...incomingIndexes) : null;
  const provenOlder = oldestIncoming === null ? [] : previous.filter((article) =>
    !article.pinned && typeof article.key.index === "number" && article.key.index < oldestIncoming &&
    !incomingIds.has(articleKeyId(article.key))
  );
  return sortCoreArticles([...incoming, ...provenOlder]);
}

export function useBoard(
  boardName: string,
  filter?: BoardFilter | null,
): UseBoardReturn {
  const client = usePttSocketStore((s) => s.client);
  const pttState = usePttSocketStore((s) => s.pttState);
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const nextCursorRef = useRef<string | undefined>();
  const activeRequestRef = useRef<"load" | "refresh" | null>(null);
  const queryGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const revalidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchArticles = useCallback(
    (loadMore = false, requestGeneration = queryGenerationRef.current) => {
      if (!client) return Promise.resolve([] as ArticleSummary[]);
      const cursor = loadMore ? nextCursorRef.current : undefined;
      let request: Promise<import("@pttzzz/core").Result<ArticlePage>>;
      if (filter?.type === "search") {
        request = client.searchArticles({ board: boardName, query: filter.keywords.join(" "), cursor });
      } else if (filter?.type === "push") {
        request = client.filterArticles({ board: boardName, minimumNativeScore: filter.threshold, cursor });
      } else if (filter?.type === "combined") {
        request = client.filterArticles({
          board: boardName,
          keyword: filter.keywords.join(" "),
          minimumNativeScore: filter.threshold,
          cursor,
        });
      } else {
        request = client.listArticles({ board: boardName, cursor });
      }
      return request.then((result) => {
        if (!result.ok) throw new Error(result.error.message);
        if (requestGeneration === queryGenerationRef.current) {
          nextCursorRef.current = result.value.nextCursor;
        }
        return [...result.value.items];
      });
    },
    [boardName, client, filter],
  );

  useEffect(() => {
    const requestGeneration = ++queryGenerationRef.current;
    let cancelled = false;
    let revalidateTimer: ReturnType<typeof setTimeout> | null = null;
    const cachedArticles = filter
      ? readFilteredBoardCache(boardName, filter) ?? []
      : readBoardCache(boardName) ?? [];
    const cachedAnchor = !filter ? readBoardAnchorCache(boardName) : null;
    const revalidateDelayMs = getBoardCacheRevalidateDelayMs(
      cachedArticles.length,
      Boolean(filter),
      Boolean(cachedAnchor),
    );

    if (pttState !== "ready" || !client || !boardName) {
      return;
    }

    setLoading(cachedArticles.length === 0);
    setRefreshing(false);
    setError(null);
    setArticles(cachedArticles);
    setHasMore(true);
    nextCursorRef.current = undefined;
    activeRequestRef.current = null;

    const runFetch = () => {
      revalidateTimerRef.current = null;
      if (cancelled || requestGeneration !== queryGenerationRef.current) return;
      activeRequestRef.current = "load";
      if (revalidateDelayMs > 0) setLoading(true);

      fetchArticles(false, requestGeneration)
        .then((next) => {
          if (cancelled || requestGeneration !== queryGenerationRef.current) return;
          const merged = cachedArticles.length > 0
            ? refreshCoreArticles(cachedArticles, next)
            : sortCoreArticles(next);
          setArticles(merged);
          setHasMore(Boolean(nextCursorRef.current));
          if (next.length > 0) {
            if (filter) {
              writeFilteredBoardCache(boardName, filter, merged);
            } else {
              writeBoardCache(boardName, merged);
            }
          }
          if (next.length === 0) {
            setError(
              filter?.type === "search"
                ? "沒有符合的搜尋結果"
                : filter?.type === "push"
                  ? "沒有符合推噓文數條件的文章"
                  : filter?.type === "combined"
                    ? "沒有符合關鍵字與推噓文數條件的文章"
                  : "找不到文章列表或看板不存在",
            );
            setHasMore(false);
          }
        })
        .catch((err: unknown) => {
          if (cancelled || requestGeneration !== queryGenerationRef.current) return;
          setError(err instanceof Error ? err.message : "無法載入看板");
          if (cachedArticles.length === 0) setHasMore(false);
        })
        .finally(() => {
          if (!cancelled && requestGeneration === queryGenerationRef.current) {
            activeRequestRef.current = null;
            setLoading(false);
          }
        });
    };

    if (revalidateDelayMs > 0) {
      revalidateTimer = setTimeout(runFetch, revalidateDelayMs);
      revalidateTimerRef.current = revalidateTimer;
    } else {
      runFetch();
    }

    return () => {
      cancelled = true;
      if (queryGenerationRef.current === requestGeneration) queryGenerationRef.current += 1;
      if (revalidateTimer) clearTimeout(revalidateTimer);
      if (revalidateTimerRef.current === revalidateTimer) revalidateTimerRef.current = null;
    };
  }, [boardName, client, fetchArticles, filter, pttState]);

  const loadMore = useCallback(() => {
    if (!client || activeRequestRef.current || loading || refreshing || articles.length === 0 || !hasMore) return;

    if (!nextCursorRef.current) {
      return;
    }

    activeRequestRef.current = "load";
    setLoading(true);
    setError(null);
    const requestGeneration = queryGenerationRef.current;
    fetchArticles(true, requestGeneration)
      .then((next) => {
        if (!mountedRef.current || requestGeneration !== queryGenerationRef.current) return;
        if (next.length === 0) {
          setHasMore(false);
          return;
        }
        setArticles((prev) => {
          const merged = appendCoreArticles(prev, next);
          if (filter) {
            writeFilteredBoardCache(boardName, filter, merged);
          } else {
            writeBoardCache(boardName, merged);
          }
          return merged;
        });
        setHasMore(Boolean(nextCursorRef.current));
      })
      .catch((err: unknown) => {
        if (!mountedRef.current || requestGeneration !== queryGenerationRef.current) return;
        setError(err instanceof Error ? err.message : "無法載入更多文章");
      })
      .finally(() => {
        if (mountedRef.current && requestGeneration === queryGenerationRef.current) {
          activeRequestRef.current = null;
          setLoading(false);
        }
      });
  }, [articles, boardName, client, fetchArticles, filter, hasMore, loading, refreshing]);

  const refresh = useCallback(() => {
    if (!client || activeRequestRef.current === "refresh" || refreshing) return;

    if (revalidateTimerRef.current) {
      clearTimeout(revalidateTimerRef.current);
      revalidateTimerRef.current = null;
    }
    activeRequestRef.current = "refresh";
    setRefreshing(true);
    setLoading(false);
    setError(null);
    const requestGeneration = ++queryGenerationRef.current;
    const previousCursor = nextCursorRef.current;
    fetchArticles(false, requestGeneration)
      .then((next) => {
        if (!mountedRef.current || requestGeneration !== queryGenerationRef.current) return;
        if (next.length === 0) {
          nextCursorRef.current = previousCursor;
          return;
        }
        setArticles((prev) => {
          const refreshed =
            prev.length > 0 ? refreshCoreArticles(prev, next) : sortCoreArticles(next);
          if (filter) {
            writeFilteredBoardCache(boardName, filter, refreshed);
          } else {
            writeBoardCache(boardName, refreshed);
          }
          return refreshed;
        });
        setHasMore(Boolean(nextCursorRef.current));
      })
      .catch((err: unknown) => {
        if (!mountedRef.current || requestGeneration !== queryGenerationRef.current) return;
        setError(err instanceof Error ? err.message : "無法重新載入文章");
      })
      .finally(() => {
        if (mountedRef.current && requestGeneration === queryGenerationRef.current) {
          activeRequestRef.current = null;
          setRefreshing(false);
        }
      });
  }, [boardName, client, fetchArticles, filter, refreshing]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      queryGenerationRef.current += 1;
    };
  }, []);

  return { articles, loading, refreshing, error, hasMore, loadMore, refresh };
}
