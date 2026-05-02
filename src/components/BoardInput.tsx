/**
 * BoardInput — 輸入看板名稱的首頁
 */

import { useState } from "react";

export interface PopularBoard {
  name: string;
  zh?: string;
  online?: string;
}

const DEFAULT_BOARD_SHORTCUTS: PopularBoard[] = [
  { name: "Gossiping", zh: "八卦" },
  { name: "Baseball", zh: "棒球" },
  { name: "Stock", zh: "股市" },
  { name: "C_Chat", zh: "希洽" },
  { name: "Soft_Job", zh: "軟體工作" },
  { name: "NBA", zh: "籃球" },
  { name: "LoL", zh: "英雄聯盟" },
  { name: "joke", zh: "就可" },
];

interface BoardInputProps {
  onEnter: (board: string) => void;
  pttState: string;
  wsStatus: string;
  popularBoards?: PopularBoard[];
  popularBoardsLoading?: boolean;
  recentBoards?: string[];
}

export function BoardInput({
  onEnter,
  pttState,
  wsStatus,
  popularBoards,
  popularBoardsLoading = false,
  recentBoards = [],
}: BoardInputProps) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const b = input.trim();
    if (b) onEnter(b);
  };

  const isConnected = pttState === "ready";
  const hasLivePopularBoards = Boolean(popularBoards?.length);
  const boards = hasLivePopularBoards ? popularBoards! : DEFAULT_BOARD_SHORTCUTS;
  const displayedBoards = boards.slice(0, 8);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "var(--font)",
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "oklch(0.165 0.006 260 / 0.94)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            minHeight: 52,
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                background:
                  "linear-gradient(135deg, var(--accent), oklch(0.55 0.18 320))",
                color: "var(--accent-on)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 13,
                letterSpacing: "-0.04em",
              }}
            >
              p
            </span>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.025em" }}>
              pttzzz
            </span>
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--font-mono)",
              fontSize: 11.5,
              color: "var(--text-dim)",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                background: isConnected
                  ? "oklch(0.72 0.16 155)"
                  : wsStatus === "connecting" ||
                      pttState === "logging_in" ||
                      pttState === "waiting_auth"
                    ? "oklch(0.86 0.16 75)"
                    : "var(--boo-fg)",
              }}
            />
            {isConnected
              ? "已登入 PTT"
              : pttState === "logging_in" || pttState === "waiting_auth"
                ? "登入中..."
                : wsStatus === "connecting"
                  ? "連線中..."
                  : `狀態:${pttState}`}
          </div>
        </div>
      </div>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "60px 24px 80px" }}>
        <section style={{ maxWidth: 720, marginBottom: 40 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 11px",
              borderRadius: 999,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
              fontSize: 12,
              fontWeight: 500,
              marginBottom: 24,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                background: "oklch(0.72 0.16 155)",
              }}
            />
            wss://ws.ptt.cc/bbs
          </div>
          <h1
            style={{
              margin: "0 0 18px",
              color: "var(--text)",
              fontSize: 56,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-0.035em",
            }}
          >
            一起推進
            <br />
            <span
              style={{
                background:
                  "linear-gradient(135deg, var(--accent), oklch(0.55 0.18 320))",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              PTTZ
            </span>
            計畫。
          </h1>
          <p
            style={{
              margin: 0,
              maxWidth: 560,
              color: "var(--text-muted)",
              fontSize: 17,
              lineHeight: 1.55,
            }}
          >
            共同打造新生的 PTT 社群，透過終端頁面重解析，讓 PTT 轉型成更現代化的社群論壇。
          </p>
        </section>

        <form
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 0,
            maxWidth: 640,
            marginBottom: 40,
            padding: 6,
            borderRadius: 14,
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            boxShadow: "0 1px 0 var(--border), 0 8px 32px -16px oklch(0 0 0 / 0.4)",
          }}
        >
          <span style={{ padding: "0 8px 0 12px", color: "var(--text-dim)" }}>
            ⌕
          </span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="輸入看板名稱  例如  Gossiping"
            disabled={!isConnected}
            style={{
              flex: 1,
              minWidth: 0,
              padding: "10px 4px",
              background: "transparent",
              border: 0,
              outline: "none",
              color: "var(--text)",
              fontSize: 15,
              fontFamily: "var(--font)",
              opacity: isConnected ? 1 : 0.5,
            }}
          />
          <button
            type="submit"
            disabled={!isConnected || !input.trim()}
            style={{
              marginLeft: 6,
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid var(--accent)",
              background: "var(--accent)",
              color: "var(--accent-on)",
              fontSize: 13,
              fontWeight: 700,
              cursor: isConnected && input.trim() ? "pointer" : "not-allowed",
              opacity: isConnected && input.trim() ? 1 : 0.45,
              fontFamily: "var(--font)",
            }}
          >
            進入看板
          </button>
        </form>

{(recentBoards?.length ?? 0) > 0 && (
          <section style={{ marginBottom: 40 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.06em",
                color: "var(--text-dim)",
                marginBottom: 12,
              }}
            >
              最近瀏覽
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              {(recentBoards ?? []).map((name) => (
                <button
                  key={name}
                  onClick={() => onEnter(name)}
                  disabled={!isConnected}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--text)",
                    fontWeight: 600,
                    fontSize: 13.5,
                    letterSpacing: "-0.01em",
                    cursor: isConnected ? "pointer" : "not-allowed",
                    fontFamily: "var(--font-mono)",
                    opacity: isConnected ? 1 : 0.45,
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.06em",
                color: "var(--text-dim)",
              }}
            >
              {hasLivePopularBoards ? "熱門看板" : "常用看板"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
              {popularBoardsLoading
                ? "同步中"
                : hasLivePopularBoards
                  ? `${boards.length} 個 · 即時人數`
                  : "即時人數待同步"}
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 10,
            }}
          >
            {displayedBoards.map((board) => (
              <button
                key={board.name}
                onClick={() => onEnter(board.name)}
                disabled={!isConnected}
                style={{
                  textAlign: "left",
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--text)",
                  cursor: isConnected ? "pointer" : "not-allowed",
                  opacity: isConnected ? 1 : 0.45,
                  fontFamily: "var(--font)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                    {board.name}
                  </span>
                  {hasLivePopularBoards && (
                    <span
                      style={{
                        color: "var(--accent-ink)",
                        background: "var(--accent-soft)",
                        borderRadius: 999,
                        padding: "1px 6px",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      HOT
                    </span>
                  )}
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 12 }}>
                  {board.zh || "—"}
                </div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    color: "var(--text-dim)",
                    fontSize: 11.5,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      background: "oklch(0.72 0.16 155)",
                    }}
                  />
                  {board.online ? `${board.online} 在線` : "即時人數待同步"}
                </div>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
