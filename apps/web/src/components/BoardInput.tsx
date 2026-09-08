/**
 * BoardInput — 輸入看板名稱的首頁
 */

import { useEffect, useMemo, useRef, useState } from "react";

export interface PopularBoard {
  name: string;
  zh?: string;
  online?: string | number;
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

const FAVORITE_FALLBACKS: PopularBoard[] = [
  { name: "Tech_Job", zh: "科技業" },
  { name: "Stock", zh: "股票板" },
  { name: "C_Chat", zh: "西恰" },
  { name: "movie", zh: "電影板" },
  { name: "Lifeismoney", zh: "省錢板" },
];

const POPULAR_CARD_MIN_WIDTH = 240;
const POPULAR_GRID_GAP = 10;
const POPULAR_ROWS = 2;
const POPULAR_FALLBACK_COLUMNS = 3;
const FAVORITE_INITIAL = 6;

function popularBoardColumnCount(containerWidth: number) {
  return Math.max(
    1,
    Math.floor((containerWidth + POPULAR_GRID_GAP) / (POPULAR_CARD_MIN_WIDTH + POPULAR_GRID_GAP)),
  );
}

interface BoardInputProps {
  onEnter: (board: string) => void;
  pttState: string;
  wsStatus: string;
  popularBoards?: PopularBoard[];
  popularBoardsLoading?: boolean;
  onSearchBoards?: (prefix: string) => Promise<PopularBoard[]>;
  favoriteBoards?: string[];
  favoriteBoardsLoading?: boolean;
  recentBoards?: string[];
  currentUser?: string;
}

export function BoardInput({
  onEnter,
  pttState,
  wsStatus,
  popularBoards,
  popularBoardsLoading = false,
  onSearchBoards,
  favoriteBoards,
  favoriteBoardsLoading = false,
  recentBoards = [],
  currentUser,
}: BoardInputProps) {
  const [input, setInput] = useState("");
  const [popularExpanded, setPopularExpanded] = useState(false);
  const [popularColumns, setPopularColumns] = useState(POPULAR_FALLBACK_COLUMNS);
  const [searchResults, setSearchResults] = useState<PopularBoard[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [favoriteExpanded, setFavoriteExpanded] = useState(false);
  const [favoriteOverrides, setFavoriteOverrides] = useState<Record<string, boolean>>({});
  const popularGridRef = useRef<HTMLDivElement>(null);

  const isConnected = pttState === "ready";
  const hasLivePopularBoards = Boolean(popularBoards?.length);
  const boards = hasLivePopularBoards ? popularBoards! : DEFAULT_BOARD_SHORTCUTS;
  const searchTerm = input.trim().toLowerCase();
  const isSearching = searchTerm.length > 0;
  const localSearchResults = useMemo(
    () =>
      isSearching
        ? boards.filter((board) =>
            `${board.name}${board.zh ?? ""}`.toLowerCase().includes(searchTerm),
          )
        : boards,
    [boards, isSearching, searchTerm],
  );
  const resultBoards = isSearching
    ? onSearchBoards
      ? searchResults
      : localSearchResults
    : boards;
  const collapsedPopularCount = popularColumns * POPULAR_ROWS;
  const displayedBoards =
    isSearching || popularExpanded
      ? resultBoards
      : resultBoards.slice(0, collapsedPopularCount);
  const hiddenPopularCount = Math.max(0, resultBoards.length - displayedBoards.length);

  useEffect(() => {
    const grid = popularGridRef.current;
    if (!grid) return;

    const updateColumns = (width: number) => {
      if (width > 0) setPopularColumns(popularBoardColumnCount(width));
    };
    updateColumns(grid.getBoundingClientRect().width);

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) updateColumns(entry.contentRect.width);
    });
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const prefix = input.trim();
    if (!prefix || !onSearchBoards) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchFailed(false);
      return;
    }

