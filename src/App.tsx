import { useState } from "react";
import { usePttSocket } from "./hooks/usePttSocket";
import { BoardInput } from "./components/BoardInput";
import { ArticleList } from "./components/ArticleList";
import { Article } from "./components/Article";
import { LoginModal } from "./components/LoginModal";

type View =
  | { type: "home" }
  | { type: "board"; name: string }
  | { type: "article"; board: string; index: number };

export default function App() {
  const { wsStatus, pttState } = usePttSocket();
  const [view, setView] = useState<View>({ type: "home" });

  return (
    <>
      {/* 登入對話框：偵測到 PTT 登入畫面時自動出現 */}
      <LoginModal pttState={pttState} wsStatus={wsStatus} />

      {view.type === "home" && (
        <BoardInput
          pttState={pttState}
          wsStatus={wsStatus}
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
        />
      )}

      {view.type === "article" && (
        <Article
          boardName={view.board}
          articleIndex={view.index}
          onBack={() => setView({ type: "board", name: view.board })}
        />
      )}
    </>
  );
}
