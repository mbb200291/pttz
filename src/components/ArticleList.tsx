/**
 * ArticleList — 看板文章列表
 * 支援：
 *   - scroll 自動載入（IntersectionObserver sentinel）
 *   - 標題關鍵字搜尋（/keyword）
 *   - 推噓文數篩選（Z threshold）
 *   - AID 跳轉（#XXXXXXXX）
 */

import type { KeyboardEvent, MouseEvent } from "react";
import { useRef, useEffect, useState } from "react";
import { useBoard } from "../hooks/useBoard";
import type { BoardFilter } from "../lib/ptt/viewState";
import type { ArticleSummary } from "../lib/ptt/parser";
import {
  readBoardAnchorCache,
  readBoardScrollCache,
  writeBoardAnchorCache,
  writeBoardScrollCache,
} from "../lib/ptt/viewCache";

declare global {
  interface Window {
    pttzzzDebug?: {
      dumpCurrentBoardArticles?: () => unknown;
      dumpLastBoardSelection?: () => unknown;
      dumpCurrentArticle?: () => unknown;
      dumpLastArticleOpenTrace?: () => unknown;
    };
  }
}

// AID format: 8 alphanumeric characters (PTT Article ID)
const AID_RE = /^#?[A-Za-z0-9]{8}$/;

function isAid(input: string): boolean {
  return AID_RE.test(input.trim());
}

function normalizeAid(input: string): string {
  return input.trim().replace(/^#/, "");
}

interface ArticleListProps {
  boardName: string;
  onSelectArticle: (article: ArticleSummary) => void;
  onSelectArticleByAid: (aid: string) => void;
  onBack: () => void;
  initialFilter?: BoardFilter | null;
  onActiveFilterChange?: (filter: BoardFilter | null) => void;
  mockArticles?: ArticleSummary[];
  mockLoading?: boolean;
  mockError?: string | null;
  onMockLoadMore?: () => void;
}

function PushCountBadge({ count }: { count: string }) {
  const num = parseInt(count, 10);
  const isBoom = count === "爆";
  const isNeg = count.startsWith("X") || num < 0;

  let className = "text-xs font-bold w-8 text-right ";
  if (isBoom) className += "text-yellow-400";
  else if (isNeg) className += "text-red-400";
  else if (num >= 50) className += "text-orange-400";
  else if (num >= 10) className += "text-green-400";
  else className += "text-gray-400";

  return <span className={className}>{count || "　"}</span>;
}

function ArticleRow({
  article,
  onClick,
}: {
  article: ArticleSummary;
  onClick: (index: number, element: HTMLButtonElement) => void;
}) {
  const isRe = article.title.startsWith("Re:");
  const isDeleted = article.title.includes("(已被刪除)");
  const isFixed = Boolean(article.fixed);
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const nextIndex = Number(event.currentTarget.dataset.articleIndex);
    onClick(
      Number.isNaN(nextIndex) ? article.index : nextIndex,
      event.currentTarget,
    );
  };

  return (
    <button
      type="button"
      data-article-index={article.index}
      data-fixed-article={isFixed ? "true" : undefined}
      onClick={handleClick}
      disabled={isDeleted}
      className={`w-full text-left px-4 py-3 border-b transition-colors flex items-baseline gap-3 ${
        isFixed
          ? "border-amber-900/40 bg-amber-950/20 hover:bg-amber-950/35"
          : "border-gray-800 hover:bg-gray-800"
      } ${
        isDeleted ? "opacity-40 cursor-not-allowed" : ""
      }`}
    >
      {isFixed ? (
        <span className="w-8 shrink-0 rounded border border-amber-700/50 bg-amber-900/30 px-1 py-0.5 text-center text-[10px] font-semibold text-amber-300">
          置頂
        </span>
      ) : (
        <PushCountBadge count={article.pushCount} />
      )}
      <span className="text-xs text-gray-500 w-10 shrink-0">
        {article.date}
      </span>
      <span
        className={`w-16 shrink-0 text-right font-mono text-xs tabular-nums ${
          isFixed ? "text-amber-300/60" : "text-gray-600"
        }`}
      >
        #{article.index}
      </span>
      <span
        className={`flex-1 text-sm truncate ${
          isFixed
            ? "font-medium text-amber-100"
            : isRe
              ? "text-gray-400"
              : "text-gray-100"
        }`}
      >
        {article.title}
      </span>
      <span
        className={`text-xs shrink-0 hidden sm:block ${
          isFixed ? "text-amber-300/70" : "text-gray-500"
        }`}
      >
        {article.author}
      </span>
    </button>
  );
}

