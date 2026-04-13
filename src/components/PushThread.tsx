/**
 * PushThread — 推文討論串
 *
 * 第一層推文以卡片式顯示；有 replyTo 的嵌套推文顯示在父推文下。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { AggregatedPush } from "../lib/ptt/pushAggregator";
import { RichContent } from "./RichContent";

export type ReplySortKey = "time" | "score";
export type ReplySortDirection = "asc" | "desc";

export interface ReplySortState {
  key: ReplySortKey;
  direction: ReplySortDirection;
}

export const DEFAULT_REPLY_SORT: ReplySortState = {
  key: "time",
  direction: "asc",
};

const INITIAL_VISIBLE_TOP_LEVEL_REPLIES = 30;
const REPLY_RENDER_BATCH_SIZE = 30;

function compareTopLevelReplies(
  a: AggregatedPush,
  b: AggregatedPush,
  sort: ReplySortState,
): number {
  const direction = sort.direction === "asc" ? 1 : -1;
  const primary =
    sort.key === "score" ? a.score - b.score : a.anchorOrder - b.anchorOrder;

  if (primary !== 0) return primary * direction;

  const anchorTie = a.anchorOrder - b.anchorOrder;
  if (anchorTie !== 0) return anchorTie;

  return a.id.localeCompare(b.id);
}

export function sortTopLevelPushes(
  pushes: AggregatedPush[],
  sort: ReplySortState,
): AggregatedPush[] {
  return [...pushes].sort((a, b) => compareTopLevelReplies(a, b, sort));
}

interface PushItemProps {
  push: AggregatedPush;
  children?: AggregatedPush[];
  childrenMap?: Map<string, AggregatedPush[]>;
  depth?: number;
}

function PushBadge({ type }: { type: AggregatedPush["type"] }) {
  if (type === "edit") {
    return (
      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-300">
        編
      </span>
    );
  }
  if (type === "push") {
    return (
      <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-bold text-green-300">
        推
      </span>
    );
  }
  if (type === "boo") {
    return (
      <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-bold text-red-300">
        噓
      </span>
    );
  }
  return (
    <span className="rounded-full bg-gray-700/70 px-2 py-0.5 text-xs text-gray-300">
      →
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  if (score === 0) return null;
  const color =
    score > 0
      ? "border-green-500/20 bg-green-500/10 text-green-300"
      : "border-red-500/20 bg-red-500/10 text-red-300";
  const label = score > 0 ? "推" : "噓";
  const sign = score > 0 ? "+" : "";
  return (
    <span
      title="此回文收到的巢狀推噓分數"
      className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${color}`}
    >
      {label} {sign}
      {score}
    </span>
  );
}

function PushItem({
  push,
  children = [],
  childrenMap,
  depth = 0,
}: PushItemProps) {
  const visualDepth = Math.min(depth, 3);
  const indent = visualDepth * 20;
  const ipLabel =
    push.ipAddresses.length === 0 ? null : push.ipAddresses.join(", ");
  const isEditNode = push.type === "edit";

  return (
    <div style={{ marginLeft: indent }} className="relative">
      {depth > 0 && (
        <div className="absolute bottom-0 left-0 top-0 w-px bg-gray-700/70" />
      )}

      <div
        className={`rounded-2xl border px-4 py-3 shadow-sm ${
          isEditNode
            ? "border-amber-500/30 bg-amber-500/5"
            : depth === 0
            ? "border-gray-700 bg-gray-800/80"
            : depth <= 3
              ? "border-gray-800 bg-gray-900/85"
              : "border-gray-800/90 bg-gray-950/90"
        }`}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <PushBadge type={push.type} />
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-sm font-semibold text-sky-300">
                {push.author}
              </span>
              {ipLabel && (
                <span className="shrink-0 text-[11px] text-gray-500">
                  {ipLabel}
                </span>
              )}
            </div>
            {push.isOP && (
              <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[11px] font-medium text-yellow-300">
                OP
              </span>
            )}
            {!isEditNode && <ScoreBadge score={push.score} />}
            {push.marker && (
              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                {push.marker.trim()}
              </span>
            )}
          </div>
          {push.time ? (
            <span className="shrink-0 text-xs text-gray-500">{push.time}</span>
          ) : null}
        </div>

        <div className="pl-1 text-sm leading-6 text-gray-200">
          <RichContent text={push.content} variant="inline" />
        </div>

        {children.length > 0 && (
          <div className="mt-3 space-y-2 border-t border-gray-800/80 pt-3">
            {children.map((child) => (
              <PushItem
                key={child.id}
                push={child}
                children={childrenMap?.get(child.id) ?? []}
                childrenMap={childrenMap}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface PushThreadProps {
  pushes: AggregatedPush[];
  score: number;
  onRefresh?: () => Promise<void> | void;
  refreshing?: boolean;
  initialVisibleTopLevelCount?: number;
  renderBatchSize?: number;
}

export function PushThread({
  pushes,
  score,
  onRefresh,
  refreshing = false,
  initialVisibleTopLevelCount = INITIAL_VISIBLE_TOP_LEVEL_REPLIES,
  renderBatchSize = REPLY_RENDER_BATCH_SIZE,
}: PushThreadProps) {
  const [sort, setSort] = useState<ReplySortState>(DEFAULT_REPLY_SORT);
  const [visibleTopLevelCount, setVisibleTopLevelCount] = useState(
    initialVisibleTopLevelCount,
  );
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const childrenMap = useMemo(() => {
    const nextMap = new Map<string, AggregatedPush[]>();
    for (const push of pushes) {
      if (push.replyTo) {
        const list = nextMap.get(push.replyTo) ?? [];
        list.push(push);
        list.sort((a, b) => a.anchorOrder - b.anchorOrder);
        nextMap.set(push.replyTo, list);
      }
    }
    return nextMap;
  }, [pushes]);

  const topLevel = useMemo(
    () => pushes.filter((push) => push.replyTo === null),
    [pushes],
  );
  const sortedTopLevel = useMemo(
    () => sortTopLevelPushes(topLevel, sort),
    [sort, topLevel],
  );
  const visibleTopLevel = sortedTopLevel.slice(0, visibleTopLevelCount);
  const hasMoreTopLevel = visibleTopLevel.length < sortedTopLevel.length;
  const supportsIntersectionObserver =
    typeof IntersectionObserver !== "undefined";

  useEffect(() => {
    setVisibleTopLevelCount(initialVisibleTopLevelCount);
  }, [initialVisibleTopLevelCount, pushes, sort.direction, sort.key]);

  useEffect(() => {
    if (!hasMoreTopLevel || !supportsIntersectionObserver) return;

    const target = sentinelRef.current;
    if (!target) return;

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisibleTopLevelCount((current) =>
        Math.min(current + renderBatchSize, sortedTopLevel.length),
      );
    });

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [
    hasMoreTopLevel,
    renderBatchSize,
    sortedTopLevel.length,
    supportsIntersectionObserver,
  ]);

  function setSortKey(key: ReplySortKey) {
    setSort((current) => {
      if (current.key === key) return current;
      return { key, direction: key === "score" ? "desc" : "asc" };
    });
  }

  function toggleSortDirection() {
    setSort((current) => ({
      ...current,
      direction: current.direction === "asc" ? "desc" : "asc",
    }));
  }

  function showMoreTopLevel() {
    setVisibleTopLevelCount((current) =>
      Math.min(current + renderBatchSize, sortedTopLevel.length),
    );
  }

  function handleRefresh() {
    if (!onRefresh || refreshing) return;
    void onRefresh();
  }

  const scoreColor =
    score > 0 ? "text-green-400" : score < 0 ? "text-red-400" : "text-gray-400";
  const scoreLabel =
    score >= 100
      ? "爆"
      : score <= -10
        ? "XX"
        : `${score > 0 ? "+" : ""}${score}`;
  const directionLabel =
    sort.key === "time"
      ? sort.direction === "asc"
        ? "舊到新"
        : "新到舊"
      : sort.direction === "asc"
        ? "低到高"
        : "高到低";

  return (
    <div className="mt-10 border-t border-gray-700 pt-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold tracking-wide text-gray-300">
            討論串
          </span>
          <span
            className={`rounded-full border border-current/20 px-2.5 py-1 text-sm font-bold ${scoreColor}`}
          >
            {scoreLabel}
          </span>
          <span className="text-xs text-gray-500">
            ({topLevel.length} 則第一層回覆)
          </span>
          <span className="text-xs text-gray-500">
            已顯示 {visibleTopLevel.length} / {sortedTopLevel.length}{" "}
            則第一層回覆
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-gray-700 bg-gray-900/70 p-1">
            <button
              type="button"
              onClick={() => setSortKey("time")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                sort.key === "time"
                  ? "bg-sky-500/20 text-sky-200"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              時間
            </button>
            <button
              type="button"
              onClick={() => setSortKey("score")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                sort.key === "score"
                  ? "bg-sky-500/20 text-sky-200"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              推噓分
            </button>
          </div>
          <button
            type="button"
            onClick={toggleSortDirection}
            className="rounded-lg border border-gray-700 bg-gray-900/70 px-2.5 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
          >
            {directionLabel}
          </button>
          {onRefresh && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="rounded-lg border border-gray-700 bg-gray-900/70 px-2.5 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? "更新中..." : "重新整理回文"}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {visibleTopLevel.map((push) => (
          <PushItem
            key={push.id}
            push={push}
            children={childrenMap.get(push.id) ?? []}
            childrenMap={childrenMap}
            depth={0}
          />
        ))}
      </div>
      {hasMoreTopLevel && (
        <div ref={sentinelRef} className="mt-4 flex justify-center">
          {!supportsIntersectionObserver && (
            <button
              type="button"
              onClick={showMoreTopLevel}
              className="rounded-lg border border-gray-700 bg-gray-900/70 px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
            >
              顯示更多回覆
            </button>
          )}
        </div>
      )}
      {!hasMoreTopLevel && (
        <div className="mt-5 border-t border-gray-800 pt-5 text-center text-sm text-gray-500">
          沒有新回文
        </div>
      )}
    </div>
  );
}
