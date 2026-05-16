/**
 * ArticleList — 看板文章列表
 * 支援：
 *   - scroll 自動載入（IntersectionObserver sentinel）
 *   - 標題關鍵字搜尋（/keyword）
 *   - 推噓文數篩選（Z threshold）
 *   - AID 跳轉（#XXXXXXXX）
 */

import type {
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
  TouchEvent,
  WheelEvent,
} from "react";
import { useRef, useEffect, useMemo, useState } from "react";
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
  onCompose?: (categoryOptions: string[]) => void;
  mockArticles?: ArticleSummary[];
  mockLoading?: boolean;
  mockRefreshing?: boolean;
  mockError?: string | null;
  onMockLoadMore?: () => void;
  onMockRefresh?: () => void;
}

function getPushBadgeStyle(count: string): {
  label: string;
  fg: string;
  bg: string;
} {
  if (!count || count.trim() === "") {
    return { label: "·", fg: "var(--text-dim)", bg: "transparent" };
  }
  if (count === "爆") {
    return {
      label: "爆",
      fg: "oklch(0.95 0.18 75)",
      bg: "oklch(0.95 0.18 75 / 0.12)",
    };
  }
  const num = parseInt(count, 10);
  if (count.startsWith("X") || num < 0) {
    return { label: count, fg: "var(--boo-fg)", bg: "var(--boo-bg)" };
  }
  if (num >= 100) {
    return {
      label: count,
      fg: "oklch(0.95 0.18 75)",
      bg: "oklch(0.95 0.18 75 / 0.10)",
    };
  }
  if (num >= 50) {
    return {
      label: count,
      fg: "oklch(0.85 0.16 60)",
      bg: "oklch(0.85 0.16 60 / 0.10)",
    };
  }
  if (num >= 10) {
    return { label: count, fg: "var(--push-fg)", bg: "var(--push-bg)" };
  }
  return { label: count, fg: "var(--text-muted)", bg: "transparent" };
}

// Extract [Category] prefix from title, e.g. "[討論] something" → { category: "討論", rest: "something" }
function parseTitle(title: string): { category: string | null; displayTitle: string; isRe: boolean } {
  const isRe = title.startsWith("Re:");
  // Strip leading "Re: " for further parsing
  let stripped = isRe ? title.slice(3).trimStart() : title;

  const catMatch = stripped.match(/^\[([^\]]+)\]\s*/);
  const category = catMatch ? catMatch[1] : null;
  if (catMatch) {
    stripped = stripped.slice(catMatch[0].length);
  }

  const displayTitle = isRe ? `Re: ${stripped}` : stripped;
  return { category, displayTitle, isRe };
}

export function extractCategoryOptionsFromArticles(
  articles: ArticleSummary[],
): string[] {
  const seen = new Set<string>();
  const categories: string[] = [];

  for (const article of articles) {
    const { category } = parseTitle(article.title);
    if (!category || seen.has(category)) continue;
    seen.add(category);
    categories.push(category);
  }

  return categories;
}

