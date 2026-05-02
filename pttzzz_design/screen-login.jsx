// Login screen — PTT-style ID/password with "kick other sessions" toggle

const { Icon, Topbar, Brand, Btn } = window.PTTZZZ_UI;

function Login({ t, onCancel, onSubmit }) {
  const [id, setId] = React.useState("");
  const [pw, setPw] = React.useState("");
  const [kick, setKick] = React.useState(false);
  const [showPw, setShowPw] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);

  const canSubmit = id.trim().length >= 2 && pw.length >= 1 && !submitting;

  function submit(e) {
    e?.preventDefault?.();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setTimeout(() => {
      setSubmitting(false);
      onSubmit?.({ id: id.trim(), kick });
    }, 900);
  }

  const inputBase = {
    width: "100%",
    padding: "11px 12px",
    background: t.bgSubtle,
    border: `1px solid ${t.border}`,
    borderRadius: 10,
    color: t.text,
    fontSize: 14,
    fontFamily: t.fontMono,
    letterSpacing: "-0.005em",
    outline: "none",
  };

  return (
    <div style={{ minHeight: "100%", color: t.text, fontFamily: t.font, position: "relative" }}>
      <Topbar t={t}
        left={<Brand t={t} onClick={onCancel} />}
        right={<Btn t={t} variant="minimal" size="sm" onClick={onCancel}>跳過</Btn>}
      />

      {/* Soft accent backdrop */}
      <div aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: `radial-gradient(60% 50% at 50% 18%, ${t.accentSoft} 0%, transparent 70%)`,
      }} />

      <div style={{
        maxWidth: 460, margin: "0 auto",
        padding: "60px 24px 80px",
        position: "relative",
      }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 56, height: 56, borderRadius: 16,
            background: `linear-gradient(135deg, ${t.accent}, oklch(0.55 0.18 320))`,
            color: t.accentOn, fontWeight: 800, fontSize: 24, letterSpacing: "-0.04em",
            boxShadow: "0 12px 32px -12px oklch(0.55 0.18 320 / 0.45), inset 0 0 0 1px oklch(1 0 0 / 0.14)",
            marginBottom: 18,
          }}>p</div>
          <h1 style={{
            fontSize: 28, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.2,
            margin: 0, marginBottom: 8,
          }}>登入 PTT</h1>
          <p style={{ fontSize: 14, color: t.textMuted, margin: 0, lineHeight: 1.55 }}>
            帳號密碼會直接傳到 <span style={{ fontFamily: t.fontMono, color: t.text }}>ws.ptt.cc</span>，<br/>
            pttzzz 不會儲存或代收。
          </p>
        </div>

        <form onSubmit={submit} style={{
          background: t.surface,
          border: `1px solid ${t.borderStrong}`,
          borderRadius: 16,
          padding: 20,
          boxShadow: `0 1px 0 ${t.border}, 0 24px 64px -32px oklch(0 0 0 / 0.45)`,
        }}>
          {/* ID */}
          <label style={{ display: "block", marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: t.textMuted, marginBottom: 6, letterSpacing: "-0.005em" }}>
              帳號
            </div>
            <input
              autoFocus
              value={id}
              onChange={e => setId(e.target.value.replace(/\s/g, ""))}
              placeholder="ptt_id"
              autoComplete="username"
              style={inputBase}
              onFocus={e => e.currentTarget.style.borderColor = t.accentBorder}
              onBlur={e => e.currentTarget.style.borderColor = t.border}
            />
          </label>

          {/* Password */}
          <label style={{ display: "block", marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: t.textMuted, marginBottom: 6 }}>
              密碼
            </div>
            <div style={{ position: "relative" }}>
              <input
                type={showPw ? "text" : "password"}
                value={pw}
                onChange={e => setPw(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{ ...inputBase, paddingRight: 44 }}
                onFocus={e => e.currentTarget.style.borderColor = t.accentBorder}
                onBlur={e => e.currentTarget.style.borderColor = t.border}
              />
              <button type="button" onClick={() => setShowPw(s => !s)}
                style={{
                  position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                  background: "transparent", border: 0, color: t.textDim,
                  padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11,
                  fontFamily: t.font, fontWeight: 600,
                }}
                title={showPw ? "隱藏密碼" : "顯示密碼"}
              >{showPw ? "隱藏" : "顯示"}</button>
            </div>
          </label>

          {/* Kick other sessions toggle */}
          <button
            type="button"
            onClick={() => setKick(k => !k)}
            style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              width: "100%", textAlign: "left",
              padding: "11px 12px",
              background: kick ? t.accentSoft : t.bgSubtle,
              border: `1px solid ${kick ? t.accentBorder : t.border}`,
              borderRadius: 10, cursor: "pointer",
              marginBottom: 6, color: t.text, fontFamily: t.font,
              transition: "border-color 120ms, background 120ms",
            }}>
            <span style={{
              width: 18, height: 18, borderRadius: 5,
              border: `1.5px solid ${kick ? t.accent : t.borderStrong}`,
              background: kick ? t.accent : "transparent",
              color: t.accentOn,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, marginTop: 1,
              transition: "all 120ms",
            }}>
              {kick && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.01em", marginBottom: 2 }}>
                中斷其他連線
              </div>
              <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.45 }}>
                若 PTT 上有其他登入中的 session，登入時將其踢除。預設關閉。
              </div>
            </span>
          </button>

          {error && (
            <div style={{
              marginTop: 10,
              padding: "9px 12px", borderRadius: 8,
              background: t.booBg, color: t.booFg,
              fontSize: 13, fontWeight: 500,
              border: `1px solid ${t.booFg}33`,
            }}>{error}</div>
          )}

          <Btn t={t} variant="solid" size="lg" onClick={submit} disabled={!canSubmit}
            style={{ width: "100%", justifyContent: "center", marginTop: 14 }}>
            {submitting ? (
              <>
                <span style={{ display: "inline-flex", animation: "spin 700ms linear infinite" }}>
                  <Icon.Refresh s={14} />
                </span>
                連線中…
              </>
            ) : (
              <>
                <Icon.Login s={14} /> 登入
              </>
            )}
          </Btn>

          <button type="button" onClick={onCancel}
            style={{
              width: "100%", marginTop: 8, padding: "9px 12px",
              background: "transparent", border: 0, color: t.textMuted,
              fontSize: 13, fontWeight: 500, cursor: "pointer", borderRadius: 8,
              fontFamily: t.font,
            }}>
            以訪客模式繼續瀏覽
          </button>
        </form>

        {/* Connection state */}
        <div style={{
          marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          fontSize: 11.5, color: t.textDim, fontFamily: t.fontMono,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: "oklch(0.72 0.16 155)" }} />
          wss://ws.ptt.cc/bbs · TLS · Origin: https://term.ptt.cc
        </div>

        <p style={{
          marginTop: 24, padding: "12px 14px",
          background: t.bgSubtle, border: `1px dashed ${t.border}`, borderRadius: 10,
          fontSize: 11.5, color: t.textDim, lineHeight: 1.55, margin: "24px 0 0",
        }}>
          <span style={{ fontWeight: 700, color: t.textMuted }}>注意 · </span>
          這是純前端閱讀器，不會在伺服器端保存你的密碼。
          會在 session 結束後自動登出。若不放心，建議使用 PTT 的子帳號。
        </p>
      </div>
    </div>
  );
}

window.PTTZZZ_LOGIN = Login;
