import { useEffect, useMemo, useState } from "react";
import {
  useHotBoards,
  useRecentBoards,
  usePttSocket,
  usePttSocketStore,
} from "./hooks/usePttSocket";
import { BoardInput } from "./components/BoardInput";
import { ArticleList } from "./components/ArticleList";
import { Article } from "./components/Article";
import { LoginModal } from "./components/LoginModal";
import { ComposeScreen } from "./components/ComposeScreen";
import type { ArticleSummary } from "./lib/ptt/parser";
import type { ArticleData } from "./hooks/useArticle";
import type { AggregatedPush } from "./lib/ptt/pushAggregator";
import type { PttState } from "./hooks/usePttSocket";
import { getSafeViewForPttState, type AppView, type BoardFilter } from "./lib/ptt/viewState";
import { resolveBoardCategoryOptions } from "./lib/ptt/boardCategories";
import { usePttActions } from "./hooks/usePttActions";

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
    ipAddresses: ["114.32.10.1"],
    time: "04/07 16:21",
    isOP: false,
    replyTo: null,
    score: 1,
    floorNumber: 0,
    anchorOrder: 10,
    sourceFloors: [1],
    pushVoters: [],
    booVoters: [],
  },
  {
    id: "push-2",
    type: "push",
    author: "pttzzz",
    content: "回1樓：謝謝，我再補 benchmark 圖",
    ipAddresses: ["114.32.10.2"],
    time: "04/07 16:23",
    isOP: true,
    replyTo: "push-1",
    score: 0,
    floorNumber: 0,
    anchorOrder: 20,
    sourceFloors: [2],
    pushVoters: [],
    booVoters: [],
  },
  {
    id: "edit-1",
    type: "edit",
    author: "pttzzz",
    content: "補充：benchmark 圖稍後補上。",
    ipAddresses: [],
    time: "",
    isOP: true,
    replyTo: "push-1",
    score: 0,
    floorNumber: 0,
    anchorOrder: 25,
    sourceFloors: [],
    marker: "作者編輯",
    pushVoters: [],
    booVoters: [],
  },
  {
    id: "push-3",
    type: "boo",
    author: "bUser",
    content: "手機版還是有點卡",
    ipAddresses: ["114.32.10.3"],
    time: "04/07 16:30",
    isOP: false,
    replyTo: null,
    score: 0,
    floorNumber: 1,
    anchorOrder: 30,
    sourceFloors: [3],
    pushVoters: [],
    booVoters: [],
  },
  ...Array.from({ length: 36 }, (_, index): AggregatedPush => {
    const scores = [10, -3, 0, 5, 1, -1];
    const typeCycle: AggregatedPush["type"][] = ["push", "neutral", "boo"];
    const floor = index + 4;
    return {
      id: `push-extra-${floor}`,
      type: typeCycle[index % typeCycle.length],
      author: `mockUser${floor}`,
      content:
        index % 5 === 0
          ? `第 ${floor} 則第一層回覆，這則用來測試比較長的內容與 lazy rendering。https://example.com/very/long/mock/url/${floor}`
          : `第 ${floor} 則第一層回覆`,
      ipAddresses: [`203.0.113.${floor}`],
      time: `04/07 ${String(16 + Math.floor(floor / 10)).padStart(2, "0")}:${String(
        floor % 60,
      ).padStart(2, "0")}`,
      isOP: false,
      replyTo: null,
      score: scores[index % scores.length],
      floorNumber: floor - 1,
      anchorOrder: 40 + index * 10,
      sourceFloors: [floor],
      pushVoters: [],
      booVoters: [],
    };
  }),
];

const MOCK_ARTICLE: ArticleData = {
  title: "[分享] 我做了一個現代化 PTT 閱讀器 PTTzzz",
  author: "pttzzz",
  date: "Mon Apr 07 16:20:00 2026",
  board: "Gossiping",
  body: `作者 pttzzz (PTTzzz)\n看板 Gossiping\n標題 [分享] 我做了一個現代化 PTT 閱讀器 PTTzzz\n時間 Mon Apr 07 16:20:00 2026\n\n大家好，這是一個 React + TypeScript 的 PTT 閱讀器。\n\n特色：\n1. 自動偵測登入流程\n2. 看板清單 + 文章閱讀\n3. 推文聚合與討論串顯示\n\n歡迎大家給我建議～`,
  pushes: MOCK_PUSHES,
  articleNotes: [
    {
      marker: "※ 編輯:",
      content: "pttzzz (114.32.10.2), 04/07/2026 16:25:00",
      rawBlock: "※ 編輯: pttzzz (114.32.10.2), 04/07/2026 16:25:00",
      markerOffset: 0,
    },
  ],
  score: 1,
};

function sameStringList(a?: readonly string[], b?: readonly string[]): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

