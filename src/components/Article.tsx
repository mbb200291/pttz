/**
 * Article — 文章閱讀頁
 * 支援 progressive render：loading 期間先顯示 partialArticle，
 * 完整資料回來後切換到完整版（含推文討論串）。
 */

import { useEffect } from "react";
import { useArticle } from "../hooks/useArticle";
import { PushThread } from "./PushThread";
import { RichContent } from "./RichContent";
import type { ArticleData, PartialArticleData } from "../hooks/useArticle";
import type { ArticleEditRecord, ArticleSummary } from "../lib/ptt/parser";
import { getLastArticleOpenTrace } from "../lib/ptt/adapter";

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
}

function ArticleEditRecords({ records }: { records: ArticleEditRecord[] }) {
  if (records.length === 0) return null;

  return (
    <section className="mb-8 space-y-2 rounded-2xl border border-gray-700/70 bg-gray-900/60 p-3">
      <div className="text-xs font-semibold tracking-wide text-gray-400">
        文章編輯紀錄
      </div>
      {records.map((record, index) => (
        <div
          key={`${record.markerOffset}-${index}`}
          className="rounded-xl border border-gray-700/80 bg-gray-950/40 px-3 py-2 text-xs leading-5 text-gray-400"
        >
          <div className="mb-1 font-medium text-gray-500">
            {record.marker.trim()}
          </div>
          <p className="whitespace-pre-wrap break-words text-gray-300">
            {record.content}
          </p>
        </div>
      ))}
    </section>
  );
}

function ArticleHeader({
  title,
  author,
  board,
  date,
}: {
  title: string;
  author: string;
  board: string;
  date: string;
}) {
  return (
    <div className="mb-6 pb-4 border-b border-gray-700">
      <h1 className="text-xl font-semibold text-white mb-2 leading-snug">
        {title || "(無標題)"}
      </h1>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-400">
        <span>
          作者{" "}
          <span className="text-sky-300 font-medium">{author}</span>
        </span>
        <span>看板 {board}</span>
        <span>{date}</span>
      </div>
    </div>
  );
}

function ArticleBody({ body }: { body: string }) {
  const clean = body.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").trim();
  return <RichContent text={clean} variant="body" />;
}

function LightweightArticleBody({ body }: { body: string }) {
  const clean = body.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").trim();
  if (!clean) {
    return <div className="mb-8 py-4 text-sm text-gray-500">文章內容載入中…</div>;
  }
  return (
    <pre className="mb-8 whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-gray-200">
      {clean}
    </pre>
  );
}

function LightweightPushList({
  pushes,
}: {
  pushes: NonNullable<PartialArticleData["pushes"]>;
}) {
  if (pushes.length === 0) return null;

  return (
    <section className="mt-10 border-t border-gray-700 pt-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold tracking-wide text-gray-300">
          回文
        </span>
        <span className="text-xs text-gray-500">已載入 {pushes.length} 則</span>
      </div>
      <div className="space-y-2">
        {pushes.map((push) => (
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

export function Article({
  boardName,
  articleIndex,
  articleAid,
  initialArticleSummary,
  onBack,
  mockArticle,
  mockLoading,
}: ArticleProps) {
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
    window.pttzzzDebug.dumpLastArticleOpenTrace = () => {
      const trace = getLastArticleOpenTrace();
      console.log("[pttzzz] last article open trace", trace);
      return trace;
    };

    return () => {
      if (window.pttzzzDebug?.dumpCurrentArticle) {
        delete window.pttzzzDebug.dumpCurrentArticle;
      }
      if (window.pttzzzDebug?.dumpLastArticleOpenTrace) {
        delete window.pttzzzDebug.dumpLastArticleOpenTrace;
      }
    };
  }, [article, articleIndex, boardName]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* 頂部導覽 */}
      <div className="sticky top-0 z-10 bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-sky-400 hover:text-sky-300 transition-colors text-sm"
        >
          ← 返回
        </button>
        <span className="text-gray-400 text-sm">{boardName}</span>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* 初次 loading，但有 partialArticle 可先顯示 */}
        {loading && partialArticle && (
          <PartialArticleView partial={partialArticle} />
        )}

        {loading && !partialArticle && (cachedArticle || initialArticle) && (
          <PartialArticleView partial={(cachedArticle ?? initialArticle)!} />
        )}

        {/* 初次 loading，尚無任何內容 */}
        {loading && !partialArticle && !cachedArticle && !initialArticle && (
          <div className="text-center py-16 text-gray-400">載入中…</div>
        )}

        {/* 載入完成但失敗 */}
        {!loading && !article && (
          <div className="text-center py-16 text-gray-500">
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
            />
            <ArticleBody body={article.body} />
            <ArticleEditRecords records={article.articleNotes} />
            <PushThread
              pushes={article.pushes}
              score={article.score}
              onRefresh={liveReload}
              refreshing={liveReloading}
            />
          </>
        )}
      </div>
    </div>
  );
}
