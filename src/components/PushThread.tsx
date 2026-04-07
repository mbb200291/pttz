/**
 * PushThread — 推文討論串
 *
 * 第一層推文直接列出；有 replyTo 的嵌套推文縮排顯示在父推文下方。
 */

import type { AggregatedPush } from "../lib/ptt/pushAggregator";

interface PushItemProps {
  push: AggregatedPush;
  children?: AggregatedPush[];
  depth?: number;
}

function PushBadge({ type }: { type: AggregatedPush["type"] }) {
  if (type === "push")
    return <span className="mr-1 text-xs font-bold text-green-400">推</span>;
  if (type === "boo")
    return <span className="mr-1 text-xs font-bold text-red-400">噓</span>;
  return <span className="mr-1 text-xs text-gray-400">→</span>;
}

function ScoreBadge({ score }: { score: number }) {
  if (score === 0) return null;
  const color = score > 0 ? "text-green-400" : "text-red-400";
  const sign = score > 0 ? "+" : "";
  return (
    <span className={`ml-1 text-xs ${color}`}>
      ({sign}
      {score})
    </span>
  );
}

function PushItem({ push, children = [], depth = 0 }: PushItemProps) {
  const indent = depth * 16; // px

  return (
    <div
      style={{ marginLeft: indent }}
      className="border-l border-gray-700 pl-2 my-1"
    >
      <div className="flex items-start gap-1 text-sm">
        <PushBadge type={push.type} />
        <span className="font-semibold text-sky-300 whitespace-nowrap">
          {push.author}
          {push.isOP && (
            <span className="ml-1 text-xs text-yellow-400">[OP]</span>
          )}
        </span>
        <span className="text-gray-300 flex-1 break-words">{push.content}</span>
        <ScoreBadge score={push.score} />
        <span className="text-xs text-gray-500 whitespace-nowrap shrink-0">
          {push.time}
        </span>
      </div>
      {children.map((child) => (
        <PushItem key={child.id} push={child} depth={depth + 1} />
      ))}
    </div>
  );
}

interface PushThreadProps {
  pushes: AggregatedPush[];
  score: number;
}

export function PushThread({ pushes, score }: PushThreadProps) {
  // 建立 parent id → children 的映射
  const childrenMap = new Map<string, AggregatedPush[]>();
  for (const p of pushes) {
    if (p.replyTo) {
      const list = childrenMap.get(p.replyTo) ?? [];
      list.push(p);
      childrenMap.set(p.replyTo, list);
    }
  }

  // 只取第一層（replyTo === null）
  const topLevel = pushes.filter((p) => p.replyTo === null);

  const scoreColor =
    score > 0 ? "text-green-400" : score < 0 ? "text-red-400" : "text-gray-400";
  const scoreLabel =
    score >= 100
      ? "爆"
      : score <= -10
        ? "XX"
        : `${score > 0 ? "+" : ""}${score}`;

  return (
    <div className="mt-4 border-t border-gray-700 pt-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold text-gray-300">推文</span>
        <span className={`text-sm font-bold ${scoreColor}`}>{scoreLabel}</span>
        <span className="text-xs text-gray-500">({topLevel.length} 則)</span>
      </div>
      <div className="space-y-0.5">
        {topLevel.map((p) => (
          <PushItem
            key={p.id}
            push={p}
            children={childrenMap.get(p.id) ?? []}
            depth={0}
          />
        ))}
      </div>
    </div>
  );
}
