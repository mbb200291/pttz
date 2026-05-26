// Article reader — body + threaded pushes
// Features: vote (article & push), reply, edit article, edit push w/ history

const { Icon, Chip, Topbar, Btn, ScoreOrb } = window.PTTZZZ_UI;
const { Monogram } = window.PTTZZZ_THEME;
const Composer = window.PTTZZZ_COMPOSER;

function stripReplyPrefix(c) {
  if (!c) return c;
  const pats = [
    /^\s*回\s*\d+\s*樓\s*[:：]?\s*/, /^\s*回\s*\d+\s*[fF]\s*[:：]?\s*/,
    /^\s*TO\s+\d+\s*[fF]\s*[:：]?\s*/i, /^\s*reply\s+to\s+\d+\s*[fF]\s*[:：]?\s*/i,
    /^\s*>>\s*\d+\s*[fF]?\s*[:：]?\s*/, /^\s*->\s*\d+\s*[fF]?\s*[:：]?\s*/,
  ];
  for (const re of pats) if (re.test(c)) return c.replace(re, "");
  return c;
}

function PushBadge({ type, t }) {
  const map = {
    push: { fg: t.pushFg, bg: t.pushBg, label: "推" },
    boo:  { fg: t.booFg,  bg: t.booBg,  label: "噓" },
    neutral: { fg: t.neutralFg, bg: t.neutralBg, label: "→" },
    edit: { fg: t.editFg, bg: t.accentSoft, label: "編" },
  };
  const v = map[type] ?? map.neutral;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 22, height: 22, padding: "0 6px",
      borderRadius: 6, background: v.bg, color: v.fg,
      fontFamily: t.fontMono, fontWeight: 700, fontSize: 11, flexShrink: 0,
    }}>{v.label}</span>
  );
}

function FloorChip({ n, t }) {
  return (<span style={{
    fontFamily: t.fontMono, fontSize: 10.5, color: t.textDim, padding: "2px 6px",
    borderRadius: 5, background: t.surface, border: `1px solid ${t.border}`,
  }}>{n}F</span>);
}

// Deterministic voter pool — names taken from real PTT-style usernames
const VOTER_POOL = [
  "marketWatch", "rant_man", "hater", "catlover", "lurker_99", "newsbot", "devguy",
  "skeptic", "foodie", "ask_me", "filmfan", "studyabroad", "techguru", "dailylife",
  "lifehacker", "randomdev", "breakingnow", "nightowl_88", "earlybird", "metro_fan",
  "taipei101", "softengineer", "frontier_x", "midnight_sun", "kaeru", "zzz_sleeper",
  "nooneknows", "midnightcafe", "lazysunday", "kaohsiung_g", "tainan_eat", "hsinchu_pm",
  "trash_talker", "gold_digger", "blue_sky_22", "redbean_soup", "pttveteran", "freshman24",
  "engineering", "pixelpusher", "starrysky", "cloudwatcher", "mtnclimber", "surfdude",
  "ramen_addict", "boba_lover", "kpop_fan", "jpop_old", "indie_rock", "classical88",
  "morningrun", "yogagirl", "gymbro", "deskjockey", "ramen_again", "tech_recruit",
  "designnerd", "ux_thinker", "pmlife", "founder_22", "vc_eyes", "biotech_lab",
  "med_student", "law_clerk", "civil_serv", "teacher_yu", "parent_3kids", "single_dad",
  "newgrad", "phd_candidate", "postdoc_li", "happy_camper", "weekend_warrior",
];

