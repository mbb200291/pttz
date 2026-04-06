/**
 * LoginModal
 *
 * 當 PTT session 偵測到登入提示（pttState === 'need_login'）時自動出現。
 * 使用者輸入帳號密碼後，呼叫 submitLogin() 送出。
 */

import { useState } from "react";
import { submitLogin, usePttSocketStore, type PttState } from "../hooks/usePttSocket";

interface Props {
  pttState: PttState;
  wsStatus: string;
}

export function LoginModal({ pttState, wsStatus }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const isOpen = pttState === "need_login";
  const isLoggingIn = pttState === "logging_in" || pttState === "waiting_auth";

  if (!isOpen && !isLoggingIn) return null;

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

        {isLoggingIn ? (
          <div className="text-center py-6 text-gray-400 text-sm">
            <div className="text-2xl mb-3 animate-pulse">🔐</div>
            驗證中，請稍候…
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
