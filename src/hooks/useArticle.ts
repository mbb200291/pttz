/**
 * useArticle
 *
 * 改由 ptt-client adapter 直接讀取文章內容與推文。
 * 支援 progressive render：在 getArticle() 完整 resolve 前，
 * 透過 adapter partial callback 逐步取得文章內容。
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { usePttSocketStore } from "./usePttSocket";
import {
  parsePartialScreen,
  type ArticleDebugDump,
  type PartialArticleData,
} from "../lib/ptt/adapter";
import type { AggregatedPush } from "../lib/ptt/pushAggregator";
import type { ArticleEditRecord, ArticleSummary } from "../lib/ptt/parser";
import { readArticleCache, writeArticleCache } from "../lib/ptt/viewCache";

type ArticleDebugWindow = Window & {
  __pttzzzArticlePartialTimeline?: Array<{
    source: "adapter_callback" | "screen_subscribe" | "state_commit";
    at: number;
    boardName: string;
    articleIndex: number;
    articleAid?: string;
    title: string;
    bodyLength: number;
    pushCount: number;
    noteCount: number;
  }>;
};

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

export type { PartialArticleData };

export interface UseArticleReturn {
  article: ArticleData | null;
  partialArticle: PartialArticleData | null;
  cachedArticle: PartialArticleData | null;
  loading: boolean;
  reloading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

type LoadMode = "initial" | "reload";

function normalizeArticleTitle(value: string): string {
  return value.replace(/[\s\u3000]+/gu, " ").trim();
}

export function isExpectedArticlePartial(
  partial: PartialArticleData,
  expected?: ArticleSummary | null,
): boolean {
  if (!expected) return true;
  const a = normalizeArticleTitle(partial.title);
  const b = normalizeArticleTitle(expected.title);
  if (a === b) return true;
  // The board-list title may be the full title while the article's 標題 header line
  // is truncated to ~48 terminal columns (80-col terminal, title starts at col 32).
  // Allow a match when one is a prefix of the other, with a minimum length guard
  // to avoid false positives between unrelated articles.
  const minLen = Math.min(a.length, b.length);
  if (minLen < 10) return false;
  return b.startsWith(a) || a.startsWith(b);
}

export function parseExpectedArticleScreenPartial(
  screen: string,
  expected?: ArticleSummary | null,
): PartialArticleData | null {
  const partial = parsePartialScreen(screen);
  if (!partial || partial.body.trim().length === 0) return null;
  if (!isExpectedArticlePartial(partial, expected)) return null;
  return partial;
}

export function mergeProgressiveArticlePartial(
  current: PartialArticleData | null,
  incoming: PartialArticleData,
): PartialArticleData {
  if (!current) return incoming;

  const currentBodyLength = current.body.trim().length;
  const incomingBodyLength = incoming.body.trim().length;
  const currentPushCount = current.pushes?.length ?? 0;
  const incomingPushCount = incoming.pushes?.length ?? 0;
  const currentNoteCount = current.articleNotes?.length ?? 0;
  const incomingNoteCount = incoming.articleNotes?.length ?? 0;

  const incomingImprovesAnyField =
    incomingBodyLength > currentBodyLength ||
    incomingPushCount > currentPushCount ||
    incomingNoteCount > currentNoteCount;
  const incomingRegressesAnyField =
    incomingBodyLength < currentBodyLength ||
    incomingPushCount < currentPushCount ||
    incomingNoteCount < currentNoteCount;

  if (incomingRegressesAnyField && !incomingImprovesAnyField) {
    return current;
  }

  return incoming;
}

export function useArticle(
  boardName: string,
  articleIndex: number,
  articleAid?: string,
  expectedSummary?: ArticleSummary,
): UseArticleReturn {
  const { client, pttState } = usePttSocketStore();
  const [article, setArticle] = useState<ArticleData | null>(null);
  const [partialArticle, setPartialArticle] = useState<PartialArticleData | null>(null);
  const [cachedArticle, setCachedArticle] = useState<PartialArticleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const latestPartialRef = useRef<PartialArticleData | null>(null);

  const recordPartialTimeline = useCallback(
    (
      source: "adapter_callback" | "screen_subscribe" | "state_commit",
      partial: PartialArticleData,
    ) => {
      if (!import.meta.env.DEV || typeof window === "undefined") return;
      const debugWindow = window as ArticleDebugWindow;
      debugWindow.__pttzzzArticlePartialTimeline =
        debugWindow.__pttzzzArticlePartialTimeline ?? [];
      debugWindow.__pttzzzArticlePartialTimeline.push({
        source,
        at: Date.now(),
        boardName,
        articleIndex,
        articleAid,
        title: partial.title,
        bodyLength: partial.body.length,
        pushCount: partial.pushes?.length ?? 0,
        noteCount: partial.articleNotes?.length ?? 0,
      });
    },
    [articleAid, articleIndex, boardName],
  );

  const loadArticle = useCallback(
    async (mode: LoadMode) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      const isCurrentRequest = () =>
        mountedRef.current && requestIdRef.current === requestId;

      // Stale-while-revalidate: if cache has full article data (pushes), show it
      // immediately and reload in background to pick up new pushes.
      let isStaleRevalidate = false;

      if (mode === "initial") {
        setPartialArticle(null);
        latestPartialRef.current = null;

        const cached = articleAid ? null : readArticleCache(boardName, articleIndex);
        if (cached?.pushes?.length) {
          isStaleRevalidate = true;
          setArticle({
            title: cached.title,
            author: cached.author,
            date: cached.date,
            board: cached.board,
            body: cached.body,
            pushes: cached.pushes,
            articleNotes: cached.articleNotes ?? [],
            score: cached.score ?? 0,
          });
          setCachedArticle(null);
          setLoading(false);
          setReloading(true);
        } else {
          setLoading(true);
          setArticle(null);
          setCachedArticle(cached);
        }
      } else {
        setReloading(true);
      }
      setError(null);

      const handlePartial = (partial: PartialArticleData) => {
        if (!isCurrentRequest()) return;
        // Full cached article already showing — suppress partial overlays
        if (isStaleRevalidate) return;
        if (!isExpectedArticlePartial(partial, expectedSummary)) return;
        const merged = mergeProgressiveArticlePartial(
          latestPartialRef.current,
          partial,
        );
        if (merged === latestPartialRef.current) return;
        latestPartialRef.current = merged;
        recordPartialTimeline("adapter_callback", merged);
        setPartialArticle(merged);
      };

      try {
        const next = articleAid
          ? await client!.getArticleByAid(boardName, articleAid, handlePartial)
          : await client!.getArticle(boardName, articleIndex, handlePartial);
        if (!isCurrentRequest()) return;
        if (!next) {
          setError("無法載入文章");
          return;
        }
        setArticle(next);
        setPartialArticle(null);
        latestPartialRef.current = null;
        setCachedArticle(null);
        if (!articleAid) {
          writeArticleCache(boardName, articleIndex, {
            title: next.title,
            author: next.author,
            date: next.date,
            board: next.board,
            body: next.body,
            pushes: next.pushes,
            articleNotes: next.articleNotes,
            score: next.score,
          });
        }
      } catch (err: unknown) {
        if (!isCurrentRequest()) return;
        setError(err instanceof Error ? err.message : "無法載入文章");
      } finally {
        if (!isCurrentRequest()) return;
        if (mode === "initial" && !isStaleRevalidate) {
          setLoading(false);
        } else {
          setReloading(false);
        }
      }
    },
    [articleAid, articleIndex, boardName, client, expectedSummary],
  );

  const reload = useCallback(async () => {
    if (pttState !== "ready" || !client || !boardName || (!articleAid && articleIndex <= 0)) {
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
    if (pttState !== "ready" || !client || !boardName || (!articleAid && articleIndex <= 0)) {
      return;
    }

    void loadArticle("initial");
  }, [articleAid, articleIndex, boardName, client, loadArticle, pttState]);

  useEffect(() => {
    if (
      pttState !== "ready" ||
      !client ||
      !boardName ||
      articleAid ||
      articleIndex <= 0
    ) {
      return;
    }

    return client.subscribeScreen((screen) => {
      if (!mountedRef.current || !loading || article) return;
      const partial = parseExpectedArticleScreenPartial(screen, expectedSummary);
      if (!partial) return;
      const merged = mergeProgressiveArticlePartial(
        latestPartialRef.current,
        partial,
      );
      if (merged === latestPartialRef.current) return;
      latestPartialRef.current = merged;
      recordPartialTimeline("screen_subscribe", merged);
      setPartialArticle(merged);
    });
  }, [
    article,
    articleAid,
    articleIndex,
    boardName,
    client,
    expectedSummary,
    loading,
    pttState,
  ]);

  useEffect(() => {
    latestPartialRef.current = partialArticle;
    if (!partialArticle) return;
    recordPartialTimeline("state_commit", partialArticle);
  }, [partialArticle, recordPartialTimeline]);

  return { article, partialArticle, cachedArticle, loading, reloading, error, reload };
}
