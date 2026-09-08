export function ScoreOrb({ score, size = 56 }: { score: number; size?: number }) {
  const isHot = score >= 100;
  const isPos = score > 0;
  const fg = isHot
    ? "oklch(0.86 0.18 75)"
    : isPos
      ? "var(--push-fg)"
      : score < 0
        ? "var(--boo-fg)"
        : "var(--text-dim)";
  const ringBg = isHot
    ? "oklch(0.86 0.18 75 / 0.18)"
    : isPos
      ? "var(--push-bg)"
      : score < 0
        ? "var(--boo-bg)"
        : "var(--neutral-bg)";
  const label = isHot ? "爆" : score === 0 ? "0" : `${isPos ? "+" : ""}${score}`;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size,
        background: ringBg,
        border: `1px solid ${fg}`,
        color: fg,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        fontFamily: "var(--font-mono)",
        fontWeight: 700,
        fontSize: Math.round(size * 0.32),
        letterSpacing: "-0.02em",
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      <span>{label}</span>
      <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.7, marginTop: 2, letterSpacing: "0.05em" }}>
        SCORE
      </span>
    </div>
  );
}
