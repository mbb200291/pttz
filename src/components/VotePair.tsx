/**
 * VotePair — 推/噓 投票按鈕對
 *
 * 顯示推文數與噓文數，點擊切換投票狀態，hover 顯示投票者名單 popover。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VoteCount {
  push: number;
  boo: number;
}

export interface VotePairProps {
  value: -1 | 0 | 1;
  count: VoteCount;
  onPush: () => void;
  onBoo: () => void;
  voterSeed?: string;
  size?: "sm" | "lg";
}

// ─── Voter name generation (deterministic) ────────────────────────────────────

const VOTER_POOL = [
  "marketWatch",
  "rant_man",
  "devguy",
  "catlover",
  "lurker_99",
  "newsbot",
  "skeptic",
  "foodie",
  "nightOwl",
  "teaLover",
  "codeMaster",
  "politiFan",
  "gossipKing",
  "quietReader",
  "PTTveteran",
  "stockGuru",
  "memeLord",
  "insomniac",
  "bbs_addict",
  "moonWatcher",
  "softwareEngineer",
  "lazyDog",
  "criticalThinker",
  "dailyBrowser",
];

/** Simple string hash (djb2 variant) */
function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0; // keep unsigned 32-bit
  }
  return h;
}

/** LCG pseudo-random number generator returning values in [0, 1) */
function makeLcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(1664525, s) + 1013904223;
    s = s >>> 0;
    return s / 0x100000000;
  };
}

/** Deterministically pick `n` names from VOTER_POOL using the seed string */
function generateVoterNames(seed: string, n: number): string[] {
  if (n <= 0) return [];
  const rng = makeLcg(hashStr(seed));
  const pool = [...VOTER_POOL];
  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  // Repeat pool if we need more names
  const result: string[] = [];
  while (result.length < n) {
    result.push(...pool);
  }
  return result.slice(0, n);
}

// ─── SVG icons ────────────────────────────────────────────────────────────────

function ThumbUpIcon({ fill = false }: { fill?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      strokeWidth={fill ? 0 : 1.5}
      stroke="currentColor"
      fill={fill ? "currentColor" : "none"}
      aria-hidden="true"
    >
      {fill ? (
        <path d="M7.493 18.5c-.425 0-.82-.236-.975-.632A7.48 7.48 0 0 1 6 15.125c0-1.75.599-3.358 1.602-4.634.151-.192.373-.309.6-.397.473-.183.89-.514 1.212-.924a9.042 9.042 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75A.75.75 0 0 1 15 2a2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23h-.777Z" />
      ) : (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.25M14.25 9h2.25M5.25 6.75h.008v.008H5.25V6.75Z"
        />
      )}
    </svg>
  );
}

