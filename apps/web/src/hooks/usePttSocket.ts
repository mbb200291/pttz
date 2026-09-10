/**
 * usePttSocket
 *
 * 改由 ptt-client bot 管理連線與登入。
 * UI 仍沿用既有的 wsStatus / pttState 介面，方便逐步遷移。
 */

import { useEffect, useState } from "react";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { PttzzzClient, type CoreError, type CoreEvent, type Board } from "@pttzzz/core";
import { createBrowserClient } from "@pttzzz/browser";
import {
  createFakeBrowserGateway,
  getFakePttCurrentUser,
  isFakePttMode,
} from "@pttzzz/browser/testing";

export type PttState =
  | "idle"
  | "connecting"
  | "need_login"
  | "logging_in"
  | "waiting_auth"
  | "duplicate_login"
  | "guest_overload"
  | "syncing_users"
  | "login_rate_limited"
  | "ready"
  | "logged_out"
  | "closed"
  | "error";

type ConnectionStatus = "idle" | "connecting" | "connected" | "error" | "closed";

export interface Credentials {
  username: string;
  password: string;
}

interface PttSocketStore {
  client: PttzzzClient | null;
  wsStatus: ConnectionStatus;
  pttState: PttState;
  credentials: Credentials | null;
  recentBuffer: string;
  loginError: string | null;
  setClient: (c: PttzzzClient) => void;
  setWsStatus: (s: ConnectionStatus) => void;
  setPttState: (s: PttState) => void;
  setCredentials: (c: Credentials) => void;
  clearCredentials: () => void;
  setRecentBuffer: (text: string) => void;
  setLoginError: (message: string | null) => void;
}

export const usePttSocketStore = create<PttSocketStore>()(
  subscribeWithSelector((set) => ({
    client: null,
    wsStatus: "idle",
    pttState: "idle",
    credentials: null,
    recentBuffer: "",
    loginError: null,
    setClient: (c) => set({ client: c }),
    setWsStatus: (s) => set({ wsStatus: s }),
    setPttState: (s) => set({ pttState: s }),
    setCredentials: (c) => set({ credentials: c }),
    clearCredentials: () => set({ credentials: null }),
    setRecentBuffer: (text) => set({ recentBuffer: text }),
    setLoginError: (message) => set({ loginError: message }),
  })),
);

if (import.meta.env.DEV && typeof window !== "undefined") {
  (
    window as typeof window & {
      __pttSocketStore?: typeof usePttSocketStore;
    }
  ).__pttSocketStore = usePttSocketStore;
}

type PttSocketGlobal = typeof globalThis & {
  __pttzzzClients?: Partial<Record<"real" | "fake", PttzzzClient>>;
};

function getClient(fakeMode: boolean): PttzzzClient {
  const global = globalThis as PttSocketGlobal;
  const mode = fakeMode ? "fake" : "real";
  const clients = global.__pttzzzClients ??= {};
  const existing = clients[mode];
  if (existing) return existing;
  const client = fakeMode
    ? new PttzzzClient(createFakeBrowserGateway())
    : createBrowserClient();
  clients[mode] = client;
  return client;
}

function mapLoginError(error: CoreError): PttState {
  switch (error.message) {
    case "duplicate_login":
      return "duplicate_login";
    case "guest_overload":
      return "guest_overload";
    case "login_rate_limited":
      return "login_rate_limited";
    default:
      return "need_login";
  }
}