export default function App() {
  const isPreview = previewMode !== null;
  const { wsStatus, pttState, client } = usePttSocket();
  const { boards: hotBoards, loading: hotBoardsLoading } = useHotBoards(!isPreview);
  const { recent: recentBoards, addRecent } = useRecentBoards(5);
  const actions = usePttActions();
  const currentUser = usePttSocketStore((s) => s.credentials?.username);
  const [postCategoryOptionsByBoard, setPostCategoryOptionsByBoard] = useState<
    Record<string, string[]>
  >({});
  const [view, setView] = useState<AppView>(() => {
    if (previewMode === "board") return { type: "board", name: "Gossiping" };
    if (previewMode === "article")
      return { type: "article", board: "Gossiping", index: 30215 };
    return { type: "home" };
  });
  const [boardFilter, setBoardFilter] = useState<BoardFilter | null>(null);

  const effectivePttState: PttState = isPreview ? "ready" : pttState;
  const effectiveWsStatus = isPreview ? "connected" : wsStatus;
  const modalPttState: PttState =
    previewMode === "login" ? "need_login" : effectivePttState;
  const popularBoards = useMemo(
    () =>
      hotBoards?.map((board) => ({
        name: board.name,
        zh: board.title,
        online: board.users,
      })),
    [hotBoards],
  );
  const composeBoard = view.type === "compose" ? view.board : null;

  useEffect(() => {
    if (isPreview) return;

    setView((current) => getSafeViewForPttState(current, pttState));
  }, [isPreview, pttState]);

  useEffect(() => {
    if (isPreview || !composeBoard || effectivePttState !== "ready") return;
    const boardKey = composeBoard.trim().toLowerCase();
    if (!boardKey || !client) return;

    if (Object.prototype.hasOwnProperty.call(postCategoryOptionsByBoard, boardKey)) {
      const cachedOptions = postCategoryOptionsByBoard[boardKey] ?? [];
      setView((current) =>
        current.type === "compose" &&
        current.board.trim().toLowerCase() === boardKey &&
        !sameStringList(current.categoryOptions, cachedOptions)
          ? { ...current, categoryOptions: cachedOptions }
          : current,
      );
      return;
    }

    let cancelled = false;
    client
      .getPostCategoryOptions(composeBoard)
      .then((options) => {
        if (cancelled) return;
        setPostCategoryOptionsByBoard((current) => ({
          ...current,
          [boardKey]: options,
        }));
        setView((current) =>
          current.type === "compose" &&
          current.board.trim().toLowerCase() === boardKey
            ? { ...current, categoryOptions: options }
            : current,
        );
      })
      .catch(() => {
        if (cancelled) return;
        setPostCategoryOptionsByBoard((current) => ({
          ...current,
          [boardKey]: [],
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [
    client,
    effectivePttState,
    isPreview,
    composeBoard,
    postCategoryOptionsByBoard,
  ]);

  return (
    <>
      {/* 登入對話框：偵測到 PTT 登入畫面時自動出現 */}
      <LoginModal pttState={modalPttState} wsStatus={effectiveWsStatus} />

      {view.type === "home" && (
        <BoardInput
          pttState={effectivePttState}
          wsStatus={effectiveWsStatus}
          popularBoards={isPreview ? undefined : popularBoards}
          popularBoardsLoading={!isPreview && hotBoardsLoading}
          recentBoards={isPreview ? undefined : recentBoards}
          onEnter={(board) => {
            addRecent(board);
            setView({ type: "board", name: board });
          }}
        />
      )}

      {view.type === "board" && (
        <ArticleList
          boardName={view.name}
          initialFilter={view.filter}
          onActiveFilterChange={setBoardFilter}
          onBack={() => setView({ type: "home" })}
          onSelectArticle={(article) =>
            setView({
              type: "article",
              board: view.name,
              index: article.index,
              summary: article,
              filter: boardFilter,
            })
          }
          onSelectArticleByAid={(aid) =>
            setView({ type: "article-by-aid", board: view.name, aid })
          }
          onCompose={
            !isPreview && effectivePttState === "ready"
              ? (categoryOptions) =>
                  setView({ type: "compose", board: view.name, categoryOptions })
              : undefined
          }
          mockArticles={isPreview ? MOCK_ARTICLES : undefined}
        />
      )}

      {view.type === "article" && (
        <Article
          boardName={view.board}
          articleIndex={view.index}
          initialArticleSummary={view.summary}
          currentUser={currentUser}
          onBack={() => setView({ type: "board", name: view.board, filter: view.filter })}
          onEditArticle={() =>
            setView({ type: "compose-edit", board: view.board, articleIndex: view.index })
          }
          mockArticle={isPreview ? MOCK_ARTICLE : undefined}
        />
      )}

      {view.type === "article-by-aid" && (
        <Article
          boardName={view.board}
          articleIndex={0}
          articleAid={view.aid}
          currentUser={currentUser}
          onBack={() => setView({ type: "board", name: view.board })}
        />
      )}

      {view.type === "compose" && (
        <ComposeScreen
          mode="post"
          initial={{ board: view.board }}
          categoryOptions={resolveBoardCategoryOptions(view.board, view.categoryOptions)}
          currentUser={currentUser}
          onCancel={() => setView({ type: "board", name: view.board })}
          onSubmit={(payload) => {
            void actions
              .postArticle(payload.board, payload.category, payload.title, payload.body)
              .then((result) => {
                if (result.ok) {
                  setView({ type: "board", name: view.board });
                } else {
                  alert(`發文失敗：${result.reason ?? "未知錯誤"}`);
                }
              })
              .catch((err) => {
                alert(`發文失敗：${err instanceof Error ? err.message : String(err)}`);
              });
          }}
        />
      )}

      {view.type === "compose-edit" && (
        <ComposeScreen
          mode="edit-article"
          initial={{ board: view.board }}
          categoryOptions={resolveBoardCategoryOptions(view.board)}
          currentUser={currentUser}
          onCancel={() => setView({ type: "board", name: view.board })}
          onSubmit={() => setView({ type: "board", name: view.board })}
        />
      )}
    </>
  );
}
