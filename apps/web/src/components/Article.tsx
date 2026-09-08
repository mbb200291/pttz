/**
 * Article — 文章閱讀頁
 * 支援 progressive render：loading 期間先顯示 partialArticle，
 * 完整資料回來後切換到完整版（含推文討論串）。
 */

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useArticle } from "../hooks/useArticle";
import { PushThread } from "./PushThread";
import { ArticleRevisions } from "./ArticleRevisions";
import { RichContent } from "./RichContent";
import { canUseShortcut, navigateList } from "../lib/keyboardNavigation";
import type { ArticleData, PartialArticleData } from "../hooks/useArticle";
import type { ArticleEditRecord, ArticleSummary } from "../lib/ptt/uiArticle";
import {
  samePttId,
  type AggregatedPush,
} from "../lib/ptt/uiTypes";
import { VotePair } from "./VotePair";
import type { VoteCount, PushEditData } from "./PushThread";
import { Composer } from "./Composer";
import type { ComposerMode, ComposerInitial } from "./Composer";
import { usePttActions } from "../hooks/usePttActions";
import type { ArticleKey } from "@pttzzz/core";
import { Monogram } from "./Monogram";
import { ScoreOrb } from "./ScoreOrb";
import { canRetryWrite, formatWriteError, writeFingerprint } from "../lib/writeResult";

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

interface ArticleProps {
  boardName: string;
  articleIndex: number;
  articleAid?: string;
  initialArticleSummary?: ArticleSummary;
  onBack: () => void;
  mockArticle?: ArticleData | null;
  mockLoading?: boolean;
  currentUser?: string;
  onEditArticle?: (article: ArticleData) => void;
  onReplyToBoard?: (article: ArticleData) => void;
}

function ArticleEditRecords({ records }: { records: ArticleEditRecord[] }) {
  if (records.length === 0) return null;

  return (
    <section style={{
      marginBottom: 32,
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: "10px 14px",
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-dim)", marginBottom: 8 }}>
        文章編輯紀錄
      </div>
      {records.map((record, index) => (
        <div
          key={`${record.markerOffset}-${index}`}
          style={{
            borderRadius: 8,
            border: "1px solid var(--border)",
            padding: "6px 10px",
            marginBottom: index < records.length - 1 ? 6 : 0,
            fontSize: 12,
            lineHeight: 1.5,
            color: "var(--text-dim)",
          }}
        >
          <div style={{ fontWeight: 500, color: "var(--text-muted)", marginBottom: 2 }}>
            {record.marker.trim()}
          </div>
          <p style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--text)", margin: 0 }}>
            {record.content}
          </p>
        </div>
      ))}
    </section>
  );
}

function parseCategory(title: string): { category: string | null; displayTitle: string } {
  const match = title.match(/^\[([^\]]+)\]\s*/);
  if (match) {
    return { category: match[1], displayTitle: title.slice(match[0].length) };
  }
  return { category: null, displayTitle: title };
}

function ArticleHeader({
  title,
  author,
  board,
  date,
  score,
}: {
  title: string;
  author: string;
  board: string;
  date: string;
  score?: number;
}) {
  const { category, displayTitle } = parseCategory(title);

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Top row: category chip + date */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        {category && (
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: "var(--accent-ink)",
            padding: "3px 8px",
            borderRadius: 5,
            background: "var(--accent-soft)",
          }}>
            {category}
          </span>
        )}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-dim)" }}>
          {date}
        </span>
      </div>

      {/* h1 title */}
      <h1 style={{
        fontSize: 30,
        fontWeight: 700,
        lineHeight: 1.2,
        letterSpacing: "-0.025em",
        margin: 0,
        marginBottom: 18,
        color: "var(--text)",
      }}>
        {displayTitle || "(無標題)"}
      </h1>

      {/* Author row */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 0 }}>
        <Monogram name={author} size={36} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{author}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-dim)", marginTop: 2 }}>
            {board}
          </div>
        </div>
        <ScoreOrb score={score ?? 0} size={56} />
      </div>
    </div>
  );
}

