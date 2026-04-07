/**
 * LoginModal
 *
 * 當 PTT session 偵測到登入提示（pttState === 'need_login'）時自動出現。
 * 使用者輸入帳號密碼後，呼叫 submitLogin() 送出。
 */

import { useState } from "react";
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
  const client = usePttSocketStore((s) => s.client);
  const setPttState = usePttSocketStore((s) => s.setPttState);

  const isOpen = pttState === "need_login";
  const isLoggingIn = pttState === "logging_in" || pttState === "waiting_auth";
  const isDuplicateLogin = pttState === "duplicate_login";
  const isGuestOverload = pttState === "guest_overload";

  if (!isOpen && !isLoggingIn && !isDuplicateLogin && !isGuestOverload)
    return null;

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    submitLogin(username.trim(), password);
  };

  const handleGuest = () => {
    submitLogin("guest", "");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-8">
        <h2 className="text-xl font-bold text-white mb-1">登入 PTT</h2>
        <p className="text-sm text-gray-400 mb-6">
          {wsStatus === "connected" ? (
            <span className="text-green-400">● 已連線</span>
          ) : (
            <span className="text-yellow-400 animate-pulse">● 連線中…</span>
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
              >
                重試訪客登入
              </button>
              <button
                type="button"
                onClick={() => setPttState("need_login")}
                className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-200 transition-colors"
              >
                改用帳號登入
              </button>
            </div>
          </div>
        ) : isDuplicateLogin ? (
          <div className="space-y-3">
            <div className="text-sm text-gray-300 leading-relaxed">
              偵測到此帳號已有其他連線，是否要踢掉其他重複登入？
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => submitDuplicateLoginDecision(true)}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition-colors"
              >
                踢掉其他連線（是）
              </button>
              <button
                type="button"
                onClick={() => submitDuplicateLoginDecision(false)}
                className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-200 transition-colors"
              >
                保留其他連線（否）
              </button>
            </div>
          </div>
        ) : isLoggingIn ? (
          <div className="text-center py-3 text-gray-400 text-sm">
            <div className="text-2xl mb-3 animate-pulse">🔐</div>
            <div className="mb-3">驗證中，請稍候…</div>
            <div className="text-xs text-gray-500 mb-2">若卡住可手動送指令</div>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => client?.send("\r")}
                className="px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs text-gray-200"
              >
                送 Enter
              </button>
              <button
                type="button"
                onClick={() => client?.send(" ")}
                className="px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs text-gray-200"
              >
                送空白
              </button>
              <button
                type="button"
                onClick={() => client?.send("y\r")}
                className="px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs text-gray-200"
              >
                送 y
              </button>
              <button
                type="button"
                onClick={() => setPttState("need_login")}
                className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs text-gray-300"
              >
                重新登入
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">帳號</label>
              <input
                autoFocus
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="PTT 帳號"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">密碼</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="PTT 密碼"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={!username.trim()}
                className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
              >
                登入
              </button>
              <button
                type="button"
                onClick={handleGuest}
                className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 transition-colors"
              >
                訪客
              </button>
            </div>
          </form>
        )}

        <p className="mt-4 text-xs text-gray-600 text-center">
          密碼僅存於記憶體，不會上傳任何伺服器
        </p>
      </div>
    </div>
  );
}
