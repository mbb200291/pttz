import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface VoteCount {
  push: number;
  boo: number;
}

export interface VotePairProps {
  value: -1 | 0 | 1;
  count: VoteCount;
  onPush: () => void;
  onBoo: () => void;
  voters?: { push: string[]; boo: string[] };
  myVote?: -1 | 0 | 1;
  size?: "sm" | "lg";
}

// ─── SVG icons ────────────────────────────────────────────────────────────────

function ThumbUp({ s = 12, fill = "none" }: { s?: number; fill?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7" />
      <path d="M7 10H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
      <path d="M7 10c0-3 1-7 4-7l1 0a2 2 0 0 1 2 2v3" />
    </svg>
  );
}

function ThumbDown({ s = 12, fill = "none" }: { s?: number; fill?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H17" />
      <path d="M17 14h3a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-3" />
      <path d="M17 14c0 3-1 7-4 7l-1 0a2 2 0 0 1-2-2v-3" />
    </svg>
  );
}

// ─── VoterPopover ─────────────────────────────────────────────────────────────

const MAX_LIST = 12;
const OVERFLOW_HIDE = 80;

interface VoterPopoverProps {
  anchorRect: DOMRect;
  count: number;
  type: "push" | "boo";
  voters: string[];
}

function MonogramMini({ name }: { name: string }) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return (
    <div style={{
      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
      background: `oklch(0.42 0.10 ${hue})`,
      color: `oklch(0.95 0.04 ${hue})`,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: 7, fontWeight: 700,
    }}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function VoterPopover({ anchorRect, count, type, voters }: VoterPopoverProps) {
  const isPush = type === "push";
  const fg = isPush ? "var(--push-fg)" : "var(--boo-fg)";
  const bg = isPush ? "var(--push-bg)" : "var(--boo-bg)";
  const label = isPush ? "推" : "噓";
  const blowout = isPush ? "推爆" : "噓爆";
  const tooMany = count > OVERFLOW_HIDE;
  const shown = tooMany ? [] : voters.slice(0, MAX_LIST);
  const remaining = count - shown.length;

  const W = 248;
  const margin = 8;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const cx = anchorRect.left + anchorRect.width / 2;
  let left = Math.round(cx - W / 2);
  left = Math.max(margin, Math.min(left, vw - W - margin));
  const estH = tooMany ? 76 : 56 + Math.ceil(shown.length / 2) * 26;
  const fitsAbove = anchorRect.top - estH - 10 > margin;
  const top = fitsAbove
    ? Math.round(anchorRect.top - estH - 10)
    : Math.round(anchorRect.bottom + 10);
  const arrowDir = fitsAbove ? "down" : "up";

  return createPortal(
    <div role="tooltip" style={{
      position: "fixed", top, left, width: W, zIndex: 9999,
      background: "var(--surface)", border: "1px solid var(--border-strong)",
      borderRadius: 12,
      boxShadow: "0 12px 32px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)",
      padding: "10px 12px", pointerEvents: "none",
      animation: `${fitsAbove ? "voter-fade-in" : "voter-fade-in-up"} 120ms ease-out`,
      fontFamily: "var(--font)",
    }}>
      {/* Arrow */}
      <div style={{
        position: "absolute",
        ...(arrowDir === "down" ? { bottom: -6 } : { top: -6 }),
        left: Math.max(12, Math.min(W - 12, cx - left)) - 6,
        width: 12, height: 12,
        background: "var(--surface)",
        borderRight: "1px solid var(--border-strong)",
        borderBottom: "1px solid var(--border-strong)",
        transform: arrowDir === "down" ? "rotate(45deg)" : "rotate(225deg)",
      }} />
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: tooMany ? 4 : 8 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 18, height: 18, borderRadius: 4, background: bg, color: fg,
          fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: 11,
        }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
          {tooMany ? `${blowout} · 共 ${count} 人` : `${count} 人${label}了這個`}
        </span>
      </div>
      {tooMany ? (
        <div style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.5 }}>
          人數過多，不顯示完整名單
        </div>
      ) : count === 0 ? (
        <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>還沒有人{label}</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 10px" }}>
            {shown.map((name) => (
              <div key={name} style={{
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                <MonogramMini name={name} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
              </div>
            ))}
          </div>
          {remaining > 0 && (
            <div style={{
              marginTop: 8, paddingTop: 8,
              borderTop: "1px dashed var(--border)",
              fontSize: 11, color: "var(--text-dim)",
            }}>
              …還有 {remaining} 人{label}
            </div>
          )}
        </>
      )}
    </div>,
    document.body,
  );
}

