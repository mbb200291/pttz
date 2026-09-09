/**
 * LoginModal
 *
 * 當 PTT session 偵測到登入提示（pttState === 'need_login'）時自動出現。
 * 使用者輸入帳號密碼後，呼叫 submitLogin() 送出。
 */

import { useState } from "react";
import type { CSSProperties } from "react";
import {
  submitDuplicateLoginDecision,
  submitLogin,
  usePttSocketStore,
  type PttState,
} from "../hooks/usePttSocket";

interface Props {
  pttState: PttState;
  wsStatus: string;
}

export function LoginModal({ pttState, wsStatus }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const setPttState = usePttSocketStore((s) => s.setPttState);
  const loginError = usePttSocketStore((s) => s.loginError);
  const setLoginError = usePttSocketStore((s) => s.setLoginError);

  const isOpen = pttState === "need_login";
  const isLoggingIn = pttState === "logging_in" || pttState === "waiting_auth";
  const isDuplicateLogin = pttState === "duplicate_login";
  const isGuestOverload = pttState === "guest_overload";
  const isSyncingUsers = pttState === "syncing_users";
  const isLoginRateLimited = pttState === "login_rate_limited";
  const isClosed = pttState === "closed";

  if (
    !isOpen &&
    !isLoggingIn &&
    !isDuplicateLogin &&
    !isGuestOverload &&
    !isSyncingUsers &&
    !isLoginRateLimited &&
    !isClosed
  )
    return null;

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setLoginError(null);
    submitLogin(username.trim(), password);
  };

  const handleGuest = () => {
    setLoginError(null);
    submitLogin("guest", "");
  };

  const inputStyle: CSSProperties = {
    width: "100%",
    padding: "11px 12px",
    background: "var(--bg-subtle)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    color: "var(--text)",
    fontSize: 14,
    fontFamily: "var(--font-mono)",
    outline: "none",
    boxSizing: "border-box",
  };

  const primaryButtonStyle: CSSProperties = {
    border: "1px solid var(--accent)",
    background: "var(--accent)",
    color: "var(--accent-on)",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 700,
    fontFamily: "var(--font)",
    cursor: "pointer",
  };

  const secondaryButtonStyle: CSSProperties = {
    border: "1px solid var(--border)",
    background: "var(--bg-subtle)",
    color: "var(--text-muted)",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "var(--font)",
    cursor: "pointer",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: "oklch(0 0 0 / 0.62)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        padding: 20,
        fontFamily: "var(--font)",
      }}
    >
      <div
        className="w-full max-w-sm"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: 16,
          boxShadow: "0 24px 64px -32px oklch(0 0 0 / 0.55)",
          padding: 24,
          color: "var(--text)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 46,
              height: 46,
              borderRadius: 14,
              background:
                "linear-gradient(135deg, var(--accent), oklch(0.55 0.18 320))",
              color: "var(--accent-on)",
              fontWeight: 800,
              fontSize: 20,
              letterSpacing: "-0.04em",
              marginBottom: 14,
            }}
          >
            p
          </div>
          <h2
            style={{
              color: "var(--text)",
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.025em",
              margin: "0 0 6px",
            }}
          >
            登入 PTT
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            帳號密碼會直接傳到 ws.ptt.cc
          </p>
        </div>
        <p
          className="mb-6"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontFamily: "var(--font-mono)",
            fontSize: 11.5,
            color: "var(--text-dim)",
          }}
        >
          {isClosed || wsStatus === "closed" || wsStatus === "error" ? (
            <span style={{ color: "var(--boo-fg)" }}>● 連線已中斷</span>
          ) : wsStatus === "connected" ? (
            <span style={{ color: "var(--push-fg)" }}>● 已連線</span>
          ) : (
            <span style={{ color: "oklch(0.86 0.16 75)" }}>● 連線中…</span>
          )}
        </p>

        {isGuestOverload ? (
          <div className="space-y-3">
            <div className="text-sm text-amber-300 leading-relaxed">
              抱歉，目前 guest 在站人數過多，暫時無法用訪客登入。
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleGuest}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium transition-colors"
                style={primaryButtonStyle}
              >
                重試訪客登入
              </button>
              <button
                type="button"
                onClick={() => setPttState("need_login")}
                className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-200 transition-colors"
                style={secondaryButtonStyle}
              >
                改用帳號登入
              </button>
            </div>
          </div>
        ) : isClosed ? (
          <div className="space-y-3">
            <p role="alert" style={{ color: "var(--text-muted)" }}>
              連線已中斷。{loginError ?? "請稍後重新整理再試。若剛才選擇保留其他登入連線，可能已達同帳號連線上限，也可能是網路中斷；目前無法確認原因。可先自行關閉不用的連線，不必直接踢除所有連線。"}
            </p>
            <button type="button" style={primaryButtonStyle} className="w-full py-2.5" onClick={() => window.location.reload()}>重新整理</button>
          </div>
        ) : isDuplicateLogin ? (
          <div className="space-y-3">
            <div className="text-sm text-gray-300 leading-relaxed">
              偵測到此帳號已有其他連線，是否要踢掉其他重複登入？
              <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>保留連線時，若已達 PTT 同帳號連線上限，本次登入可能會被中斷。可先自行關閉不用的連線；選擇踢除也不保證所有其他連線都會離線。</p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => submitDuplicateLoginDecision(true)}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition-colors"
                style={{
                  ...primaryButtonStyle,
                  background: "var(--boo-fg)",
                  borderColor: "var(--boo-fg)",
                }}
              >
                踢掉其他連線（是）
              </button>
              <button
                type="button"
                onClick={() => submitDuplicateLoginDecision(false)}
                className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-200 transition-colors"
                style={secondaryButtonStyle}
              >
                保留其他連線（否）
              </button>
            </div>
          </div>
        ) : isSyncingUsers ? (
          <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
            <div className="text-center text-2xl">⏳</div>
            <div>正在更新與同步線上使用者及好友名單，系統負荷量大時會需時較久。</div>
            <div className="text-xs text-gray-500">
              若長時間沒有進度，可改用重新登入再試一次。
            </div>
            <button
              type="button"
              onClick={() => setPttState("need_login")}
              className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-200 transition-colors"
              style={secondaryButtonStyle}
            >
              重新登入
            </button>
          </div>
        ) : isLoginRateLimited ? (
          <div className="space-y-3">
            <div className="text-sm text-amber-300 leading-relaxed">
              登入太頻繁，為避免系統負荷過重，請稍後再試。
            </div>
            <button
              type="button"
              onClick={() => setPttState("need_login")}
              className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-200 transition-colors"
              style={secondaryButtonStyle}
            >
              返回登入
            </button>
          </div>
        ) : isLoggingIn ? (
          <div className="text-center py-3 text-gray-400 text-sm">
            <div className="text-2xl mb-3 animate-pulse">🔐</div>
            <div className="mb-3">驗證中，請稍候…</div>
            <div className="flex flex-wrap justify-center gap-2">
              <button
              type="button"
              onClick={() => setPttState("need_login")}
              className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs text-gray-300"
              style={secondaryButtonStyle}
            >
              重新登入
            </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            {loginError && (
              <div
                className="rounded-lg px-4 py-2.5 text-sm"
                style={{
                  border: "1px solid oklch(0.86 0.16 75 / 0.45)",
                  background: "oklch(0.86 0.16 75 / 0.10)",
                  color: "oklch(0.86 0.16 75)",
                }}
              >
                {loginError}
              </div>
            )}
            <div>
              <label className="block mb-1" style={{ color: "var(--text-muted)", fontSize: 12, fontWeight: 600 }}>帳號</label>
              <input
                autoFocus
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="PTT 帳號"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-sky-500"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block mb-1" style={{ color: "var(--text-muted)", fontSize: 12, fontWeight: 600 }}>密碼</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="PTT 密碼"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-sky-500"
                style={inputStyle}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={!username.trim()}
                className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
                style={{
                  ...primaryButtonStyle,
                  opacity: username.trim() ? 1 : 0.45,
                  cursor: username.trim() ? "pointer" : "not-allowed",
                }}
              >
                登入
              </button>
              <button
                type="button"
                onClick={handleGuest}
                className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 transition-colors"
                style={secondaryButtonStyle}
              >
                訪客
              </button>
            </div>
          </form>
        )}

        <p className="mt-4 text-xs text-center" style={{ color: "var(--text-dim)" }}>
          密碼僅存於記憶體，不會上傳任何伺服器
        </p>
      </div>
    </div>
  );
}
