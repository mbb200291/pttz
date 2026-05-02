/**
 * useBoard
 *
 * 改由 ptt-client adapter 直接讀取看板文章列表。
 * 支援一般列表、標題搜尋（/keyword）、推噓文數篩選（Z threshold）。
 */

import { useState, useEffect, useCallback } from "react";
import { usePttSocketStore } from "./usePttSocket";
import { parsePartialBoardScreen } from "../lib/ptt/adapter";
import type { ArticleSummary } from "../lib/ptt/parser";
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
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
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
  previous: ArticleSummary[],
  incoming: ArticleSummary[],
): ArticleSummary[] {
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
  cached: ArticleSummary[],
  incoming: ArticleSummary[],
): ArticleSummary[] {
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
  const isNearVisibleWindow = (article: ArticleSummary) =>
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

export function sortBoardArticles(articles: ArticleSummary[]): ArticleSummary[] {
  return [...articles].sort((a, b) => {
    if (Boolean(a.fixed) !== Boolean(b.fixed)) {
      return a.fixed ? -1 : 1;
    }
    return b.index - a.index;
  });
}

export function getNextBoardLoadMoreOffset(
  articles: ArticleSummary[],
): number | null {
  const normalIndexes = articles
    .filter((article) => !article.fixed)
    .map((article) => article.index);
  if (normalIndexes.length === 0) return null;
  return Math.min(...normalIndexes) - 1;
}

export function useBoard(
  boardName: string,
  filter?: BoardFilter | null,
): UseBoardReturn {
  const client = usePttSocketStore((s) => s.client);
  const pttState = usePttSocketStore((s) => s.pttState);
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const fetchArticles = useCallback(
    (beforeIndex?: number) => {
      if (!client) return Promise.resolve([]);
      if (filter?.type === "search") {
        return client.searchArticles(boardName, filter.keyword, beforeIndex);
      }
      if (filter?.type === "push") {
        return client.filterArticlesByPush(boardName, filter.threshold, beforeIndex);
      }
      return client.listArticles(boardName, beforeIndex);
    },
    [boardName, client, filter],
  );

  useEffect(() => {
    let cancelled = false;
    let resolved = false;
    let unsubscribeScreen: (() => void) | null = null;
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
    setError(null);
    setArticles(cachedArticles);
    setHasMore(true);

    if (!filter && cachedArticles.length === 0) {
      unsubscribeScreen = client.subscribeScreen((screen) => {
        if (cancelled || resolved) return;
        const partial = parsePartialBoardScreen(screen);
        if (partial.length === 0) return;
        setArticles((prev) =>
          prev.length === 0 ? partial : mergeBoardArticles(prev, partial),
        );
      });
    }

    const runFetch = () => {
      if (cancelled) return;
      if (revalidateDelayMs > 0) setLoading(true);

      fetchArticles()
        .then((next) => {
          if (cancelled) return;
          resolved = true;
          const merged = cachedArticles.length > 0
            ? refreshCachedBoardArticles(cachedArticles, next)
            : next;
          setArticles(merged);
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
                  : "找不到文章列表或看板不存在",
            );
            setHasMore(false);
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          resolved = true;
          setError(err instanceof Error ? err.message : "無法載入看板");
          setHasMore(false);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
          unsubscribeScreen?.();
        });
    };

    if (revalidateDelayMs > 0) {
      revalidateTimer = setTimeout(runFetch, revalidateDelayMs);
    } else {
      runFetch();
    }

    return () => {
      cancelled = true;
      if (revalidateTimer) clearTimeout(revalidateTimer);
      unsubscribeScreen?.();
    };
  }, [boardName, client, fetchArticles, filter, pttState]);

  const loadMore = useCallback(() => {
    if (!client || loading || articles.length === 0 || !hasMore) return;

    const nextOffset = getNextBoardLoadMoreOffset(articles);
    if (nextOffset === null || nextOffset <= 0) {
      setHasMore(false);
      return;
    }

    setLoading(true);
    fetchArticles(nextOffset)
      .then((next) => {
        if (next.length === 0) {
          setHasMore(false);
          return;
        }
        setArticles((prev) => {
          const merged = mergeBoardArticles(prev, next);
          if (filter) {
            writeFilteredBoardCache(boardName, filter, merged);
          } else {
            writeBoardCache(boardName, merged);
          }
          return merged;
        });
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "無法載入更多文章");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [articles, boardName, client, fetchArticles, filter, hasMore, loading]);

  return { articles, loading, error, hasMore, loadMore };
}