export function usePttSocket() {
  const pttState = usePttSocketStore((s) => s.pttState);
  const client = usePttSocketStore((s) => s.client);

  useEffect(() => {
    const fakeMode = isFakePttMode();
    const socketClient = getClient(fakeMode);

    const store = usePttSocketStore.getState();
    const fakeUser = fakeMode ? getFakePttCurrentUser() : null;
    store.setClient(socketClient);
    let active = true;

    const unsubscribe = socketClient.subscribe((event: CoreEvent) => {
      const current = usePttSocketStore.getState();
      if (event.type === "connection.changed") {
        const status: ConnectionStatus = event.status === "disconnected" ? "closed" : event.status;
        current.setWsStatus(status);
        if (event.status === "connecting") current.setPttState("connecting");
        else if (event.status === "connected" && current.pttState !== "ready") current.setPttState("need_login");
        else if (event.status === "disconnected") current.setPttState("closed");
      } else if (event.type === "session.changed") {
        if (event.session) {
          current.setCredentials({ username: event.session.userId, password: "" });
          current.setPttState("ready");
        } else {
          current.clearCredentials();
          if (current.wsStatus === "connected") current.setPttState("need_login");
        }
      }
    });

    if (store.wsStatus !== "connected") {
      store.setWsStatus("connecting");
      store.setPttState("connecting");
    }
    void socketClient.connect().then((result) => {
      if (!active) return;
      if (!result.ok) {
        usePttSocketStore.getState().setWsStatus("error");
        usePttSocketStore.getState().setPttState("error");
      } else if (fakeUser) {
        const current = usePttSocketStore.getState();
        if (current.pttState !== "ready" || current.credentials?.username !== fakeUser) {
          void socketClient.login({ username: fakeUser, password: "" });
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return {
    wsStatus: usePttSocketStore((s) => s.wsStatus),
    pttState,
    client,
  };
}

export function useHotBoards(enabled = true) {
  const client = usePttSocketStore((s) => s.client);
  const pttState = usePttSocketStore((s) => s.pttState);
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !client || pttState !== "ready") {
      setBoards(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    client.listBoards({ source: { kind: "hot" }, limit: 100 })
      .then((result) => {
        if (!cancelled) setBoards(result.ok && result.value.kind === "boards" ? [...result.value.items] : null);
      })
      .catch(() => {
        if (!cancelled) setBoards(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, enabled, pttState]);

  return { boards, loading };
}

export function useFavoriteBoards(enabled = true) {
  const client = usePttSocketStore((s) => s.client);
  const pttState = usePttSocketStore((s) => s.pttState);
  const [boards, setBoards] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !client || pttState !== "ready") {
      setBoards(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    client.listBoards({ source: { kind: "favorite" }, limit: 100 })
      .then((result) => {
        const names = result.ok && result.value.kind === "boards"
          ? result.value.items.map((board) => board.name)
          : [];
        if (!cancelled) setBoards(names);
      })
      .catch(() => {
        if (!cancelled) setBoards([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, enabled, pttState]);

  return { boards, loading };
}

export function useRecentBoards(maxRecent = 5) {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("pttzzz_recent_boards");
    if (stored) {
      try {
        setRecent(JSON.parse(stored) as string[]);
      } catch {
        setRecent([]);
      }
    }
  }, []);

  const addRecent = (boardName: string) => {
    setRecent((prev) => {
      const filtered = prev.filter((b) => b !== boardName);
      const updated = [boardName, ...filtered].slice(0, maxRecent);
      localStorage.setItem("pttzzz_recent_boards", JSON.stringify(updated));
      return updated;
    });
  };

  return { recent, addRecent };
}

export async function submitLogout(): Promise<void> {
  const state = usePttSocketStore.getState();
  try {
    await state.client?.disconnect();
    usePttSocketStore.setState({ credentials: null, recentBuffer: "", loginError: null, wsStatus: "closed", pttState: "logged_out" });
  } catch {
    usePttSocketStore.setState({ credentials: null, recentBuffer: "", wsStatus: "closed", pttState: "closed", loginError: "登出時連線清理未完成，請關閉此分頁；不會影響其他 PTT 客戶端。" });
  }
}

function retainDisconnectedLogin(preservedOthers = false): boolean {
  const state = usePttSocketStore.getState();
  if (state.wsStatus !== "closed" && state.wsStatus !== "error") return false;
  state.clearCredentials();
  state.setPttState("closed");
  state.setLoginError(preservedOthers
    ? "選擇保留其他連線後，本次登入連線已中斷。可能已達 PTT 同帳號連線上限，也可能是網路中斷；目前無法確認原因。可先自行關閉不用的 PTT 連線，再重新整理登入；若再次出現重複登入提示，再決定是否踢除。"
    : "登入期間連線已中斷，目前無法確認登入是否完成。請稍後重新整理再試；不會自動踢除其他連線。");
  return true;
}

export async function submitLogin(
  username: string,
  password: string,
): Promise<void> {
  const { client, setCredentials, setPttState, clearCredentials } =
    usePttSocketStore.getState();
  if (!client) return;

  usePttSocketStore.getState().setLoginError(null);
  setCredentials({ username, password });
  setPttState("logging_in");

  const result = await client.login({
    username,
    password,
    disconnectExistingSession: false,
  });
  if (retainDisconnectedLogin()) return;
  if (result.ok) {
    setPttState("ready");
    return;
  }

  if (result.error.message !== "duplicate_login") clearCredentials();
  usePttSocketStore.getState().setLoginError(
    result.error.message === "invalid_credentials"
      ? "帳號或密碼錯誤。"
      : result.error.code === "GATEWAY_FAILURE"
        ? "登入失敗，請再試一次。"
        : null,
  );
  setPttState(mapLoginError(result.error));
}

export async function submitDuplicateLoginDecision(
  kickOthers: boolean,
): Promise<void> {
  const { credentials, client, setPttState, clearCredentials } =
    usePttSocketStore.getState();
  if (!client || !credentials) return;

  usePttSocketStore.getState().setLoginError(null);
  setPttState("logging_in");
  const result = await client.login({
    username: credentials.username,
    password: credentials.password,
    disconnectExistingSession: kickOthers,
  });
  if (retainDisconnectedLogin(!kickOthers)) return;

  if (result.ok) {
    setPttState("ready");
    return;
  }

  if (!kickOthers) {
    clearCredentials();
  }
  usePttSocketStore.getState().setLoginError(
    result.error.message === "invalid_credentials"
      ? "帳號或密碼錯誤。"
      : result.error.code === "GATEWAY_FAILURE"
        ? "登入失敗，請再試一次。"
        : null,
  );
  setPttState(mapLoginError(result.error));
}
