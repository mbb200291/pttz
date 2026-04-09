/**
 * useBoard
 *
 * 進入指定看板，取得文章列表。
 * 流程：送 "s [board]\r" → 解析回傳的文章列表行
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { usePttSocketStore } from "./usePttSocket";
import {
  parseArticleBuffer,
  stripAnsi,
  type ArticleSummary,
} from "../lib/ptt/parser";
import { detectAuthInterrupt, detectState } from "../lib/ptt/session";
import { getEnterBoardCommand } from "../lib/ptt/navigation";

export interface UseBoardReturn {
  articles: ArticleSummary[];
  loading: boolean;
  error: string | null;
  loadMore: () => void;
}

const LINE_BUFFER_TIMEOUT = 300; // ms，等候 terminal 輸出穩定
const DEBUG_TAIL_LENGTH = 80;
const BOARD_ENTRY_RETRY_DELAY = 1200;
const MAX_BOARD_ENTRY_RETRIES = 2;
const STATE_WINDOW = 3000;

function formatTail(raw: string): string {
  return stripAnsi(raw)
    .replace(/\s+/g, " ")
    .trim()
    .slice(-DEBUG_TAIL_LENGTH);
}

export function useBoard(boardName: string): UseBoardReturn {
  const { client, pttState } = usePttSocketStore();
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasParsedArticlesRef = useRef(false);
  const boardEntryRetriesRef = useRef(0);
  const rawRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parseAndSet = useCallback((raw: string) => {
    if (detectAuthInterrupt(raw)) {
      setArticles([]);
      setError("登入流程已被重新觸發，請重新登入");
      setLoading(false);
      hasParsedArticlesRef.current = false;
      return;
    }

    const parsed = parseArticleBuffer(raw);
    if (parsed.length > 0) {
      hasParsedArticlesRef.current = true;
      setArticles((prev) => {
        const map = new Map(prev.map((a) => [a.index, a]));
        parsed.forEach((a) => map.set(a.index, a));
        return Array.from(map.values()).sort((a, b) => b.index - a.index);
      });
      setError(null);
    } else if (raw.trim() && !hasParsedArticlesRef.current) {
      const { state } = detectState(raw);
      setError(`尚未解析出文章列表（state=${state}，tail=${formatTail(raw)}）`);
    }
    setLoading(false);
  }, []);

  // 監聽 recentBuffer 的變化，解析文章列表
  useEffect(() => {
    if (pttState !== "ready" || !client) return;

    const currentBuffer = usePttSocketStore.getState().recentBuffer;
    if (currentBuffer) {
      parseAndSet(currentBuffer);
    }

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
    if (detectAuthInterrupt(recentBuffer)) {
      setArticles([]);
      setError("登入流程已被重新觸發，請重新登入");
      setLoading(false);
      return;
    }
    const { state } = detectState(recentBuffer.slice(-STATE_WINDOW));

    if (state === "article") {
      setLoading(true);
      setError(null);
      client?.enqueue("\x1b[D", 180);
      return;
    }

    // 只在可預期畫面送出「進入看板」指令，避免誤觸
    const canEnterBoard =
      state === "main_menu" ||
      state === "board_list" ||
      state === "article_list";

    if (!canEnterBoard) {
      setError(
        `目前畫面尚未就緒，暫時無法進入看板（state=${state}，tail=${formatTail(recentBuffer)}）`,
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setArticles([]);
    hasParsedArticlesRef.current = false;
    boardEntryRetriesRef.current = 0;
    rawRef.current = "";
    client?.enqueue(getEnterBoardCommand(state, boardName, recentBuffer), 250);
  }, [pttState, boardName, client]);

  useEffect(() => {
    if (!loading || !client) return;

    const timer = setTimeout(() => {
      const { recentBuffer } = usePttSocketStore.getState();
      if (detectAuthInterrupt(recentBuffer)) {
        setArticles([]);
        setError("登入流程已被重新觸發，請重新登入");
        setLoading(false);
        return;
      }
      const { state } = detectState(recentBuffer.slice(-STATE_WINDOW));

      if (state === "article_list") {
        parseAndSet(recentBuffer);
        return;
      }

      if (
        state === "board_list" &&
        boardEntryRetriesRef.current < MAX_BOARD_ENTRY_RETRIES
      ) {
        boardEntryRetriesRef.current += 1;
        client.enqueue(getEnterBoardCommand(state, boardName, recentBuffer), 250);
      }
    }, BOARD_ENTRY_RETRY_DELAY);

    return () => clearTimeout(timer);
  }, [loading, client, boardName, parseAndSet]);

  const loadMore = useCallback(() => {
    if (!client || loading) return;

    const { recentBuffer, clearBuffer } = usePttSocketStore.getState();
    if (detectAuthInterrupt(recentBuffer)) {
      setArticles([]);
      setError("登入流程已被重新觸發，請重新登入");
      setLoading(false);
      return;
    }
    const { state } = detectState(recentBuffer.slice(-STATE_WINDOW));
    if (state !== "article_list") return;

    setLoading(true);
    clearBuffer();
    // 使用 PageUp 控制碼翻頁，避免送出 y 誤觸 yes/reply 類互動
    client.enqueue("\x1b[5~", 200);
  }, [client, loading]);

  if (import.meta.env.DEV && typeof window !== "undefined") {
    (
      window as typeof window & {
        __boardDebug?: {
          boardName: string;
          articles: ArticleSummary[];
          loading: boolean;
          error: string | null;
        };
      }
    ).__boardDebug = {
      boardName,
      articles,
      loading,
      error,
    };
  }

  return { articles, loading, error, loadMore };
}