function ThumbDownIcon({ fill = false }: { fill?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      strokeWidth={fill ? 0 : 1.5}
      stroke="currentColor"
      fill={fill ? "currentColor" : "none"}
      aria-hidden="true"
    >
      {fill ? (
        <path d="M15.73 5.5h1.035A7.465 7.465 0 0 1 18 9.625a7.465 7.465 0 0 1-1.235 4.125h-.148c-.806 0-1.534.446-2.031 1.08a9.04 9.04 0 0 1-2.861 2.4c-.723.384-1.35.956-1.653 1.715a4.499 4.499 0 0 0-.322 1.672v.633A.75.75 0 0 1 9 22a2.25 2.25 0 0 1-2.25-2.25c0-1.152.26-2.243.723-3.218C7.74 16.024 7.367 15.3 6.75 15.3H3.623c-1.026 0-1.945-.694-2.054-1.715A12.137 12.137 0 0 1 1.5 12.25c0-2.848.992-5.464 2.649-7.521C4.537 4.247 5.136 4 5.754 4H9.77a4.5 4.5 0 0 1 1.423.23l3.114 1.04a4.5 4.5 0 0 0 1.423.23Z" />
      ) : (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977a8.96 8.96 0 0 1-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398C20.613 14.547 19.833 15 19 15h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 0 0 .303-.54m.023-8.25H16.48a4.5 4.5 0 0 0-1.423.23l-3.114 1.04a4.5 4.5 0 0 1-1.423.23H6.504c-.618 0-1.217.247-1.605.729A11.95 11.95 0 0 0 2.25 12.25c0 .434.023.863.068 1.285C2.427 14.306 3.346 15 4.372 15h3.126c.618 0 .991.724.725 1.282A7.471 7.471 0 0 0 7.5 19.75 2.25 2.25 0 0 0 9.75 22a.75.75 0 0 0 .75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 0 0 2.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384"
        />
      )}
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
  seed: string;
}

function VoterPopover({ anchorRect, count, type, seed }: VoterPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [above, setAbove] = useState(true);

  useEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    const popH = el.offsetHeight || 200;
    setAbove(anchorRect.top > popH + 12);
  }, [anchorRect]);

  const label = type === "push" ? "推" : "噓";
  const colorClass = type === "push" ? "text-green-300" : "text-red-300";

  let body: React.ReactNode;

  if (count === 0) {
    body = (
      <p className="text-gray-400 text-xs py-1">
        還沒有人{label}
      </p>
    );
  } else if (count > OVERFLOW_HIDE) {
    const overflowLabel = type === "push" ? "推爆" : "噓爆";
    body = (
      <p className={`text-xs py-1 ${colorClass}`}>
        {overflowLabel} · 共 {count} 人，不顯示完整名單
      </p>
    );
  } else {
    const displayCount = Math.min(count, MAX_LIST);
    const names = generateVoterNames(`${seed}:${type}`, displayCount);
    const overflow = count - MAX_LIST;
    body = (
      <>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          {names.map((name, i) => (
            <span key={i} className={`text-xs truncate ${colorClass}`}>
              {name}
            </span>
          ))}
        </div>
        {overflow > 0 && (
          <p className="text-gray-400 text-xs mt-1">…還有 {overflow} 人{label}</p>
        )}
      </>
    );
  }

  const style: React.CSSProperties = above
    ? {
        top: anchorRect.top - 8,
        left: anchorRect.left,
      }
    : {
        top: anchorRect.bottom + 8,
        left: anchorRect.left,
      };

  const positionClass = above ? "-translate-y-full" : "";

  return ReactDOM.createPortal(
    <div
      ref={popoverRef}
      style={style}
      className={`fixed z-[9999] min-w-[160px] max-w-[260px] rounded-xl border border-gray-700 bg-gray-800 shadow-xl px-3 py-2 pointer-events-none ${positionClass}`}
    >
      <p className="text-gray-500 text-xs mb-1 font-medium">{label}文者</p>
      {body}
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
  voterSeed = "x",
  size = "sm",
}: VotePairProps) {
  const [hoverTarget, setHoverTarget] = useState<"push" | "boo" | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const pushRef = useRef<HTMLButtonElement>(null);
  const booRef = useRef<HTMLButtonElement>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(
    (type: "push" | "boo") => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      showTimerRef.current = setTimeout(() => {
        const ref = type === "push" ? pushRef : booRef;
        if (ref.current) {
          setAnchorRect(ref.current.getBoundingClientRect());
        }
        setHoverTarget(type);
      }, 220);
    },
    [],
  );

  const handleMouseLeave = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    hideTimerRef.current = setTimeout(() => {
      setHoverTarget(null);
      setAnchorRect(null);
    }, 80);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const isLg = size === "lg";
  const btnBase = isLg
    ? "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors cursor-pointer"
    : "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer";

  const pushActive = value === 1;
  const booActive = value === -1;

  const pushClass = pushActive
    ? `${btnBase} bg-green-500/15 border-green-500/40 text-green-300`
    : `${btnBase} bg-gray-800 border-gray-700 text-gray-400 hover:bg-green-500/10 hover:border-green-500/30 hover:text-green-300`;

  const booClass = booActive
    ? `${btnBase} bg-red-500/15 border-red-500/40 text-red-300`
    : `${btnBase} bg-gray-800 border-gray-700 text-gray-400 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-300`;

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        ref={pushRef}
        type="button"
        aria-label="推"
        aria-pressed={pushActive}
        className={pushClass}
        onClick={onPush}
        onMouseEnter={() => handleMouseEnter("push")}
        onMouseLeave={handleMouseLeave}
      >
        <ThumbUpIcon fill={pushActive} />
        <span>推</span>
        <span>{count.push}</span>
      </button>

      <button
        ref={booRef}
        type="button"
        aria-label="噓"
        aria-pressed={booActive}
        className={booClass}
        onClick={onBoo}
        onMouseEnter={() => handleMouseEnter("boo")}
        onMouseLeave={handleMouseLeave}
      >
        <ThumbDownIcon fill={booActive} />
        <span>噓</span>
        <span>{count.boo}</span>
      </button>

      {hoverTarget && anchorRect && (
        <VoterPopover
          anchorRect={anchorRect}
          count={hoverTarget === "push" ? count.push : count.boo}
          type={hoverTarget}
          seed={voterSeed}
        />
      )}
    </div>
  );
}
