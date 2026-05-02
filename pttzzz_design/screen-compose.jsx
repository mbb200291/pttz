// ComposeScreen — full-page article compose / edit
// mode: "post" | "edit-article"
//   - post:         create new article, board picker on top
//   - edit-article: edit existing article, shows revision history, edit-summary required

const { Icon, Btn, Topbar, Chip } = window.PTTZZZ_UI;
const { Monogram } = window.PTTZZZ_THEME;

const CATEGORIES = ["新聞", "討論", "問卦", "心得", "請益", "情報", "閒聊", "問題", "食記", "公告", "閒談", "負雷"];

function ToolbarButton({ t, onClick, title, children }) {
  return (
    <button onClick={onClick} title={title}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 32, height: 32, borderRadius: 7, border: 0,
        background: "transparent", color: t.textMuted, cursor: "pointer",
        transition: "background 100ms",
      }}
      onMouseEnter={e => e.currentTarget.style.background = t.bgSubtle}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      {children}
    </button>
  );
}

function ImageThumb({ src, alt, onRemove, onInsertRef, t }) {
  return (
    <div style={{
      position: "relative", borderRadius: 10, overflow: "hidden",
      border: `1px solid ${t.border}`, background: t.surface2,
      width: 110, height: 110, flexShrink: 0,
    }}>
      <img src={src} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <button onClick={onRemove} title="移除"
        style={{
          position: "absolute", top: 5, right: 5,
          width: 22, height: 22, borderRadius: 11,
          background: "oklch(0 0 0 / 0.7)", color: "white", border: 0,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer",
        }}><Icon.Close s={11} /></button>
      <button onClick={onInsertRef} title="插入引用"
        style={{
          position: "absolute", bottom: 5, left: 5, padding: "3px 7px",
          fontSize: 10, fontWeight: 700, fontFamily: "JetBrains Mono, monospace",
          background: "oklch(0 0 0 / 0.7)", color: "white", border: 0, borderRadius: 5,
          cursor: "pointer",
        }}>插入 {alt}</button>
    </div>
  );
}

