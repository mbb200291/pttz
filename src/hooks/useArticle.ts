/**
 * useArticle
 *
 * 改由 ptt-client adapter 直接讀取文章內容與推文。
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { usePttSocketStore } from "./usePttSocket";
import type { ArticleDebugDump } from "../lib/ptt/adapter";
import type { AggregatedPush } from "../lib/ptt/pushAggregator";
import type { ArticleEditRecord } from "../lib/ptt/parser";

export interface ArticleData {
  title: string;
  author: string;
  date: string;
  board: string;
  body: string;
  pushes: AggregatedPush[];
  articleNotes: ArticleEditRecord[];
  score: number;
  debug?: ArticleDebugDump;
}

export interface UseArticleReturn {
  article: ArticleData | null;
  loading: boolean;
  reloading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

type LoadMode = "initial" | "reload";

export function useArticle(
  boardName: string,
  articleIndex: number,
): UseArticleReturn {
  const { client, pttState } = usePttSocketStore();
  const [article, setArticle] = useState<ArticleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const loadArticle = useCallback(
    async (mode: LoadMode) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      const isCurrentRequest = () =>
        mountedRef.current && requestIdRef.current === requestId;

      if (mode === "initial") {
        setLoading(true);
        setArticle(null);
      } else {
        setReloading(true);
      }
      setError(null);

      try {
        const next = await client!.getArticle(boardName, articleIndex);
        if (!isCurrentRequest()) return;
        if (!next) {
          setError("無法載入文章");
          return;
        }
        setArticle(next);
      } catch (err: unknown) {
        if (!isCurrentRequest()) return;
        setError(err instanceof Error ? err.message : "無法載入文章");
      } finally {
        if (!isCurrentRequest()) return;
        if (mode === "initial") {
          setLoading(false);
        } else {
          setReloading(false);
        }
      }
    },
    [articleIndex, boardName, client],
  );

  const reload = useCallback(async () => {
    if (pttState !== "ready" || !client || !boardName || articleIndex <= 0) {
      return;
    }

    await loadArticle("reload");
  }, [articleIndex, boardName, client, loadArticle, pttState]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (pttState !== "ready" || !client || !boardName || articleIndex <= 0) {
      return;
    }

    void loadArticle("initial");
  }, [articleIndex, boardName, client, loadArticle, pttState]);

  return { article, loading, reloading, error, reload };
}
