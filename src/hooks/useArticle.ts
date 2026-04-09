/**
 * useArticle
 *
 * 改由 ptt-client adapter 直接讀取文章內容與推文。
 */

import { useState, useEffect } from "react";
import { usePttSocketStore } from "./usePttSocket";
import type { AggregatedPush } from "../lib/ptt/pushAggregator";

export interface ArticleData {
  title: string;
  author: string;
  date: string;
  board: string;
  body: string;
  pushes: AggregatedPush[];
  score: number;
}

export interface UseArticleReturn {
  article: ArticleData | null;
  loading: boolean;
  error: string | null;
}

export function useArticle(
  boardName: string,
  articleIndex: number,
): UseArticleReturn {
  const { client, pttState } = usePttSocketStore();
  const [article, setArticle] = useState<ArticleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (pttState !== "ready" || !client || !boardName || articleIndex <= 0) {
      return;
    }

    setLoading(true);
    setArticle(null);
    setError(null);

    client
      .getArticle(boardName, articleIndex)
      .then((next) => {
        if (cancelled) return;
        if (!next) {
          setError("無法載入文章");
          return;
        }
        setArticle(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "無法載入文章");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [articleIndex, boardName, client, pttState]);

  return { article, loading, error };
}