function makeMockImage(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue} 80% 60%)"/>
      <stop offset="100%" stop-color="hsl(${(hue + 60) % 360} 80% 50%)"/></linearGradient></defs>
    <rect width="96" height="96" fill="url(#g)"/>
    <circle cx="32" cy="34" r="10" fill="white" fill-opacity="0.9"/>
    <path d="M0 80 L32 56 L56 70 L96 40 L96 96 L0 96 Z" fill="black" fill-opacity="0.18"/>
  </svg>`;
  return "data:image/svg+xml;base64," + btoa(svg);
}

function ComposeScreen({ t, mode, initial, onCancel, onSubmit }) {
  const isEdit = mode === "edit-article";
  const conf = {
    title: isEdit ? "修改文章" : "發新文章",
    submit: isEdit ? "儲存修訂" : "發布文章",
    crumb: isEdit ? "編輯" : "撰寫",
  };

  const { CURRENT_USER } = window.PTTZZZ_DATA;

  const [board, setBoard] = React.useState(initial?.board || "Gossiping");
  const [category, setCategory] = React.useState(initial?.category || "討論");
  const [title, setTitle] = React.useState(initial?.title || "");
  const [body, setBody] = React.useState(initial?.body || "");
  const [editSummary, setEditSummary] = React.useState("");
  const [images, setImages] = React.useState(initial?.images || []);
  const [showPreview, setShowPreview] = React.useState(false);
  const [draftSavedAt, setDraftSavedAt] = React.useState(null);
  const fileRef = React.useRef(null);
  const bodyRef = React.useRef(null);

  // mock revision list for edit mode (only for edit)
  const revisions = isEdit ? (initial?.revisions || [
    { time: "04/28 14:02", who: CURRENT_USER, summary: "原始發布" },
    { time: "04/28 14:18", who: CURRENT_USER, summary: "補充第三段範例" },
    { time: "04/28 16:30", who: CURRENT_USER, summary: "修正錯字" },
  ]) : [];

  const titleSuggestion = title ? `[${category}] ${title}` : `[${category}] —`;
  const charCount = body.length;
  const wordCount = body.trim().length === 0 ? 0 : body.trim().split(/\s+/).length;
  const isValid = title.trim().length > 0 && body.trim().length > 0 && (!isEdit || editSummary.trim().length > 0);

  // Autosave indicator
  React.useEffect(() => {
    if (!body && !title) return;
    const tm = setTimeout(() => setDraftSavedAt(new Date()), 600);
    return () => clearTimeout(tm);
  }, [body, title]);

  function pickImages() { fileRef.current?.click(); }
  function onFiles(files) {
    const arr = Array.from(files || []).slice(0, 8 - images.length);
    const next = arr.map((f, i) => ({
      id: `img-${Date.now()}-${i}`,
      src: makeMockImage(f.name || `image-${i}`),
      alt: `img${images.length + i + 1}`,
      name: f.name || `image-${i}.png`,
    }));
    setImages(prev => [...prev, ...next]);
  }
  function removeImage(id) { setImages(prev => prev.filter(i => i.id !== id)); }

  function insertAtCursor(text) {
    const el = bodyRef.current;
    if (!el) { setBody(b => b + text); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + text + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + text.length;
    });
  }

  function wrapSelection(prefix, suffix = prefix) {
    const el = bodyRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const sel = body.slice(start, end);
    const next = body.slice(0, start) + prefix + sel + suffix + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = start + prefix.length;
      el.selectionEnd = end + prefix.length;
    });
  }

  function submit() {
    if (!isValid) return;
    onSubmit?.({ board, category, title, body, images, editSummary });
  }

  // Keyboard: Cmd/Ctrl+Enter to submit, Esc to cancel
  React.useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); if (isValid) submit(); }
      else if (e.key === "Escape") { e.preventDefault(); onCancel?.(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div style={{ minHeight: "100%", color: t.text, fontFamily: t.font }}>
      <Topbar t={t}
        left={<>
          <Btn t={t} variant="minimal" size="sm" onClick={onCancel}>
            <Icon.Back s={14} /> 取消
          </Btn>
          <span style={{ width: 1, height: 18, background: t.border }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: t.textMuted, letterSpacing: "-0.01em" }}>
            {conf.crumb}
          </span>
          <span style={{ fontFamily: t.fontMono, fontSize: 11.5, color: t.textDim }}>
            · {board}
          </span>
        </>}
        right={<>
          <span style={{ fontFamily: t.fontMono, fontSize: 11.5, color: t.textDim }}>
            {draftSavedAt ? `草稿已存於 ${draftSavedAt.toTimeString().slice(0, 5)}` : "未存草稿"}
          </span>
          <Btn t={t} variant="ghost" size="sm" onClick={() => setShowPreview(p => !p)}>
            <EyeIcon /> {showPreview ? "繼續編輯" : "預覽"}
          </Btn>
          <Btn t={t} variant="solid" size="sm" onClick={submit} disabled={!isValid}>
            <Icon.Compose s={13} /> {conf.submit}
            <span style={{ marginLeft: 4, padding: "1px 6px", borderRadius: 4, fontSize: 10,
              background: "oklch(1 0 0 / 0.18)", fontFamily: t.fontMono }}>⌘↵</span>
          </Btn>
        </>}
      />

      <div style={{
        display: "grid", gridTemplateColumns: "1fr 280px", gap: 32,
        maxWidth: 1180, margin: "0 auto", padding: "32px 24px 80px",
      }}>
        {/* MAIN COLUMN */}
        <div style={{ minWidth: 0 }}>
          {showPreview ? (
            <ComposePreview t={t} title={titleSuggestion} body={body} images={images}
              author={CURRENT_USER} board={board} />
          ) : (
            <>
              {/* Board + category row */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
                <label style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "6px 12px", background: t.surface, border: `1px solid ${t.border}`,
                  borderRadius: 9, fontSize: 13, fontWeight: 600,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: t.textDim, letterSpacing: "0.06em", textTransform: "uppercase" }}>看板</span>
                  <select disabled={isEdit} value={board} onChange={e => setBoard(e.target.value)}
                    style={{
                      background: "transparent", border: 0, color: t.text, fontFamily: "inherit",
                      fontSize: 13, fontWeight: 700, outline: "none", letterSpacing: "-0.01em",
                      cursor: isEdit ? "not-allowed" : "pointer",
                    }}>
                    {window.PTTZZZ_DATA.POPULAR_BOARDS.map(b => (
                      <option key={b.name} value={b.name}>{b.name} · {b.zh}</option>
                    ))}
                  </select>
                </label>
                <span style={{ fontSize: 11, color: t.textDim, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>分類</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {CATEGORIES.map(c => (
                    <button key={c} onClick={() => setCategory(c)}
                      style={{
                        padding: "5px 11px", borderRadius: 7,
                        border: `1px solid ${category === c ? t.accentBorder : t.border}`,
                        background: category === c ? t.accentSoft : "transparent",
                        color: category === c ? t.accentInk : t.textMuted,
                        fontSize: 12, fontWeight: 600, cursor: "pointer", letterSpacing: "-0.01em",
                      }}>[{c}]</button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div style={{ marginBottom: 8 }}>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="輸入文章標題…"
                  maxLength={80}
                  style={{
                    width: "100%", padding: "16px 18px",
                    background: "transparent", border: `1px solid ${t.border}`,
                    borderRadius: 12, color: t.text,
                    fontSize: 24, fontWeight: 700, fontFamily: t.font,
                    letterSpacing: "-0.025em", outline: "none",
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = t.accentBorder}
                  onBlur={e => e.currentTarget.style.borderColor = t.border}
                />
              </div>
              <div style={{ marginBottom: 18, fontFamily: t.fontMono, fontSize: 11.5, color: t.textDim, paddingLeft: 4 }}>
                預覽標題: <span style={{ color: t.accentInk, fontWeight: 700 }}>{titleSuggestion}</span>
              </div>

              {/* Toolbar */}
              <div style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "6px 10px", background: t.surface, border: `1px solid ${t.border}`,
                borderTopLeftRadius: 12, borderTopRightRadius: 12, borderBottom: 0,
              }}>
                <ToolbarButton t={t} title="粗體" onClick={() => wrapSelection("**")}><span style={{ fontWeight: 800, fontSize: 14 }}>B</span></ToolbarButton>
                <ToolbarButton t={t} title="斜體" onClick={() => wrapSelection("_")}><span style={{ fontStyle: "italic", fontSize: 14 }}>I</span></ToolbarButton>
                <ToolbarButton t={t} title="刪除線" onClick={() => wrapSelection("~~")}><span style={{ textDecoration: "line-through", fontSize: 13 }}>S</span></ToolbarButton>
                <span style={{ width: 1, height: 18, background: t.border, margin: "0 4px" }} />
                <ToolbarButton t={t} title="連結" onClick={() => insertAtCursor("https://")}><LinkIcon /></ToolbarButton>
                <ToolbarButton t={t} title="引言" onClick={() => insertAtCursor("\n: ")}><QuoteIcon /></ToolbarButton>
                <ToolbarButton t={t} title="程式碼" onClick={() => wrapSelection("`")}><CodeIcon /></ToolbarButton>
                <ToolbarButton t={t} title="清單" onClick={() => insertAtCursor("\n1. ")}><ListIcon /></ToolbarButton>
                <span style={{ width: 1, height: 18, background: t.border, margin: "0 4px" }} />
                <ToolbarButton t={t} title="插入圖片" onClick={pickImages}><ImgIcon /></ToolbarButton>
                <ToolbarButton t={t} title="表情" onClick={() => insertAtCursor(" :)")}><SmileIcon /></ToolbarButton>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: t.fontMono, fontSize: 11, color: t.textDim, paddingRight: 6 }}>
                  Markdown
                </span>
              </div>

              {/* Body editor */}
              <textarea
                ref={bodyRef}
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder={`寫點什麼…\n\n支援 Markdown · 圖片貼上自動上傳 · ⌘↵ 發布`}
                rows={18}
                style={{
                  display: "block", width: "100%",
                  padding: "18px 20px",
                  background: t.surface, border: `1px solid ${t.border}`, borderTop: 0,
                  borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
                  color: t.text, fontSize: 15, lineHeight: 1.7,
                  fontFamily: t.fontMono, letterSpacing: "-0.005em",
                  outline: "none", resize: "vertical", minHeight: 360,
                }}
                onFocus={e => e.currentTarget.style.borderColor = t.accentBorder}
                onBlur={e => e.currentTarget.style.borderColor = t.border}
              />

              {/* Editor footer stats */}
              <div style={{
                display: "flex", alignItems: "center", gap: 14,
                marginTop: 10, fontFamily: t.fontMono, fontSize: 11.5, color: t.textDim,
              }}>
                <span>{charCount} 字</span>
                <span>{wordCount} 詞</span>
                <span>· 約 {Math.max(1, Math.ceil(charCount / 400))} 分鐘閱讀</span>
                <span style={{ flex: 1 }} />
                {!isValid && (
                  <span style={{ color: t.booFg }}>
                    {!title.trim() ? "需要標題" : !body.trim() ? "需要內容" : isEdit ? "需要修訂說明" : ""}
                  </span>
                )}
              </div>

              {/* Images strip */}
              {images.length > 0 && (
                <div style={{ marginTop: 22 }}>
                  <div style={{ display: "flex", alignItems: "baseline", marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: t.textDim, letterSpacing: "0.06em", textTransform: "uppercase" }}>已上傳圖片</span>
                    <span style={{ fontFamily: t.fontMono, fontSize: 11.5, color: t.textDim, marginLeft: 8 }}>{images.length}/8</span>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {images.map(img => (
                      <ImageThumb key={img.id} src={img.src} alt={img.alt} t={t}
                        onRemove={() => removeImage(img.id)}
                        onInsertRef={() => insertAtCursor(`\n![${img.alt}](${img.alt})\n`)} />
                    ))}
                    {images.length < 8 && (
                      <button onClick={pickImages}
                        style={{
                          width: 110, height: 110, borderRadius: 10,
                          border: `1.5px dashed ${t.border}`, background: "transparent",
                          color: t.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer",
                          display: "inline-flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                        }}>
                        <PlusIcon /> 加入圖片
                      </button>
                    )}
                  </div>
                </div>
              )}

              <input ref={fileRef} type="file" accept="image/*" multiple
                style={{ display: "none" }} onChange={e => onFiles(e.target.files)} />

              {/* Edit summary (edit mode only) */}
              {isEdit && (
                <div style={{
                  marginTop: 28, padding: 16,
                  background: t.accentSoft, border: `1px dashed ${t.accentBorder}`,
                  borderRadius: 12,
                }}>
                  <label style={{
                    display: "block", fontSize: 11, fontWeight: 700, color: t.accentInk,
                    letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8,
                  }}>修訂說明 · 必填</label>
                  <input
                    value={editSummary}
                    onChange={e => setEditSummary(e.target.value)}
                    placeholder="這次修訂改了什麼？(會顯示在文末「※ 編輯」紀錄)"
                    style={{
                      width: "100%", padding: "10px 13px",
                      background: t.bg, border: `1px solid ${t.accentBorder}`,
                      borderRadius: 8, color: t.text, fontSize: 13.5,
                      fontFamily: t.font, outline: "none",
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* SIDEBAR */}
        <aside>
          <SideCard t={t} title={isEdit ? "修訂歷史" : "作者"}>
            {!isEdit && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
                <Monogram name={CURRENT_USER} size={36} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{CURRENT_USER}</div>
                  <div style={{ fontFamily: t.fontMono, fontSize: 11, color: t.textDim }}>已登入</div>
                </div>
              </div>
            )}
            {isEdit && (
              <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {revisions.map((r, i) => {
                  const isLatest = i === revisions.length - 1;
                  return (
                    <li key={i} style={{
                      position: "relative", paddingLeft: 18, paddingBottom: 12,
                      borderLeft: `1.5px solid ${isLatest ? t.accent : t.border}`,
                      marginLeft: 4,
                    }}>
                      <span style={{
                        position: "absolute", left: -5, top: 4, width: 8, height: 8, borderRadius: 4,
                        background: isLatest ? t.accent : t.borderStrong,
                      }} />
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: t.fontMono, fontSize: 11, color: t.textDim }}>{r.time}</span>
                        {isLatest && <Chip t={t} soft color={{ fg: t.accentInk, bg: t.accentSoft }}>最新</Chip>}
                        {i === 0 && <Chip t={t} soft color={{ fg: t.textDim, bg: t.surface }}>原始</Chip>}
                      </div>
                      <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 2 }}>{r.summary}</div>
                    </li>
                  );
                })}
                <li style={{ paddingLeft: 18, marginLeft: 4, position: "relative" }}>
                  <span style={{
                    position: "absolute", left: -7, top: 2, width: 12, height: 12, borderRadius: 6,
                    background: t.accent, boxShadow: `0 0 0 4px ${t.accentSoft}`,
                  }} />
                  <div style={{ fontWeight: 700, fontSize: 12.5, color: t.accentInk }}>進行中…</div>
                  <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>儲存後成為新版本</div>
                </li>
              </ol>
            )}
          </SideCard>

          <SideCard t={t} title="格式提示">
            {[
              { sym: "**B**", desc: "粗體" },
              { sym: "_I_", desc: "斜體" },
              { sym: "`code`", desc: "行內程式" },
              { sym: "> 引言", desc: "區塊引言" },
              { sym: "- item", desc: "項目清單" },
              { sym: "[文字](url)", desc: "超連結" },
              { sym: "![alt](img1)", desc: "插入圖片" },
            ].map(r => (
              <div key={r.sym} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12.5 }}>
                <code style={{ fontFamily: t.fontMono, color: t.text, fontWeight: 600 }}>{r.sym}</code>
                <span style={{ color: t.textMuted }}>{r.desc}</span>
              </div>
            ))}
          </SideCard>

          <SideCard t={t} title="發文須知">
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, lineHeight: 1.7, color: t.textMuted }}>
              <li>請遵守看板規則與板規</li>
              <li>標題請加上正確分類</li>
              <li>圖片轉貼第三方圖床</li>
              <li>{isEdit ? "編輯時間限發文後 30 分鐘內不限次數" : "發文 cooldown：1 分鐘"}</li>
            </ul>
          </SideCard>
        </aside>
      </div>
    </div>
  );
}

