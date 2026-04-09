/**
 * useArticle
 *
 * 開啟指定文章，收集整篇內容（含多頁），然後解析推文並聚合。
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { usePttSocketStore } from "./usePttSocket";
import {
  extractCurrentArticlePage,
  extractFirstArticlePage,
  getLastPageInfo,
  mergeArticlePage,
  parsePushBuffer,
  splitArticleBody,
  stripAnsi,
} from "../lib/ptt/parser";
import { detectAuthInterrupt, detectState } from "../lib/ptt/session";
import {
  aggregatePushes,
  calcArticleScore,
  type AggregatedPush,
} from "../lib/ptt/pushAggregator";

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
const STATE_WINDOW = 3000;
const OPEN_ARTICLE_TIMEOUT = 2500;
const OPEN_FROM_ARTICLE_DELAY = 260;

function normalizeText(raw: string): string {
  return stripAnsi(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function parseArticleHeader(body: string): {
  author: string;
  title: string;
  date: string;
  board: string;
  content: string;
} {
  const lines = normalizeText(body).split("\n");
  const firstSeparator = lines.findIndex((line) =>
    /^─{10,}/.test(line.trim()),
  );
  const headerLines =
    firstSeparator >= 0 ? lines.slice(0, firstSeparator) : lines.slice(0, 8);
  const headerBlock = headerLines.join(" ").replace(/\s+/g, " ").trim();
  let contentStart = firstSeparator >= 0 ? firstSeparator + 1 : 0;

  const author =
    headerBlock.match(/作者\s+(.+?)(?=\s+看板\s+)/u)?.[1]?.trim() ?? "";
  const board =
    headerBlock.match(/看板\s+(.+?)(?=\s+標題\s+)/u)?.[1]?.trim() ?? "";
  const title =
    headerBlock.match(/標題\s+(.+?)(?=\s+時間\s+)/u)?.[1]?.trim() ?? "";
  const date = headerBlock.match(/時間\s+(.+)$/u)?.[1]?.trim() ?? "";

  return {
    author,
    title,
    date,
    board,
    content: lines.slice(contentStart).join("\n").trim(),
  };
}

export function useArticle(
  boardName: string,
  articleIndex: number,
): UseArticleReturn {
  const { client, pttState } = usePttSocketStore();
  const [article, setArticle] = useState<ArticleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rawAccRef = useRef(""); // 累積所有頁的內容
  const seenPagesRef = useRef(new Map<number, string>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneRef = useRef(false);

  const finalizeArticle = useCallback((rawFull: string) => {
    const { body } = splitArticleBody(rawFull);
    const { author, title, date, board, content } = parseArticleHeader(body);

    const rawPushes = parsePushBuffer(rawFull);
    const pushes = aggregatePushes(rawPushes, author);
    const score = calcArticleScore(pushes);

    setArticle({ title, author, date, board, body: content, pushes, score });
    setLoading(false);
  }, []);

  const processBuffer = useCallback(
    (buf: string) => {
      if (doneRef.current) return;
      if (detectAuthInterrupt(buf)) {
        doneRef.current = true;
        setArticle(null);
        setError("登入流程已被重新觸發，請重新登入");
        setLoading(false);
        return;
      }

      const plain = buf.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
      if (!plain.trim()) return;
      const sessionState = detectState(buf.slice(-STATE_WINDOW)).state;
      const atBottom = plain.includes("(END)") || plain.includes("瀏覽結束");
      const pageInfo = getLastPageInfo(plain);
      const currentPage = pageInfo?.currentPage ?? null;
      const totalPages = pageInfo?.totalPages ?? null;
      const hasArticleHeader =
        plain.includes("作者") &&
        plain.includes("標題") &&
        plain.includes("時間");

      if (seenPagesRef.current.size === 0) {
        if (currentPage !== 1 || !hasArticleHeader) {
          return;
        }
      }

      if (sessionState !== "article" && currentPage === null && !hasArticleHeader) {
        return;
      }

      if (currentPage !== null && !Number.isNaN(currentPage)) {
        const pageContent =
          currentPage === 1
            ? extractFirstArticlePage(buf)
            : extractCurrentArticlePage(buf);

        if (!pageContent) {
          return;
        }

        seenPagesRef.current.set(currentPage, pageContent);
        rawAccRef.current = Array.from(seenPagesRef.current.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([, page]) => page)
          .reduce((merged, page) => mergeArticlePage(merged, page), "");
      } else {
        rawAccRef.current = extractCurrentArticlePage(buf);
      }

      if (timerRef.current) clearTimeout(timerRef.current);

      const reachedLastPage =
        currentPage !== null &&
        totalPages !== null &&
        !Number.isNaN(totalPages) &&
        currentPage >= totalPages;

      if (atBottom || reachedLastPage) {
        doneRef.current = true;
        finalizeArticle(rawAccRef.current || buf);
        return;
      }

      if (currentPage !== null && !Number.isNaN(currentPage)) {
        timerRef.current = setTimeout(() => {
          client?.send(" "); // 空白翻頁
        }, STABLE_TIMEOUT);
      }
    },
    [client, finalizeArticle],
  );

  if (import.meta.env.DEV && typeof window !== "undefined") {
    (
      window as typeof window & {
        __articleDebug?: {
          boardName: string;
          articleIndex: number;
          loading: boolean;
          error: string | null;
          pages: number[];
          rawPreview: string;
        };
      }
    ).__articleDebug = {
      boardName,
      articleIndex,
      loading,
      error,
      pages: Array.from(seenPagesRef.current.keys()).sort((a, b) => a - b),
      rawPreview: rawAccRef.current.slice(0, 1200),
    };
  }

  useEffect(() => {
    if (pttState !== "ready" || !boardName || articleIndex <= 0) return;

    const { recentBuffer } = usePttSocketStore.getState();
    if (detectAuthInterrupt(recentBuffer)) {
      setLoading(false);
      setArticle(null);
      setError("登入流程已被重新觸發，請重新登入");
      return;
    }
    const stateBuffer = recentBuffer.slice(-STATE_WINDOW);
    const { state } = detectState(stateBuffer);

    setLoading(true);
    setArticle(null);
    setError(null);
    rawAccRef.current = "";
    seenPagesRef.current = new Map();
    doneRef.current = false;

    if (state === "article_list") {
      usePttSocketStore.getState().clearBuffer();
      // 先定位到指定文章，再用右箭頭真正進入閱讀畫面。
      client?.enqueue(`${articleIndex}\r`, 160);
      client?.enqueue("\x1b[C", 220);
    } else if (state === "article") {
      usePttSocketStore.getState().clearBuffer();
      client?.enqueue("\x1b[D", 120);
      client?.enqueue(`${articleIndex}\r`, OPEN_FROM_ARTICLE_DELAY);
      client?.enqueue("\x1b[C", OPEN_FROM_ARTICLE_DELAY + 60);
    } else {
      openTimeoutRef.current = setTimeout(() => {
        if (doneRef.current) return;
        const latestBuffer = usePttSocketStore.getState().recentBuffer;
        const latestState = detectState(latestBuffer.slice(-STATE_WINDOW)).state;
        if (latestState !== "article" && latestState !== "article_list") {
          setError("目前不在文章列表，暫時無法開啟文章");
          setLoading(false);
        }
      }, OPEN_ARTICLE_TIMEOUT);
    }

    const unsubscribe = usePttSocketStore.subscribe((state) => {
      processBuffer(state.recentBuffer);
    });
    processBuffer(usePttSocketStore.getState().recentBuffer);

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
      if (openTimeoutRef.current) clearTimeout(openTimeoutRef.current);
    };
  }, [pttState, boardName, articleIndex, client, processBuffer]);

  return { article, loading, error };
}
