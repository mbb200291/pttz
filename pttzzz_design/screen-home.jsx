// Home screen — board picker + favorites + recent + popular grid (with expand)

const { Icon, Chip, Topbar, Brand, Btn } = window.PTTZZZ_UI;
const { Monogram } = window.PTTZZZ_THEME;

const POPULAR_INITIAL = 6;

function Home({ t, onPick, onLogin, loggedIn }) {
  const { POPULAR_BOARDS, RECENT_BOARDS, FAVORITE_BOARDS, CURRENT_USER } = window.PTTZZZ_DATA;
  const [q, setQ] = React.useState("");
  const [hover, setHover] = React.useState(null);
  const [popularExpanded, setPopularExpanded] = React.useState(false);
  const [favs, setFavs] = React.useState(() => FAVORITE_BOARDS.map(f => f.name));

  function go(name) { onPick(name || q.trim() || "Gossiping"); }

  const searching = q.trim().length > 0;
  const filtered = searching
    ? POPULAR_BOARDS.filter(b => (b.name + b.zh).toLowerCase().includes(q.trim().toLowerCase()))
    : POPULAR_BOARDS;

  const popularVisible = searching || popularExpanded ? filtered : filtered.slice(0, POPULAR_INITIAL);
  const popularHidden = Math.max(0, filtered.length - popularVisible.length);

  const favoriteCards = FAVORITE_BOARDS.filter(f => favs.includes(f.name));

  function toggleFav(name) {
    setFavs(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  }

  return (
    <div style={{ minHeight: "100%", color: t.text, fontFamily: t.font }}>
      <Topbar t={t}
        left={<Brand t={t} onClick={() => onPick(null)} />}
        right={
          <Btn t={t} variant="minimal" size="sm" onClick={onLogin}>
            <Icon.Login s={13} />
            <span>{loggedIn ? "已登入" : "登入 PTT"}</span>
          </Btn>
        } />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "60px 24px 80px" }}>
        {/* Hero */}
        <div style={{ marginBottom: 44, maxWidth: 720 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "5px 11px", borderRadius: 999,
            background: t.surface, border: `1px solid ${t.border}`,
            fontSize: 12, color: t.textMuted, fontWeight: 500,
            marginBottom: 24,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: "oklch(0.72 0.16 155)" }} />
            <span>已連線 · wss://ws.ptt.cc/bbs</span>
          </div>
          <h1 style={{
            fontSize: 56, fontWeight: 700, letterSpacing: "-0.035em", lineHeight: 1.05,
            margin: 0, marginBottom: 18, color: t.text,
          }}>
            <span>一起推進</span>
            <div>
              <span style={{
                background: `linear-gradient(135deg, ${t.accent}, oklch(0.55 0.18 320))`,
                WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
              }}>PTTZ</span>計畫。
            </div>
          </h1>
          <p style={{ fontSize: 17, color: t.textMuted, lineHeight: 1.55, margin: 0, maxWidth: 560 }}>
            共同打造新生的PTT社群，透過終端頁面重解析，讓PTT能轉型成更現代化的社群論壇。激進聚合分散推文、嵌套回覆回文、回文推噓、回文編輯⋯，我們的野心沒有終點。
          </p>
        </div>

        {/* Search */}
        <div style={{
          display: "flex", alignItems: "center", gap: 0,
          background: t.surface, border: `1px solid ${t.borderStrong}`,
          borderRadius: 14, padding: 6, maxWidth: 640, marginBottom: 48,
          boxShadow: `0 1px 0 ${t.border}, 0 8px 32px -16px oklch(0 0 0 / 0.4)`,
        }}>
          <span style={{ padding: "0 8px 0 12px", color: t.textDim, display: "flex", alignItems: "center" }}>
            <Icon.Search s={16} />
          </span>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") go(); }}
            placeholder="輸入看板名稱  例如  Gossiping"
            style={{
              flex: 1, minWidth: 0, padding: "10px 4px",
              background: "transparent", border: 0, outline: "none",
              color: t.text, fontSize: 15, fontFamily: t.font, letterSpacing: "-0.005em",
            }} />
          <Btn t={t} variant="solid" size="md" onClick={() => go()} style={{ marginLeft: 6 }}>
            進入看板
          </Btn>
        </div>

        {/* My Favorites */}
        {favoriteCards.length > 0 && !searching && (
          <section style={{ marginBottom: 40 }}>
            <SectionHead t={t}
              icon={<StarIcon filled />}
              title="我的最愛"
              hint={`${CURRENT_USER} · ${favoriteCards.length} 個關注看板`}
              accent />
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 12,
            }}>
              {favoriteCards.map(b => (
                <FavoriteCard key={b.name} t={t} board={b}
                  onOpen={() => go(b.name)}
                  onUnstar={() => toggleFav(b.name)} />
              ))}
            </div>
          </section>
        )}

        {/* Recent */}
        {RECENT_BOARDS.length > 0 && !searching && (
          <section style={{ marginBottom: 40 }}>
            <SectionHead t={t}
              icon={<ClockIcon />}
              title="最近瀏覽" />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {RECENT_BOARDS.map(name => {
                const isFav = favs.includes(name);
                return (
                  <div key={name} style={{
                    display: "inline-flex", alignItems: "stretch",
                    background: t.surface, border: `1px solid ${t.border}`,
                    borderRadius: 10, overflow: "hidden",
                    transition: "border-color 100ms",
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = t.accentBorder}
                  onMouseLeave={e => e.currentTarget.style.borderColor = t.border}>
                    <button onClick={() => go(name)} style={{
                      padding: "8px 12px", border: 0, background: "transparent",
                      color: t.text, fontWeight: 600, fontSize: 13.5,
                      cursor: "pointer", fontFamily: t.fontMono, letterSpacing: "-0.01em",
                    }}>{name}</button>
                    <button onClick={() => toggleFav(name)} title={isFav ? "從最愛移除" : "加入最愛"}
                      style={{
                        padding: "0 9px", border: 0, background: "transparent",
                        borderLeft: `1px solid ${t.border}`,
                        color: isFav ? t.accent : t.textDim, cursor: "pointer",
                        display: "inline-flex", alignItems: "center",
                      }}>
                      <StarIcon filled={isFav} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Popular boards grid */}
        <section>
          <SectionHead t={t}
            icon={<FlameIcon />}
            title="熱門看板"
            hint={searching ? `${filtered.length} 個搜尋結果` : `${POPULAR_BOARDS.length} 個 · 即時人數`} />
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 10,
          }}>
            {popularVisible.map(b => {
              const active = hover === b.name;
              const isFav = favs.includes(b.name);
              return (
                <div key={b.name}
                  onMouseEnter={() => setHover(b.name)}
                  onMouseLeave={() => setHover(null)}
                  style={{
                    background: t.surface,
                    border: `1px solid ${active ? t.accentBorder : t.border}`,
                    borderRadius: 12, padding: "14px 16px",
                    transition: "border-color 120ms, background 120ms",
                    fontFamily: t.font, color: t.text,
                    position: "relative", cursor: "pointer",
                  }}
                  onClick={() => go(b.name)}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontFamily: t.fontMono, fontWeight: 700, fontSize: 14, letterSpacing: "-0.01em" }}>
                      {b.name}
                    </span>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {b.hot && <Chip t={t} soft color={{ fg: "oklch(0.86 0.18 75)", bg: "oklch(0.86 0.18 75 / 0.12)" }}>HOT</Chip>}
                      <button onClick={e => { e.stopPropagation(); toggleFav(b.name); }}
                        title={isFav ? "從最愛移除" : "加入最愛"}
                        style={{
                          width: 22, height: 22, padding: 0, border: 0, background: "transparent",
                          color: isFav ? t.accent : (active ? t.textMuted : t.textDim), cursor: "pointer",
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                        }}>
                        <StarIcon filled={isFav} s={14} />
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 12 }}>{b.zh}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11.5, color: t.textDim, fontFamily: t.fontMono }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 3, background: "oklch(0.72 0.16 155)" }} />
                      {b.online.toLocaleString()} 在線
                    </span>
                    <span>·</span>
                    <span>今日 {b.today.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {!searching && popularHidden > 0 && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
              <button onClick={() => setPopularExpanded(x => !x)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "9px 16px", borderRadius: 10,
                  background: t.surface, border: `1px solid ${t.border}`,
                  color: t.textMuted, fontWeight: 600, fontSize: 13,
                  cursor: "pointer", fontFamily: t.font, letterSpacing: "-0.005em",
                  transition: "border-color 100ms, background 100ms",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = t.accentBorder; e.currentTarget.style.color = t.text; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.color = t.textMuted; }}>
                {popularExpanded
                  ? <><ChevronUp /> 收起</>
                  : <><ChevronDown /> 展開全部 {filtered.length} 個看板（再 +{popularHidden}）</>}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SectionHead({ t, icon, title, hint, accent = false }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 22, height: 22, borderRadius: 6,
          background: accent ? t.accentSoft : t.surface,
          border: `1px solid ${accent ? t.accentBorder : t.border}`,
          color: accent ? t.accentInk : t.textMuted,
        }}>{icon}</span>
        <span style={{
          fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
          color: accent ? t.accentInk : t.textDim, textTransform: "uppercase",
        }}>{title}</span>
      </div>
      {hint && (
        <div style={{ fontSize: 12, color: t.textDim, fontFamily: t.fontMono }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function FavoriteCard({ t, board, onOpen, onUnstar }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      style={{
        position: "relative",
        background: hover ? t.bgSubtle : t.surface,
        border: `1px solid ${hover ? t.accentBorder : t.border}`,
        borderRadius: 14, padding: "16px 16px 14px",
        cursor: "pointer", overflow: "hidden",
        transition: "border-color 120ms, background 120ms",
      }}>
      {/* Accent stripe */}
      <span style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
        background: `linear-gradient(180deg, ${t.accent}, oklch(0.55 0.18 320))`,
        opacity: hover ? 1 : 0.7,
      }} />

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <Monogram name={board.name} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: t.fontMono, fontWeight: 700, fontSize: 14, letterSpacing: "-0.01em", color: t.text }}>
            {board.name}
          </div>
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 1 }}>
            {board.zh}
          </div>
        </div>
        <button onClick={e => { e.stopPropagation(); onUnstar(); }}
          title="從最愛移除"
          style={{
            width: 26, height: 26, padding: 0, border: 0,
            background: "transparent", color: t.accent,
            cursor: "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}>
          <StarIcon filled s={15} />
        </button>
      </div>

      {board.note && (
        <div style={{ fontSize: 12, color: t.textDim, marginBottom: 12, lineHeight: 1.45 }}>
          {board.note}
        </div>
      )}

      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        fontSize: 11.5, color: t.textDim, fontFamily: t.fontMono,
        paddingTop: 10, borderTop: `1px dashed ${t.border}`,
      }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: "oklch(0.72 0.16 155)" }} />
          {board.online.toLocaleString()} 在線
        </span>
        <span>·</span>
        <span>今日 {board.today.toLocaleString()}</span>
        <span style={{ flex: 1 }} />
        <span style={{
          color: hover ? t.accentInk : t.textDim,
          transition: "color 100ms",
        }}>進入 →</span>
      </div>
    </div>
  );
}

function StarIcon({ filled = false, s = 12 }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
function ClockIcon() {
  return (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>);
}
function FlameIcon() {
  return (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>);
}
function ChevronDown() {
  return (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>);
}
function ChevronUp() {
  return (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>);
}

window.PTTZZZ_HOME = Home;