function ArticleBody({ body }: { body: string }) {
  const clean = body.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
  return <RichContent text={clean} variant="body" />;
}

function LightweightArticleBody({ body }: { body: string }) {
  const clean = body.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
  if (!clean) {
    return <div className="mb-8 py-4 text-sm text-gray-500">文章內容載入中…</div>;
  }
  return (
    <pre tabIndex={0} aria-label="載入中的原始正文" className="mb-8 overflow-x-auto whitespace-pre font-mono text-sm leading-relaxed text-gray-200">
      {clean}
    </pre>
  );
}

function LightweightPushList({
  pushes,
}: {
  pushes: NonNullable<PartialArticleData["pushes"]>;
}) {
  const visiblePushes = pushes.filter((push) => push.visible !== false);
  if (visiblePushes.length === 0) return null;

  return (
    <section className="mt-10 border-t border-gray-700 pt-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold tracking-wide text-gray-300">
          回文
        </span>
        <span className="text-xs text-gray-500">已載入 {visiblePushes.length} 則</span>
      </div>
      <div className="space-y-2">
        {visiblePushes.map((push) => (
          <div
            key={push.id}
            className="rounded-xl border border-gray-800 bg-gray-900/70 px-3 py-2"
          >
            <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
              <span className="font-medium text-sky-300">{push.author}</span>
              {push.time ? <span>{push.time}</span> : null}
            </div>
            <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-6 text-gray-200">
              {push.content}
            </pre>
          </div>
        ))}
      </div>
    </section>
  );
}

function getViewerPushVote(push: AggregatedPush, currentUser?: string): -1 | 0 | 1 {
  if (push.votes?.viewerVote === "push") return 1;
  if (push.votes?.viewerVote === "boo") return -1;
  if (!currentUser) return 0;
  if (push.pushVoters.some((author) => samePttId(author, currentUser))) return 1;
  if (push.booVoters.some((author) => samePttId(author, currentUser))) return -1;
  return 0;
}

function getViewerArticleVote(article: ArticleData, currentUser?: string): -1 | 0 | 1 {
  if (article.articleVotes?.viewerVote === "push") return 1;
  if (article.articleVotes?.viewerVote === "boo") return -1;
  if (!currentUser) return 0;
  if (article.articlePushVoters?.some((author) => samePttId(author, currentUser))) return 1;
  if (article.articleBooVoters?.some((author) => samePttId(author, currentUser))) return -1;
  return 0;
}

function transitionVoteState(
  current: { value: -1 | 0 | 1; count: VoteCount },
  next: -1 | 0 | 1,
): { value: -1 | 0 | 1; count: VoteCount } {
  return {
    value: next,
    count: {
      push: Math.max(0, current.count.push - (current.value === 1 ? 1 : 0)) +
        (next === 1 ? 1 : 0),
      boo: Math.max(0, current.count.boo - (current.value === -1 ? 1 : 0)) +
        (next === -1 ? 1 : 0),
    },
  };
}

function PartialArticleView({ partial }: { partial: PartialArticleData }) {
  const pushes = partial.pushes ?? [];
  const articleNotes = partial.articleNotes ?? [];

  return (
    <>
      <ArticleHeader
        title={partial.title}
        author={partial.author}
        board={partial.board}
        date={partial.date}
      />
      <LightweightArticleBody body={partial.body} />
      <ArticleEditRecords records={articleNotes} />
      <LightweightPushList pushes={pushes} />
      <div className="py-6 text-center text-gray-500 text-sm border-t border-gray-800">
        完整討論串整理中…
      </div>
    </>
  );
}

type PushTypeBadgeType = "push" | "boo" | "neutral";

