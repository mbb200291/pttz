// Home screen — board picker + recent + popular grid

const { Icon, Chip, Topbar, Brand, Btn } = window.PTTZZZ_UI;

function Home({ t, onPick, onLogin, loggedIn }) {
  const { POPULAR_BOARDS, RECENT_BOARDS } = window.PTTZZZ_DATA;
  const [q, setQ] = React.useState("");
  const [hover, setHover] = React.useState(null);

  function go(name) {onPick(name || q.trim() || "Gossiping");}

  const filtered = q.trim() ?
  POPULAR_BOARDS.filter((b) => (b.name + b.zh).toLowerCase().includes(q.trim().toLowerCase())) :
  POPULAR_BOARDS;

  return (
    <div style={{ minHeight: "100%", color: t.text, fontFamily: t.font }}>
      <Topbar t={t}
      left={<Brand t={t} onClick={() => onPick(null)} />}
      right={
      <>
            <Btn t={t} variant="minimal" size="sm" onClick={onLogin}>
              <Icon.Login s={13} />
              <span>{loggedIn ? "已登入" : "登入 PTT"}</span>
            </Btn>
          </>
      } />
      

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "60px 24px 80px" }}>
        {/* Hero */}
        <div style={{ marginBottom: 48, maxWidth: 720 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "5px 11px", borderRadius: 999,
            background: t.surface, border: `1px solid ${t.border}`,
            fontSize: 12, color: t.textMuted, fontWeight: 500,
            marginBottom: 24
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: "oklch(0.72 0.16 155)" }} />
            <span>已連線 · wss://ws.ptt.cc/bbs</span>
          </div>
          <h1 style={{
            fontSize: 56, fontWeight: 700, letterSpacing: "-0.035em", lineHeight: 1.05,
            margin: 0, marginBottom: 18, color: "black"
          }}>
            <span>一起推進</span>
            <div>
              <span style={{
                background: `linear-gradient(135deg, ${t.accent}, oklch(0.55 0.18 320))`,
                WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent"
              }}>PTTZ</span>計畫。
            </div>
          </h1>
          <p style={{ fontSize: 17, color: t.textMuted, lineHeight: 1.55, margin: 0, maxWidth: 560 }}>共同打造新生的PTT社群，透過終端頁面重解析，讓PTT能轉型成更現代話的社群論壇。激進聚合分散推文、嵌套回覆回文、回文推噓、回文編輯...，我們的野心沒有終點。

          </p>
        </div>

        {/* Search */}
        <div style={{
          display: "flex", alignItems: "center", gap: 0,
          background: t.surface, border: `1px solid ${t.borderStrong}`,
          borderRadius: 14,
          padding: 6,
          maxWidth: 640,
          marginBottom: 40,
          boxShadow: `0 1px 0 ${t.border}, 0 8px 32px -16px oklch(0 0 0 / 0.4)`
        }}>
          <span style={{ padding: "0 8px 0 12px", color: t.textDim, display: "flex", alignItems: "center" }}>
            <Icon.Search s={16} />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {if (e.key === "Enter") go();}}
            placeholder="輸入看板名稱  例如  Gossiping"
            style={{
              flex: 1, minWidth: 0, padding: "10px 4px",
              background: "transparent", border: 0, outline: "none",
              color: t.text, fontSize: 15, fontFamily: t.font, letterSpacing: "-0.005em"
            }} />
          
          <Btn t={t} variant="solid" size="md" onClick={() => go()} style={{ marginLeft: 6 }}>
            進入看板
          </Btn>
        </div>

        {/* Recent */}
        {RECENT_BOARDS.length > 0 &&
        <div style={{ marginBottom: 36 }}>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", color: t.textDim, marginBottom: 12, textTransform: "uppercase" }}>
              最近瀏覽
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {RECENT_BOARDS.map((name) =>
            <button key={name} onClick={() => go(name)} style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "8px 14px", borderRadius: 10,
              background: t.surface, border: `1px solid ${t.border}`,
              color: t.text, fontWeight: 600, fontSize: 13.5, letterSpacing: "-0.01em",
              cursor: "pointer", fontFamily: t.fontMono
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = t.accentBorder}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = t.border}>
              
                  {name}
                </button>
            )}
            </div>
          </div>
        }

        {/* Popular boards grid */}
        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", color: t.textDim, textTransform: "uppercase" }}>
              熱門看板
            </div>
            <div style={{ fontSize: 12, color: t.textDim }}>
              {filtered.length} 個 · 即時人數
            </div>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 10
          }}>
            {filtered.map((b) => {
              const active = hover === b.name;
              return (
                <button key={b.name}
                onMouseEnter={() => setHover(b.name)}
                onMouseLeave={() => setHover(null)}
                onClick={() => go(b.name)}
                style={{
                  textAlign: "left",
                  background: t.surface,
                  border: `1px solid ${active ? t.accentBorder : t.border}`,
                  borderRadius: 12, padding: "14px 16px",
                  cursor: "pointer",
                  transition: "border-color 120ms, background 120ms",
                  fontFamily: t.font,
                  color: t.text,
                  position: "relative"
                }}>
                  
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontFamily: t.fontMono, fontWeight: 700, fontSize: 14, letterSpacing: "-0.01em" }}>
                      {b.name}
                    </span>
                    {b.hot && <Chip t={t} soft color={{ fg: "oklch(0.86 0.18 75)", bg: "oklch(0.86 0.18 75 / 0.12)" }}>HOT</Chip>}
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
                </button>);

            })}
          </div>
        </div>
      </div>
    </div>);

}

window.PTTZZZ_HOME = Home;