function ArticleRow({
  article,
  onClick,
}: {
  article: ArticleSummary;
  onClick: (index: number, element: HTMLButtonElement) => void;
}) {
  const isDeleted = article.title.includes("(已被刪除)");
  const isFixed = Boolean(article.fixed);
  const { category, displayTitle, isRe } = parseTitle(article.title);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const nextIndex = Number(event.currentTarget.dataset.articleIndex);
    onClick(
      Number.isNaN(nextIndex) ? article.index : nextIndex,
      event.currentTarget,
    );
  };

  const badgeStyle = isFixed ? null : getPushBadgeStyle(article.pushCount);

  return (
    <button
      type="button"
      data-article-index={article.index}
      data-fixed-article={isFixed ? "true" : undefined}
      onClick={handleClick}
      disabled={isDeleted}
      style={{
        display: "grid",
        gridTemplateColumns: "44px 56px 1fr auto",
        gap: 14,
        padding: "10px 20px",
        background: isFixed ? "var(--accent-soft)" : "transparent",
        borderBottom: "1px solid var(--border)",
        width: "100%",
        textAlign: "left",
        cursor: isDeleted ? "not-allowed" : "pointer",
        opacity: isDeleted ? 0.4 : 1,
        alignItems: "center",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!isFixed && !isDeleted) {
          (e.currentTarget as HTMLButtonElement).style.background =
            "var(--surface)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isFixed && !isDeleted) {
          (e.currentTarget as HTMLButtonElement).style.background =
            "transparent";
        }
      }}
    >
      {/* Column 1: Push badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        {isFixed ? (
          <span
            style={{
              minWidth: 36,
              height: 24,
              padding: "0 8px",
              borderRadius: 6,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "-0.02em",
              color: "var(--accent-ink)",
              background: "var(--accent-soft)",
            }}
          >
            置頂
          </span>
        ) : (
          <span
            style={{
              minWidth: 36,
              height: 24,
              padding: "0 8px",
              borderRadius: 6,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "-0.02em",
              color: badgeStyle!.fg,
              background: badgeStyle!.bg,
            }}
          >
            {badgeStyle!.label}
          </span>
        )}
      </div>

      {/* Column 2: Date + index stacked */}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11.5,
          color: "var(--text-dim)",
          lineHeight: 1.4,
        }}
      >
        <div>{article.date}</div>
        <div style={{ fontSize: 10, opacity: 0.7 }}>#{article.index}</div>
      </div>

      {/* Column 3: Title + meta */}
      <div style={{ minWidth: 0 }}>
        {/* Title row */}
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            minWidth: 0,
          }}
        >
          {isFixed && !category && (
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: "var(--accent-ink)",
                padding: "2px 6px",
                borderRadius: 4,
                background: "var(--accent-soft)",
                flexShrink: 0,
              }}
            >
              置頂
            </span>
          )}
          {category && (
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: "var(--accent-ink)",
                padding: "2px 6px",
                borderRadius: 4,
                background: "var(--accent-soft)",
                flexShrink: 0,
              }}
            >
              {category}
            </span>
          )}
          <span
            style={{
              fontSize: 14,
              fontWeight: isRe ? 500 : 600,
              color: isRe ? "var(--text-muted)" : "var(--text)",
              letterSpacing: "-0.01em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
              flex: 1,
            }}
          >
            {displayTitle}
          </span>
        </div>
        {/* Meta row */}
        {article.author && (
          <div
            style={{
              fontSize: 11.5,
              color: "var(--text-dim)",
              fontFamily: "var(--font-mono)",
              marginTop: 2,
            }}
          >
            {article.author}
          </div>
        )}
      </div>

      {/* Column 4: Right arrow hint */}
      <div
        style={{
          color: "var(--text-dim)",
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          paddingRight: 4,
        }}
      >
        →
      </div>
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
const PULL_REFRESH_THRESHOLD_PX = 72;
const PULL_REFRESH_MAX_DISTANCE_PX = 96;
const PULL_REFRESH_REFRESHING_GAP_PX = 48;

function isAtTopBoundary(): boolean {
  return typeof window === "undefined" || window.scrollY <= 0;
}

function getRubberBandDistance(rawDistance: number): number {
  if (rawDistance <= 0) return 0;
  const normalized = 1 - Math.exp(-rawDistance / PULL_REFRESH_MAX_DISTANCE_PX);
  return Math.round(PULL_REFRESH_MAX_DISTANCE_PX * normalized);
}

