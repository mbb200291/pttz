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
import { detectState } from "../lib/ptt/session";

export type PttState =
  | "idle"
  | "connecting"
  | "need_login" // PTT 顯示登入提示，等待使用者輸入
  | "logging_in" // 已送出帳號，等待密碼提示
  | "waiting_auth" // 已送出密碼，等待 PTT 驗證結果
  | "duplicate_login" // 偵測到重複登入，等待使用者決策
  | "guest_overload" // guest 人數已滿，等待使用者重試或改一般登入
  | "syncing_users" // 正在同步線上使用者與好友名單
  | "login_rate_limited" // 登入太頻繁，被系統暫時限制
  | "ready" // 主功能表，可以瀏覽看板
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
  clearCredentials: () => void;
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
    clearCredentials: () => set({ credentials: null }),
    appendBuffer: (text) =>
      set((state) => {
        const next = state.recentBuffer + text;
        return {
          recentBuffer:
            next.length > BUFFER_LIMIT ? next.slice(-BUFFER_LIMIT) : next,
        };
      }),
    clearBuffer: () => set({ recentBuffer: "" }),
  })),
);

if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as typeof window & { __pttSocketStore?: typeof usePttSocketStore }).__pttSocketStore =
    usePttSocketStore;
}

// ─── Global singleton ─────────────────────────────────────────────────────────
// 防止 React 18 StrictMode 與 Vite HMR 在 dev 中重建多條 WS 連線
type PttSocketGlobal = typeof globalThis & {
  __pttClientSingleton?: PttClient | null;
};

function getSingletonClient(): PttClient | null {
  return (globalThis as PttSocketGlobal).__pttClientSingleton ?? null;
}

function setSingletonClient(client: PttClient | null): void {
  (globalThis as PttSocketGlobal).__pttClientSingleton = client;
}

// ─── PTT session state detection ─────────────────────────────────────────────

export function handleSocketStatusChange(status: ConnectionStatus): void {
  const { client, pttState, setPttState, setWsStatus } =
    usePttSocketStore.getState();

  setWsStatus(status);

  if (status === "connecting") {
    setPttState("connecting");
    return;
  }

  if (status === "closed" || status === "error") {
    if (pttState === "ready") {
      setPttState(status as PttState);
      return;
    }

    setPttState("need_login");
    client?.connect();
  }
}

