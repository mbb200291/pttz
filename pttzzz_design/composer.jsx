// Composer — used for: new article, reply to article, edit article, edit push.
// Supports image insertion via paste/upload (placeholder thumbnails).

const { Icon, Btn } = window.PTTZZZ_UI;

function ImageThumb({ src, alt, onRemove, t }) {
  return (
    <div style={{
      position: "relative", display: "inline-block",
      borderRadius: 10, overflow: "hidden",
      border: `1px solid ${t.border}`, background: t.surface2,
      width: 96, height: 96, flexShrink: 0,
    }}>
      <img src={src} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <button onClick={onRemove} title="移除"
        style={{
          position: "absolute", top: 4, right: 4,
          width: 22, height: 22, borderRadius: 11,
          background: "oklch(0 0 0 / 0.7)", color: "white", border: 0,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer",
        }}><Icon.Close s={11} /></button>
    </div>
  );
}

function Composer({ t, mode, initial, onClose, onSubmit }) {
  // mode: "post" | "reply" | "edit-article" | "edit-push"
  const titles = {
    "post":         { title: "發新文章", submit: "發布", showTitle: true,  showCategory: true  },
    "reply":        { title: "回覆推文", submit: "送出回覆", showTitle: false, showCategory: false },
    "edit-article": { title: "修改文章", submit: "儲存修訂", showTitle: true,  showCategory: true  },
    "edit-push":    { title: "編輯回文", submit: "儲存", showTitle: false, showCategory: false },
  };
  const conf = titles[mode] ?? titles.post;
  const [title, setTitle] = React.useState(initial?.title || "");
  const [category, setCategory] = React.useState(initial?.category || "討論");
  const [body, setBody] = React.useState(initial?.body || "");
  const [pushType, setPushType] = React.useState(initial?.pushType || "push"); // push | boo | neutral
  const [images, setImages] = React.useState(initial?.images || []);
  const fileRef = React.useRef(null);

  const isReply = mode === "reply" || mode === "edit-push";
  const isEdit  = mode === "edit-article" || mode === "edit-push";
  const maxLen = isReply ? 80 : 4000;
  const remain = maxLen - body.length;

  function pickImages() { fileRef.current?.click(); }

  function onFiles(files) {
    const arr = Array.from(files || []).slice(0, 6 - images.length);
    const next = arr.map((f, i) => ({
      id: `img-${Date.now()}-${i}`,
      // create a dummy mock URL using a data-uri SVG so we don't need real bytes
      src: makeMockImage(f.name || `image-${i}`),
      alt: f.name || "圖片",
    }));
    setImages(prev => [...prev, ...next]);
  }

  function makeMockImage(seed) {
    // colorful mock thumbnail derived from name
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    const hue = Math.abs(h) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="hsl(${hue} 80% 60%)"/>
        <stop offset="100%" stop-color="hsl(${(hue+60)%360} 80% 50%)"/></linearGradient></defs>
      <rect width="96" height="96" fill="url(#g)"/>
      <circle cx="32" cy="34" r="10" fill="white" fill-opacity="0.9"/>
      <path d="M0 80 L32 56 L56 70 L96 40 L96 96 L0 96 Z" fill="black" fill-opacity="0.18"/>
    </svg>`;
    return "data:image/svg+xml;base64," + btoa(svg);
  }

  function removeImage(id) {
    setImages(prev => prev.filter(i => i.id !== id));
  }

  function submit() {
    onSubmit?.({ title, category, body, pushType, images });
    onClose?.();
  }

  return (
    <div role="dialog" aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "oklch(0 0 0 / 0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div style={{
        width: "100%", maxWidth: isReply ? 540 : 720,
        background: t.bg, color: t.text, fontFamily: t.font,
        border: `1px solid ${t.borderStrong}`, borderRadius: 16,
        boxShadow: "0 32px 80px -24px oklch(0 0 0 / 0.55)",
        display: "flex", flexDirection: "column",
        maxHeight: "calc(100vh - 40px)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${t.border}` }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, letterSpacing: "-0.015em" }}>
            {conf.title}
            {isEdit && (
              <span style={{
                marginLeft: 8, padding: "2px 7px", borderRadius: 5,
                fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em",
                color: t.editFg, background: t.accentSoft,
              }}>EDIT</span>
            )}
          </h2>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{
            background: "transparent", border: 0, color: t.textMuted, cursor: "pointer",
            padding: 6, borderRadius: 6,
          }}><Icon.Close s={14} /></button>
        </div>

        {/* Body (scrollable) */}
        <div style={{ padding: 18, overflowY: "auto", flex: 1 }}>
          {conf.showCategory && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              {["新聞", "討論", "問卦", "心得", "請益", "情報", "閒聊"].map(c => (
                <button key={c} onClick={() => setCategory(c)}
                  style={{
                    padding: "5px 11px", borderRadius: 7, border: `1px solid ${category === c ? t.accentBorder : t.border}`,
                    background: category === c ? t.accentSoft : t.surface,
                    color: category === c ? t.accentInk : t.textMuted,
                    fontSize: 12, fontWeight: 600, cursor: "pointer", letterSpacing: "-0.01em",
                  }}>[{c}]</button>
              ))}
            </div>
          )}

          {conf.showTitle && (
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="標題"
              style={{
                width: "100%", padding: "12px 14px",
                background: t.surface, border: `1px solid ${t.border}`,
                borderRadius: 10, color: t.text, fontSize: 15, fontWeight: 600,
                marginBottom: 12, fontFamily: t.font, outline: "none",
                letterSpacing: "-0.015em",
              }}
              onFocus={e => e.currentTarget.style.borderColor = t.accentBorder}
              onBlur={e => e.currentTarget.style.borderColor = t.border}
            />
          )}

          {/* Push type selector for reply */}
          {mode === "reply" && (
            <div style={{ display: "inline-flex", padding: 3, background: t.surface, borderRadius: 10, border: `1px solid ${t.border}`, marginBottom: 12 }}>
              {[
                { v: "push",    label: "推", fg: t.pushFg, bg: t.pushBg },
                { v: "neutral", label: "→",  fg: t.neutralFg, bg: t.neutralBg },
                { v: "boo",     label: "噓", fg: t.booFg, bg: t.booBg },
              ].map(o => (
                <button key={o.v} onClick={() => setPushType(o.v)}
                  style={{
                    padding: "5px 14px", borderRadius: 7, border: 0,
                    background: pushType === o.v ? o.bg : "transparent",
                    color: pushType === o.v ? o.fg : t.textMuted,
                    fontFamily: t.fontMono, fontWeight: 700, fontSize: 13,
                    cursor: "pointer",
                  }}>{o.label}</button>
              ))}
            </div>
          )}

          {/* Body textarea */}
          <textarea
            value={body}
            onChange={e => setBody(e.target.value.slice(0, maxLen))}
            placeholder={isReply ? "留個推文…  支援 回x樓 / >>xf 引用語法" : "寫點什麼…"}
            rows={isReply ? 3 : 12}
            style={{
              width: "100%", padding: "12px 14px",
              background: t.surface, border: `1px solid ${t.border}`,
              borderRadius: 10, color: t.text,
              fontSize: isReply ? 14 : 14.5, lineHeight: 1.65,
              fontFamily: isReply ? t.font : t.fontMono,
              outline: "none", resize: "vertical", minHeight: isReply ? 70 : 240,
              letterSpacing: "-0.005em",
            }}
            onFocus={e => e.currentTarget.style.borderColor = t.accentBorder}
            onBlur={e => e.currentTarget.style.borderColor = t.border}
          />

          {/* Image previews */}
          {images.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {images.map(img => (
                <ImageThumb key={img.id} src={img.src} alt={img.alt} t={t}
                  onRemove={() => removeImage(img.id)} />
              ))}
            </div>
          )}

          {/* Edit summary (for edits) */}
          {isEdit && (
            <div style={{
              marginTop: 14, padding: "10px 12px",
              background: t.accentSoft, border: `1px dashed ${t.accentBorder}`,
              borderRadius: 8, fontSize: 12, color: t.accentInk, lineHeight: 1.5,
            }}>
              <span style={{ fontWeight: 700 }}>提示 · </span>
              {mode === "edit-article"
                ? "儲存後將在文末插入「※ 編輯」紀錄。原文修訂歷史會保留。"
                : "儲存後此回文將標示為已編輯，原版本會保留在編輯歷史。"}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 18px", borderTop: `1px solid ${t.border}`,
        }}>
          <input ref={fileRef} type="file" accept="image/*" multiple
            style={{ display: "none" }} onChange={e => onFiles(e.target.files)} />
          <Btn t={t} variant="ghost" size="sm" onClick={pickImages}
            disabled={images.length >= 6}
            title={images.length >= 6 ? "最多 6 張" : "插入圖片"}>
            <ImgIcon /> 插入圖片  {images.length > 0 && <span style={{ color: t.textDim }}>{images.length}/6</span>}
          </Btn>
          {isReply && (
            <span style={{ fontSize: 11.5, color: t.textDim, fontFamily: t.fontMono }}>
              支援 ||  強制合併
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span style={{
            fontFamily: t.fontMono, fontSize: 11.5,
            color: remain < 20 ? t.booFg : t.textDim,
          }}>{remain}</span>
          <Btn t={t} variant="ghost" size="sm" onClick={onClose}>取消</Btn>
          <Btn t={t} variant="solid" size="sm" onClick={submit}
            disabled={body.trim().length === 0 || (conf.showTitle && title.trim().length === 0)}>
            {conf.submit}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function ImgIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  );
}

window.PTTZZZ_COMPOSER = Composer;
