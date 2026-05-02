// Reusable bits: Topbar, Chip, ScoreCircle, IconStubs, etc.

const { Monogram } = window.PTTZZZ_THEME;

// Tiny icons drawn as inline SVG (no external libs).
const Icon = {
  Search: ({ s = 16 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
  ),
  Back: ({ s = 16 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
  ),
  Filter: ({ s = 14 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M6 12h12M10 18h4"/></svg>
  ),
  Bookmark: ({ s = 14 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
  ),
  Refresh: ({ s = 14 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/></svg>
  ),
  Compose: ({ s = 14 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
  ),
  Sort: ({ s = 14 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h13M3 12h9M3 18h5M17 4v16M17 20l-3-3M17 20l3-3"/></svg>
  ),
  Close: ({ s = 14 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
  ),
  Star: ({ s = 14, fill = "none" }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15 9 22 9.3 17 14 18.5 21 12 17.3 5.5 21 7 14 2 9.3 9 9 12 2"/></svg>
  ),
  ArrowDown: ({ s = 12 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
  ),
  ArrowUp: ({ s = 12 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
  ),
  Reply: ({ s = 13 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 17 4 12l5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
  ),
  Login: ({ s = 14 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/></svg>
  ),
  Dot: ({ s = 4 }) => (
    <svg width={s} height={s} viewBox="0 0 4 4" fill="currentColor"><circle cx="2" cy="2" r="2"/></svg>
  ),
};

function Chip({ children, color, t, soft = false, mono = false, style }) {
  const fg = color?.fg ?? t.textMuted;
  const bg = soft ? (color?.bg ?? t.surface2) : "transparent";
  const border = soft ? "transparent" : t.border;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 7px",
      borderRadius: 999,
      border: `1px solid ${border}`,
      background: bg,
      color: fg,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: mono ? 0 : "0.01em",
      lineHeight: 1.5,
      fontFamily: mono ? t.fontMono : t.font,
      whiteSpace: "nowrap",
      ...style,
    }}>{children}</span>
  );
}

function Topbar({ t, left, right, dense }) {
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 20,
      background: t.bg + "f0",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      borderBottom: `1px solid ${t.border}`,
    }}>
      <div style={{
        maxWidth: 1100, margin: "0 auto",
        padding: dense ? "10px 20px" : "14px 24px",
        display: "flex", alignItems: "center", gap: 16, minHeight: 52,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>{left}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{right}</div>
      </div>
    </div>
  );
}

function Brand({ t, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      background: "transparent", border: 0, cursor: "pointer",
      padding: 0, color: t.text,
    }}>
      <span style={{
        width: 26, height: 26, borderRadius: 7,
        background: `linear-gradient(135deg, ${t.accent}, oklch(0.55 0.18 320))`,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        color: t.accentOn, fontWeight: 800, fontSize: 13, letterSpacing: "-0.04em",
        boxShadow: "inset 0 0 0 1px oklch(1 0 0 / 0.12)",
      }}>p</span>
      <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.025em" }}>pttzzz</span>
    </button>
  );
}

function ScoreOrb({ score, t, size = 56 }) {
  // Score = (push - boo). Visualize with a colored ring + label.
  const isHot = score >= 100;
  const isPos = score > 0;
  const fg = isHot ? "oklch(0.86 0.18 75)" : isPos ? t.pushFg : score < 0 ? t.booFg : t.textMuted;
  const ringBg = isHot ? "oklch(0.86 0.18 75 / 0.18)" : isPos ? t.pushBg : score < 0 ? t.booBg : t.neutralBg;
  const label = isHot ? "爆" : score === 0 ? "0" : `${isPos ? "+" : ""}${score}`;
  return (
    <div style={{
      width: size, height: size,
      borderRadius: size,
      background: ringBg,
      border: `1px solid ${fg}`,
      color: fg,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column",
      fontFamily: t.fontMono,
      fontWeight: 700, fontSize: size * 0.32, letterSpacing: "-0.02em",
      flexShrink: 0,
      lineHeight: 1,
    }}>
      <span>{label}</span>
      <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.7, marginTop: 2, letterSpacing: "0.05em" }}>SCORE</span>
    </div>
  );
}

function Btn({ children, onClick, t, variant = "ghost", size = "md", style, disabled, title }) {
  const sizeStyles = {
    sm: { padding: "5px 10px", fontSize: 12, gap: 5 },
    md: { padding: "7px 13px", fontSize: 13, gap: 6 },
    lg: { padding: "10px 18px", fontSize: 14, gap: 7 },
  }[size];
  const variants = {
    ghost: { background: "transparent", color: t.text, border: `1px solid ${t.border}` },
    solid: { background: t.accent, color: t.accentOn, border: `1px solid ${t.accent}` },
    soft:  { background: t.surface, color: t.text, border: `1px solid ${t.border}` },
    minimal: { background: "transparent", color: t.textMuted, border: "1px solid transparent" },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: "inline-flex", alignItems: "center",
        ...sizeStyles, ...variants[variant],
        borderRadius: 8,
        fontWeight: 600,
        letterSpacing: "-0.01em",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "background 120ms, border-color 120ms, color 120ms",
        fontFamily: t.font,
        ...style,
      }}
      onMouseEnter={e => {
        if (disabled) return;
        if (variant === "ghost" || variant === "soft" || variant === "minimal") {
          e.currentTarget.style.background = t.surface2;
        }
      }}
      onMouseLeave={e => {
        if (disabled) return;
        if (variant === "ghost" || variant === "minimal") e.currentTarget.style.background = "transparent";
        if (variant === "soft") e.currentTarget.style.background = t.surface;
      }}
    >{children}</button>
  );
}

window.PTTZZZ_UI = { Icon, Chip, Topbar, Brand, ScoreOrb, Btn };