function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}
// Deterministic shuffled slice from VOTER_POOL given a seed and count
function pickVoters(seed, n) {
  if (n <= 0) return [];
  const pool = [...VOTER_POOL];
  let s = hashStr(seed) || 1;
  // Fisher–Yates with LCG
  for (let i = pool.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  // If we need more than the pool has, recycle with suffixes
  if (n <= pool.length) return pool.slice(0, n);
  const out = pool.slice();
  let suffix = 2;
  while (out.length < n) {
    for (const name of pool) {
      out.push(`${name}${suffix}`);
      if (out.length >= n) break;
    }
    suffix++;
  }
  return out;
}

const VOTER_LIST_CAP = 12;        // show this many names max
const VOTER_LIST_SUPPRESS = 80;   // above this, hide list entirely (推爆 mode)

function VoterPopover({ kind, count, voters, t, anchorRect, scrollKey }) {
  const isPush = kind === "push";
  const fg = isPush ? t.pushFg : t.booFg;
  const bg = isPush ? t.pushBg : t.booBg;
  const label = isPush ? "推" : "噓";
  const blowout = isPush ? "推爆" : "噓爆";
  const tooMany = count > VOTER_LIST_SUPPRESS;
  const shown = tooMany ? [] : voters.slice(0, VOTER_LIST_CAP);
  const remaining = count - shown.length;

  // Position: prefer above anchor, flip below if not enough room.
  const W = 248;
  const margin = 8;
  const vw = window.innerWidth, vh = window.innerHeight;
  const cx = anchorRect.left + anchorRect.width / 2;
  let left = Math.round(cx - W / 2);
  left = Math.max(margin, Math.min(left, vw - W - margin));
  const estH = tooMany ? 76 : 56 + Math.ceil(shown.length / 2) * 26;
  const fitsAbove = anchorRect.top - estH - 10 > margin;
  const top = fitsAbove ? Math.round(anchorRect.top - estH - 10) : Math.round(anchorRect.bottom + 10);
  const arrowDir = fitsAbove ? "down" : "up";

  return ReactDOM.createPortal(
    <div role="tooltip" style={{
      position: "fixed", top, left, width: W, zIndex: 9999,
      background: t.surface, border: `1px solid ${t.borderStrong}`, borderRadius: 12,
      boxShadow: "0 12px 32px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)",
      padding: "10px 12px", pointerEvents: "none",
      animation: "voterFadeIn 120ms ease-out",
    }}>
      <style>{`@keyframes voterFadeIn { from { opacity: 0; transform: translateY(${arrowDir === "down" ? 4 : -4}px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      {/* Arrow */}
      <div style={{
        position: "absolute",
        [arrowDir === "down" ? "bottom" : "top"]: -6,
        left: Math.max(12, Math.min(W - 12, cx - left)) - 6,
        width: 12, height: 12,
        background: t.surface,
        borderRight: `1px solid ${t.borderStrong}`,
        borderBottom: `1px solid ${t.borderStrong}`,
        transform: arrowDir === "down" ? "rotate(45deg)" : "rotate(225deg)",
      }} />
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: tooMany ? 4 : 8 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 18, height: 18, borderRadius: 4, background: bg, color: fg,
          fontFamily: t.fontMono, fontWeight: 800, fontSize: 11,
        }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>
          {tooMany ? `${blowout} · 共 ${count} 人` : `${count} 人${label}了這個`}
        </span>
      </div>
      {tooMany ? (
        <div style={{ fontSize: 11.5, color: t.textDim, lineHeight: 1.5 }}>
          人數過多，不顯示完整名單
        </div>
      ) : count === 0 ? (
        <div style={{ fontSize: 11.5, color: t.textDim }}>還沒有人{label}</div>
      ) : (
        <>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 10px",
          }}>
            {shown.map(name => (
              <div key={name} style={{
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: t.fontMono, fontSize: 11.5, color: t.text,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                <Monogram name={name} size={16} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
              </div>
            ))}
          </div>
          {remaining > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${t.border}`, fontSize: 11, color: t.textDim }}>
              …還有 {remaining} 人{label}
            </div>
          )}
        </>
      )}
    </div>,
    document.body
  );
}

