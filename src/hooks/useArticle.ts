/**
 * useArticle
 *
 * 開啟指定文章，收集整篇內容（含多頁），然後解析推文並聚合。
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { usePttSocketStore } from "./usePttSocket";
import { parsePushLine, splitArticleBody } from "../lib/ptt/parser";
import { aggregatePushes, calcArticleScore, type AggregatedPush } from "../lib/ptt/pushAggregator";

export interface ArticleData {
  title: string;
  author: string;
  date: string;
  board: string;
  body: string; // 文章正文（raw，含 ANSI 顏色）
  pushes: AggregatedPush[];
  score: number;
}

export interface UseArticleReturn {
  article: ArticleData | null;
  loading: boolean;
  error: string | null;
}

const STABLE_TIMEOUT = 500;

export function useArticle(
  boardName: string,
  articleIndex: number,
): UseArticleReturn {
  const { client, pttState } = usePttSocketStore();
  const [article, setArticle] = useState<ArticleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rawAccRef = useRef(""); // 累積所有頁的內容
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneRef = useRef(false);

  const finalizeArticle = useCallback((rawFull: string) => {
    const { body, pushLines } = splitArticleBody(rawFull);

    // 解析文章 header（前幾行有 作者/標題/時間/看板）
    const headerLines = body.split("\n").slice(0, 5);
    const getField = (key: string) => {
      const line = headerLines.find((l) => l.includes(key));
      if (!line) return "";
      const idx = line.indexOf(key);
      return line.slice(idx + key.length).trim().split(/\s{2,}/)[0];
    };
    const author = getField("作者");
    const title = getField("標題");
    const date = getField("時間");
    const board = getField("看板");

    const rawPushes = pushLines
      .map((l) => parsePushLine(l))
      .filter((p) => p !== null);
    const pushes = aggregatePushes(rawPushes, author);
    const score = calcArticleScore(pushes);

    setArticle({ title, author, date, board, body, pushes, score });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (pttState !== "ready" || !boardName || articleIndex <= 0) return;

    setLoading(true);
    setArticle(null);
    setError(null);
    rawAccRef.current = "";
    doneRef.current = false;
    usePttSocketStore.getState().clearBuffer();

    // 進看板後按下文章編號 + Enter 開啟
    client?.enqueue("\x1b\x1b", 150);
    client?.enqueue(`s ${boardName}\r`, 300);
    client?.enqueue(`${articleIndex}\r`, 400);

    const unsubscribe = usePttSocketStore.subscribe((state) => {
      if (doneRef.current) return;

      const buf = state.recentBuffer;
      rawAccRef.current = buf;

      // 偵測「已到底」（END 標記）
      const plain = buf.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
      const atBottom = plain.includes("(END)") || plain.includes("瀏覽結束");

      if (timerRef.current) clearTimeout(timerRef.current);

      if (atBottom) {
        doneRef.current = true;
        finalizeArticle(buf);
        return;
      }

      // 尚未到底，繼續翻頁
      timerRef.current = setTimeout(() => {
        client?.send(" "); // 空白翻頁
      }, STABLE_TIMEOUT);
    });

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pttState, boardName, articleIndex, client, finalizeArticle]);

  return { article, loading, error };
}
