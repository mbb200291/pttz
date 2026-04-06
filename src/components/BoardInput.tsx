/**
 * BoardInput — 輸入看板名稱的首頁
 */

import { useState } from "react";

const POPULAR_BOARDS = [
  "Gossiping",
  "Baseball",
  "joke",
  "Stock",
  "C_Chat",
  "Soft_Job",
  "NBA",
  "LoL",
];

interface BoardInputProps {
  onEnter: (board: string) => void;
  pttState: string;
  wsStatus: string;
}

export function BoardInput({ onEnter, pttState, wsStatus }: BoardInputProps) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const b = input.trim();
    if (b) onEnter(b);
  };

  const isConnected = pttState === "ready";

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-bold text-center mb-2">
          PTT<span className="text-sky-400">zzz</span>
        </h1>
        <p className="text-gray-500 text-center text-sm mb-8">
          現代化 PTT 閱讀器
        </p>

        {/* 連線狀態 */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected
                ? "bg-green-400"
                : wsStatus === "connecting" || pttState === "logging_in" || pttState === "waiting_auth"
                  ? "bg-yellow-400 animate-pulse"
                  : "bg-red-400"
            }`}
          />
          <span className="text-xs text-gray-400">
            {isConnected
              ? "已登入 PTT"
              : pttState === "logging_in" || pttState === "waiting_auth"
                ? "登入中…"
                : wsStatus === "connecting"
                  ? "連線中…"
                  : `狀態：${pttState}`}
          </span>
        </div>

        {/* 輸入看板 */}
        <form onSubmit={handleSubmit} className="mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="輸入看板名稱（如 Gossiping）"
              disabled={!isConnected}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-sky-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!isConnected || !input.trim()}
              className="px-5 py-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
            >
              進入
            </button>
          </div>
        </form>

        {/* 熱門看板 */}
        <div>
          <p className="text-xs text-gray-500 mb-3">熱門看板</p>
          <div className="flex flex-wrap gap-2">
            {POPULAR_BOARDS.map((b) => (
              <button
                key={b}
                onClick={() => onEnter(b)}
                disabled={!isConnected}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded-lg text-sm text-gray-300 transition-colors"
              >
                {b}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
