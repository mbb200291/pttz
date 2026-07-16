/**
 * usePttSocket
 *
 * 改由 ptt-client bot 管理連線與登入。
 * UI 仍沿用既有的 wsStatus / pttState 介面，方便逐步遷移。
 */

import { useEffect, useState } from "react";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import {
  createPttAdapter,
  type ConnectionStatus,
  type HotBoardSummary,
  type LoginFailureReason,
  type PttAdapter,
} from "../lib/ptt/adapter";
import {
  createFakePttAdapter,
  getFakePttCurrentUser,
  isFakePttMode,
} from "../lib/ptt/fakeAdapter";

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
  | "closed"
  | "error";

export interface Credentials {
  username: string;
  password: string;
}

interface PttSocketStore {
  client: PttAdapter | null;
  wsStatus: ConnectionStatus;
  pttState: PttState;
  credentials: Credentials | null;
  recentBuffer: string;
  loginError: string | null;
  setClient: (c: PttAdapter) => void;
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
  __pttAdapterSingleton?: PttAdapter | null;
};

function getSingletonAdapter(): PttAdapter | null {
  return (globalThis as PttSocketGlobal).__pttAdapterSingleton ?? null;
}

function setSingletonAdapter(adapter: PttAdapter | null): void {
  (globalThis as PttSocketGlobal).__pttAdapterSingleton = adapter;
}

function mapFailureReason(reason: LoginFailureReason): PttState {
  switch (reason) {
    case "guest_overload":
      return "guest_overload";
    case "login_rate_limited":
      return "login_rate_limited";
    default:
      return "need_login";
  }
}

function mapConnectionStatus(status: ConnectionStatus): PttState {
  if (status === "connected") return "need_login";
  return status;
}

export function usePttSocket() {
  const pttState = usePttSocketStore((s) => s.pttState);
  const client = usePttSocketStore((s) => s.client);

  useEffect(() => {
    const fakeMode = isFakePttMode();
    const existing = getSingletonAdapter();
    const adapter = existing ?? (fakeMode ? createFakePttAdapter() : createPttAdapter());
    if (!existing) setSingletonAdapter(adapter);

    const store = usePttSocketStore.getState();
    const fakeUser = fakeMode ? getFakePttCurrentUser() : null;
    store.setClient(adapter);
    if (fakeUser) {
      store.setCredentials({ username: fakeUser, password: "" });
      void adapter.login(fakeUser, "", false);
    }
    store.setWsStatus(adapter.getStatus());
    store.setPttState(
      adapter.isLoggedIn()
        ? "ready"
        : adapter.getStatus() === "connected"
          ? "need_login"
          : adapter.getStatus() === "connecting"
            ? "connecting"
            : mapConnectionStatus(adapter.getStatus()),
    );
    store.setRecentBuffer(adapter.getLastScreen());

    const unsubStatus = adapter.subscribeStatus((status) => {
      const { pttState: currentPttState, setPttState, setWsStatus } =
        usePttSocketStore.getState();
      setWsStatus(status);

      if (status === "connected") {
        setPttState(adapter.isLoggedIn() ? "ready" : "need_login");
        return;
      }

      if (status === "connecting") {
        setPttState("connecting");
        return;
      }

      if (status === "closed" || status === "error") {
        if (
          currentPttState === "need_login" ||
          currentPttState === "guest_overload" ||
          currentPttState === "login_rate_limited" ||
          currentPttState === "duplicate_login"
        ) {
          return;
        }
        setPttState(status);
      }
    });

    const unsubScreen = adapter.subscribeScreen((screen) => {
      usePttSocketStore.getState().setRecentBuffer(screen);
    });

    return () => {
      unsubStatus();
      unsubScreen();
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
  const [boards, setBoards] = useState<HotBoardSummary[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !client || pttState !== "ready") {
      setBoards(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    client
      .listHotBoards()
      .then((nextBoards) => {
        if (!cancelled) setBoards(nextBoards);
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
    client
      .getFavoriteBoards()
      .then((nextBoards: string[]) => {
        if (!cancelled) setBoards(nextBoards);
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

export async function submitLogin(
  username: string,
  password: string,
  kickOthers = false,
): Promise<void> {
  const { client, setCredentials, setPttState, clearCredentials } =
    usePttSocketStore.getState();
  if (!client) return;

  usePttSocketStore.getState().setLoginError(null);
  setCredentials({ username, password });
  setPttState("logging_in");

  const result = await client.login(username, password, kickOthers);
  if (result.ok) {
    setPttState("ready");
    return;
  }

  clearCredentials();
  usePttSocketStore.getState().setLoginError(
    result.reason === "invalid_credentials"
      ? "帳號或密碼錯誤。"
      : result.reason === "unknown"
        ? "登入失敗，請再試一次。"
        : null,
  );
  setPttState(mapFailureReason(result.reason));
}

export async function submitDuplicateLoginDecision(
  kickOthers: boolean,
): Promise<void> {
  const { credentials, client, setPttState, clearCredentials } =
    usePttSocketStore.getState();
  if (!client || !credentials) return;

  usePttSocketStore.getState().setLoginError(null);
  setPttState("logging_in");
  const result = await client.login(
    credentials.username,
    credentials.password,
    kickOthers,
  );

  if (result.ok) {
    setPttState("ready");
    return;
  }

  if (!kickOthers) {
    clearCredentials();
  }
  usePttSocketStore.getState().setLoginError(
    result.reason === "invalid_credentials"
      ? "帳號或密碼錯誤。"
      : result.reason === "unknown"
        ? "登入失敗，請再試一次。"
        : null,
  );
  setPttState(mapFailureReason(result.reason));
}