    let cancelled = false;
    setSearchResults([]);
    setSearchLoading(true);
    setSearchFailed(false);
    const timeout = window.setTimeout(() => {
      onSearchBoards(prefix)
        .then((results) => {
          if (!cancelled) setSearchResults(results);
        })
        .catch(() => {
          if (!cancelled) setSearchFailed(true);
        })
        .finally(() => {
          if (!cancelled) setSearchLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [input, onSearchBoards]);

  const baseFavoriteNames = useMemo(
    () =>
      favoriteBoards !== undefined
        ? favoriteBoards
        : favoriteBoardsLoading
          ? []
          : FAVORITE_FALLBACKS.map((board) => board.name),
    [favoriteBoards, favoriteBoardsLoading],
  );

  const favoriteNames = useMemo(() => {
    const byKey = new Map(baseFavoriteNames.map((name) => [name.toLowerCase(), name]));
    Object.entries(favoriteOverrides).forEach(([name, enabled]) => {
      if (enabled) byKey.set(name.toLowerCase(), name);
      else byKey.delete(name.toLowerCase());
    });
    return Array.from(byKey.values());
  }, [baseFavoriteNames, favoriteOverrides]);

  const favoriteCards = useMemo(() => {
    const metadata = new Map(
      [...boards, ...FAVORITE_FALLBACKS].map((board) => [board.name.toLowerCase(), board]),
    );

    return favoriteNames.map((name) => {
      const board = metadata.get(name.toLowerCase());
      return {
        name,
        zh: board?.zh,
        online: board?.online,
      };
    });
  }, [boards, favoriteNames]);
  const displayedFavoriteCards = favoriteExpanded
    ? favoriteCards
    : favoriteCards.slice(0, FAVORITE_INITIAL);
  const hiddenFavoriteCount = Math.max(
    0,
    favoriteCards.length - displayedFavoriteCards.length,
  );

  const submitBoard = (board = input.trim()) => {
    const nextBoard = board.trim();
    if (nextBoard && isConnected) onEnter(nextBoard);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitBoard();
  };

  const toggleFavorite = (name: string) => {
    const isFavorite = favoriteNames.some(
      (favoriteName) => favoriteName.toLowerCase() === name.toLowerCase(),
    );
    setFavoriteOverrides((current) => ({
      ...current,
      [name]: !isFavorite,
    }));
  };

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
            共同打造新生的PTT社群，透過終端頁面重解析，讓PTT能轉型成更現代化的社群論壇。聚合分散推文、回文嵌套回覆、回文推噓、回文編輯⋯，我們的野心沒有終點。
          </p>
        </section>

        <form
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 0,
            maxWidth: 640,
            marginBottom: 48,
            padding: 6,
            borderRadius: 14,
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            boxShadow: "0 1px 0 var(--border), 0 8px 32px -16px oklch(0 0 0 / 0.4)",
          }}
        >
          <span style={{ padding: "0 8px 0 12px", color: "var(--text-dim)" }}>
            <SearchIcon />
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

        {favoriteCards.length > 0 && !isSearching && (
          <section style={{ marginBottom: 40 }}>
            <SectionHead
              icon={<StarIcon filled />}
              title="我的最愛"
              hint={`${currentUser ?? "PTT"} · ${favoriteCards.length} 個關注看板`}
              accent
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 12,
              }}
            >
              {displayedFavoriteCards.map((board) => (
                <FavoriteCard
                  key={board.name}
                  board={board}
                  disabled={!isConnected}
                  onOpen={() => submitBoard(board.name)}
                  onUnstar={() => toggleFavorite(board.name)}
                />
              ))}
            </div>
            {favoriteCards.length > FAVORITE_INITIAL && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
                <button
                  type="button"
                  onClick={() => setFavoriteExpanded((expanded) => !expanded)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "9px 16px",
                    borderRadius: 10,
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text-muted)",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "var(--font)",
                  }}
                >
                  {favoriteExpanded ? (
                    <>
                      <ChevronUpIcon /> 收起
                    </>
                  ) : (
                    <>
                      <ChevronDownIcon /> 展開全部 {favoriteCards.length} 個最愛（再 +
                      {hiddenFavoriteCount}）
                    </>
                  )}
                </button>
              </div>
            )}
          </section>
        )}

        {(recentBoards?.length ?? 0) > 0 && !isSearching && (
          <section style={{ marginBottom: 40 }}>
            <SectionHead icon={<ClockIcon />} title="最近瀏覽" />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(recentBoards ?? []).map((name) => {
                const isFavorite = favoriteNames.some(
                  (favoriteName) => favoriteName.toLowerCase() === name.toLowerCase(),
                );
                return (
                  <div
                    key={name}
                    style={{
                      display: "inline-flex",
                      alignItems: "stretch",
                      overflow: "hidden",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      opacity: isConnected ? 1 : 0.45,
                    }}
                  >
                    <button
                      onClick={() => submitBoard(name)}
                      disabled={!isConnected}
                      style={{
                        padding: "8px 12px",
                        border: 0,
                        background: "transparent",
                        color: "var(--text)",
                        fontWeight: 600,
                        fontSize: 13.5,
                        letterSpacing: "-0.01em",
                        cursor: isConnected ? "pointer" : "not-allowed",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {name}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFavorite(name)}
                      title={isFavorite ? "從最愛移除" : "加入最愛"}
                      disabled={!isConnected}
                      style={{
                        width: 34,
                        border: 0,
                        borderLeft: "1px solid var(--border)",
                        background: "transparent",
                        color: isFavorite ? "var(--accent-ink)" : "var(--text-dim)",
                        cursor: isConnected ? "pointer" : "not-allowed",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <StarIcon filled={isFavorite} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <SectionHead
            icon={<FlameIcon />}
            title={isSearching ? "搜尋看板" : hasLivePopularBoards ? "熱門看板" : "常用看板"}
            hint={
              popularBoardsLoading
                ? "同步中"
                : isSearching
                  ? searchLoading
                    ? "搜尋中"
                    : searchFailed
                      ? "搜尋失敗，請稍後再試"
                      : `${resultBoards.length} 個搜尋結果`
                  : hasLivePopularBoards
                    ? `${boards.length} 個 · 即時人數`
                    : "即時人數待同步"
            }
          />
          <div
            ref={popularGridRef}
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(auto-fill, minmax(${POPULAR_CARD_MIN_WIDTH}px, 1fr))`,
              gap: POPULAR_GRID_GAP,
            }}
          >
            {displayedBoards.map((board) => {
              const isFavorite = favoriteNames.some(
                (favoriteName) => favoriteName.toLowerCase() === board.name.toLowerCase(),
              );
              return (
                <div
                  key={board.name}
                  onClick={() => submitBoard(board.name)}
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
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                      {board.name}
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      {hasLivePopularBoards && !isSearching && (
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
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleFavorite(board.name);
                        }}
                        title={isFavorite ? "從最愛移除" : "加入最愛"}
                        disabled={!isConnected}
                        style={{
                          width: 24,
                          height: 24,
                          padding: 0,
                          border: 0,
                          background: "transparent",
                          color: isFavorite ? "var(--accent-ink)" : "var(--text-dim)",
                          cursor: isConnected ? "pointer" : "not-allowed",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <StarIcon filled={isFavorite} />
                      </button>
                    </span>
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
                    {formatOnlineCount(board.online)}
                  </div>
                </div>
              );
            })}
          </div>

          {!isSearching && hiddenPopularCount > 0 && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
              <button
                type="button"
                onClick={() => setPopularExpanded((expanded) => !expanded)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 16px",
                  borderRadius: 10,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "var(--font)",
                }}
              >
                {popularExpanded ? (
                  <>
                    <ChevronUpIcon /> 收起
                  </>
                ) : (
                  <>
                    <ChevronDownIcon /> 展開全部 {resultBoards.length} 個看板（再 +
                    {hiddenPopularCount}）
                  </>
                )}
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function SectionHead({
  icon,
  title,
  hint,
  accent = false,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: 14,
      }}
    >
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: 6,
            background: accent ? "var(--accent-soft)" : "var(--surface)",
            border: accent ? "1px solid var(--accent-border)" : "1px solid var(--border)",
            color: accent ? "var(--accent-ink)" : "var(--text-muted)",
          }}
        >
          {icon}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: accent ? "var(--accent-ink)" : "var(--text-dim)",
          }}
        >
          {title}
        </span>
      </div>
      {hint && (
        <div style={{ color: "var(--text-dim)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function FavoriteCard({
  board,
  disabled,
  onOpen,
  onUnstar,
}: {
  board: PopularBoard;
  disabled: boolean;
  onOpen: () => void;
  onUnstar: () => void;
}) {
  return (
    <div
      onClick={onOpen}
      style={{
        position: "relative",
        textAlign: "left",
        overflow: "hidden",
        padding: "16px 16px 14px",
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        color: "var(--text)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        fontFamily: "var(--font)",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: "linear-gradient(180deg, var(--accent), oklch(0.55 0.18 320))",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <Monogram name={board.name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14 }}>
            {board.name}
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 1 }}>
            {board.zh || "我的最愛看板"}
          </div>
        </div>
        <button
          type="button"
          title="從最愛移除"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onUnstar();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              onUnstar();
            }
          }}
          style={{
            width: 26,
            height: 26,
            padding: 0,
            border: 0,
            background: "transparent",
            color: "var(--accent-ink)",
            cursor: disabled ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <StarIcon filled />
        </button>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          paddingTop: 10,
          borderTop: "1px dashed var(--border)",
          color: "var(--text-dim)",
          fontSize: 11.5,
          fontFamily: "var(--font-mono)",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              background: "oklch(0.72 0.16 155)",
            }}
          />
          {formatOnlineCount(board.online)}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ color: "var(--accent-ink)" }}>進入 →</span>
      </div>
    </div>
  );
}

function Monogram({ name }: { name: string }) {
  const hue = Array.from(name).reduce((value, char) => value + char.charCodeAt(0), 0) % 360;
  return (
    <span
      style={{
        width: 32,
        height: 32,
        borderRadius: 10,
        background: `oklch(0.42 0.10 ${hue})`,
        color: `oklch(0.95 0.04 ${hue})`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: 13,
        letterSpacing: 0,
        flexShrink: 0,
      }}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function formatOnlineCount(online?: string | number) {
  if (online === undefined || online === "") return "即時人數待同步";
  const value = typeof online === "number" ? online.toLocaleString() : online;
  return `${value} 在線`;
}

function StarIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}