export function detectAndRespond(buf: string): void {
  const { client, credentials, pttState, setPttState, clearCredentials } =
    usePttSocketStore.getState();
  if (!client) return;

  // 只看最近 3000 字，去掉 ANSI
  const recent = stripAnsi(buf.slice(-3000));
  const session = detectState(recent);

  console.log(
    `[PTT] state=${pttState} tail=${JSON.stringify(recent.slice(-200))}`,
  );

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
      if (recent.includes("太多 guest") || recent.includes("too many guest")) {
        setPttState("guest_overload");
      } else if (
        recent.includes("正在更新與同步線上使用者及好友名單") ||
        (recent.includes("好友名單") && recent.includes("系統負荷量大"))
      ) {
        setPttState("syncing_users");
      } else if (
        recent.includes("登入太頻繁") &&
        recent.includes("請稍後再試")
      ) {
        clearCredentials();
        setPttState("login_rate_limited");
      } else if (
        recent.includes("抱歉") &&
        recent.includes("guest") &&
        recent.includes("在站上")
      ) {
        setPttState("guest_overload");
      } else if (
        recent.includes("請輸入您的密碼") ||
        recent.includes("Password:") ||
        recent.includes("密碼")
      ) {
        if (credentials) {
          client.send(credentials.password + "\r");
          setPttState("waiting_auth");
        }
      } else if (
        recent.includes("您同意遵守") ||
        recent.includes("使用條款") ||
        recent.includes("(Y/N)")
      ) {
        // guest 或特殊流程可能直接略過密碼提示，進入條款確認
        client.send("y\r");
        usePttSocketStore.getState().clearBuffer();
        setPttState("waiting_auth");
      } else if (recent.includes("按任意鍵繼續")) {
        client.send(" ");
        usePttSocketStore.getState().clearBuffer();
        setPttState("waiting_auth");
      } else if (
        recent.includes("重複登入") ||
        recent.includes("刪除其他重複登入")
      ) {
        setPttState("duplicate_login");
      } else if (
        recent.includes("主功能表") ||
        recent.includes("【主功能表】")
      ) {
        // 少數情況可能直接進主選單
        setPttState("ready");
      } else if (
        session.state === "main_menu" ||
        session.state === "board_list" ||
        session.state === "article_list"
      ) {
        setPttState("ready");
      } else if (recent.includes("請輸入代號") || recent.includes("Login:")) {
        // 帳號不存在/流程被中斷，回到登入
        clearCredentials();
        setPttState("need_login");
      }
      break;

    // waiting_auth：密碼已送出，等條款/主功能表/衝突提示
    case "waiting_auth":
      if (
        recent.includes("主功能表") ||
        recent.includes("【主功能表】") ||
        session.state === "main_menu" ||
        session.state === "board_list" ||
        session.state === "article_list"
      ) {
        console.log("[PTT] detected main menu → ready");
        setPttState("ready");
      } else if (
        recent.includes("正在更新與同步線上使用者及好友名單") ||
        (recent.includes("好友名單") && recent.includes("系統負荷量大"))
      ) {
        setPttState("syncing_users");
      } else if (
        recent.includes("登入太頻繁") &&
        recent.includes("請稍後再試")
      ) {
        clearCredentials();
        setPttState("login_rate_limited");
      } else if (
        recent.includes("太多 guest") ||
        recent.includes("too many guest")
      ) {
        setPttState("guest_overload");
      } else if (
        recent.includes("抱歉") &&
        recent.includes("guest") &&
        recent.includes("在站上")
      ) {
        setPttState("guest_overload");
      } else if (recent.includes("請輸入代號") || recent.includes("Login:")) {
        // 帳密錯誤或拒絕重複登入後回到登入提示
        clearCredentials();
        setPttState("need_login");
      } else if (
        recent.includes("重複登入") ||
        recent.includes("刪除其他重複登入")
      ) {
        // 這個提示通常也會帶 (Y/N)，必須優先於通用 (Y/N) 規則判斷
        console.log("[PTT] duplicate login detected → waiting user decision");
        setPttState("duplicate_login");
      } else if (recent.includes("您同意遵守") || recent.includes("使用條款")) {
        console.log("[PTT] accepting terms");
        client.send("y\r");
        usePttSocketStore.getState().clearBuffer();
      } else if (recent.includes("按任意鍵繼續")) {
        console.log("[PTT] pressing any key");
        client.send(" ");
        usePttSocketStore.getState().clearBuffer(); // 清除舊畫面，防止重複觸發
      } else if (recent.includes("(Y/N)")) {
        // 登入流程中若出現未辨識的 Y/N 提示，優先交由使用者決策，
        // 避免被自動空白鍵卡住。
        console.log("[PTT] unknown (Y/N) prompt → waiting user decision");
        setPttState("duplicate_login");
      }
      break;

    // duplicate_login：由 UI 決策是否踢掉其他重複登入
    case "duplicate_login":
      break;

    // guest_overload：由 UI 提示重試 guest 或改一般登入
    case "guest_overload":
    case "login_rate_limited":
      break;

    case "syncing_users":
      if (
        recent.includes("主功能表") ||
        recent.includes("【主功能表】") ||
        session.state === "main_menu" ||
        session.state === "board_list" ||
        session.state === "article_list"
      ) {
        setPttState("ready");
      } else if (recent.includes("按任意鍵繼續")) {
        client.send(" ");
        usePttSocketStore.getState().clearBuffer();
      } else if (
        recent.includes("登入太頻繁") &&
        recent.includes("請稍後再試")
      ) {
        clearCredentials();
        setPttState("login_rate_limited");
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
  const pttState = usePttSocketStore((s) => s.pttState);
  const client = usePttSocketStore((s) => s.client);

  // 初始化 singleton（只跑一次，StrictMode 第二次進來會早退）
  useEffect(() => {
    const existingClient = getSingletonClient();
    if (existingClient) {
      existingClient.setOptions({
        onData: (text) => usePttSocketStore.getState().appendBuffer(text),
        onStatusChange: handleSocketStatusChange,
      });
      usePttSocketStore.getState().setClient(existingClient);
      return;
    }

    const nextClient = new PttClient({
      onData: (text) => usePttSocketStore.getState().appendBuffer(text),
      onStatusChange: handleSocketStatusChange,
    });

    setSingletonClient(nextClient);
    usePttSocketStore.getState().setClient(nextClient);
    nextClient.connect();
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

  // 登入流程保底：若卡在 logging_in / waiting_auth，定期送 Enter 推進畫面
  useEffect(() => {
    if (!client) return;
    if (pttState !== "logging_in" && pttState !== "waiting_auth") return;

    const timer = setInterval(() => {
      client.send("\r");
    }, 1800);

    return () => clearInterval(timer);
  }, [client, pttState]);

  return {
    wsStatus: usePttSocketStore((s) => s.wsStatus),
    pttState,
    client,
  };
}

/**
 * 由 LoginModal 呼叫：儲存憑證並送出帳號
 */
export function submitLogin(username: string, password: string): void {
  const { client, setPttState, setCredentials, clearBuffer } =
    usePttSocketStore.getState();
  setCredentials({ username, password });
  clearBuffer();
  client?.send(username + "\r");
  setPttState("logging_in");
}

/**
 * 由 LoginModal 呼叫：重複登入時，決定是否踢掉其他連線
 */
export function submitDuplicateLoginDecision(kickOthers: boolean): void {
  const { client, setPttState, clearBuffer, clearCredentials } =
    usePttSocketStore.getState();
  if (!kickOthers) clearCredentials();
  client?.send(kickOthers ? "y\r" : "n\r");
  clearBuffer();
  setPttState("waiting_auth");
}
