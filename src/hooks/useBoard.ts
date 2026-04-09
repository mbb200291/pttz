/**
 * useBoard
 *
 * 改由 ptt-client adapter 直接讀取看板文章列表。
 */

import { useState, useEffect, useCallback } from "react";
import { usePttSocketStore } from "./usePttSocket";
import type { ArticleSummary } from "../lib/ptt/parser";

export interface UseBoardReturn {
  articles: ArticleSummary[];
  loading: boolean;
  error: string | null;
  loadMore: () => void;
}

export function useBoard(boardName: string): UseBoardReturn {
  const { client, pttState } = usePttSocketStore();
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (pttState !== "ready" || !client || !boardName) {
      return;
    }

    setLoading(true);
    setError(null);
    setArticles([]);

    client
      .listArticles(boardName)
      .then((next) => {
        if (cancelled) return;
        setArticles(next);
        if (next.length === 0) {
          setError("找不到文章列表或看板不存在");
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "無法載入看板");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [boardName, client, pttState]);

  const loadMore = useCallback(() => {
    if (!client || loading || articles.length === 0) return;

    const nextOffset = Math.min(...articles.map((article) => article.index)) - 1;
    if (nextOffset <= 0) return;

    setLoading(true);
    client
      .listArticles(boardName, nextOffset)
      .then((next) => {
        setArticles((prev) => {
          const map = new Map(prev.map((article) => [article.index, article]));
          next.forEach((article) => map.set(article.index, article));
          return Array.from(map.values()).sort((a, b) => b.index - a.index);
        });
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "無法載入更多文章");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [articles, boardName, client, loading]);

  return { articles, loading, error, loadMore };
}