function PushTypeBadge({ type }: { type: PushTypeBadgeType }) {
  const config: Record<PushTypeBadgeType, { fg: string; bg: string; label: string }> = {
    push: { fg: "var(--push-fg)", bg: "var(--push-bg)", label: "推" },
    boo: { fg: "var(--boo-fg)", bg: "var(--boo-bg)", label: "噓" },
    neutral: { fg: "var(--neutral-fg)", bg: "var(--neutral-bg)", label: "→" },
  };
  const { fg, bg, label } = config[type];
  return (
    <span style={{
      display: "inline-flex",
      width: 22,
      height: 22,
      borderRadius: 6,
      fontSize: 11,
      fontWeight: 700,
      fontFamily: "var(--font-mono)",
      alignItems: "center",
      justifyContent: "center",
      color: fg,
      background: bg,
    }}>
      {label}
    </span>
  );
}

export function Article({
  boardName,
  articleIndex,
  articleAid,
  initialArticleSummary,
  onBack,
  mockArticle,
  mockLoading,
  currentUser,
  onEditArticle,
  onReplyToBoard,
}: ArticleProps) {
  const navigationRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (document.activeElement === document.body && !document.querySelector('[role="dialog"], dialog[open]')) {
      navigationRef.current?.focus({ preventScroll: true });
    }
  }, [boardName, articleIndex, articleAid]);
  const {
    article: liveArticle,
    partialArticle,
    cachedArticle,
    loading: liveLoading,
    reloading: liveReloading,
    error: liveError,
    reload: liveReload,
  } = useArticle(boardName, articleIndex, articleAid, initialArticleSummary);

  const article = mockArticle ?? liveArticle;
  const loading = mockLoading ?? liveLoading;
  const error = liveError;

  // Article-level vote (optimistic UI)
  const [articleVote, setArticleVote] = useState<{ value: -1 | 0 | 1; count: VoteCount }>({
    value: 0,
    count: { push: 0, boo: 0 },
  });

  // Per-push votes (optimistic UI): pushId → { value, count }
  const [pushVotes, setPushVotes] = useState<Map<string, { value: -1 | 0 | 1; count: VoteCount }>>(new Map());

  const pendingPushVoteIdsRef = useRef(new Set<string>());
  const [pendingPushVoteIds, setPendingPushVoteIds] = useState<Set<string>>(
    new Set(),
  );
  const [pushVoteError, setPushVoteError] = useState<string | null>(null);
  const lockedPushVoteIdsRef = useRef(new Set<string>());
  const [lockedPushVoteIds, setLockedPushVoteIds] = useState<Set<string>>(new Set());

  const [articleVotePending, setArticleVotePending] = useState(false);
  const articleVotePendingRef = useRef(false);
  const [articleVoteLocked, setArticleVoteLocked] = useState(false);

  const pushEdits = useMemo(() => {
    const edits = new Map<string, PushEditData>();
    for (const push of article?.pushes ?? []) {
      if (!push.editHistory || push.editHistory.length === 0) continue;
      edits.set(push.id, {
        content: push.content,
        history: push.editHistory,
      });
    }
    return edits;
  }, [article?.pushes]);

  // Composer state: null = closed
  const [composer, setComposer] = useState<{
    mode: ComposerMode;
    initial: ComposerInitial;
    replyId?: string;
  } | null>(null);
  const [composerSubmitting, setComposerSubmitting] = useState(false);
  const composerSubmittingRef = useRef(false);
  const [composerSubmitError, setComposerSubmitError] = useState<string | null>(null);
  const [lockedComposerFingerprints, setLockedComposerFingerprints] = useState<Set<string>>(new Set());
  const [deletingArticle, setDeletingArticle] = useState(false);
  const [deleteArticleError, setDeleteArticleError] = useState<string | null>(null);
  const deletingArticleRef = useRef(false);
  const [deleteArticleLocked, setDeleteArticleLocked] = useState(false);

  const actions = usePttActions();
  const articleKey = useMemo<ArticleKey>(() => articleAid
    ? { board: boardName, aid: articleAid }
    : { board: boardName, index: articleIndex }, [articleAid, articleIndex, boardName]);
  const { isLoggedIn } = actions;
  const isArticleAuthor = Boolean(
    article && currentUser &&
    samePttId(article.author, currentUser),
  );
  const hasArticleLocator = articleIndex > 0 || Boolean(articleAid);
  const canDeleteArticle = Boolean(
    isLoggedIn && isArticleAuthor && hasArticleLocator,
  );
  const canEditArticle = Boolean(
    isLoggedIn && isArticleAuthor && articleIndex > 0 && onEditArticle,
  );
  const canReplyToBoard = Boolean(
    isLoggedIn && hasArticleLocator && onReplyToBoard,
  );

  const clearWriteLocks = useCallback(() => {
    lockedPushVoteIdsRef.current.clear();
    setLockedPushVoteIds(new Set());
    setArticleVoteLocked(false);
    setDeleteArticleLocked(false);
    setLockedComposerFingerprints(new Set());
  }, []);

  useEffect(() => {
    clearWriteLocks();
  }, [articleAid, articleIndex, boardName, clearWriteLocks]);

  const handleDeleteArticle = useCallback(async () => {
    if (!article || !canDeleteArticle || deletingArticleRef.current || deleteArticleLocked) return;
    setDeleteArticleError(null);
    if (!window.confirm("確定要刪除這篇文章嗎？刪除後無法復原。")) return;

    deletingArticleRef.current = true;
    setDeletingArticle(true);
    try {
      const result = await actions.deleteArticle({ article: articleKey });
      if (!result.ok) {
        setDeleteArticleError(formatWriteError(result.error, "文章刪除失敗"));
        if (!canRetryWrite(result.error)) setDeleteArticleLocked(true);
        return;
      }
      onBack();
    } catch (error) {
      setDeleteArticleLocked(true);
      setDeleteArticleError(
        error instanceof Error ? error.message : "文章刪除失敗",
      );
    } finally {
      deletingArticleRef.current = false;
      setDeletingArticle(false);
    }
  }, [
    actions,
    article,
    articleKey,
    canDeleteArticle,
    deleteArticleLocked,
    onBack,
  ]);

  useEffect(() => {
    if (!article) return;
    setArticleVote({
      value: getViewerArticleVote(article, currentUser),
      count: {
        push: article.articleVotes?.pushCount ?? article.articlePushVoters?.length ?? 0,
        boo: article.articleVotes?.booCount ?? article.articleBooVoters?.length ?? 0,
      },
    });
  }, [article, currentUser]);

  useEffect(() => {
    if (!article || !currentUser) return;
    setPushVotes((previous) => {
      const next = new Map(previous);
      let changed = false;
      for (const [pushId, optimistic] of previous) {
        const push = article.pushes.find((item) => item.id === pushId);
        if (push && getViewerPushVote(push, currentUser) === optimistic.value) {
          next.delete(pushId);
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [article, currentUser]);

  const handleArticleVote = useCallback((direction: "push" | "boo") => {
    if (!isLoggedIn || isArticleAuthor || articleVotePendingRef.current || articleVoteLocked) return;
    const clicked: -1 | 1 = direction === "push" ? 1 : -1;
    const isCancellation = articleVote.value !== 0;
    const next: -1 | 0 | 1 = isCancellation ? 0 : clicked;
    const previousDirection = articleVote.value === 1 ? "push" : "boo";
    articleVotePendingRef.current = true;
    setArticleVotePending(true);
    const request = isCancellation
      ? actions.withdrawArticleVote({ article: articleKey, direction: previousDirection })
      : actions.voteArticle({ article: articleKey, direction });
    void request.then((result) => {
      if (!result.ok) {
        setPushVoteError(formatWriteError(result.error, "文章推噓送出失敗"));
        if (!canRetryWrite(result.error)) setArticleVoteLocked(true);
        return;
      }
      setArticleVote((previous) => transitionVoteState(previous, next));
      void liveReload().then((refreshed) => {
        if (refreshed) clearWriteLocks();
      });
    }).catch((error) => {
      setArticleVoteLocked(true);
      setPushVoteError(error instanceof Error ? error.message : "文章推噓送出失敗");
    }).finally(() => {
      articleVotePendingRef.current = false;
      setArticleVotePending(false);
    });
  }, [actions, articleKey, articleVote.value, articleVoteLocked, clearWriteLocks, isArticleAuthor, isLoggedIn, liveReload]);

  const handlePushVote = useCallback((pushId: string, next: -1 | 0 | 1) => {
    const push = article?.pushes.find((item) => item.id === pushId);
    if (!push) return;
    const currentState = pushVotes.get(pushId) ?? {
      value: getViewerPushVote(push, currentUser),
      count: {
        push: push.votes?.pushCount ?? push.pushVoters.length,
        boo: push.votes?.booCount ?? push.booVoters.length,
      },
    };
    const currentVote = currentState.value;

    if (next === 0) return;

    const direction = next === 1 ? "push" : "boo";
    const isWithdrawal = next === currentVote;
    const resultingVote: -1 | 0 | 1 = isWithdrawal ? 0 : next;
    if (pendingPushVoteIdsRef.current.has(pushId) || lockedPushVoteIdsRef.current.has(pushId)) return;
    pendingPushVoteIdsRef.current.add(pushId);
    setPendingPushVoteIds(new Set(pendingPushVoteIdsRef.current));

    const previousOptimistic = pushVotes.get(pushId);
    setPushVoteError(null);
    setPushVotes((previous) =>
      new Map(previous).set(
        pushId,
        transitionVoteState(currentState, resultingVote),
      ),
    );

    const rollback = () => {
      setPushVotes((previous) => {
        const rolledBack = new Map(previous);
        if (previousOptimistic) rolledBack.set(pushId, previousOptimistic);
        else rolledBack.delete(pushId);
        return rolledBack;
      });
    };

    const request = isWithdrawal
      ? actions.withdrawReplyVote({ article: articleKey, replyId: pushId, direction })
      : actions.voteReply({ article: articleKey, replyId: pushId, direction });
    void request
      .then((result) => {
        if (!result.ok) {
          rollback();
          setPushVoteError(formatWriteError(result.error, "回文推噓送出失敗"));
          if (!canRetryWrite(result.error)) {
            lockedPushVoteIdsRef.current.add(pushId);
            setLockedPushVoteIds(new Set(lockedPushVoteIdsRef.current));
          }
          return;
        }
        void liveReload().then((refreshed) => {
          if (refreshed) clearWriteLocks();
        });
      })
      .catch((error) => {
        rollback();
        lockedPushVoteIdsRef.current.add(pushId);
        setLockedPushVoteIds(new Set(lockedPushVoteIdsRef.current));
        setPushVoteError(
          error instanceof Error ? error.message : "回文推噓送出失敗",
        );
      })
      .finally(() => {
        pendingPushVoteIdsRef.current.delete(pushId);
        setPendingPushVoteIds(new Set(pendingPushVoteIdsRef.current));
      });
  }, [actions, article?.pushes, articleKey, clearWriteLocks, currentUser, liveReload, pushVotes]);

  const openReply = useCallback(() => {
    setComposerSubmitError(null);
    setComposer({ mode: "reply", initial: {} });
  }, []);

  const openReplyPush = useCallback((push: AggregatedPush) => {
    setComposerSubmitError(null);
    setComposer({
      mode: "reply-push",
      initial: {},
      replyId: push.id,
    });
  }, []);

  const openEditPush = useCallback((push: AggregatedPush) => {
    setComposerSubmitError(null);
    setComposer({
      mode: "edit-push",
      initial: {
        body: push.content,
      },
      replyId: push.id,
    });
  }, []);

  const handleComposerClose = useCallback(() => {
    if (composerSubmitting) return;
    setComposerSubmitError(null);
    setComposer(null);
  }, [composerSubmitting]);

  const composerFingerprint = useCallback((payload: import("./Composer").ComposerPayload) => {
    if (composer?.mode === "edit-push" && composer.replyId) {
      return payload.editMode === "撤回"
        ? writeFingerprint("withdrawReply", { article: articleKey, replyId: composer.replyId })
        : payload.editMode === "區段"
          ? writeFingerprint("editReply", {
              article: articleKey,
              replyId: composer.replyId,
              mode: "section",
              changes: [{ start: payload.sectionStart, end: payload.sectionEnd, replacement: payload.body }],
            })
        : writeFingerprint("editReply", {
            article: articleKey,
            replyId: composer.replyId,
            mode: payload.editMode === "補充" ? "append" : "replace",
            content: payload.body,
          });
    }
    if (composer?.mode === "reply-push" && composer.replyId) {
      return writeFingerprint("replyToReply", {
        article: articleKey,
        replyId: composer.replyId,
        content: payload.body,
        pushType: payload.pushType,
      });
    }
    return writeFingerprint("replyToArticle", {
      article: articleKey,
      content: payload.body,
      pushType: isArticleAuthor ? "neutral" : payload.pushType,
    });
  }, [articleKey, composer, isArticleAuthor]);

  const handleComposerSubmit = useCallback((payload: import("./Composer").ComposerPayload) => {
    const fingerprint = composerFingerprint(payload);
    if (composerSubmittingRef.current || lockedComposerFingerprints.has(fingerprint)) return;
    composerSubmittingRef.current = true;
    setComposerSubmitting(true);
    setComposerSubmitError(null);

    void (async () => {
      try {
        let result;
        if (composer?.mode === "edit-push" && composer.replyId) {
          result = payload.editMode === "撤回"
            ? await actions.withdrawReply({ article: articleKey, replyId: composer.replyId })
            : payload.editMode === "區段"
              ? await actions.editReply({
                  article: articleKey,
                  replyId: composer.replyId,
                  mode: "section",
                  changes: [{ start: payload.sectionStart, end: payload.sectionEnd, replacement: payload.body }],
                })
            : await actions.editReply({
                article: articleKey,
                replyId: composer.replyId,
                mode: payload.editMode === "補充" ? "append" : "replace",
                content: payload.body,
              });
        } else if (composer?.mode === "reply-push" && composer.replyId) {
          result = await actions.replyToReply({
            article: articleKey,
            replyId: composer.replyId,
            content: payload.body,
            pushType: payload.pushType,
          });
        } else {
          result = await actions.replyToArticle({
            article: articleKey,
            content: payload.body,
            pushType: isArticleAuthor ? "neutral" : payload.pushType,
          });
        }
        if (!result.ok) {
          setComposerSubmitError(formatWriteError(
            result.error,
            composer?.mode === "edit-push" ? "推文編輯失敗" : "回文送出失敗",
          ));
          if (!canRetryWrite(result.error)) {
            setLockedComposerFingerprints((current) => new Set(current).add(fingerprint));
          }
          return;
        }
        setComposer(null);
        void liveReload().then((refreshed) => {
          if (refreshed) clearWriteLocks();
        });
      } catch (error) {
        setLockedComposerFingerprints((current) => new Set(current).add(fingerprint));
        setComposerSubmitError(
          error instanceof Error ? error.message : "回文送出失敗",
        );
      } finally {
        composerSubmittingRef.current = false;
        setComposerSubmitting(false);
      }
    })();
  }, [actions, articleKey, clearWriteLocks, composer, composerFingerprint, isArticleAuthor, liveReload, lockedComposerFingerprints]);

  const initialArticle =
    initialArticleSummary && !articleAid
      ? {
          title: initialArticleSummary.title,
          author: initialArticleSummary.author,
          date: initialArticleSummary.date,
          board: boardName,
          body: "",
        }
      : null;

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return;

    window.pttzzzDebug = window.pttzzzDebug ?? {};
    window.pttzzzDebug.dumpCurrentArticle = () => {
      const dump = article?.debug ?? {
        boardName,
        articleIndex,
        warning: "No article debug data is available yet.",
      };
      console.log("[pttzzz] current article debug dump", dump);
      return dump;
    };

    return () => {
      if (window.pttzzzDebug?.dumpCurrentArticle) {
        delete window.pttzzzDebug.dumpCurrentArticle;
      }
    };
  }, [article, articleIndex, boardName]);

  // Count all visible aggregated replies, including nested replies.
  const replyCount = (article?.pushes ?? []).filter((push) =>
    push.type !== "edit" &&
    push.visible !== false
  ).length;

  return (
    <div ref={navigationRef} tabIndex={0} data-navigation-item aria-label="文章閱讀區，左方向鍵返回"
      onKeyDown={(event) => {
        if (article && !composer && canUseShortcut(event)) {
          const key = event.key.toLowerCase();
          if (key === "x" && isLoggedIn) {
            event.preventDefault();
            openReply();
          } else if (key === "r" && canReplyToBoard) {
            event.preventDefault();
            onReplyToBoard?.(article);
          }
        }
        if (event.key === "ArrowLeft" && event.target === event.currentTarget) navigateList(event, onBack);
      }}
      style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      {/* 頂部導覽 */}
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "oklch(0.165 0.006 260 / 0.94)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{
          maxWidth: 820,
          margin: "0 auto",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          minHeight: 52,
        }}>
          {/* Left side */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={onBack}
              style={{
                background: "transparent",
                border: 0,
                cursor: "pointer",
                color: "var(--text-muted)",
                fontFamily: "var(--font)",
                fontSize: 13,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 0",
              }}
            >
              ← 返回
            </button>
            <span style={{ color: "var(--border)", fontSize: 14 }}>|</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-muted)" }}>
              {boardName}
            </span>
          </div>
          {/* Right side */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {article && (
              <button
                type="button"
                aria-label="刪除文章"
                onClick={() => void handleDeleteArticle()}
                disabled={!canDeleteArticle || deletingArticle || deleteArticleLocked}
                style={{
                  background: "transparent",
                  color: "var(--boo-fg)",
                  border: "1px solid var(--boo-fg)",
                  padding: "7px 13px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: canDeleteArticle && !deletingArticle && !deleteArticleLocked ? "pointer" : "not-allowed",
                  opacity: canDeleteArticle && !deletingArticle && !deleteArticleLocked ? 1 : 0.45,
                }}
              >
                {deletingArticle ? "刪除中…" : "刪除"}
              </button>
            )}
            {article && (
              <button
                type="button"
                aria-label="編輯文章"
                onClick={() => canEditArticle && onEditArticle?.(article)}
                disabled={!canEditArticle}
                style={{
                  background: "transparent",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                  padding: "7px 13px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: canEditArticle ? "pointer" : "not-allowed",
                  opacity: canEditArticle ? 1 : 0.45,
                }}
              >
                編輯
              </button>
            )}
            {article && (
              <button
                type="button"
                aria-label="回應至看板"
                aria-keyshortcuts="r"
                title="回應至看板（R）"
                onClick={() => canReplyToBoard && onReplyToBoard?.(article)}
                disabled={!canReplyToBoard}
                style={{
                  background: "var(--accent)",
                  color: "var(--accent-on, #fff)",
                  border: "1px solid var(--accent)",
                  padding: "7px 13px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: canReplyToBoard ? "pointer" : "not-allowed",
                  opacity: canReplyToBoard ? 1 : 0.45,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                回應
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "32px 24px 80px" }}>
        {deleteArticleError && (
          <div
            role="alert"
            style={{
              marginBottom: 16,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--boo-fg)",
              color: "var(--boo-fg)",
              background: "var(--boo-bg)",
              fontSize: 13,
            }}
          >
            {deleteArticleError}
          </div>
        )}

        {/* 初次 loading，但有 partialArticle 可先顯示 */}
        {loading && partialArticle && (
          <PartialArticleView partial={partialArticle} />
        )}

        {loading && !partialArticle && (cachedArticle || initialArticle) && (
          <PartialArticleView partial={(cachedArticle ?? initialArticle)!} />
        )}

        {/* 初次 loading，尚無任何內容 */}
        {loading && !partialArticle && !cachedArticle && !initialArticle && (
          <div style={{ textAlign: "center", padding: "64px 0", color: "var(--text-dim)" }}>載入中…</div>
        )}

        {/* 載入完成但失敗 */}
        {!loading && !article && (
          <div style={{ textAlign: "center", padding: "64px 0", color: "var(--text-dim)" }}>
            {error ?? "無法載入文章"}
          </div>
        )}

        {/* 完整文章 */}
        {article && (
          <>
            <ArticleHeader
              title={article.title}
              author={article.author}
              board={article.board}
              date={article.date}
              score={article.score}
            />
            <ArticleBody body={article.body} />
            <ArticleRevisions revisions={article.revisions ?? []} />
            <ArticleEditRecords records={article.articleNotes} />

            {/* One action row uses the core's corrected article vote totals. */}
            <div role="group" aria-label="文章推噓與回覆" style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "16px 0",
              borderTop: "1px solid var(--border)",
              borderBottom: "1px solid var(--border)",
              marginBottom: 24,
              flexWrap: "wrap",
            }}>
              <VotePair
                value={articleVote.value}
                count={articleVote.count}
                voters={{
                  push: article.articlePushVoters ?? [],
                  boo: article.articleBooVoters ?? [],
                }}
                myVote={articleVote.value}
                onPush={() => handleArticleVote("push")}
                onBoo={() => handleArticleVote("boo")}
                disabled={!isLoggedIn || isArticleAuthor || articleVotePending || articleVoteLocked}
                size="lg"
              />
              <div
                aria-label={`聚合後回覆 ${replyCount}`}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <PushTypeBadge type="neutral" />
                <span style={{ fontWeight: 700, fontSize: 14, color: "var(--neutral-fg)", fontFamily: "var(--font-mono)" }}>{replyCount}</span>
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>回覆</span>
              </div>
              {isArticleAuthor && (
                <span style={{ color: "var(--text-dim)", fontSize: 12 }}>
                  作者本人, 使用 → 加註方式
                </span>
              )}
              {isLoggedIn && (
                <button type="button" onClick={openReply} aria-keyshortcuts="x" title="回覆此文（X）"
                  className="px-4 py-2 rounded-xl border border-gray-700 text-sm text-gray-300 hover:text-white hover:border-gray-500 transition-colors">
                  回覆此文
                </button>
              )}
            </div>
            {pushVoteError && (
              <p role="alert" className="mb-3 text-sm text-red-400">
                {pushVoteError}
              </p>
            )}
            <PushThread
              pushes={article.pushes}
              score={article.score}
              onRefresh={async () => {
                const refreshed = await liveReload();
                if (refreshed) clearWriteLocks();
                return refreshed;
              }}
              refreshing={liveReloading}
              currentUser={currentUser}
              onReply={openReplyPush}
              onEdit={openEditPush}
              pushVotes={pushVotes}
              onVote={handlePushVote}
              pushEdits={pushEdits}
              pendingVoteIds={new Set([...pendingPushVoteIds, ...lockedPushVoteIds])}
            />
          </>
        )}
      </div>
      {composer && (
        <Composer
          mode={composer.mode}
          initial={composer.initial}
          neutralOnly={isArticleAuthor && composer.mode === "reply"}
          submitting={composerSubmitting}
          isSubmitLocked={(payload) => lockedComposerFingerprints.has(composerFingerprint(payload))}
          submitError={composerSubmitError}
          onClose={handleComposerClose}
          onSubmit={handleComposerSubmit}
        />
      )}
    </div>
  );
}