function SideCard({ t, title, children }) {
  return (
    <div style={{
      background: t.surface, border: `1px solid ${t.border}`,
      borderRadius: 12, padding: "14px 16px", marginBottom: 14,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: t.textDim,
        letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12,
      }}>{title}</div>
      {children}
    </div>
  );
}

function ComposePreview({ t, title, body, images, author, board }) {
  const lines = body.split("\n");
  const imageMap = Object.fromEntries(images.map(i => [i.alt, i]));
  return (
    <article style={{
      padding: "28px 32px", background: t.surface,
      border: `1px solid ${t.border}`, borderRadius: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontFamily: t.fontMono, fontSize: 11, color: t.textDim }}>預覽 · {board}</span>
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, marginBottom: 16, lineHeight: 1.25, letterSpacing: "-0.025em" }}>
        {title}
      </h1>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, paddingBottom: 18, borderBottom: `1px solid ${t.border}` }}>
        <Monogram name={author} size={32} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{author}</div>
          <div style={{ fontFamily: t.fontMono, fontSize: 11, color: t.textDim }}>剛剛</div>
        </div>
      </div>
      {lines.map((ln, i) => {
        const imgRef = ln.match(/^\!\[([^\]]+)\]\(([^)]+)\)$/);
        if (imgRef && imageMap[imgRef[2]]) {
          return (<img key={i} src={imageMap[imgRef[2]].src} alt={imgRef[1]}
            style={{ display: "block", width: "100%", maxWidth: 480, borderRadius: 10, margin: "12px 0" }} />);
        }
        if (ln.startsWith(": ")) {
          return (<blockquote key={i} style={{
            margin: "8px 0", paddingLeft: 12, borderLeft: `3px solid ${t.accentBorder}`,
            color: t.textMuted, fontStyle: "italic",
          }}>{ln.slice(2)}</blockquote>);
        }
        return (<div key={i} style={{
          fontSize: 15, lineHeight: 1.75, color: t.text,
          minHeight: 4, marginBottom: ln.trim() === "" ? 8 : 0,
        }}>{renderInline(ln, t)}</div>);
      })}
    </article>
  );
}

