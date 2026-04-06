/**
 * usePttSocket
 *
 * 管理 PTT WebSocket 連線與 session 狀態機。
 *
 * 設計重點：
 * - 使用 module-level `_client` singleton，避免 React 18 StrictMode
 *   double-mount 導致 WebSocket 在 CONNECTING 狀態被 cleanup 關閉
 * - 訂閱 rawBuffer，偵測 PTT 登入畫面並自動送出憑證
 * - pttState 追蹤 PTT 應用層狀態（獨立於 WS 連線狀態）
 */

import { useEffect } from "react";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { PttClient, type ConnectionStatus } from "../lib/ptt/client";
import { stripAnsi } from "../lib/ptt/parser";

export type PttState =
  | "idle"
  | "connecting"
  | "need_login"     // PTT 顯示登入提示，等待使用者輸入
  | "logging_in"     // 已送出帳號，等待密碼提示
  | "waiting_auth"   // 已送出密碼，等待 PTT 驗證結果
  | "ready"          // 主功能表，可以瀏覽看板
  | "closed"
  | "error";

export interface Credentials {
  username: string;
  password: string;
}

interface PttSocketStore {
  client: PttClient | null;
  wsStatus: ConnectionStatus;
  pttState: PttState;
  credentials: Credentials | null;
  // 只保留最近 8000 個字元，避免無限增長
  recentBuffer: string;
  setClient: (c: PttClient) => void;
  setWsStatus: (s: ConnectionStatus) => void;
  setPttState: (s: PttState) => void;
  setCredentials: (c: Credentials) => void;
  appendBuffer: (text: string) => void;
  clearBuffer: () => void;
}

const BUFFER_LIMIT = 8000;

export const usePttSocketStore = create<PttSocketStore>()(
  subscribeWithSelector((set) => ({
  client: null,
  wsStatus: "idle",
  pttState: "idle",
  credentials: null,
  recentBuffer: "",
  setClient: (c) => set({ client: c }),
  setWsStatus: (s) => set({ wsStatus: s }),
  setPttState: (s) => set({ pttState: s }),
  setCredentials: (c) => set({ credentials: c }),
  appendBuffer: (text) =>
    set((state) => {
      const next = state.recentBuffer + text;
      return { recentBuffer: next.length > BUFFER_LIMIT ? next.slice(-BUFFER_LIMIT) : next };
    }),
  clearBuffer: () => set({ recentBuffer: "" }),
})));

// ─── Module-level singleton ───────────────────────────────────────────────────
// 防止 React 18 StrictMode double-mount 造成 WS 在 CONNECTING 時被 close
let _client: PttClient | null = null;

// ─── PTT session state detection ─────────────────────────────────────────────

function detectAndRespond(buf: string): void {
  const { client, credentials, pttState, setPttState } = usePttSocketStore.getState();
  if (!client) return;

  // 只看最近 3000 字，去掉 ANSI
  const recent = stripAnsi(buf.slice(-3000));

  console.log(`[PTT] state=${pttState} tail=${JSON.stringify(recent.slice(-200))}`);

  switch (pttState) {
    // 連線中：等待登入代號提示
    case "connecting":
    case "idle":
      if (recent.includes("請輸入代號") || recent.includes("Login:")) {
        if (credentials) {
          client.send(credentials.username + "\r");
          setPttState("logging_in");
        } else {
          setPttState("need_login");
        }
      }
      break;

    // need_login：LoginModal 顯示中，等使用者操作（submitLogin 會接手）
    case "need_login":
      break;

    // logging_in：帳號已送出，等密碼提示
    case "logging_in":
      if (recent.includes("請輸入您的密碼") || recent.includes("Password:")) {
        if (credentials) {
          client.send(credentials.password + "\r");
          setPttState("waiting_auth");
        }
      }
      break;

    // waiting_auth：密碼已送出，等條款/主功能表/衝突提示
    case "waiting_auth":
      if (recent.includes("主功能表") || recent.includes("【主功能表】")) {
        setPttState("ready");
      } else if (
        recent.includes("您同意遵守") ||
        recent.includes("按任意鍵繼續") ||
        recent.includes("(Y/N)")
      ) {
        client.send("y\r");
      } else if (recent.includes("您想刪除其他重複登入")) {
        client.send("n\r");
      }
      break;

    // ready：偵測意外登出
    case "ready":
      if (recent.includes("請輸入代號") || recent.includes("Login:")) {
        // PTT 登出或連線斷掉
        setPttState("need_login");
      }
      break;

    default:
      break;
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function usePttSocket() {
  // 初始化 singleton（只跑一次，StrictMode 第二次進來會早退）
  useEffect(() => {
    if (_client) return;

    _client = new PttClient({
      onData: (text) => usePttSocketStore.getState().appendBuffer(text),
      onStatusChange: (s) => {
        usePttSocketStore.getState().setWsStatus(s);
        if (s === "connecting") usePttSocketStore.getState().setPttState("connecting");
        if (s === "closed" || s === "error") usePttSocketStore.getState().setPttState(s as PttState);
      },
    });

    usePttSocketStore.getState().setClient(_client);
    _client.connect();
    // 不需要 cleanup：這是 app 生命週期等長的 singleton
  }, []);

  // 訂閱 recentBuffer，持續偵測 PTT session 狀態
  useEffect(() => {
    const unsub = usePttSocketStore.subscribe(
      (state) => state.recentBuffer,
      (buf) => detectAndRespond(buf),
    );
    return unsub;
  }, []);

  return {
    wsStatus: usePttSocketStore((s) => s.wsStatus),
    pttState: usePttSocketStore((s) => s.pttState),
    client: usePttSocketStore((s) => s.client),
  };
}

/**
 * 由 LoginModal 呼叫：儲存憑證並送出帳號
 */
export function submitLogin(username: string, password: string): void {
  const { client, setPttState, setCredentials } = usePttSocketStore.getState();
  setCredentials({ username, password });
  client?.send(username + "\r");
  setPttState("logging_in");
}
