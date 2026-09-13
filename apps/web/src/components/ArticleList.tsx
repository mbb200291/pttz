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
  RefObject,
  TouchEvent,
  WheelEvent,
} from "react";
import { useRef, useEffect, useMemo, useState } from "react";
import { canUseShortcut, hasOpenNavigationDialog, navigateList, type NavigationKeyEvent } from "../lib/keyboardNavigation";
import { useBodyNavigation } from "../hooks/useBodyNavigation";
import { useBoard } from "../hooks/useBoard";
import type { BoardFilter } from "../lib/ptt/viewState";
import type { ArticleSummary } from "../lib/ptt/uiArticle";
import type { ArticleSummary as CoreArticleSummary } from "@pttzzz/core";
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

type DisplayArticleSummary = ArticleSummary | CoreArticleSummary;

function displayIndex(article: DisplayArticleSummary): number {
  return "index" in article
    ? article.index
    : "index" in article.key
      ? article.key.index ?? 0
      : 0;
}

function legacySummary(article: DisplayArticleSummary): ArticleSummary {
  return {
    index: displayIndex(article),
    mark: article.mark ?? "",
    pushCount: "pushCount" in article
      ? article.pushCount
      : article.nativeScoreLabel ?? String(article.nativeScore ?? ""),
    date: "date" in article ? article.date : article.publishedAt ?? "",
    author: article.author,
    title: article.title,
    fixed: "fixed" in article ? article.fixed : "pinned" in article ? article.pinned : false,
  };
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
  articles: DisplayArticleSummary[],
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
  article: DisplayArticleSummary;
  onClick: (index: number, element: HTMLButtonElement) => void;
}) {
  const normalized = legacySummary(article);
  const isDeleted = /[（(](?:本文)?已被刪除[）)]/.test(article.title);
  const isFixed = Boolean(normalized.fixed);
  const { category, displayTitle, isRe } = parseTitle(article.title);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const nextIndex = Number(event.currentTarget.dataset.articleIndex);
    onClick(
      Number.isNaN(nextIndex) ? normalized.index : nextIndex,
      event.currentTarget,
    );
  };

  const badgeStyle = isFixed ? null : getPushBadgeStyle(normalized.pushCount);

  return (
    <button
      type="button"
      data-article-index={normalized.index}
      data-navigation-item
      className="focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-400"
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

      {/* Column 2: index + PTT's yearless month/day label */}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11.5,
          color: "var(--text-dim)",
          lineHeight: 1.4,
        }}
      >
        <div>#{normalized.index}</div>
        <div style={{ fontSize: 10, opacity: 0.7 }}>{normalized.date}</div>
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

const PUSH_QUICK_FILTERS: Array<{ label: string; value: number | null }> = [
  { label: "全部", value: null },
  { label: "≥10", value: 10 },
  { label: "≥20", value: 20 },
  { label: "≥30", value: 30 },
  { label: "爆", value: 100 },
] as const;
const PUSH_FILTER_PRESETS = new Set([10, 20, 30, 100]);
const CUSTOM_PUSH_DEFAULT = 50;
const CUSTOM_PUSH_QUICK_VALUES = [5, 15, 25, 50, 75];

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

function clampPushThreshold(value: number): number {
  return Math.max(1, Math.min(999, Math.round(value)));
}

function parsePushThreshold(value: string): number | null {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) return null;
  return clampPushThreshold(numeric);
}

function getFilterKeywords(filter: BoardFilter | null): string[] {
  if (filter?.type === "search" || filter?.type === "combined") {
    return filter.keywords;
  }
  return [];
}

function getFilterThreshold(filter: BoardFilter | null): number | null {
  if (filter?.type === "push" || filter?.type === "combined") {
    return filter.threshold;
  }
  return null;
}

function mergeFilter(next: {
  keywords?: string[] | null;
  threshold?: number | null;
}): BoardFilter | null {
  const keywords = dedupeKeywords(next.keywords ?? []);
  const threshold = next.threshold ?? null;

  if (keywords.length > 0 && threshold !== null) {
    return { type: "combined", keywords, threshold };
  }
  if (keywords.length > 0) return { type: "search", keywords };
  if (threshold !== null) return { type: "push", threshold };
  return null;
}

function dedupeKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const keyword of keywords) {
    const trimmed = keyword.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function FilterCloseIcon() {
  return (
    <svg
      width={11}
      height={11}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function ChevronDownMiniIcon() {
  return (
    <svg
      width={9}
      height={9}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ opacity: 0.6 }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CustomThresholdPopover({
  value,
  anchorRef,
  onApply,
  onClose,
}: {
  value: number | null;
  anchorRef: RefObject<HTMLDivElement | null>;
  onApply: (threshold: number) => void;
  onClose: () => void;
}) {
  const initial =
    value !== null && !PUSH_FILTER_PRESETS.has(value)
      ? value
      : CUSTOM_PUSH_DEFAULT;
  const [draft, setDraft] = useState(String(initial));
  const parsed = parsePushThreshold(draft);

  useEffect(() => {
    function handlePointerDown(event: globalThis.MouseEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        anchorRef.current &&
        !anchorRef.current.contains(target)
      ) {
        onClose();
      }
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "Enter" && parsed !== null) onApply(parsed);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorRef, onApply, onClose, parsed]);

  const rangeValue = parsed ?? 1;

  return (
    <div
      role="dialog"
      aria-label="自訂推文門檻"
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        right: 0,
        zIndex: 30,
        width: 280,
        padding: 14,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        boxShadow:
          "0 10px 30px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)",
        fontFamily: "var(--font)",
        color: "var(--text)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          color: "var(--text-dim)",
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        自訂推文門檻
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>推噓 ≥</span>
        <input
          type="number"
          min={1}
          max={999}
          value={draft}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "") {
              setDraft("");
              return;
            }
            const parsedNext = parsePushThreshold(next);
            if (parsedNext !== null) setDraft(String(parsedNext));
          }}
          autoFocus
          style={{
            flex: 1,
            padding: "6px 10px",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 7,
            color: "var(--text)",
            fontSize: 16,
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            letterSpacing: "-0.01em",
            outline: "none",
            textAlign: "right",
          }}
        />
        <span style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
          推
        </span>
      </div>

      <input
        aria-label="推文門檻"
        type="range"
        min={1}
        max={100}
        value={rangeValue}
        onChange={(event) =>
          setDraft(String(clampPushThreshold(Number(event.target.value))))
        }
        style={{ width: "100%", accentColor: "var(--accent-ink)", margin: "2px 0 8px" }}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: "var(--text-dim)",
          fontFamily: "var(--font-mono)",
          marginBottom: 12,
        }}
      >
        <span>1</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100+</span>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }}>
        {CUSTOM_PUSH_QUICK_VALUES.map((quickValue) => (
          <button
            key={quickValue}
            type="button"
            onClick={() => setDraft(String(quickValue))}
            style={{
              padding: "4px 9px",
              borderRadius: 6,
              background:
                parsed === quickValue ? "var(--accent-soft)" : "transparent",
              border: `1px solid ${
                parsed === quickValue ? "var(--accent-border)" : "var(--border)"
              }`,
              color:
                parsed === quickValue ? "var(--accent-ink)" : "var(--text-muted)",
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
            }}
          >
            ≥{quickValue}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "6px 12px",
            borderRadius: 7,
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--text-muted)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "var(--font)",
          }}
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => {
            if (parsed !== null) onApply(parsed);
          }}
          disabled={parsed === null}
          style={{
            padding: "6px 14px",
            borderRadius: 7,
            background: "var(--accent-ink)",
            border: "1px solid var(--accent-ink)",
            color: "var(--surface)",
            fontSize: 12,
            fontWeight: 700,
            cursor: parsed === null ? "not-allowed" : "pointer",
            fontFamily: "var(--font)",
            opacity: parsed === null ? 0.5 : 1,
          }}
        >
          套用
        </button>
      </div>
    </div>
  );
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
    "",
  );
  const [activeFilter, setActiveFilter] = useState<BoardFilter | null>(
    initialFilter ?? null,
  );
  const [customPushFilterOpen, setCustomPushFilterOpen] = useState(false);
  const pushFilterRef = useRef<HTMLDivElement>(null);
  const navigationRef = useRef<HTMLDivElement>(null);
  useBodyNavigation(navigationRef, handleNavigation);

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
      ? activeFilter.keywords.join("/")
      : activeFilter?.type === "push"
        ? activeFilter.threshold
        : activeFilter?.type === "combined"
          ? `${activeFilter.keywords.join("/")}:${activeFilter.threshold}`
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
          if (document.activeElement === document.body && !row.matches(":disabled") && !hasOpenNavigationDialog()) row.focus({ preventScroll: true });
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
      const snapshot = articles.map(legacySummary);
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
      return;
    }
    if (isAid(val)) {
      onSelectArticleByAid(normalizeAid(val));
      return;
    }
    setActiveFilter((prev) =>
      mergeFilter({
        keywords: [...getFilterKeywords(prev), val],
        threshold: getFilterThreshold(prev),
      }),
    );
    setSearchInput("");
  }

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSearchCommit();
  }

  function handlePushFilterClick(threshold: number | null) {
    setCustomPushFilterOpen(false);
    if (threshold === null) {
      setActiveFilter((prev) =>
        mergeFilter({ keywords: getFilterKeywords(prev) }),
      );
      return;
    }
    setActiveFilter((prev) =>
      getFilterThreshold(prev) === threshold
        ? mergeFilter({ keywords: getFilterKeywords(prev) })
        : mergeFilter({ keywords: getFilterKeywords(prev), threshold }),
    );
  }

  function handleCustomPushFilterApply(threshold: number) {
    setCustomPushFilterOpen(false);
    setActiveFilter((prev) =>
      mergeFilter({ keywords: getFilterKeywords(prev), threshold }),
    );
  }

  function handleClearFilter() {
    setActiveFilter(null);
    setSearchInput("");
    setCustomPushFilterOpen(false);
  }

  function handleClearKeywordFilter(keyword: string) {
    setActiveFilter((prev) =>
      mergeFilter({
        keywords: getFilterKeywords(prev).filter(
          (currentKeyword) => currentKeyword.toLowerCase() !== keyword.toLowerCase(),
        ),
        threshold: getFilterThreshold(prev),
      }),
    );
  }

  function handleClearPushFilter() {
    if (getFilterThreshold(activeFilter) === null) return;
    setActiveFilter((prev) =>
      mergeFilter({ keywords: getFilterKeywords(prev) }),
    );
    setCustomPushFilterOpen(false);
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
    activeFilter?.type === "search" || activeFilter?.type === "combined"
      ? `系列《${activeFilter.keywords.join(" / ")}》`
      : activeFilter?.type === "push"
        ? `推噓 ≥${activeFilter.threshold}`
        : null;
  const activeKeywords = getFilterKeywords(activeFilter);
  const activePushThreshold = getFilterThreshold(activeFilter);
  const isCustomPushFilter =
    activePushThreshold !== null && !PUSH_FILTER_PRESETS.has(activePushThreshold);

  function handleNavigation(event: NavigationKeyEvent, scope?: HTMLElement) {
    if (event.key.toLowerCase() === "z" && canUseShortcut(event, false, scope)) {
      event.preventDefault();
      setCustomPushFilterOpen(true);
      return;
    }
    if (event.key.toLowerCase() === "p" && onCompose && canUseShortcut(event, true, scope)) {
      event.preventDefault();
      onCompose(observedCategoryOptions);
      return;
    }
    navigateList(event, onBack, scope);
  }

  return (
    <div
      ref={navigationRef}
      onTouchStart={handleTouchStart}
      onKeyDown={handleNavigation}
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
              aria-keyshortcuts="Control+p"
              title="發文（Ctrl+P）"
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
            ref={pushFilterRef}
            style={{
              position: "relative",
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
                value === null
                  ? activePushThreshold === null
                  : activePushThreshold === value;
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
            <span
              style={{
                width: 1,
                background: "var(--border)",
                margin: "2px 2px",
              }}
            />
            <button
              type="button"
              onClick={() => setCustomPushFilterOpen((open) => !open)}
              title="自訂推文門檻"
              style={{
                border: 0,
                borderRadius: 7,
                background: isCustomPushFilter ? "var(--accent-soft)" : "transparent",
                color: isCustomPushFilter ? "var(--accent-ink)" : "var(--text-muted)",
                cursor: "pointer",
                fontFamily: "var(--font)",
                fontSize: 12,
                fontWeight: 700,
                padding: "5px 11px",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {isCustomPushFilter ? `≥${activePushThreshold}` : "自訂"}
              <ChevronDownMiniIcon />
            </button>
            {customPushFilterOpen && (
              <CustomThresholdPopover
                value={activePushThreshold}
                anchorRef={pushFilterRef}
                onApply={handleCustomPushFilterApply}
                onClose={() => setCustomPushFilterOpen(false)}
              />
            )}
          </div>
        </div>

        {activeFilter && (
          <div
            style={{
              maxWidth: 1100,
              margin: "0 auto",
              padding: "0 24px 14px",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.06em",
                color: "var(--text-dim)",
                textTransform: "uppercase",
                marginRight: 2,
              }}
            >
              篩選中
            </span>
            {activeKeywords.map((keyword) => (
              <span
                key={keyword}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 4px 4px 10px",
                  borderRadius: 999,
                  background: "var(--accent-soft)",
                  color: "var(--accent-ink)",
                  border: "1px solid var(--accent-border)",
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "-0.005em",
                }}
              >
                <span aria-hidden="true">⌕</span>
                <span>
                  關鍵字{" "}
                  <span style={{ fontFamily: "var(--font-mono)" }}>
                    「{keyword}」
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => handleClearKeywordFilter(keyword)}
                  title={`清除關鍵字 ${keyword}`}
                  style={{
                    background: "transparent",
                    border: 0,
                    color: "inherit",
                    cursor: "pointer",
                    padding: "3px 5px",
                    borderRadius: 999,
                    display: "inline-flex",
                    alignItems: "center",
                    opacity: 0.75,
                    fontFamily: "var(--font)",
                    fontSize: 12,
                  }}
                >
                  <FilterCloseIcon />
                </button>
              </span>
            ))}
            {activePushThreshold !== null && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 4px 4px 10px",
                  borderRadius: 999,
                  background: "var(--accent-soft)",
                  color: "var(--accent-ink)",
                  border: "1px solid var(--accent-border)",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                <span>
                  推噓 {activePushThreshold >= 100 ? "爆文" : `≥${activePushThreshold}`}
                </span>
                <button
                  type="button"
                  onClick={handleClearPushFilter}
                  title="清除推噓篩選"
                  style={{
                    background: "transparent",
                    border: 0,
                    color: "inherit",
                    cursor: "pointer",
                    padding: "3px 5px",
                    borderRadius: 999,
                    display: "inline-flex",
                    alignItems: "center",
                    opacity: 0.75,
                    fontFamily: "var(--font)",
                    fontSize: 12,
                  }}
                >
                  <FilterCloseIcon />
                </button>
              </span>
            )}
            <span
              style={{
                fontSize: 12,
                color: "var(--text-dim)",
                fontFamily: "var(--font-mono)",
                marginLeft: 4,
              }}
            >
              · {articles.length} 篇符合
            </span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={handleClearFilter}
              style={{
                background: "transparent",
                border: 0,
                color: "var(--text-muted)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                padding: "4px 8px",
                borderRadius: 6,
                fontFamily: "var(--font)",
              }}
            >
              清除全部
            </button>
          </div>
        )}
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
            key={displayIndex(a)}
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
              onSelectArticle({ ...legacySummary(a), index });
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
        ) : error ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>暫時無法載入</span>
            <button
              type="button"
              onClick={handleLoadMore}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--text)",
                cursor: "pointer",
                fontSize: 13,
                padding: "6px 10px",
              }}
            >
              再試一次
            </button>
          </div>
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
