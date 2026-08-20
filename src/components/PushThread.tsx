/**
 * PushThread — 推文討論串
 *
 * 第一層推文以卡片式顯示；有 replyTo 的嵌套推文顯示在父推文下。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  detectArticleVote,
  normalizePttId,
  type AggregatedPush,
} from "../lib/ptt/pushAggregator";
import { RichContent } from "./RichContent";
import { VotePair } from "./VotePair";
import { Monogram } from "./Monogram";

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

export interface VoteCount {
  push: number;
  boo: number;
}

export interface PushEditRecord {
  time: string;    // display timestamp
  content: string; // content at that version
}

export interface PushEditData {
  content: string;
  history: PushEditRecord[];
}

const INITIAL_VISIBLE_TOP_LEVEL_REPLIES = 30;
const REPLY_RENDER_BATCH_SIZE = 30;
const REFRESH_ANIMATION_MIN_MS = 350;
const REFRESH_HIGHLIGHT_MS = 220;
function getViewerVote(push: AggregatedPush, currentUser?: string): -1 | 0 | 1 {
  if (!currentUser) return 0;
  const viewerId = normalizePttId(currentUser);
  if (push.pushVoters.some((author) => normalizePttId(author) === viewerId)) return 1;
  if (push.booVoters.some((author) => normalizePttId(author) === viewerId)) return -1;
  return 0;
}

function getPushVoteState(push: AggregatedPush, currentUser?: string) {
  return {
    value: getViewerVote(push, currentUser),
    count: {
      push: push.pushVoters.length,
      boo: push.booVoters.length,
    },
  };
}

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

// ─── Inline SVG icons ──────────────────────────────────────────────────────────

function PencilIcon() {
  return (
    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 .49-4.5" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  );
}

function ReplyIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

// ─── PushBadge ────────────────────────────────────────────────────────────────

function PushBadge({ type }: { type: AggregatedPush["type"] }) {
  const config: Record<string, { bg: string; fg: string; label: string }> = {
    push:    { bg: "var(--push-bg)",    fg: "var(--push-fg)",    label: "推" },
    boo:     { bg: "var(--boo-bg)",     fg: "var(--boo-fg)",     label: "噓" },
    neutral: { bg: "var(--neutral-bg)", fg: "var(--neutral-fg)", label: "→" },
    edit:    { bg: "var(--accent-soft)", fg: "var(--edit-fg)",   label: "編" },
  };
  const { bg, fg, label } = config[type] ?? config.neutral;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 22,
      height: 22,
      padding: "0 6px",
      borderRadius: 6,
      fontFamily: "var(--font-mono)",
      fontWeight: 700,
      fontSize: 11,
      background: bg,
      color: fg,
    }}>
      {label}
    </span>
  );
}

// ─── FloorChip ────────────────────────────────────────────────────────────────

function formatSourceFloors(sourceFloors: number[], fallbackFloor: number): string {
  const floors = [...new Set(sourceFloors.length > 0 ? sourceFloors : [fallbackFloor])]
    .filter(Boolean)
    .sort((a, b) => a - b);
  if (floors.length === 0) return "";
  const consecutive = floors.every((floor, index) => index === 0 || floor === floors[index - 1] + 1);
  if (floors.length > 1 && consecutive) return `${floors[0]}–${floors[floors.length - 1]}F`;
  return `${floors.join("、")}F`;
}

function FloorChip({ sourceFloors, fallbackFloor }: { sourceFloors: number[]; fallbackFloor: number }) {
  const label = formatSourceFloors(sourceFloors, fallbackFloor);
  if (!label) return null;
  return (
    <span style={{
      fontFamily: "var(--font-mono)",
      fontSize: 10.5,
      color: "var(--text-dim)",
      padding: "2px 6px",
      borderRadius: 5,
      background: "var(--surface)",
      border: "1px solid var(--border)",
    }}>
      {label}
    </span>
  );
}

// ─── ghostBtn style factory ───────────────────────────────────────────────────

function ghostBtnStyle(active = false): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "5px 9px",
    borderRadius: 7,
    border: `1px solid ${active ? "var(--accent-border)" : "var(--border)"}`,
    background: active ? "var(--accent-soft)" : "transparent",
    color: active ? "var(--accent-ink)" : "var(--text-muted)",
    fontSize: 11.5,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

function iconBtnStyle(active = false): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    padding: 0,
    borderRadius: 7,
    border: `1px solid ${active ? "var(--accent-border)" : "var(--border)"}`,
    background: active ? "var(--accent-soft)" : "transparent",
    color: active ? "var(--accent-ink)" : "var(--text-muted)",
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

// ─── EditHistoryPanel ─────────────────────────────────────────────────────────

function EditHistoryPanel({
  editData,
  onClose,
}: {
  editData: PushEditData;
  onClose: () => void;
}) {
  const count = editData.history.length;
  return (
    <div style={{
      marginTop: 8,
      marginLeft: 32,
      background: "var(--bg-subtle)",
      border: "1px dashed var(--accent-border)",
      borderRadius: 10,
      padding: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent-ink)" }}>
          編輯歷史 · {count} 個版本
        </span>
        <button type="button" onClick={onClose} style={ghostBtnStyle()}>
          收起
        </button>
      </div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {editData.history.map((record, i) => {
          const isLast = i === editData.history.length - 1;
          const isFirst = i === 0;
          return (
            <li key={i} style={{
              position: "relative",
              paddingLeft: 18,
              paddingBottom: 10,
              borderLeft: `1.5px solid ${isLast ? "var(--accent)" : "var(--border)"}`,
            }}>
              {/* Dot */}
              <span style={{
                position: "absolute",
                left: -5,
                top: 4,
                width: 8,
                height: 8,
                borderRadius: 4,
                background: isLast ? "var(--accent)" : "var(--border-strong)",
              }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text-dim)",
                }}>
                  {record.time}
                </span>
                {isLast && (
                  <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--accent-ink)",
                    background: "var(--accent-soft)",
                    borderRadius: 4,
                    padding: "1px 5px",
                  }}>
                    目前版本
                  </span>
                )}
                {isFirst && !isLast && (
                  <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--text-dim)",
                    background: "var(--surface-2)",
                    borderRadius: 4,
                    padding: "1px 5px",
                  }}>
                    原始
                  </span>
                )}
                {isFirst && isLast && (
                  <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--text-dim)",
                    background: "var(--surface-2)",
                    borderRadius: 4,
                    padding: "1px 5px",
                  }}>
                    原始
                  </span>
                )}
              </div>
              <p style={{
                margin: 0,
                fontSize: 12,
                color: "var(--text)",
                lineHeight: 1.6,
              }}>
                {record.content}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ─── PushItem ─────────────────────────────────────────────────────────────────