// ─── VotePair ─────────────────────────────────────────────────────────────────

export function VotePair({
  value,
  count,
  onPush,
  onBoo,
  voters = { push: [], boo: [] },
  myVote = 0,
  size = "sm",
}: VotePairProps) {
  const pushRef = useRef<HTMLButtonElement>(null);
  const booRef = useRef<HTMLButtonElement>(null);
  const [hoverTarget, setHoverTarget] = useState<"push" | "boo" | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openPopover = useCallback((type: "push" | "boo", btn: HTMLButtonElement) => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    showTimer.current = setTimeout(() => {
      setAnchorRect(btn.getBoundingClientRect());
      setHoverTarget(type);
    }, 220);
  }, []);

  const closePopover = useCallback(() => {
    if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null; }
    hideTimer.current = setTimeout(() => { setHoverTarget(null); setAnchorRect(null); }, 80);
  }, []);

  useEffect(() => () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  const isPush = value === 1;
  const isBoo = value === -1;
  const pushDisabled = myVote === 1;
  const booDisabled = myVote === -1;
  const padX = size === "lg" ? 12 : 8;
  const padY = size === "lg" ? 7 : 5;
  const fontSize = size === "lg" ? 13 : 12;
  const iconSize = size === "lg" ? 14 : 12;

  return (
    <div style={{
      display: "inline-flex", padding: 2, gap: 2,
      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9,
    }}>
      <button
        ref={pushRef}
        type="button"
        aria-label="推"
        aria-pressed={isPush}
        // className kept for test assertions: /green/ match
        className={isPush ? "vote-btn push-btn active green" : "vote-btn push-btn"}
        disabled={pushDisabled}
        onClick={onPush}
        onMouseEnter={(e) => {
          if (!isPush && !pushDisabled) e.currentTarget.style.background = "var(--bg-subtle)";
          if (!pushDisabled) openPopover("push", e.currentTarget);
        }}
        onMouseLeave={(e) => {
          if (!isPush) e.currentTarget.style.background = "transparent";
          closePopover();
        }}
        onFocus={(e) => openPopover("push", e.currentTarget)}
        onBlur={closePopover}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: `${padY}px ${padX}px`, borderRadius: 7, border: 0,
          cursor: pushDisabled ? "not-allowed" : "pointer",
          background: isPush ? "var(--push-bg)" : "transparent",
          color: isPush ? "var(--push-fg)" : "var(--text-muted)",
          fontFamily: "var(--font-mono)", fontWeight: 700, fontSize,
          transition: "background 100ms",
          opacity: pushDisabled ? 0.45 : 1,
        }}
      >
        <ThumbUp s={iconSize} fill={isPush ? "currentColor" : "none"} />
        {count.push}
      </button>

      <button
        ref={booRef}
        type="button"
        aria-label="噓"
        aria-pressed={isBoo}
        // className kept for test assertions: /red/ match
        className={isBoo ? "vote-btn boo-btn active red" : "vote-btn boo-btn"}
        disabled={booDisabled}
        onClick={onBoo}
        onMouseEnter={(e) => {
          if (!isBoo && !booDisabled) e.currentTarget.style.background = "var(--bg-subtle)";
          if (!booDisabled) openPopover("boo", e.currentTarget);
        }}
        onMouseLeave={(e) => {
          if (!isBoo) e.currentTarget.style.background = "transparent";
          closePopover();
        }}
        onFocus={(e) => openPopover("boo", e.currentTarget)}
        onBlur={closePopover}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: `${padY}px ${padX}px`, borderRadius: 7, border: 0,
          cursor: booDisabled ? "not-allowed" : "pointer",
          background: isBoo ? "var(--boo-bg)" : "transparent",
          color: isBoo ? "var(--boo-fg)" : "var(--text-muted)",
          fontFamily: "var(--font-mono)", fontWeight: 700, fontSize,
          transition: "background 100ms",
          opacity: booDisabled ? 0.45 : 1,
        }}
      >
        <ThumbDown s={iconSize} fill={isBoo ? "currentColor" : "none"} />
        {count.boo}
      </button>

      {hoverTarget && anchorRect && (
        <VoterPopover
          anchorRect={anchorRect}
          count={hoverTarget === "push" ? count.push : count.boo}
          type={hoverTarget}
          voters={hoverTarget === "push" ? (voters?.push ?? []) : (voters?.boo ?? [])}
        />
      )}
    </div>
  );
}
