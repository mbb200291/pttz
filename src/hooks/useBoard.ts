/**
 * useBoard
 *
 * 進入指定看板，取得文章列表。
 * 流程：送 "s [board]\r" → 解析回傳的文章列表行
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { usePttSocketStore } from "./usePttSocket";
import {
  parseArticleLine,
  stripAnsi,
  type ArticleSummary,
} from "../lib/ptt/parser";
import { detectState } from "../lib/ptt/session";

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
        timerRef.current = setTimeout(
          () => parseAndSet(buf),
          LINE_BUFFER_TIMEOUT,
        );
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

    const { recentBuffer } = usePttSocketStore.getState();
    const { state } = detectState(recentBuffer);

    // 只在可預期畫面送出「進入看板」指令，避免誤觸
    const canEnterBoard =
      state === "main_menu" ||
      state === "board_list" ||
      state === "article_list";

    if (!canEnterBoard) {
      setError("目前畫面尚未就緒，暫時無法進入看板");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setArticles([]);
    rawRef.current = "";
    usePttSocketStore.getState().clearBuffer();
    client?.enqueue(`s ${boardName}\r`, 250);
  }, [pttState, boardName, client]);

  const loadMore = useCallback(() => {
    if (!client || loading) return;

    const { recentBuffer } = usePttSocketStore.getState();
    const { state } = detectState(recentBuffer);
    if (state !== "article_list") return;

    setLoading(true);
    // 使用 PageUp 控制碼翻頁，避免送出 y 誤觸 yes/reply 類互動
    client.enqueue("\x1b[5~", 200);
  }, [client, loading]);

  return { articles, loading, error, loadMore };
}
