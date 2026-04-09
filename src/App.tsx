import { useEffect, useState } from "react";
import { usePttSocket } from "./hooks/usePttSocket";
import { BoardInput } from "./components/BoardInput";
import { ArticleList } from "./components/ArticleList";
import { Article } from "./components/Article";
import { LoginModal } from "./components/LoginModal";
import type { ArticleSummary } from "./lib/ptt/parser";
import type { ArticleData } from "./hooks/useArticle";
import type { AggregatedPush } from "./lib/ptt/pushAggregator";
import type { PttState } from "./hooks/usePttSocket";
import { getSafeViewForPttState, type AppView } from "./lib/ptt/viewState";

type PreviewMode = "home" | "board" | "article" | "login";

// 全域 preview 開關：false = 完全停用 ?preview=... 功能
const ENABLE_PREVIEW = true;

const preview = new URLSearchParams(window.location.search).get("preview");
const previewMode: PreviewMode | null =
  ENABLE_PREVIEW &&
  (preview === "home" ||
    preview === "board" ||
    preview === "article" ||
    preview === "login")
    ? preview
    : null;

const MOCK_ARTICLES: ArticleSummary[] = [
  {
    index: 30215,
    mark: "",
    pushCount: "爆",
    date: "04/07",
    author: "catlover",
    title: "[新聞] 台北捷運新制上路，通勤族怎麼看？",
  },
  {
    index: 30214,
    mark: "",
    pushCount: "35",
    date: "04/07",
    author: "devguy",
    title: "[討論] 2026 前端框架你還會選 React 嗎",
  },
  {
    index: 30213,
    mark: "",
    pushCount: "X2",
    date: "04/06",
    author: "oldman",
    title: "Re: [問卦] 這波房價到底誰在買",
  },
  {
    index: 30212,
    mark: "",
    pushCount: "8",
    date: "04/06",
    author: "someone",
    title: "(已被刪除) [公告] 板規修訂草案",
  },
];

const MOCK_PUSHES: AggregatedPush[] = [
  {
    id: "push-1",
    type: "push",
    author: "aUser",
    content: "這篇分析滿清楚的，感謝整理",
    time: "04/07 16:21",
    isOP: false,
    replyTo: null,
    score: 1,
    floorNumber: 0,
  },
  {
    id: "push-2",
    type: "push",
    author: "pttzzz",
    content: "回1樓：謝謝，我再補 benchmark 圖",
    time: "04/07 16:23",
    isOP: true,
    replyTo: "push-1",
    score: 0,
    floorNumber: 0,
  },
  {
    id: "push-3",
    type: "boo",
    author: "bUser",
    content: "手機版還是有點卡",
    time: "04/07 16:30",
    isOP: false,
    replyTo: null,
    score: 0,
    floorNumber: 1,
  },
];

const MOCK_ARTICLE: ArticleData = {
  title: "[分享] 我做了一個現代化 PTT 閱讀器 PTTzzz",
  author: "pttzzz",
  date: "Mon Apr 07 16:20:00 2026",
  board: "Gossiping",
  body: `作者 pttzzz (PTTzzz)\n看板 Gossiping\n標題 [分享] 我做了一個現代化 PTT 閱讀器 PTTzzz\n時間 Mon Apr 07 16:20:00 2026\n\n大家好，這是一個 React + TypeScript 的 PTT 閱讀器。\n\n特色：\n1. 自動偵測登入流程\n2. 看板清單 + 文章閱讀\n3. 推文聚合與討論串顯示\n\n歡迎大家給我建議～`,
  pushes: MOCK_PUSHES,
  score: 1,
};

export default function App() {
  const { wsStatus, pttState } = usePttSocket();
  const [view, setView] = useState<AppView>(() => {
    if (previewMode === "board") return { type: "board", name: "Gossiping" };
    if (previewMode === "article")
      return { type: "article", board: "Gossiping", index: 30215 };
    return { type: "home" };
  });

  const isPreview = previewMode !== null;
  const effectivePttState: PttState = isPreview ? "ready" : pttState;
  const effectiveWsStatus = isPreview ? "connected" : wsStatus;
  const modalPttState: PttState =
    previewMode === "login" ? "need_login" : effectivePttState;

  useEffect(() => {
    if (isPreview) return;

    setView((current) => getSafeViewForPttState(current, pttState));
  }, [isPreview, pttState]);

  return (
    <>
      {/* 登入對話框：偵測到 PTT 登入畫面時自動出現 */}
      <LoginModal pttState={modalPttState} wsStatus={effectiveWsStatus} />

      {view.type === "home" && (
        <BoardInput
          pttState={effectivePttState}
          wsStatus={effectiveWsStatus}
          onEnter={(board) => setView({ type: "board", name: board })}
        />
      )}

      {view.type === "board" && (
        <ArticleList
          boardName={view.name}
          onBack={() => setView({ type: "home" })}
          onSelectArticle={(index) =>
            setView({ type: "article", board: view.name, index })
          }
          mockArticles={isPreview ? MOCK_ARTICLES : undefined}
        />
      )}

      {view.type === "article" && (
        <Article
          boardName={view.board}
          articleIndex={view.index}
          onBack={() => setView({ type: "board", name: view.board })}
          mockArticle={isPreview ? MOCK_ARTICLE : undefined}
        />
      )}
    </>
  );
}