const PUSH_QUICK_FILTERS = [
  { label: "≥10", value: 10 },
  { label: "≥30", value: 30 },
  { label: "≥100", value: 100 },
  { label: "爆", value: 100 },
] as const;

export const ARTICLE_LIST_PRELOAD_ROOT_MARGIN = "0px 0px 720px 0px";

export function ArticleList({
  boardName,
  onSelectArticle,
  onSelectArticleByAid,
  onBack,
  initialFilter,
  onActiveFilterChange,
  mockArticles,
  mockLoading,
  mockError,
  onMockLoadMore,
}: ArticleListProps) {
  const [searchInput, setSearchInput] = useState(
    initialFilter?.type === "search" ? initialFilter.keyword : "",
  );
  const [activeFilter, setActiveFilter] = useState<BoardFilter | null>(
    initialFilter ?? null,
  );

  const {
    articles: liveArticles,
    loading: liveLoading,
    error: liveError,
    hasMore: liveHasMore,
    loadMore,
  } = useBoard(boardName, activeFilter);

  const articles = mockArticles ?? liveArticles;
  const loading = mockLoading ?? liveLoading;
  const error = mockError ?? liveError;
  const hasMore = mockArticles ? true : liveHasMore;
  const handleLoadMore = onMockLoadMore ?? loadMore;

  const mountedBoardNameRef = useRef(boardName);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [supportsObserver] = useState(
    () => typeof IntersectionObserver !== "undefined",
  );
  const lastSelectionRef = useRef<{
    boardName: string;
    index: number;
    title: string;
    author: string;
  } | null>(null);
  const restoredListKeyRef = useRef<string | null>(null);
  const restoreListKey = `${boardName}:${activeFilter?.type ?? "all"}:${
    activeFilter?.type === "search"
      ? activeFilter.keyword
      : activeFilter?.type === "push"
        ? activeFilter.threshold
        : ""
  }`;

  // IntersectionObserver sentinel
  useEffect(() => {
    if (!supportsObserver || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          handleLoadMore();
        }
      },
      { rootMargin: ARTICLE_LIST_PRELOAD_ROOT_MARGIN },
    );

    const el = sentinelRef.current;
    if (el) observer.observe(el);

    return () => observer.disconnect();
  }, [hasMore, handleLoadMore, loading, supportsObserver]);

  // Reset filter when boardName actually changes (not on initial mount)
  useEffect(() => {
    if (mountedBoardNameRef.current === boardName) return;
    mountedBoardNameRef.current = boardName;
    setActiveFilter(null);
    setSearchInput("");
  }, [boardName]);

  useEffect(() => {
    onActiveFilterChange?.(activeFilter);
  }, [activeFilter, onActiveFilterChange]);

  useEffect(() => {
    if (typeof window === "undefined" || articles.length === 0) return;
    if (restoredListKeyRef.current === restoreListKey) return;

    const cachedAnchor = readBoardAnchorCache(boardName);
    const cachedScrollY = readBoardScrollCache(boardName);
    const rafId = window.requestAnimationFrame(() => {
      restoredListKeyRef.current = restoreListKey;
      if (cachedAnchor) {
        const row = document.querySelector<HTMLElement>(
          `[data-article-index="${cachedAnchor.articleIndex}"]`,
        );
        if (row) {
          const targetTop =
            window.scrollY +
            row.getBoundingClientRect().top -
            cachedAnchor.viewportTop;
          window.scrollTo({ top: Math.max(0, targetTop), behavior: "auto" });
          return;
        }
      }

      if (cachedScrollY !== null) {
        window.scrollTo({ top: cachedScrollY, behavior: "auto" });
      }
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [articles.length, boardName, restoreListKey]);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return;

    window.pttzzzDebug = window.pttzzzDebug ?? {};
    window.pttzzzDebug.dumpCurrentBoardArticles = () => {
      const snapshot = articles.map((article) => ({
        index: article.index,
        title: article.title,
        author: article.author,
        date: article.date,
        pushCount: article.pushCount,
      }));
      console.log("[pttzzz] current board articles", { boardName, snapshot });
      return { boardName, articles: snapshot };
    };
    window.pttzzzDebug.dumpLastBoardSelection = () => {
      console.log("[pttzzz] last board selection", lastSelectionRef.current);
      return lastSelectionRef.current;
    };

    return () => {
      if (window.pttzzzDebug?.dumpCurrentBoardArticles) {
        delete window.pttzzzDebug.dumpCurrentBoardArticles;
      }
      if (window.pttzzzDebug?.dumpLastBoardSelection) {
        delete window.pttzzzDebug.dumpLastBoardSelection;
      }
    };
  }, [articles, boardName]);

  function handleSearchCommit() {
    const val = searchInput.trim();
    if (!val) {
      setActiveFilter(null);
      return;
    }
    if (isAid(val)) {
      onSelectArticleByAid(normalizeAid(val));
      return;
    }
    setActiveFilter({ type: "search", keyword: val });
  }

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSearchCommit();
  }

  function handlePushFilterClick(threshold: number) {
    setSearchInput("");
    setActiveFilter((prev) =>
      prev?.type === "push" && prev.threshold === threshold
        ? null
        : { type: "push", threshold },
    );
  }

  function handleClearFilter() {
    setActiveFilter(null);
    setSearchInput("");
  }

  const filterLabel =
    activeFilter?.type === "search"
      ? `系列《${activeFilter.keyword}》`
      : activeFilter?.type === "push"
        ? `推文數 ≥${activeFilter.threshold}`
        : null;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* 頂部 */}
      <div className="sticky top-0 z-10 bg-gray-800 border-b border-gray-700">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-sky-400 hover:text-sky-300 transition-colors text-sm shrink-0"
          >
            ← 返回
          </button>
          <h1 className="text-lg font-semibold shrink-0">
            {boardName}
            {filterLabel ? (
              <span className="ml-2 text-sm font-normal text-sky-300">
                {filterLabel}
              </span>
            ) : (
              <span className="ml-2 text-sm font-normal text-gray-400">
                看板
              </span>
            )}
          </h1>
          {filterLabel && (
            <button
              onClick={handleClearFilter}
              className="ml-auto text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              ✕ 清除
            </button>
          )}
        </div>

        {/* 搜尋列 */}
        <div className="px-4 pb-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-1 min-w-0 items-center gap-1">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="搜尋標題 or #AID"
              className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-sky-600"
            />
            <button
              type="button"
              onClick={handleSearchCommit}
              disabled={!searchInput.trim()}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              搜尋
            </button>
          </div>

          {/* 推噓文數快選 */}
          <div className="flex items-center gap-1">
            {PUSH_QUICK_FILTERS.map(({ label, value }) => {
              const active =
                activeFilter?.type === "push" &&
                activeFilter.threshold === value;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => handlePushFilterClick(value)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    active
                      ? "bg-sky-600/30 border-sky-500 text-sky-200"
                      : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="divide-y divide-gray-800">
        {articles.map((a) => (
          <ArticleRow
            key={a.index}
            article={a}
            onClick={(index, element) => {
              lastSelectionRef.current = {
                boardName,
                index,
                title: a.title,
                author: a.author,
              };
              if (typeof window !== "undefined") {
                writeBoardScrollCache(boardName, window.scrollY);
                writeBoardAnchorCache(boardName, {
                  articleIndex: index,
                  scrollY: window.scrollY,
                  viewportTop: element.getBoundingClientRect().top,
                });
              }
              onSelectArticle({ ...a, index });
            }}
          />
        ))}
      </div>

      {/* Sentinel + 載入指示 */}
      <div className="py-8 text-center">
        {loading ? (
          <span className="text-gray-500 text-sm">載入中…</span>
        ) : error && articles.length === 0 ? (
          <span className="text-amber-400 text-sm">{error}</span>
        ) : articles.length === 0 ? (
          <span className="text-gray-600 text-sm">正在連線至 PTT…</span>
        ) : !hasMore ? (
          <span className="text-gray-700 text-xs">已到最舊文章</span>
        ) : supportsObserver ? (
          <div ref={sentinelRef} className="h-1" aria-hidden="true" />
        ) : (
          <button
            onClick={handleLoadMore}
            className="text-sky-400 text-sm hover:text-sky-300"
          >
            載入更多
          </button>
        )}
      </div>
    </div>
  );
}
