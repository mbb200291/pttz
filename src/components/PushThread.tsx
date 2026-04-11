/**
 * PushThread — 推文討論串
 *
 * 第一層推文以卡片式顯示；有 replyTo 的嵌套推文顯示在父推文下。
 */

import type { AggregatedPush } from "../lib/ptt/pushAggregator";

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
  const color = score > 0 ? "text-green-400" : "text-red-400";
  const sign = score > 0 ? "+" : "";
  return <span className={`text-xs font-medium ${color}`}>{sign}{score}</span>;
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
            <div className="group relative min-w-0">
              <span className="truncate text-sm font-semibold text-sky-300">
                {push.author}
              </span>
              {ipLabel && (
                <div className="pointer-events-none absolute left-0 top-full z-10 mt-2 hidden whitespace-nowrap rounded-lg border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-300 shadow-lg group-hover:block">
                  {ipLabel}
                </div>
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

        <div className="pl-1">
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-200">
            {push.content}
          </p>
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
}

export function PushThread({
  pushes,
  score,
}: PushThreadProps) {
  const childrenMap = new Map<string, AggregatedPush[]>();
  for (const push of pushes) {
    if (push.replyTo) {
      const list = childrenMap.get(push.replyTo) ?? [];
      list.push(push);
      list.sort((a, b) => a.anchorOrder - b.anchorOrder);
      childrenMap.set(push.replyTo, list);
    }
  }

  const topLevel = pushes.filter((push) => push.replyTo === null);
  const scoreColor =
    score > 0 ? "text-green-400" : score < 0 ? "text-red-400" : "text-gray-400";
  const scoreLabel =
    score >= 100
      ? "爆"
      : score <= -10
        ? "XX"
        : `${score > 0 ? "+" : ""}${score}`;

  return (
    <div className="mt-10 border-t border-gray-700 pt-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm font-semibold tracking-wide text-gray-300">
          討論串
        </span>
        <span
          className={`rounded-full border border-current/20 px-2.5 py-1 text-sm font-bold ${scoreColor}`}
        >
          {scoreLabel}
        </span>
        <span className="text-xs text-gray-500">({topLevel.length} 則第一層回覆)</span>
      </div>

      <div className="space-y-3">
        {topLevel.map((push) => (
          <PushItem
            key={push.id}
            push={push}
            children={childrenMap.get(push.id) ?? []}
            childrenMap={childrenMap}
            depth={0}
          />
        ))}
      </div>
    </div>
  );
}
