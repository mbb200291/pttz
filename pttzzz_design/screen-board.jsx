// Board screen — article list

const { Icon, Chip, Topbar, Brand, Btn } = window.PTTZZZ_UI;
const { pushCountStyle } = window.PTTZZZ_THEME;

const PUSH_FILTERS = [
  { label: "全部", value: null },
  { label: "≥10", value: 10 },
  { label: "≥20", value: 20 },
  { label: "≥30", value: 30 },
  { label: "爆", value: "boom" },
];

// Custom threshold popover — slider + number input
function CustomThresholdPopover({ t, value, onApply, onClose }) {
  const initial = typeof value === "number" && ![10, 20, 30].includes(value) ? value : 50;
  const [n, setN] = React.useState(initial);
  const ref = React.useRef(null);

  React.useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    function onKey(e) {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") onApply(n);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [n, onApply, onClose]);

  const QUICK = [5, 15, 25, 50, 75];

  return (
    <div ref={ref} style={{
      position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 30,
      width: 280, padding: 14,
      background: t.surface, border: `1px solid ${t.border}`,
      borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)",
      fontFamily: t.font, color: t.text,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: t.textDim,
        textTransform: "uppercase", marginBottom: 10,
      }}>自訂推文門檻</div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: t.textMuted }}>推噓 ≥</span>
        <input
          type="number" min={1} max={999} value={n}
          onChange={e => {
            const v = parseInt(e.target.value, 10);
            if (!Number.isNaN(v)) setN(Math.max(1, Math.min(999, v)));
            else setN("");
          }}
          autoFocus
          style={{
            flex: 1, padding: "6px 10px",
            background: t.bg, border: `1px solid ${t.border}`, borderRadius: 7,
            color: t.text, fontSize: 16, fontFamily: t.fontMono, fontWeight: 700,
            letterSpacing: "-0.01em", outline: "none", textAlign: "right",
          }}
        />
        <span style={{ fontSize: 12, color: t.textDim, fontFamily: t.fontMono }}>推</span>
      </div>

      <input
        type="range" min={1} max={100} value={typeof n === "number" ? n : 1}
        onChange={e => setN(parseInt(e.target.value, 10))}
        style={{
          width: "100%", accentColor: t.accentInk, margin: "2px 0 8px",
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: t.textDim, fontFamily: t.fontMono, marginBottom: 12 }}>
        <span>1</span><span>25</span><span>50</span><span>75</span><span>100+</span>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }}>
        {QUICK.map(q => (
          <button key={q} onClick={() => setN(q)}
            style={{
              padding: "4px 9px", borderRadius: 6,
              background: n === q ? t.accentSoft : "transparent",
              border: `1px solid ${n === q ? t.accentBorder : t.border}`,
              color: n === q ? t.accentInk : t.textMuted,
              fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: t.fontMono,
            }}>≥{q}</button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{
          padding: "6px 12px", borderRadius: 7,
          background: "transparent", border: `1px solid ${t.border}`,
          color: t.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: t.font,
        }}>取消</button>
        <button
          onClick={() => onApply(typeof n === "number" ? n : 1)}
          disabled={typeof n !== "number" || n < 1}
          style={{
            padding: "6px 14px", borderRadius: 7,
            background: t.accentInk, border: `1px solid ${t.accentInk}`,
            color: t.surface, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: t.font,
            opacity: (typeof n !== "number" || n < 1) ? 0.5 : 1,
          }}>套用</button>
      </div>
    </div>
  );
}