// Thumbs-up / thumbs-down compact group with hover voter list
function VotePair({ value, count, onPush, onBoo, t, size = "sm", voterSeed = "x" }) {
  const isPush = value === 1, isBoo = value === -1;
  const padX = size === "lg" ? 12 : size === "xs" ? 6 : 8;
  const padY = size === "lg" ? 7 : size === "xs" ? 3 : 5;
  const fontSize = size === "lg" ? 13 : size === "xs" ? 11 : 12;
  const iconSize = size === "lg" ? 14 : size === "xs" ? 11 : 12;
  const gap = size === "xs" ? 3 : 5;
  const radius = size === "xs" ? 7 : 9;
  const innerRadius = size === "xs" ? 5 : 7;
  const pushBtnRef = React.useRef(null);
  const booBtnRef = React.useRef(null);
  const [hover, setHover] = React.useState(null); // null | "push" | "boo"
  const [anchorRect, setAnchorRect] = React.useState(null);
  const hoverTimer = React.useRef(null);

  const pushVoters = React.useMemo(
    () => pickVoters(`${voterSeed}|push`, Math.min(count.push, VOTER_LIST_CAP + 1)),
    [voterSeed, count.push]
  );
  const booVoters = React.useMemo(
    () => pickVoters(`${voterSeed}|boo`, Math.min(count.boo, VOTER_LIST_CAP + 1)),
    [voterSeed, count.boo]
  );

  function open(kind, btn) {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      if (btn) setAnchorRect(btn.getBoundingClientRect());
      setHover(kind);
    }, 220);
  }
  function close() {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHover(null), 80);
  }
  React.useEffect(() => () => clearTimeout(hoverTimer.current), []);

  return (
    <div style={{
      display: "inline-flex", padding: 2, gap: 2, position: "relative",
      background: t.surface, border: `1px solid ${t.border}`, borderRadius: radius,
    }}>
      <button ref={pushBtnRef} onClick={onPush}
        onMouseEnter={e => { if (!isPush) e.currentTarget.style.background = t.bgSubtle; open("push", e.currentTarget); }}
        onMouseLeave={e => { if (!isPush) e.currentTarget.style.background = "transparent"; close(); }}
        onFocus={e => open("push", e.currentTarget)}
        onBlur={close}
        title=""
        aria-label={`推 (${count.push} 人)`}
        style={{
          display: "inline-flex", alignItems: "center", gap,
          padding: `${padY}px ${padX}px`, borderRadius: innerRadius, border: 0, cursor: "pointer",
          background: isPush ? t.pushBg : "transparent",
          color: isPush ? t.pushFg : t.textMuted,
          fontFamily: t.fontMono, fontWeight: 700, fontSize,
          transition: "background 100ms",
      }}>
        <ThumbUp s={iconSize} fill={isPush ? "currentColor" : "none"} />
        {count.push}
      </button>
      <button ref={booBtnRef} onClick={onBoo}
        onMouseEnter={e => { if (!isBoo) e.currentTarget.style.background = t.bgSubtle; open("boo", e.currentTarget); }}
        onMouseLeave={e => { if (!isBoo) e.currentTarget.style.background = "transparent"; close(); }}
        onFocus={e => open("boo", e.currentTarget)}
        onBlur={close}
        title=""
        aria-label={`噓 (${count.boo} 人)`}
        style={{
          display: "inline-flex", alignItems: "center", gap,
          padding: `${padY}px ${padX}px`, borderRadius: innerRadius, border: 0, cursor: "pointer",
          background: isBoo ? t.booBg : "transparent",
          color: isBoo ? t.booFg : t.textMuted,
          fontFamily: t.fontMono, fontWeight: 700, fontSize,
          transition: "background 100ms",
      }}>
        <ThumbDown s={iconSize} fill={isBoo ? "currentColor" : "none"} />
        {count.boo}
      </button>
      {hover && anchorRect && (
        <VoterPopover
          kind={hover}
          count={hover === "push" ? count.push : count.boo}
          voters={hover === "push" ? pushVoters : booVoters}
          t={t}
          anchorRect={anchorRect}
        />
      )}
    </div>
  );
}

function ThumbUp({ s = 12, fill = "none" }) {
  return (<svg width={s} height={s} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7"/>
    <path d="M7 10H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/><path d="M7 10c0-3 1-7 4-7l1 0a2 2 0 0 1 2 2v3"/>
  </svg>);
}
function ThumbDown({ s = 12, fill = "none" }) {
  return (<svg width={s} height={s} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H17"/>
    <path d="M17 14h3a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-3"/><path d="M17 14c0 3-1 7-4 7l-1 0a2 2 0 0 1-2-2v-3"/>
  </svg>);
}

