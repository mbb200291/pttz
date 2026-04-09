/**
 * ArticleList — 看板文章列表
 */

import type { MouseEvent } from "react";
import { useRef } from "react";
import { useBoard } from "../hooks/useBoard";
import type { ArticleSummary } from "../lib/ptt/parser";

interface ArticleListProps {
  boardName: string;
  onSelectArticle: (index: number) => void;
  onBack: () => void;
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
  onClick: (index: number) => void;
}) {
  const isRe = article.title.startsWith("Re:");
  const isDeleted = article.title.includes("(已被刪除)");
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const nextIndex = Number(event.currentTarget.dataset.articleIndex);
    onClick(Number.isNaN(nextIndex) ? article.index : nextIndex);
  };

  return (
    <button
      type="button"
      data-article-index={article.index}
      onClick={handleClick}
      disabled={isDeleted}
      className={`w-full text-left px-4 py-3 border-b border-gray-800 hover:bg-gray-800 transition-colors flex items-baseline gap-3 ${
        isDeleted ? "opacity-40 cursor-not-allowed" : ""
      }`}
    >
      <PushCountBadge count={article.pushCount} />
      <span className="text-xs text-gray-500 w-10 shrink-0">
        {article.date}
      </span>
      <span
        className={`flex-1 text-sm truncate ${
          isRe ? "text-gray-400" : "text-gray-100"
        }`}
      >
        {article.title}
      </span>
      <span className="text-xs text-gray-500 shrink-0 hidden sm:block">
        {article.author}
      </span>
    </button>
  );
}

export function ArticleList({
  boardName,
  onSelectArticle,
  onBack,
  mockArticles,
  mockLoading,
  mockError,
  onMockLoadMore,
}: ArticleListProps) {
  const {
    articles: liveArticles,
    loading: liveLoading,
    error: liveError,
    loadMore,
  } = useBoard(boardName);
  const articles = mockArticles ?? liveArticles;
  const loading = mockLoading ?? liveLoading;
  const error = mockError ?? liveError;
  const handleLoadMore = onMockLoadMore ?? loadMore;
  const bottomRef = useRef<HTMLDivElement>(null);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* 頂部 */}
      <div className="sticky top-0 z-10 bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-sky-400 hover:text-sky-300 transition-colors text-sm"
        >
          ← 返回
        </button>
        <h1 className="text-lg font-semibold">
          {boardName}
          <span className="ml-2 text-sm font-normal text-gray-400">看板</span>
        </h1>
      </div>

      <div className="divide-y divide-gray-800">
        {articles.map((a) => (
          <ArticleRow
            key={a.index}
            article={a}
            onClick={onSelectArticle}
          />
        ))}
      </div>

      {/* 載入指示 */}
      <div ref={bottomRef} className="py-8 text-center">
        {loading ? (
          <span className="text-gray-500 text-sm">載入中…</span>
        ) : error && articles.length === 0 ? (
          <span className="text-amber-400 text-sm">{error}</span>
        ) : articles.length === 0 ? (
          <span className="text-gray-600 text-sm">正在連線至 PTT…</span>
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