function ArticleRow({ a, t, density, showAuthor, onOpen }) {
  const tone = pushCountStyle(a.push, t);
  const isRe = a.title.startsWith("Re:");
  const isDeleted = a.deleted;
  const isPinned = a.pinned;
  const padY = density === "compact" ? 7 : density === "roomy" ? 13 : 10;

  return (
    <button
      onClick={() => !isDeleted && onOpen(a)}
      disabled={isDeleted}
      style={{
        display: "grid",
        gridTemplateColumns: "44px 56px 1fr auto",
        alignItems: "center",
        gap: 14,
        width: "100%",
        textAlign: "left",
        padding: `${padY}px 20px`,
        background: isPinned ? t.accentSoft : "transparent",
        border: 0,
        borderBottom: `1px solid ${t.border}`,
        cursor: isDeleted ? "not-allowed" : "pointer",
        opacity: isDeleted ? 0.4 : 1,
        fontFamily: t.font, color: t.text,
        transition: "background 120ms",
      }}
      onMouseEnter={e => { if (!isDeleted && !isPinned) e.currentTarget.style.background = t.surface; }}
      onMouseLeave={e => { if (!isDeleted && !isPinned) e.currentTarget.style.background = "transparent"; }}
    >
      {/* Push badge */}
      <div style={{
        justifySelf: "start",
        minWidth: 36, height: 24,
        padding: "0 8px",
        borderRadius: 6,
        background: tone.bg, color: tone.fg,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontFamily: t.fontMono, fontWeight: 700, fontSize: 12,
        letterSpacing: "-0.02em",
      }}>{tone.label.trim() || "·"}</div>

      {/* Date / index */}
      <div style={{ fontFamily: t.fontMono, fontSize: 11.5, color: t.textDim }}>
        <div>{a.date}</div>
        <div style={{ fontSize: 10, opacity: 0.7 }}>#{a.idx}</div>
      </div>

      {/* Title + meta */}
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          minWidth: 0,
        }}>
          {a.category && (
            <span style={{
              fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em",
              color: t.accentInk, padding: "2px 6px", borderRadius: 4,
              background: t.accentSoft, flexShrink: 0,
            }}>{a.category}</span>
          )}
          {isPinned && <Chip t={t} soft color={{ fg: t.accentInk, bg: t.accentSoft }}>置頂</Chip>}
          <span style={{
            fontSize: 14,
            fontWeight: isRe ? 500 : 600,
            color: isRe ? t.textMuted : t.text,
            letterSpacing: "-0.01em",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            minWidth: 0,
          }}>
            {a.title.replace(/^\[.+?\]\s*/, "").replace(/^Re:\s*\[.+?\]\s*/, "Re: ")}
          </span>
        </div>
        {(a.replies != null || showAuthor) && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5, color: t.textDim, fontFamily: t.font }}>
            {showAuthor && <span style={{ fontFamily: t.fontMono }}>{a.author}</span>}
            {a.replies != null && (
              <>
                {showAuthor && <Icon.Dot s={3} />}
                <span>{a.replies} 回覆</span>
              </>
            )}
            {isRe && (<><Icon.Dot s={3} /><span>系列回文</span></>)}
          </div>
        )}
      </div>

      {/* Right: hover open hint */}
      <div style={{ color: t.textDim, fontSize: 11, fontFamily: t.fontMono, paddingRight: 4 }}>
        →
      </div>
    </button>
  );
}