export function ArticleList({
  boardName,
  onSelectArticle,
  onSelectArticleByAid,
  onBack,
  initialFilter,
  onActiveFilterChange,
  onCompose,
  mockArticles,
  mockLoading,
  mockRefreshing,
  mockError,
  onMockLoadMore,
  onMockRefresh,
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
    refreshing: liveRefreshing,
    error: liveError,
    hasMore: liveHasMore,
    loadMore,
    refresh,
  } = useBoard(boardName, activeFilter);

  const articles = mockArticles ?? liveArticles;
  const loading = mockLoading ?? liveLoading;
  const refreshing = mockRefreshing ?? liveRefreshing;
  const error = mockError ?? liveError;
  const hasMore = mockArticles ? true : liveHasMore;
  const handleLoadMore = onMockLoadMore ?? loadMore;
  const handleRefresh = onMockRefresh ?? refresh;
  const observedCategoryOptions = useMemo(
    () => extractCategoryOptionsFromArticles(articles),
    [articles],
  );

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
  const touchStartYRef = useRef<number | null>(null);
  const pointerStartYRef = useRef<number | null>(null);
  const pullRawDistanceRef = useRef(0);
  const wheelPullDistanceRef = useRef(0);
  const wheelSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [pullReady, setPullReady] = useState(false);
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

  useEffect(() => {
    return () => {
      if (wheelSettleTimerRef.current) {
        clearTimeout(wheelSettleTimerRef.current);
      }
    };
  }, []);

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

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (!isAtTopBoundary()) return;
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
    pullRawDistanceRef.current = 0;
    setPullReady(false);
  }

  function handleTouchMove(event: TouchEvent<HTMLDivElement>) {
    const startY = touchStartYRef.current;
    if (startY === null) return;
    if (!isAtTopBoundary()) return;

    const currentY = event.touches[0]?.clientY ?? startY;
    const rawDistance = Math.max(0, currentY - startY);
    pullRawDistanceRef.current = rawDistance;
    setPullReady(rawDistance >= PULL_REFRESH_THRESHOLD_PX);
    setPullDistance(getRubberBandDistance(rawDistance));
  }

  function handleTouchEnd() {
    if (pullRawDistanceRef.current >= PULL_REFRESH_THRESHOLD_PX && !loading && !refreshing) {
      handleRefresh();
    }
    touchStartYRef.current = null;
    pullRawDistanceRef.current = 0;
    setPullReady(false);
    setPullDistance(0);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch" || event.button !== 0 || !isAtTopBoundary()) {
      return;
    }
    pointerStartYRef.current = event.clientY;
    pullRawDistanceRef.current = 0;
    setPullReady(false);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const startY = pointerStartYRef.current;
    if (startY === null) return;
    if (!isAtTopBoundary()) return;

    const rawDistance = Math.max(0, event.clientY - startY);
    pullRawDistanceRef.current = rawDistance;
    setPullReady(rawDistance >= PULL_REFRESH_THRESHOLD_PX);
    setPullDistance(getRubberBandDistance(rawDistance));
  }

  function handlePointerEnd() {
    if (pullRawDistanceRef.current >= PULL_REFRESH_THRESHOLD_PX && !loading && !refreshing) {
      handleRefresh();
    }
    pointerStartYRef.current = null;
    pullRawDistanceRef.current = 0;
    setPullReady(false);
    setPullDistance(0);
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (!isAtTopBoundary() || loading || refreshing) {
      wheelPullDistanceRef.current = 0;
      if (wheelSettleTimerRef.current) clearTimeout(wheelSettleTimerRef.current);
      setPullReady(false);
      setPullDistance(0);
      return;
    }

    if (event.deltaY >= 0) {
      wheelPullDistanceRef.current = 0;
      if (wheelSettleTimerRef.current) clearTimeout(wheelSettleTimerRef.current);
      setPullReady(false);
      setPullDistance(0);
      return;
    }

    wheelPullDistanceRef.current = Math.min(
      PULL_REFRESH_MAX_DISTANCE_PX,
      wheelPullDistanceRef.current + Math.abs(event.deltaY),
    );
    setPullReady(wheelPullDistanceRef.current >= PULL_REFRESH_THRESHOLD_PX);
    setPullDistance(getRubberBandDistance(wheelPullDistanceRef.current));

    if (wheelPullDistanceRef.current >= PULL_REFRESH_THRESHOLD_PX) {
      wheelPullDistanceRef.current = 0;
      if (wheelSettleTimerRef.current) clearTimeout(wheelSettleTimerRef.current);
      setPullReady(false);
      setPullDistance(0);
      handleRefresh();
      return;
    }

    if (wheelSettleTimerRef.current) clearTimeout(wheelSettleTimerRef.current);
    wheelSettleTimerRef.current = setTimeout(() => {
      wheelPullDistanceRef.current = 0;
      wheelSettleTimerRef.current = null;
      setPullReady(false);
      setPullDistance(0);
    }, 160);
  }

  const filterLabel =
    activeFilter?.type === "search"
      ? `系列《${activeFilter.keyword}》`
      : activeFilter?.type === "push"
        ? `推文數 ≥${activeFilter.threshold}`
        : null;

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onWheel={handleWheel}
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "var(--font)",
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "oklch(0.165 0.006 260 / 0.94)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "14px 24px 10px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            minHeight: 52,
          }}
        >
          <button
            onClick={onBack}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "transparent",
              border: "1px solid transparent",
              borderRadius: 8,
              color: "var(--text-muted)",
              cursor: "pointer",
              fontFamily: "var(--font)",
              fontSize: 13,
              fontWeight: 600,
              padding: "5px 0",
              flexShrink: 0,
            }}
          >
            ← 返回
          </button>
          <span style={{ width: 1, height: 18, background: "var(--border)" }} />
          <h1
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              margin: 0,
              minWidth: 0,
              flex: 1,
              fontSize: 14,
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              color: "var(--text)",
            }}
          >
            {boardName}
            <span
              style={{
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontFamily: "var(--font)",
                fontSize: 13,
                fontWeight: 500,
                color: filterLabel ? "var(--accent-ink)" : "var(--text-muted)",
              }}
            >
              {filterLabel ?? "看板"}
            </span>
          </h1>
          {filterLabel && (
            <button
              onClick={handleClearFilter}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--text-muted)",
                cursor: "pointer",
                fontFamily: "var(--font)",
                fontSize: 12,
                fontWeight: 600,
                padding: "6px 10px",
              }}
            >
              清除
            </button>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading || refreshing}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: refreshing ? "var(--accent-soft)" : "transparent",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: refreshing ? "var(--accent-ink)" : "var(--text-muted)",
              cursor: loading || refreshing ? "not-allowed" : "pointer",
              fontFamily: "var(--font)",
              fontSize: 12,
              fontWeight: 700,
              padding: "6px 10px",
              opacity: loading ? 0.55 : 1,
            }}
          >
            {refreshing ? "重新載入中" : "重新整理"}
          </button>
          {onCompose && (
            <button
              type="button"
              onClick={() => onCompose(observedCategoryOptions)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "var(--accent)",
                border: "1px solid var(--accent)",
                borderRadius: 8,
                color: "var(--accent-on)",
                cursor: "pointer",
                fontFamily: "var(--font)",
                fontSize: 13,
                fontWeight: 700,
                padding: "7px 13px",
              }}
            >
              ✎ 發文
            </button>
          )}
        </div>

        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "0 24px 16px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 0,
              flex: 1,
              minWidth: 240,
              border: "1px solid var(--border)",
              borderRadius: 10,
              background: "var(--surface)",
            }}
          >
            <span
              style={{
                padding: "0 6px 0 11px",
                color: "var(--text-dim)",
                display: "inline-flex",
              }}
            >
              ⌕
            </span>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="搜尋標題  或  #AID"
              style={{
                flex: 1,
                minWidth: 0,
                padding: "8px 10px",
                background: "transparent",
                border: 0,
                outline: "none",
                color: "var(--text)",
                fontFamily: "var(--font)",
                fontSize: 13.5,
              }}
            />
            <button
              type="button"
              onClick={handleSearchCommit}
              disabled={!searchInput.trim()}
              style={{
                marginRight: 4,
                padding: "6px 11px",
                borderRadius: 7,
                border: "1px solid transparent",
                background: searchInput.trim() ? "var(--accent)" : "transparent",
                color: searchInput.trim() ? "var(--accent-on)" : "var(--text-dim)",
                cursor: searchInput.trim() ? "pointer" : "not-allowed",
                fontFamily: "var(--font)",
                fontSize: 12,
                fontWeight: 700,
                opacity: searchInput.trim() ? 1 : 0.55,
              }}
            >
              搜尋
            </button>
          </div>

          <div
            style={{
              display: "inline-flex",
              gap: 1,
              padding: 3,
              background: "var(--surface)",
              borderRadius: 10,
              border: "1px solid var(--border)",
            }}
          >
            {PUSH_QUICK_FILTERS.map(({ label, value }) => {
              const active =
                activeFilter?.type === "push" &&
                activeFilter.threshold === value;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => handlePushFilterClick(value)}
                  style={{
                    border: 0,
                    borderRadius: 7,
                    background: active ? "var(--accent-soft)" : "transparent",
                    color: active ? "var(--accent-ink)" : "var(--text-muted)",
                    cursor: "pointer",
                    fontFamily: "var(--font)",
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "5px 11px",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div
        aria-hidden="true"
        data-testid="pull-refresh-indicator"
        style={{
          height: refreshing
            ? Math.max(PULL_REFRESH_REFRESHING_GAP_PX, pullDistance)
            : pullDistance,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-dim)",
          fontSize: 12,
          fontFamily: "var(--font)",
          transition: touchStartYRef.current === null ? "height 140ms ease" : "none",
        }}
      >
        {refreshing
          ? "重新載入中"
          : pullDistance > 0
            ? pullReady
              ? "放開重新整理"
              : "下拉重新整理"
            : ""}
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", paddingTop: 20 }}>
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
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "32px 0",
          textAlign: "center",
        }}
      >
        {loading ? (
          <span style={{ color: "var(--text-dim)", fontSize: 13 }}>載入中…</span>
        ) : refreshing ? (
          <span style={{ color: "var(--text-dim)", fontSize: 13 }}>重新載入中…</span>
        ) : error && articles.length === 0 ? (
          <span style={{ color: "oklch(0.86 0.16 75)", fontSize: 13 }}>{error}</span>
        ) : articles.length === 0 ? (
          <span style={{ color: "var(--text-dim)", fontSize: 13 }}>正在連線至 PTT…</span>
        ) : !hasMore ? (
          <span style={{ color: "var(--text-dim)", fontSize: 12 }}>已到最舊文章</span>
        ) : supportsObserver ? (
          <div ref={sentinelRef} className="h-1" aria-hidden="true" />
        ) : (
          <button
            onClick={handleLoadMore}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 13,
              padding: "6px 10px",
            }}
          >
            載入更多
          </button>
        )}
      </div>
    </div>
  );
}