// Edit history popover panel for a push
function EditHistoryPanel({ history, t, onClose }) {
  return (
    <div style={{
      marginTop: 8, marginLeft: 32,
      background: t.bgSubtle, border: `1px dashed ${t.accentBorder}`,
      borderRadius: 10, padding: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
          color: t.accentInk,
        }}>編輯歷史 · {history.length} 個版本</span>
        <span style={{ flex: 1 }} />
        <button onClick={onClose} style={{
          background: "transparent", border: 0, color: t.textDim, cursor: "pointer",
          fontSize: 11, padding: 4,
        }}>收起</button>
      </div>
      <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {history.map((h, i) => (
          <li key={i} style={{
            position: "relative", paddingLeft: 18, paddingBottom: 10,
            borderLeft: `1.5px solid ${i === history.length - 1 ? t.accent : t.border}`,
            marginLeft: 4,
          }}>
            <span style={{
              position: "absolute", left: -5, top: 4, width: 8, height: 8, borderRadius: 4,
              background: i === history.length - 1 ? t.accent : t.borderStrong,
            }} />
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
              <span style={{ fontFamily: t.fontMono, fontSize: 11, color: t.textDim }}>{h.time}</span>
              {i === history.length - 1 && <Chip t={t} soft color={{ fg: t.accentInk, bg: t.accentSoft }}>目前版本</Chip>}
              {i === 0 && <Chip t={t} soft color={{ fg: t.textDim, bg: t.surface }}>原始</Chip>}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: t.text, wordBreak: "break-word" }}>
              {h.content}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PushCard({ p, t, depth = 0, kids = [], childMap, layout, dense, onReply, onEdit, onVote, votes, currentUser }) {
  const visualDepth = Math.min(depth, 3);
  const indent = visualDepth * (layout === "messaging" ? 24 : 18);
  const isEdit = p.type === "edit";
  const isOP = p.isOP;
  const padX = dense ? 10 : 12;
  const padY = dense ? 6 : 8;
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const v = votes[p.id] ?? { value: 0, push: 0, boo: 0 };
  const wasEdited = p.history && p.history.length > 1;
  const canEdit = currentUser && p.author === currentUser && p.type !== "edit";

  // Compact action cluster — sits on right column under the timestamp
  const ActionCluster = () => (
    !isEdit && (
      <div style={{
        display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap",
        justifyContent: "flex-end",
      }}>
        <VotePair value={v.value} count={v} voterSeed={p.id}
          onPush={() => onVote(p.id, v.value === 1 ? 0 : 1)}
          onBoo={() => onVote(p.id, v.value === -1 ? 0 : -1)} t={t} size="xs" />
        <button onClick={() => onReply(p)} style={iconBtn(t)} title="回覆" aria-label="回覆">
          <Icon.Reply s={12} />
        </button>
        {canEdit && (
          <button onClick={() => onEdit(p)} style={iconBtn(t)} title="編輯回文" aria-label="編輯">
            <PencilIcon />
          </button>
        )}
        {wasEdited && (
          <button onClick={() => setHistoryOpen(o => !o)} style={iconBtn(t, historyOpen)}
            title={historyOpen ? "收起歷史" : `編輯歷史 (${p.history.length})`}>
            <HistoryIcon />
          </button>
        )}
      </div>
    )
  );

  if (layout === "messaging") {
    return (
      <div style={{ marginLeft: indent, position: "relative" }}>
        {depth > 0 && <div style={{ position: "absolute", left: -12, top: 0, bottom: 0, width: 2, background: t.border, borderRadius: 2 }} />}
        <div style={{ display: "flex", gap: 10, padding: `${padY}px 0`, alignItems: "flex-start" }}>
          <Monogram name={p.author} size={28} />
          <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: t.text }}>{p.author}</span>
                {isOP && <Chip t={t} soft color={{ fg: t.opFg, bg: t.opBg }}>OP</Chip>}
                <PushBadge type={p.type} t={t} />
                {wasEdited && <Chip t={t} soft color={{ fg: t.editFg, bg: t.accentSoft }}>已編輯</Chip>}
                {p.score !== 0 && (
                  <span style={{ fontSize: 11, color: p.score > 0 ? t.pushFg : t.booFg, fontFamily: t.fontMono, fontWeight: 600 }}>
                    {p.score > 0 ? "+" : ""}{p.score}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.5, color: isEdit ? t.editFg : t.text, fontStyle: isEdit ? "italic" : "normal", wordBreak: "break-word" }}>
                {stripReplyPrefix(p.content)}
              </div>
            </div>
            {!isEdit && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                <span style={{ fontFamily: t.fontMono, fontSize: 10.5, color: t.textDim, whiteSpace: "nowrap" }}>
                  {p.time}{p.ip ? ` · ${p.ip}` : ""}
                </span>
                <ActionCluster />
              </div>
            )}
          </div>
        </div>
        {historyOpen && wasEdited && <EditHistoryPanel history={p.history} t={t} onClose={() => setHistoryOpen(false)} />}
        {kids.length > 0 && (
          <div>
            {kids.map(k => (
              <PushCard key={k.id} p={k} t={t} depth={depth + 1}
                kids={childMap.get(k.id) ?? []} childMap={childMap} layout={layout} dense={dense}
                onReply={onReply} onEdit={onEdit} onVote={onVote} votes={votes} currentUser={currentUser} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // threaded (default) — left: author + content, right: time + actions
  return (
    <div style={{ marginLeft: indent, position: "relative" }}>
      {depth > 0 && <div style={{ position: "absolute", left: -10, top: 12, bottom: 6, width: 2, background: t.border, borderRadius: 2 }} />}
      <div style={{
        background: depth === 0 ? t.surface : t.surface2,
        border: `1px solid ${isEdit ? t.accentBorder : t.border}`,
        borderRadius: 10, padding: `${padY}px ${padX}px`, marginBottom: 4,
        display: "flex", gap: 10, alignItems: "flex-start",
      }}>
        {/* Main column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
            <Monogram name={p.author} size={20} />
            <span style={{ fontWeight: 700, fontSize: 12.5, color: t.text }}>{p.author}</span>
            {isOP && <Chip t={t} soft color={{ fg: t.opFg, bg: t.opBg }}>OP</Chip>}
            {isEdit && <Chip t={t} soft color={{ fg: t.editFg, bg: t.accentSoft }}>{p.marker || "作者編輯"}</Chip>}
            {wasEdited && !isEdit && <Chip t={t} soft color={{ fg: t.editFg, bg: t.accentSoft }}>已編輯</Chip>}
            <PushBadge type={p.type} t={t} />
            {!isEdit && p.score !== 0 && (
              <Chip t={t} soft color={{
                fg: p.score > 0 ? t.pushFg : t.booFg,
                bg: p.score > 0 ? t.pushBg : t.booBg,
              }}>{p.score > 0 ? "推" : "噓"} {p.score > 0 ? "+" : ""}{p.score}</Chip>
            )}
            {!isEdit && <FloorChip n={p.floor} t={t} />}
          </div>
          <div style={{
            fontSize: 13.5, lineHeight: 1.5, color: isEdit ? t.editFg : t.text,
            paddingLeft: 26, fontStyle: isEdit ? "italic" : "normal", wordBreak: "break-word",
          }}>
            {stripReplyPrefix(p.content)}
          </div>
        </div>
        {/* Right meta column: time + actions */}
        {!isEdit ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0, paddingTop: 1 }}>
            <span style={{ fontFamily: t.fontMono, fontSize: 10.5, color: t.textDim, whiteSpace: "nowrap" }}>
              {p.time}{p.ip ? ` · ${p.ip}` : ""}
            </span>
            <ActionCluster />
          </div>
        ) : (
          <span style={{ fontFamily: t.fontMono, fontSize: 10.5, color: t.textDim, whiteSpace: "nowrap", flexShrink: 0 }}>
            {p.time}
          </span>
        )}
      </div>
      {historyOpen && wasEdited && <EditHistoryPanel history={p.history} t={t} onClose={() => setHistoryOpen(false)} />}
      {kids.length > 0 && (
        <div style={{ marginLeft: 10, marginBottom: 4 }}>
          {kids.map(k => (
            <PushCard key={k.id} p={k} t={t} depth={depth + 1}
              kids={childMap.get(k.id) ?? []} childMap={childMap} layout={layout} dense={dense}
              onReply={onReply} onEdit={onEdit} onVote={onVote} votes={votes} currentUser={currentUser} />
          ))}
        </div>
      )}
    </div>
  );
}

function ghostBtn(t, active = false) {
  return {
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "5px 9px", borderRadius: 7, border: `1px solid ${active ? t.accentBorder : t.border}`,
    background: active ? t.accentSoft : "transparent",
    color: active ? t.accentInk : t.textMuted,
    fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
    transition: "background 100ms",
  };
}
function iconBtn(t, active = false) {
  return {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 24, height: 24, padding: 0, borderRadius: 6,
    border: `1px solid ${active ? t.accentBorder : t.border}`,
    background: active ? t.accentSoft : t.surface,
    color: active ? t.accentInk : t.textMuted,
    cursor: "pointer", fontFamily: "inherit",
    transition: "background 100ms, color 100ms",
  };
}
function PencilIcon() { return (<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>); }
function HistoryIcon() { return (<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>); }

function ArticleScreen({ t, layout, density, onBack, onEditArticle }) {
  const { ARTICLE, PUSHES, CURRENT_USER } = window.PTTZZZ_DATA;
  const [sortKey, setSortKey] = React.useState("time");
  const [sortDir, setSortDir] = React.useState("asc");
  const [refreshSpin, setRefreshSpin] = React.useState(false);
  const dense = density === "compact";

  // Mutable state: votes, edits, composer
  const [articleVote, setArticleVote] = React.useState({ value: 0, push: ARTICLE.pushTotal, boo: ARTICLE.booTotal });
  const [pushVotes, setPushVotes] = React.useState(() => {
    const m = {};
    PUSHES.forEach(p => {
      m[p.id] = { value: 0, push: Math.max(0, p.score), boo: p.score < 0 ? -p.score : 0 };
    });
    return m;
  });
  const [composer, setComposer] = React.useState(null); // { mode, initial, target }
  const [editedPushes, setEditedPushes] = React.useState({}); // id -> { content, history }

  // Build push list with applied edits + history
  const pushes = React.useMemo(() => {
    return PUSHES.map(p => {
      const e = editedPushes[p.id];
      if (!e) return p;
      return { ...p, content: e.content, history: e.history };
    });
  }, [PUSHES, editedPushes]);

  const childMap = React.useMemo(() => {
    const m = new Map();
    for (const p of pushes) {
      if (p.replyTo) {
        const list = m.get(p.replyTo) ?? [];
        list.push(p); m.set(p.replyTo, list);
      }
    }
    for (const list of m.values()) list.sort((a, b) => a.floor - b.floor);
    return m;
  }, [pushes]);

  const top = React.useMemo(() => pushes.filter(p => p.replyTo === null), [pushes]);
  const sorted = React.useMemo(() => {
    const arr = [...top];
    if (sortKey === "time") arr.sort((a, b) => a.floor - b.floor);
    if (sortKey === "score") arr.sort((a, b) => a.score - b.score);
    if (sortDir === "desc") arr.reverse();
    return arr;
  }, [top, sortKey, sortDir]);

  const pushCount = pushes.filter(p => p.type === "push").length;
  const booCount = pushes.filter(p => p.type === "boo").length;
  const neutralCount = pushes.filter(p => p.type === "neutral").length;
  const score = pushCount - booCount;

  function refresh() { setRefreshSpin(true); setTimeout(() => setRefreshSpin(false), 700); }

  function voteArticle(next) {
    setArticleVote(prev => {
      const delta = next - prev.value;
      let push = prev.push, boo = prev.boo;
      if (prev.value === 1) push--; if (prev.value === -1) boo--;
      if (next === 1) push++; if (next === -1) boo++;
      return { value: next, push, boo };
    });
  }

  function votePush(id, next) {
    setPushVotes(prev => {
      const cur = prev[id] ?? { value: 0, push: 0, boo: 0 };
      let push = cur.push, boo = cur.boo;
      if (cur.value === 1) push--; if (cur.value === -1) boo--;
      if (next === 1) push++; if (next === -1) boo++;
      return { ...prev, [id]: { value: next, push, boo } };
    });
  }

  function openReply(targetPush) {
    setComposer({ mode: "reply", target: targetPush, initial: { body: targetPush ? `回${targetPush.floor}樓：` : "" } });
  }
  function openEditPush(p) {
    setComposer({ mode: "edit-push", target: p, initial: { body: p.content } });
  }
  function openEditArticle() {
    if (onEditArticle) {
      onEditArticle(ARTICLE);
      return;
    }
    setComposer({ mode: "edit-article", initial: { title: ARTICLE.title, category: ARTICLE.category, body: ARTICLE.body } });
  }

  function submitComposer(payload) {
    if (composer.mode === "edit-push" && composer.target) {
      const p = composer.target;
      const prev = editedPushes[p.id];
      const baseHistory = prev?.history ?? [{ time: p.time, content: p.content }];
      const history = [...baseHistory, { time: nowStamp(), content: payload.body }];
      setEditedPushes(s => ({ ...s, [p.id]: { content: payload.body, history } }));
    }
    // For brevity we don't actually mutate ARTICLE / push list for new posts —
    // the prototype demonstrates the flow.
  }

  function nowStamp() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${m}/${day} ${hh}:${mm}`;
  }

  // Render PTT body with link highlight
  const renderBody = () => ARTICLE.body.split("\n").map((line, i) => {
    const urlMatch = line.match(/(https?:\/\/\S+)/);
    const isHeader = /^[0-9]+\..+：$/.test(line.trim());
    return (
      <div key={i} style={{
        fontSize: 15, lineHeight: 1.75, color: t.text,
        fontWeight: isHeader ? 600 : 400,
        minHeight: 4, marginBottom: line.trim() === "" ? 8 : 0,
      }}>
        {urlMatch ? (<>
          {line.split(urlMatch[1])[0]}
          <a href={urlMatch[1]} onClick={e => e.preventDefault()}
            style={{ color: t.accentInk, textDecoration: "underline", textDecorationColor: t.accentBorder, textUnderlineOffset: 3 }}>
            {urlMatch[1]}
          </a>
          {line.split(urlMatch[1])[1]}
        </>) : line}
      </div>
    );
  });

  return (
    <div style={{ minHeight: "100%", color: t.text, fontFamily: t.font }}>
      <Topbar t={t}
        left={<>
          <Btn t={t} variant="minimal" size="sm" onClick={onBack}><Icon.Back s={14} /> 返回</Btn>
          <span style={{ width: 1, height: 18, background: t.border }} />
          <span style={{ fontFamily: t.fontMono, fontSize: 13.5, fontWeight: 600, color: t.textMuted }}>{ARTICLE.board}</span>
          <span style={{ fontFamily: t.fontMono, fontSize: 11.5, color: t.textDim }}>#{ARTICLE.aid}</span>
        </>}
        right={<>
          <Btn t={t} variant="ghost" size="sm" onClick={refresh} title="重新整理推文">
            <span style={{ display: "inline-flex", animation: refreshSpin ? "spin 700ms ease" : "none" }}><Icon.Refresh s={13} /></span>
          </Btn>
          {ARTICLE.author === CURRENT_USER && (
            <Btn t={t} variant="ghost" size="sm" onClick={openEditArticle} title="修改文章">
              <PencilIcon /> 修改
            </Btn>
          )}
          <Btn t={t} variant="ghost" size="sm" title="收藏"><Icon.Bookmark s={13} /></Btn>
          <Btn t={t} variant="solid" size="sm" onClick={() => openReply(null)}>
            <Icon.Compose s={13} /> 回文
          </Btn>
        </>}
      />

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "32px 24px 80px" }}>
        {/* Article header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            {ARTICLE.category && (
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
                color: t.accentInk, padding: "3px 8px", borderRadius: 5, background: t.accentSoft,
              }}>{ARTICLE.category}</span>
            )}
            <span style={{ fontFamily: t.fontMono, fontSize: 11.5, color: t.textDim }}>{ARTICLE.date}</span>
          </div>
          <h1 style={{
            fontSize: 30, fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.025em",
            margin: 0, marginBottom: 18, textWrap: "balance",
          }}>{ARTICLE.title.replace(/^\[.+?\]\s*/, "")}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Monogram name={ARTICLE.author} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>
                {ARTICLE.author}
                <span style={{ fontWeight: 400, color: t.textMuted, marginLeft: 6 }}>({ARTICLE.authorZh})</span>
              </div>
              <div style={{ fontFamily: t.fontMono, fontSize: 11.5, color: t.textDim, marginTop: 2 }}>
                {ARTICLE.ip} · {ARTICLE.idx}
              </div>
            </div>
            <ScoreOrb score={score} t={t} size={56} />
          </div>
        </div>

        <article style={{ marginBottom: 24 }}>{renderBody()}</article>

        {/* Article-level vote */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 0", marginBottom: 16,
        }}>
          <VotePair value={articleVote.value} count={articleVote} voterSeed="article"
            onPush={() => voteArticle(articleVote.value === 1 ? 0 : 1)}
            onBoo={() => voteArticle(articleVote.value === -1 ? 0 : -1)} t={t} size="lg" />
          <Btn t={t} variant="ghost" size="sm" onClick={() => openReply(null)}>
            <Icon.Reply s={13} /> 回覆此文
          </Btn>
          <span style={{ flex: 1 }} />
          {ARTICLE.author === CURRENT_USER && (
            <Btn t={t} variant="minimal" size="sm" onClick={openEditArticle}>
              <PencilIcon /> 修改文章
            </Btn>
          )}
        </div>

        {ARTICLE.edits.length > 0 && (
          <div style={{
            background: t.surface, border: `1px solid ${t.border}`,
            borderRadius: 10, padding: "10px 14px", marginBottom: 32,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.textDim, letterSpacing: "0.06em", marginBottom: 6, textTransform: "uppercase" }}>
              文章編輯紀錄
            </div>
            {ARTICLE.edits.map((e, i) => (
              <div key={i} style={{ fontFamily: t.fontMono, fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
                <span style={{ color: t.editFg, fontWeight: 600 }}>{e.marker}: </span>{e.content}
                {e.note && <div style={{ fontFamily: t.font, color: t.textMuted, marginTop: 2 }}>{e.note}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Stats bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          padding: "16px 0", borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}`,
          marginBottom: 24, flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <PushBadge type="push" t={t} />
            <span style={{ fontWeight: 700, fontSize: 14, color: t.pushFg, fontFamily: t.fontMono }}>{pushCount}</span>
            <span style={{ fontSize: 12, color: t.textDim }}>推</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <PushBadge type="boo" t={t} />
            <span style={{ fontWeight: 700, fontSize: 14, color: t.booFg, fontFamily: t.fontMono }}>{booCount}</span>
            <span style={{ fontSize: 12, color: t.textDim }}>噓</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <PushBadge type="neutral" t={t} />
            <span style={{ fontWeight: 700, fontSize: 14, color: t.textMuted, fontFamily: t.fontMono }}>{neutralCount}</span>
            <span style={{ fontSize: 12, color: t.textDim }}>中立</span>
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: t.textDim, fontFamily: t.fontMono }}>
            {top.length} 第一層 · {pushes.length - top.length} 嵌套
          </span>
        </div>

        {/* Sort */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, marginRight: "auto" }}>討論串</h2>
          <div style={{ display: "inline-flex", padding: 3, background: t.surface, borderRadius: 8, border: `1px solid ${t.border}` }}>
            {[{ k: "time", l: "時間" }, { k: "score", l: "推噓分" }].map(o => (
              <button key={o.k} onClick={() => setSortKey(o.k)}
                style={{
                  padding: "5px 11px", borderRadius: 5, border: 0,
                  background: sortKey === o.k ? t.accentSoft : "transparent",
                  color: sortKey === o.k ? t.accentInk : t.textMuted,
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>{o.l}</button>
            ))}
          </div>
          <Btn t={t} variant="ghost" size="sm" onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}>
            {sortDir === "asc" ? <Icon.ArrowUp s={11} /> : <Icon.ArrowDown s={11} />}
            {sortKey === "time" ? (sortDir === "asc" ? "舊到新" : "新到舊") : (sortDir === "asc" ? "低到高" : "高到低")}
          </Btn>
        </div>

        <div>
          {sorted.map(p => (
            <PushCard key={p.id} p={p} t={t} depth={0}
              kids={childMap.get(p.id) ?? []} childMap={childMap} layout={layout} dense={dense}
              onReply={openReply} onEdit={openEditPush} onVote={votePush} votes={pushVotes} currentUser={CURRENT_USER} />
          ))}
        </div>

        <div style={{ textAlign: "center", padding: "40px 0", fontSize: 12, color: t.textDim, fontFamily: t.fontMono }}>
          沒有更多回文
        </div>
      </div>

      {composer && (
        <Composer t={t} mode={composer.mode} initial={composer.initial}
          onClose={() => setComposer(null)} onSubmit={submitComposer} />
      )}
    </div>
  );
}

window.PTTZZZ_ARTICLE = ArticleScreen;