interface PushItemProps {
  push: AggregatedPush;
  children?: AggregatedPush[];
  childrenMap?: Map<string, AggregatedPush[]>;
  depth?: number;
  currentUser?: string;
  onReply?: (push: AggregatedPush) => void;
  onEdit?: (push: AggregatedPush) => void;
  voteState?: { value: -1 | 0 | 1; count: VoteCount };
  onVote?: (next: -1 | 0 | 1) => void;
  editData?: PushEditData;
  pushVotes?: Map<string, { value: -1 | 0 | 1; count: VoteCount }>;
  pushEdits?: Map<string, PushEditData>;
  onVoteRaw?: (pushId: string, next: -1 | 0 | 1) => void;
  pendingVoteIds?: ReadonlySet<string>;
}

function PushItem({
  push,
  children = [],
  childrenMap,
  depth = 0,
  currentUser,
  onReply,
  onEdit,
  voteState,
  onVote,
  editData,
  pushVotes,
  pushEdits,
  onVoteRaw,
  pendingVoteIds,
}: PushItemProps) {
  const [showHistory, setShowHistory] = useState(false);
  const toggleHistory = useCallback(() => setShowHistory(v => !v), []);

  const visualDepth = Math.min(depth, 3);
  const indent = visualDepth * 12;
  const ipLabel =
    push.ipAddresses.length === 0 ? null : push.ipAddresses.join(", ");
  const isEditNode = push.type === "edit";
  const displayVoteState = voteState ?? getPushVoteState(push, currentUser);

  const cardBorder = isEditNode
    ? "1px solid var(--accent-border)"
    : "1px solid var(--border)";
  const cardBackground = depth === 0 ? "var(--surface)" : "var(--surface-2)";

  const scoreAbs = Math.abs(push.score);
  const scoreLabel = push.score > 0 ? `推 +${scoreAbs}` : `噓 -${scoreAbs}`;
  const scoreFg = push.score > 0 ? "var(--push-fg)" : "var(--boo-fg)";
  const scoreBg = push.score > 0 ? "var(--push-bg)" : "var(--boo-bg)";
  const canEdit = Boolean(
    onEdit &&
    currentUser &&
    normalizePttId(push.author) === normalizePttId(currentUser) &&
    !isEditNode,
  );

  const actionCluster = !isEditNode && (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 4,
      flexWrap: "wrap",
    }}>
      {onVote && (
        <VotePair
          value={displayVoteState.value}
          count={displayVoteState.count}
          voters={{ push: push.pushVoters, boo: push.booVoters }}
          myVote={displayVoteState.value}
          onPush={() => onVote(1)}
          onBoo={() => onVote(-1)}
          size="xs"
          disabled={pendingVoteIds?.has(push.id) ?? false}
        />
      )}

      {onReply && (
        <button
          type="button"
          onClick={() => onReply(push)}
          aria-label="回覆"
          title="回覆"
          style={iconBtnStyle()}
        >
          <ReplyIcon />
        </button>
      )}

      {canEdit && (
        <button
          type="button"
          onClick={() => onEdit?.(push)}
          aria-label="編輯"
          title="編輯"
          style={iconBtnStyle()}
        >
          <PencilIcon />
        </button>
      )}

      {editData && editData.history.length > 1 && (
        <button
          type="button"
          onClick={toggleHistory}
          aria-label={showHistory ? "收起歷史" : "編輯歷史"}
          title={showHistory ? "收起歷史" : "編輯歷史"}
          style={iconBtnStyle(showHistory)}
        >
          <HistoryIcon />
        </button>
      )}
    </div>
  );

  return (
    <div style={{ marginLeft: indent, position: "relative" }}>
      {depth > 0 && (
        <div style={{
          position: "absolute",
          left: -14,
          top: 16,
          bottom: 8,
          width: 2,
          background: "var(--border)",
        }} />
      )}

      <div style={{
        border: cardBorder,
        borderRadius: 10,
        padding: "8px 10px",
        marginBottom: 4,
        background: cardBackground,
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        flexWrap: "wrap",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Card header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 3,
            flexWrap: "wrap",
          }}>
            <Monogram name={push.author} size={20} />

            <span style={{ fontWeight: 700, fontSize: 12.5, color: "var(--text)" }}>
              {push.author}
            </span>

            {push.isOP && (
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--op-fg)",
                background: "var(--op-bg)",
                borderRadius: 5,
                padding: "1px 6px",
              }}>
                OP · 原PO
              </span>
            )}

            {isEditNode && push.marker && (
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--edit-fg)",
                background: "var(--accent-soft)",
                borderRadius: 5,
                padding: "1px 6px",
              }}>
                {push.marker.trim()}
              </span>
            )}

            <PushBadge type={push.type} />

            {push.score !== 0 && !isEditNode && (
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: scoreFg,
                background: scoreBg,
                borderRadius: 5,
                padding: "1px 6px",
              }}
                title="此回文收到的明確投票分數"
              >
                {scoreLabel}
              </span>
            )}

            {(push.floorNumber > 0 || push.sourceFloors.length > 0) && (
              <FloorChip
                sourceFloors={push.sourceFloors}
                fallbackFloor={push.floorNumber}
              />
            )}
          </div>

          {/* Content */}
          <div style={{
            fontSize: 13.5,
            lineHeight: 1.5,
            color: isEditNode ? "var(--edit-fg)" : "var(--text)",
            paddingLeft: 26,
            fontStyle: isEditNode ? "italic" : undefined,
            wordBreak: "break-word",
          }}>
            <RichContent text={push.content} variant="inline" />
          </div>
        </div>

        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 4,
          flexShrink: 0,
          paddingTop: 1,
          maxWidth: 220,
        }}>
          {(push.time || ipLabel) && (
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              color: "var(--text-dim)",
              whiteSpace: "nowrap",
            }}>
              {[push.time, ipLabel].filter(Boolean).join(" · ")}
            </span>
          )}
          {actionCluster}
        </div>

        {showHistory && editData && (
          <div style={{ flexBasis: "100%" }}>
            <EditHistoryPanel editData={editData} onClose={toggleHistory} />
          </div>
        )}

        {/* Nested children */}
        {children.length > 0 && (
          <div style={{
            flexBasis: "100%",
            marginTop: 8,
            marginLeft: 10,
            paddingTop: 8,
            borderTop: "1px solid var(--border)",
          }}>
            {children.map((child) => (
              <PushItem
                key={child.id}
                push={child}
                children={childrenMap?.get(child.id) ?? []}
                childrenMap={childrenMap}
                depth={depth + 1}
                currentUser={currentUser}
                onReply={onReply}
                onEdit={onEdit}
                voteState={pushVotes?.get(child.id)}
                editData={pushEdits?.get(child.id)}
                pushVotes={pushVotes}
                pushEdits={pushEdits}
                onVote={onVoteRaw ? (next) => onVoteRaw(child.id, next) : undefined}
                onVoteRaw={onVoteRaw}
                pendingVoteIds={pendingVoteIds}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PushThread ───────────────────────────────────────────────────────────────

interface PushThreadProps {
  pushes: AggregatedPush[];
  score: number;
  onRefresh?: () => Promise<void> | void;
  refreshing?: boolean;
  initialVisibleTopLevelCount?: number;
  renderBatchSize?: number;
  currentUser?: string;
  onReply?: (push: AggregatedPush) => void;
  onEdit?: (push: AggregatedPush) => void;
  pushVotes?: Map<string, { value: -1 | 0 | 1; count: VoteCount }>;
  onVote?: (pushId: string, next: -1 | 0 | 1) => void;
  pushEdits?: Map<string, PushEditData>;
  pendingVoteIds?: ReadonlySet<string>;
}

export function PushThread({
  pushes,
  score,
  onRefresh,
  refreshing = false,
  initialVisibleTopLevelCount = INITIAL_VISIBLE_TOP_LEVEL_REPLIES,
  renderBatchSize = REPLY_RENDER_BATCH_SIZE,
  currentUser,
  onReply,
  onEdit,
  pushVotes,
  onVote,
  pushEdits,
  pendingVoteIds,
}: PushThreadProps) {
  const [sort, setSort] = useState<ReplySortState>(DEFAULT_REPLY_SORT);
  const [visibleTopLevelCount, setVisibleTopLevelCount] = useState(
    initialVisibleTopLevelCount,
  );
  const [localRefreshing, setLocalRefreshing] = useState(false);
  const [refreshPulse, setRefreshPulse] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showRefreshing = refreshing || localRefreshing;

  // Compatibility guard for pre-model caches; edited opaque bodies such as
  // "推" stay visible because their edit history proves they are content.
  const visiblePushes = useMemo(
    () => pushes.filter((push) => (
      push.editHistory?.length || detectArticleVote(push.content) === null
    )),
    [pushes],
  );

  const childrenMap = useMemo(() => {
    const nextMap = new Map<string, AggregatedPush[]>();
    for (const push of visiblePushes) {
      if (push.replyTo) {
        const list = nextMap.get(push.replyTo) ?? [];
        list.push(push);
        list.sort((a, b) => a.anchorOrder - b.anchorOrder);
        nextMap.set(push.replyTo, list);
      }
    }
    return nextMap;
  }, [visiblePushes]);

  const topLevel = useMemo(
    () => visiblePushes.filter((push) => push.replyTo === null),
    [visiblePushes],
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

  useEffect(() => () => {
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
  }, []);

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

  function finishRefreshAfter(startedAt: number) {
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, REFRESH_ANIMATION_MIN_MS - elapsed);
    refreshTimeoutRef.current = setTimeout(() => {
      setLocalRefreshing(false);
      setRefreshPulse(true);
      pulseTimeoutRef.current = setTimeout(() => {
        setRefreshPulse(false);
      }, REFRESH_HIGHLIGHT_MS);
    }, remaining);
  }

  function handleRefresh() {
    if (!onRefresh || showRefreshing) return;
    const startedAt = Date.now();
    setLocalRefreshing(true);
    Promise.resolve(onRefresh()).finally(() => {
      finishRefreshAfter(startedAt);
    });
  }

  const scoreColor =
    score > 0 ? "var(--push-fg)" : score < 0 ? "var(--boo-fg)" : "var(--text-muted)";
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

  // Sort selector pill button style
  function sortBtnStyle(active: boolean): React.CSSProperties {
    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "4px 10px",
      borderRadius: 6,
      border: 0,
      background: active ? "var(--accent-soft)" : "transparent",
      color: active ? "var(--accent-ink)" : "var(--text-muted)",
      fontSize: 12,
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: "inherit",
    };
  }

  function ctrlBtnStyle(): React.CSSProperties {
    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "5px 10px",
      borderRadius: 7,
      border: "1px solid var(--border)",
      background: "var(--surface)",
      color: "var(--text-muted)",
      fontSize: 12,
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: "inherit",
    };
  }

  function SpinnerIcon() {
    return (
      <span
        aria-hidden="true"
        style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          border: "2px solid currentColor",
          borderTopColor: "transparent",
          display: "inline-block",
          animation: "pttzzz-spin 700ms linear infinite",
        }}
      />
    );
  }

  return (
    <div style={{ marginTop: 40, borderTop: "1px solid var(--border)", paddingTop: 24 }}>
      {/* Sort + stats */}
      <div style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
            討論串
          </span>
          <span style={{
            fontSize: 13,
            fontWeight: 700,
            color: scoreColor,
            border: "1px solid currentColor",
            borderRadius: 20,
            padding: "2px 8px",
            opacity: 0.8,
          }}>
            {scoreLabel}
          </span>
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
            ({topLevel.length} 則第一層回覆)
          </span>
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
            已顯示 {visibleTopLevel.length} / {sortedTopLevel.length} 則第一層回覆
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          {/* Sort selector */}
          <div style={{
            display: "inline-flex",
            padding: 3,
            background: "var(--surface)",
            borderRadius: 8,
            border: "1px solid var(--border)",
          }}>
            <button
              type="button"
              onClick={() => setSortKey("time")}
              style={sortBtnStyle(sort.key === "time")}
            >
              時間
            </button>
            <button
              type="button"
              onClick={() => setSortKey("score")}
              style={sortBtnStyle(sort.key === "score")}
            >
              推噓分
            </button>
          </div>

          <button
            type="button"
            onClick={toggleSortDirection}
            style={ctrlBtnStyle()}
          >
            {directionLabel}
          </button>

          {onRefresh && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={showRefreshing}
              aria-busy={showRefreshing}
              style={{
                ...ctrlBtnStyle(),
                gap: 6,
                opacity: showRefreshing ? 0.75 : 1,
                cursor: showRefreshing ? "not-allowed" : "pointer",
              }}
            >
              {showRefreshing && <SpinnerIcon />}
              {showRefreshing ? "更新中..." : "重新整理回文"}
            </button>
          )}
        </div>
      </div>

      {/* Push cards */}
      <div
        style={{
          transition: "background 180ms ease, box-shadow 180ms ease",
          background: refreshPulse ? "var(--accent-soft)" : "transparent",
          boxShadow: refreshPulse ? "0 0 0 1px var(--accent-border)" : "none",
          borderRadius: 10,
          padding: refreshPulse ? 8 : 0,
          margin: refreshPulse ? -8 : 0,
        }}
      >
        {visibleTopLevel.map((push) => (
          <PushItem
            key={push.id}
            push={push}
            children={childrenMap.get(push.id) ?? []}
            childrenMap={childrenMap}
            depth={0}
            currentUser={currentUser}
            onReply={onReply}
            onEdit={onEdit}
            voteState={pushVotes?.get(push.id)}
            onVote={onVote ? (next) => onVote(push.id, next) : undefined}
            onVoteRaw={onVote}
            editData={pushEdits?.get(push.id)}
            pushVotes={pushVotes}
            pushEdits={pushEdits}
            pendingVoteIds={pendingVoteIds}
          />
        ))}
      </div>

      {hasMoreTopLevel && (
        <div ref={sentinelRef} style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
          {!supportsIntersectionObserver && (
            <button
              type="button"
              onClick={showMoreTopLevel}
              style={ctrlBtnStyle()}
            >
              顯示更多回覆
            </button>
          )}
        </div>
      )}

      {!hasMoreTopLevel && (
        <div style={{
          marginTop: 20,
          paddingTop: 20,
          borderTop: "1px solid var(--border)",
          textAlign: "center",
          fontSize: 13,
          color: "var(--text-dim)",
        }}>
          沒有新回文
        </div>
      )}
    </div>
  );
}
