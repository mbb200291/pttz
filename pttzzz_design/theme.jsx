// Theme tokens + helpers shared across all screens.
// All colors in oklch — easy to swap accent / theme.

const ACCENTS = {
  indigo:  { h: 270, c: 0.16, name: "靛紫 Indigo" },
  amber:   { h:  70, c: 0.16, name: "琥珀 Amber"  },
  emerald: { h: 155, c: 0.14, name: "翠綠 Emerald"},
  rose:    { h:  10, c: 0.17, name: "玫瑰 Rose"   },
  cyan:    { h: 220, c: 0.14, name: "青藍 Cyan"   },
};

function buildTheme({ mode, accentKey, density }) {
  const a = ACCENTS[accentKey] ?? ACCENTS.indigo;
  const dark = mode === "dark";

  const t = dark ? {
    bg:        "oklch(0.165 0.006 260)",
    bgSubtle:  "oklch(0.195 0.006 260)",
    surface:   "oklch(0.215 0.006 260)",
    surface2:  "oklch(0.245 0.006 260)",
    border:    "oklch(1 0 0 / 0.08)",
    borderStrong:"oklch(1 0 0 / 0.14)",
    text:      "oklch(0.97 0.005 260)",
    textMuted: "oklch(0.72 0.008 260)",
    textDim:   "oklch(0.55 0.008 260)",
    pushFg:    "oklch(0.82 0.14 155)",
    pushBg:    "oklch(0.82 0.14 155 / 0.10)",
    booFg:     "oklch(0.78 0.16 25)",
    booBg:     "oklch(0.78 0.16 25 / 0.10)",
    neutralFg: "oklch(0.78 0.02 260)",
    neutralBg: "oklch(0.78 0.02 260 / 0.08)",
    opFg:      "oklch(0.86 0.14 90)",
    opBg:      "oklch(0.86 0.14 90 / 0.12)",
    editFg:    "oklch(0.86 0.14 90)",
  } : {
    bg:        "oklch(0.985 0.003 80)",
    bgSubtle:  "oklch(0.965 0.003 80)",
    surface:   "oklch(1 0 0)",
    surface2:  "oklch(0.98 0.003 80)",
    border:    "oklch(0 0 0 / 0.08)",
    borderStrong:"oklch(0 0 0 / 0.14)",
    text:      "oklch(0.20 0.01 260)",
    textMuted: "oklch(0.42 0.01 260)",
    textDim:   "oklch(0.58 0.01 260)",
    pushFg:    "oklch(0.45 0.14 155)",
    pushBg:    "oklch(0.45 0.14 155 / 0.08)",
    booFg:     "oklch(0.50 0.18 25)",
    booBg:     "oklch(0.50 0.18 25 / 0.08)",
    neutralFg: "oklch(0.42 0.01 260)",
    neutralBg: "oklch(0.42 0.01 260 / 0.06)",
    opFg:      "oklch(0.45 0.14 70)",
    opBg:      "oklch(0.45 0.14 70 / 0.10)",
    editFg:    "oklch(0.45 0.14 70)",
  };

  t.accent     = `oklch(0.68 ${a.c} ${a.h})`;
  t.accentSoft = `oklch(0.68 ${a.c} ${a.h} / 0.14)`;
  t.accentBorder = `oklch(0.68 ${a.c} ${a.h} / 0.32)`;
  t.accentInk  = dark ? `oklch(0.92 ${a.c * 0.6} ${a.h})` : `oklch(0.45 ${a.c} ${a.h})`;
  t.accentOn   = dark ? "oklch(0.12 0.005 260)" : "oklch(1 0 0)";

  // Spacing scale
  const dens = density === "compact" ? 0.85 : density === "roomy" ? 1.15 : 1;
  t.dens = dens;
  t.s1 = `${4 * dens}px`;
  t.s2 = `${8 * dens}px`;
  t.s3 = `${12 * dens}px`;
  t.s4 = `${16 * dens}px`;
  t.s5 = `${24 * dens}px`;
  t.s6 = `${32 * dens}px`;
  t.rowPadY = `${10 * dens}px`;
  t.rowPadX = `${16 * dens}px`;
  t.cardRadius = "14px";
  t.font = `"Inter", "Noto Sans TC", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
  t.fontMono = `"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace`;

  return t;
}

// Deterministic monogram color from username
function monogramColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return { hue, bg: `oklch(0.42 0.10 ${hue})`, fg: `oklch(0.95 0.04 ${hue})` };
}

function Monogram({ name, size = 28 }) {
  const c = monogramColor(name || "?");
  const initials = (name || "?").slice(0, 2).toUpperCase();
  return (
    <div
      style={{
        width: size, height: size, borderRadius: size * 0.32,
        background: c.bg, color: c.fg,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.round(size * 0.42), fontWeight: 700, letterSpacing: "-0.02em",
        flexShrink: 0,
        boxShadow: "inset 0 0 0 1px oklch(1 0 0 / 0.06)",
      }}
    >{initials}</div>
  );
}

// Compute push count style for the badge in the article list
function pushCountStyle(count, t) {
  if (count === "爆") return { fg: "oklch(0.95 0.18 75)", bg: "oklch(0.95 0.18 75 / 0.12)", label: "爆" };
  if (count === "M ") return { fg: t.accentInk, bg: t.accentSoft, label: "M" };
  if (count === "—")  return { fg: t.textDim,   bg: "transparent",     label: "—" };
  if (count.startsWith("X")) return { fg: t.booFg, bg: t.booBg, label: count };
  const n = parseInt(count, 10);
  if (Number.isNaN(n))    return { fg: t.textDim, bg: "transparent", label: count };
  if (n >= 100)           return { fg: "oklch(0.95 0.18 75)",  bg: "oklch(0.95 0.18 75 / 0.10)",  label: count };
  if (n >= 50)            return { fg: "oklch(0.85 0.16 60)",  bg: "oklch(0.85 0.16 60 / 0.10)",  label: count };
  if (n >= 10)            return { fg: t.pushFg,                bg: t.pushBg,                       label: count };
  return                         { fg: t.textMuted,             bg: "transparent",                  label: count };
}

window.PTTZZZ_THEME = { buildTheme, ACCENTS, Monogram, monogramColor, pushCountStyle };