function renderInline(line, t) {
  // Tiny inline markdown: **bold**, _italic_, `code`, https://...
  const parts = [];
  let rest = line;
  let key = 0;
  const patterns = [
    { re: /\*\*([^*]+)\*\*/, render: (m) => <strong key={key++} style={{ fontWeight: 700 }}>{m[1]}</strong> },
    { re: /_([^_]+)_/, render: (m) => <em key={key++}>{m[1]}</em> },
    { re: /`([^`]+)`/, render: (m) => <code key={key++} style={{ fontFamily: t.fontMono, fontSize: "0.9em", padding: "1px 5px", background: t.bgSubtle, borderRadius: 4 }}>{m[1]}</code> },
    { re: /(https?:\/\/\S+)/, render: (m) => <a key={key++} href={m[1]} onClick={e => e.preventDefault()} style={{ color: t.accentInk, textDecoration: "underline" }}>{m[1]}</a> },
  ];
  while (rest.length) {
    let earliest = null;
    for (const p of patterns) {
      const m = rest.match(p.re);
      if (m && (earliest == null || m.index < earliest.m.index)) earliest = { p, m };
    }
    if (!earliest) { parts.push(rest); break; }
    if (earliest.m.index > 0) parts.push(rest.slice(0, earliest.m.index));
    parts.push(earliest.p.render(earliest.m));
    rest = rest.slice(earliest.m.index + earliest.m[0].length);
  }
  return parts;
}

function EyeIcon() { return (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>); }
function LinkIcon() { return (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>); }
function QuoteIcon() { return (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4"/></svg>); }
function CodeIcon() { return (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>); }
function ListIcon() { return (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>); }
function ImgIcon() { return (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>); }
function SmileIcon() { return (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>); }
function PlusIcon() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>); }

window.PTTZZZ_COMPOSE = ComposeScreen;
