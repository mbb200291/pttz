/**
 * useBoard
 *
 * 進入指定看板，取得文章列表。
 * 流程：送 "s [board]\r" → 解析回傳的文章列表行
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { usePttSocketStore } from "./usePttSocket";
import { parseArticleLine, stripAnsi, type ArticleSummary } from "../lib/ptt/parser";

export interface UseBoardReturn {
  articles: ArticleSummary[];
  loading: boolean;
  error: string | null;
  loadMore: () => void;
}

const LINE_BUFFER_TIMEOUT = 300; // ms，等候 terminal 輸出穩定

export function useBoard(boardName: string): UseBoardReturn {
  const { client, pttState } = usePttSocketStore();
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rawRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parseAndSet = useCallback((raw: string) => {
    const lines = raw.split("\n");
    const parsed = lines
      .map((l) => parseArticleLine(stripAnsi(l)))
      .filter((a): a is ArticleSummary => a !== null);
    if (parsed.length > 0) {
      setArticles((prev) => {
        const map = new Map(prev.map((a) => [a.index, a]));
        parsed.forEach((a) => map.set(a.index, a));
        return Array.from(map.values()).sort((a, b) => b.index - a.index);
      });
    }
    setLoading(false);
  }, []);

  // 監聽 recentBuffer 的變化，解析文章列表
  useEffect(() => {
    if (pttState !== "ready" || !client) return;

    const unsubscribe = usePttSocketStore.subscribe(
      (state) => state.recentBuffer,
      (buf) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => parseAndSet(buf), LINE_BUFFER_TIMEOUT);
      },
    );

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pttState, client, parseAndSet]);

  // 進入看板（等 PTT ready 才導航）
  useEffect(() => {
    if (pttState !== "ready" || !boardName) return;
    setLoading(true);
    setArticles([]);
    rawRef.current = "";
    usePttSocketStore.getState().clearBuffer();
    client?.enqueue("\x1b\x1b", 150); // ESC ESC 回主選單
    client?.enqueue(`s ${boardName}\r`, 300);
  }, [pttState, boardName, client]);

  const loadMore = useCallback(() => {
    if (!client || loading) return;
    setLoading(true);
    client.enqueue("y", 200); // 在看板列表按 y 往上翻頁（前一頁）
  }, [client, loading]);

  return { articles, loading, error, loadMore };
}
