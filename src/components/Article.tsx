/**
 * Article — 文章閱讀頁
 */

import { useArticle } from "../hooks/useArticle";
import { PushThread } from "./PushThread";
import type { ArticleData } from "../hooks/useArticle";

interface ArticleProps {
  boardName: string;
  articleIndex: number;
  onBack: () => void;
  mockArticle?: ArticleData | null;
  mockLoading?: boolean;
}

export function Article({
  boardName,
  articleIndex,
  onBack,
  mockArticle,
  mockLoading,
}: ArticleProps) {
  const { article: liveArticle, loading: liveLoading } = useArticle(
    boardName,
    articleIndex,
  );
  const article = mockArticle ?? liveArticle;
  const loading = mockLoading ?? liveLoading;

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
        {loading && (
          <div className="text-center py-16 text-gray-400">載入中…</div>
        )}

        {!loading && !article && (
          <div className="text-center py-16 text-gray-500">無法載入文章</div>
        )}

        {article && (
          <>
            {/* 文章 header */}
            <div className="mb-6 pb-4 border-b border-gray-700">
              <h1 className="text-xl font-semibold text-white mb-2 leading-snug">
                {article.title || "(無標題)"}
              </h1>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-400">
                <span>
                  作者{" "}
                  <span className="text-sky-300 font-medium">
                    {article.author}
                  </span>
                </span>
                <span>看板 {article.board}</span>
                <span>{article.date}</span>
              </div>
            </div>

            {/* 文章正文（保留 pre 格式，用 monospace） */}
            <pre className="font-mono text-sm text-gray-200 whitespace-pre-wrap break-words leading-relaxed mb-8">
              {article.body
                .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "") // 先去掉 ANSI（之後可改用 ansi-to-html）
                .trim()}
            </pre>

            {/* 推文討論串 */}
            <PushThread pushes={article.pushes} score={article.score} />
          </>
        )}
      </div>
    </div>
  );
}