function Board({ t, boardName, density, showAuthor, onBack, onOpen, onCompose }) {
  const { ARTICLES, PINNED, POPULAR_BOARDS } = window.PTTZZZ_DATA;
  const meta = POPULAR_BOARDS.find(b => b.name === boardName);
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState(null);
  const [customOpen, setCustomOpen] = React.useState(false);

  const PRESETS = [null, 10, 20, 30, "boom"];
  const isCustom = typeof filter === "number" && !PRESETS.includes(filter);

  const all = [...PINNED, ...ARTICLES];
  const filtered = all.filter(a => {
    if (search.trim() && !a.title.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (filter == null) return true;
    if (filter === "boom") return a.push === "爆";
    const n = parseInt(a.push, 10);
    return !Number.isNaN(n) && n >= filter;
  });

  return (
    <div style={{ minHeight: "100%", color: t.text, fontFamily: t.font }}>
      <Topbar t={t}
        left={
          <>
            <Btn t={t} variant="minimal" size="sm" onClick={onBack}>
              <Icon.Back s={14} /> 返回
            </Btn>
            <span style={{ width: 1, height: 18, background: t.border }} />
            <span style={{ fontFamily: t.fontMono, fontSize: 14, fontWeight: 700 }}>{boardName}</span>
            {meta && <span style={{ fontSize: 13, color: t.textMuted }}>{meta.zh}</span>}
            {meta && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: t.textDim, fontFamily: t.fontMono }}>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: "oklch(0.72 0.16 155)" }} />
                {meta.online.toLocaleString()} 在線
              </span>
            )}
          </>
        }
        right={
          <>
            <Btn t={t} variant="ghost" size="sm" title="收藏看板">
              <Icon.Bookmark s={13} />
            </Btn>
            <Btn t={t} variant="solid" size="sm" onClick={onCompose}>
              <Icon.Compose s={13} /> 發文
            </Btn>
          </>
        }
      />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 0 60px" }}>
        {/* Search + filters */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center",
          padding: "0 20px 18px",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 0,
            background: t.surface, border: `1px solid ${t.border}`,
            borderRadius: 10, flex: 1, minWidth: 240,
          }}>
            <span style={{ padding: "0 6px 0 11px", color: t.textDim, display: "inline-flex" }}>
              <Icon.Search s={14} />
            </span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜尋標題  或  #AID"
              style={{
                flex: 1, padding: "8px 10px",
                background: "transparent", border: 0, outline: "none",
                color: t.text, fontSize: 13.5, fontFamily: t.font,
              }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{
                background: "transparent", border: 0, color: t.textDim, padding: "0 10px", cursor: "pointer", display: "inline-flex",
              }}><Icon.Close s={12} /></button>
            )}
          </div>

          <div style={{ position: "relative", display: "inline-flex", padding: 3, background: t.surface, borderRadius: 10, border: `1px solid ${t.border}`, gap: 1 }}>
            {PUSH_FILTERS.map(f => (
              <button key={f.label}
                onClick={() => { setFilter(f.value); setCustomOpen(false); }}
                style={{
                  padding: "5px 11px", borderRadius: 7, border: 0,
                  background: filter === f.value ? t.accentSoft : "transparent",
                  color: filter === f.value ? t.accentInk : t.textMuted,
                  fontSize: 12, fontWeight: 600, cursor: "pointer", letterSpacing: "-0.01em",
                  fontFamily: t.font,
                }}>{f.label}</button>
            ))}
            <span style={{ width: 1, background: t.border, margin: "2px 2px" }} />
            <button
              onClick={() => setCustomOpen(o => !o)}
              title="自訂推文門檻"
              style={{
                padding: "5px 11px", borderRadius: 7, border: 0,
                background: isCustom ? t.accentSoft : "transparent",
                color: isCustom ? t.accentInk : t.textMuted,
                fontSize: 12, fontWeight: 600, cursor: "pointer", letterSpacing: "-0.01em",
                fontFamily: t.font, display: "inline-flex", alignItems: "center", gap: 4,
              }}>
              {isCustom ? `≥${filter}` : "自訂"}
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </button>
            {customOpen && (
              <CustomThresholdPopover t={t} value={filter}
                onApply={n => { setFilter(n); setCustomOpen(false); }}
                onClose={() => setCustomOpen(false)} />
            )}
          </div>
        </div>

        {/* Active filter chips */}
        {(search.trim() || filter != null) && (
          <div style={{
            display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8,
            padding: "0 20px 14px",
          }}>
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
              color: t.textDim, textTransform: "uppercase", marginRight: 2,
            }}>
              篩選中
            </span>
            {search.trim() && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "4px 4px 4px 10px", borderRadius: 999,
                background: t.accentSoft, color: t.accentInk,
                border: `1px solid ${t.accentBorder}`,
                fontSize: 12, fontWeight: 600, letterSpacing: "-0.005em",
              }}>
                <Icon.Search s={11} />
                <span>關鍵字 <span style={{ fontFamily: t.fontMono }}>「{search.trim()}」</span></span>
                <button onClick={() => setSearch("")} title="清除關鍵字"
                  style={{
                    background: "transparent", border: 0, color: "inherit",
                    cursor: "pointer", padding: "3px 5px", borderRadius: 999,
                    display: "inline-flex", alignItems: "center", opacity: 0.7,
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = 1}
                  onMouseLeave={e => e.currentTarget.style.opacity = 0.7}>
                  <Icon.Close s={11} />
                </button>
              </span>
            )}
            {filter != null && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "4px 4px 4px 10px", borderRadius: 999,
                background: t.accentSoft, color: t.accentInk,
                border: `1px solid ${t.accentBorder}`,
                fontSize: 12, fontWeight: 600,
              }}>
                <span>推噓 {filter === "boom" ? "爆文" : `≥${filter}`}</span>
                <button onClick={() => setFilter(null)} title="清除推噓篩選"
                  style={{
                    background: "transparent", border: 0, color: "inherit",
                    cursor: "pointer", padding: "3px 5px", borderRadius: 999,
                    display: "inline-flex", alignItems: "center", opacity: 0.7,
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = 1}
                  onMouseLeave={e => e.currentTarget.style.opacity = 0.7}>
                  <Icon.Close s={11} />
                </button>
              </span>
            )}
            <span style={{
              fontSize: 12, color: t.textDim, fontFamily: t.fontMono, marginLeft: 4,
            }}>
              · {filtered.length} 篇符合
            </span>
            <span style={{ flex: 1 }} />
            <button onClick={() => { setSearch(""); setFilter(null); }}
              style={{
                background: "transparent", border: 0, color: t.textMuted,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                padding: "4px 8px", borderRadius: 6, fontFamily: t.font,
              }}
              onMouseEnter={e => e.currentTarget.style.color = t.text}
              onMouseLeave={e => e.currentTarget.style.color = t.textMuted}>
              清除全部
            </button>
          </div>
        )}

        {/* Articles */}
        <div style={{ borderTop: `1px solid ${t.border}` }}>
          {filtered.length === 0 ? (
            <div style={{
              padding: "60px 20px", textAlign: "center",
              color: t.textMuted, fontSize: 14,
            }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.5 }}>∅</div>
              <div style={{ fontWeight: 600, marginBottom: 6, color: t.text }}>沒有符合的文章</div>
              <div style={{ fontSize: 12.5, color: t.textDim }}>
                試著調整關鍵字或推噓條件
              </div>
              <button onClick={() => { setSearch(""); setFilter(null); }}
                style={{
                  marginTop: 18, padding: "6px 14px", borderRadius: 8,
                  background: t.surface, border: `1px solid ${t.border}`,
                  color: t.text, fontSize: 12.5, fontWeight: 600,
                  cursor: "pointer", fontFamily: t.font,
                }}>清除全部篩選</button>
            </div>
          ) : filtered.map(a => (
            <ArticleRow key={a.idx} a={a} t={t} density={density} showAuthor={showAuthor} onOpen={onOpen} />
          ))}
        </div>

        {/* Sentinel */}
        <div style={{ padding: "32px 0", textAlign: "center", color: t.textDim, fontSize: 12, fontFamily: t.fontMono }}>
          ↓ 滾動載入更舊文章
        </div>
      </div>
    </div>
  );
}

window.PTTZZZ_BOARD = Board;
