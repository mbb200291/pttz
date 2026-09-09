// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { CoreEvent, PttzzzClient } from "@pttzzz/core";

const listeners = new Set<(event: CoreEvent) => void>();
const unsubscribe = vi.fn();
const connect = vi.fn().mockResolvedValue({ ok: true, value: undefined });
const login = vi.fn().mockResolvedValue({ ok: true, value: { userId: "user" } });
let fakeMode = false;
let fakeUser: string | null = null;
const listBoards = vi.fn();
const client = {
  connect,
  login,
  listBoards,
  disconnect: vi.fn(),
  subscribe: vi.fn((listener: (event: CoreEvent) => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      unsubscribe();
    };
  }),
} as unknown as PttzzzClient;

vi.mock("@pttzzz/browser", () => ({ createBrowserClient: () => client }));
vi.mock("@pttzzz/browser/testing", () => ({
  createFakeBrowserGateway: () => ({}),
  getFakePttCurrentUser: () => fakeUser,
  isFakePttMode: () => fakeMode,
}));
vi.mock("@pttzzz/core", async (importOriginal) => ({
  ...await importOriginal<typeof import("@pttzzz/core")>(),
  PttzzzClient: class {
    constructor() { return client; }
  },
}));

import {
  submitDuplicateLoginDecision,
  submitLogin,
  useFavoriteBoards,
  usePttSocket,
  usePttSocketStore,
  type PttState,
} from "../usePttSocket";

describe("public PttzzzClient socket bridge", () => {
  beforeEach(() => {
    listeners.clear();
    vi.clearAllMocks();
    fakeMode = false;
    fakeUser = null;
    connect.mockResolvedValue({ ok: true, value: undefined });
    login.mockResolvedValue({ ok: true, value: { userId: "user" } });
    usePttSocketStore.setState({
      client: null,
      wsStatus: "idle",
      pttState: "idle" as PttState,
      credentials: null,
      recentBuffer: "",
      loginError: null,
    });
  });

  it("uses only public subscribe/connect and unsubscribes on cleanup", async () => {
    const { unmount } = renderHook(() => usePttSocket());
    await waitFor(() => expect(connect).toHaveBeenCalledOnce());
    expect(client.subscribe).toHaveBeenCalledOnce();

    for (const listener of listeners) {
      listener({ type: "connection.changed", status: "connected" });
      listener({ type: "session.changed", session: { userId: "alice" } });
    }
    expect(usePttSocketStore.getState()).toMatchObject({
      wsStatus: "connected",
      pttState: "ready",
      credentials: { username: "alice", password: "" },
    });

    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(listeners.size).toBe(0);
    expect(client.disconnect).not.toHaveBeenCalled();

    usePttSocketStore.getState().setPttState("idle");
    expect(usePttSocketStore.getState().pttState).toBe("idle");
  });

  it("clears the visible session when the public client logs out", async () => {
    renderHook(() => usePttSocket());
    await waitFor(() => expect(client.subscribe).toHaveBeenCalledOnce());
    for (const listener of listeners) {
      listener({ type: "connection.changed", status: "connected" });
      listener({ type: "session.changed", session: { userId: "alice" } });
      listener({ type: "session.changed", session: null });
    }
    expect(usePttSocketStore.getState().credentials).toBeNull();
    expect(usePttSocketStore.getState().pttState).toBe("need_login");
  });

  it("keeps a disconnected state closed when a null session arrives", async () => {
    renderHook(() => usePttSocket());
    await waitFor(() => expect(client.subscribe).toHaveBeenCalledOnce());
    for (const listener of listeners) {
      listener({ type: "connection.changed", status: "disconnected" });
      listener({ type: "session.changed", session: null });
    }
    expect(usePttSocketStore.getState().pttState).toBe("closed");
  });

  it("does not regress a connected singleton to connecting when remounted", async () => {
    const first = renderHook(() => usePttSocket());
    await waitFor(() => expect(client.subscribe).toHaveBeenCalledOnce());
    for (const listener of listeners) {
      listener({ type: "connection.changed", status: "connected" });
      listener({ type: "session.changed", session: { userId: "alice" } });
    }
    first.unmount();

    renderHook(() => usePttSocket());
    expect(usePttSocketStore.getState()).toMatchObject({
      wsStatus: "connected",
      pttState: "ready",
    });
  });

  it("ignores an old connect failure after a remount has become ready", async () => {
    let resolveOld!: (result: { ok: false; error: { code: string; message: string; retryable: false } }) => void;
    const oldConnect = new Promise<{ ok: false; error: { code: string; message: string; retryable: false } }>(
      (resolve) => { resolveOld = resolve; },
    );
    connect
      .mockReturnValueOnce(oldConnect)
      .mockResolvedValueOnce({ ok: true, value: undefined });

    const first = renderHook(() => usePttSocket());
    first.unmount();
    renderHook(() => usePttSocket());
    for (const listener of listeners) {
      listener({ type: "connection.changed", status: "connected" });
      listener({ type: "session.changed", session: { userId: "new-user" } });
    }

    resolveOld({ ok: false, error: { code: "OLD", message: "old", retryable: false } });
    await Promise.resolve();
    expect(usePttSocketStore.getState()).toMatchObject({
      wsStatus: "connected",
      pttState: "ready",
    });
  });

  it("auto-logins fake mode once across a StrictMode-style remount", async () => {
    fakeMode = true;
    fakeUser = "fake-user";
    let resolveConnect!: (result: { ok: true; value: undefined }) => void;
    const pending = new Promise<{ ok: true; value: undefined }>((resolve) => {
      resolveConnect = resolve;
    });
    connect.mockReturnValue(pending);

    const first = renderHook(() => usePttSocket());
    first.unmount();
    const second = renderHook(() => usePttSocket());
    resolveConnect({ ok: true, value: undefined });

    await waitFor(() => expect(login).toHaveBeenCalledOnce());
    expect(login).toHaveBeenCalledWith({ username: "fake-user", password: "" });

    for (const listener of listeners) {
      listener({ type: "connection.changed", status: "connected" });
      listener({ type: "session.changed", session: { userId: "fake-user" } });
    }
    second.unmount();
    connect.mockResolvedValue({ ok: true, value: undefined });
    renderHook(() => usePttSocket());
    await Promise.resolve();
    expect(login).toHaveBeenCalledOnce();
  });

  it("keeps other PTT sessions by default", async () => {
    usePttSocketStore.getState().setClient(client);
    await submitLogin("user", "password");
    expect(login).toHaveBeenCalledWith({
      username: "user",
      password: "password",
      disconnectExistingSession: false,
    });
    expect(usePttSocketStore.getState()).toMatchObject({
      pttState: "ready",
      credentials: { username: "user", password: "password" },
    });
  });

  it.each([true, false])("does not let a late duplicate-login result overwrite a closed connection (%s)", async (ok) => {
    usePttSocketStore.setState({ client, wsStatus: "connected", pttState: "duplicate_login", credentials: { username: "user", password: "password" } });
    login.mockImplementationOnce(async () => {
      usePttSocketStore.setState({ wsStatus: "closed", pttState: "closed" });
      return ok ? { ok: true, value: { userId: "user" } } : { ok: false, error: { code: "LOGIN_FAILED", message: "unknown", retryable: false } };
    });
    await submitDuplicateLoginDecision(false);
    expect(usePttSocketStore.getState()).toMatchObject({ pttState: "closed", credentials: null });
    expect(usePttSocketStore.getState().loginError).toContain("保留其他連線");
    expect(usePttSocketStore.getState().loginError).toContain("無法確認");
    expect(login).toHaveBeenCalledTimes(1);
  });

  it("keeps credentials and asks for a decision when PTT reports a duplicate login", async () => {
    login.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "LOGIN_FAILED",
        message: "duplicate_login",
        retryable: false,
      },
    });
    usePttSocketStore.getState().setClient(client);

    await submitLogin("user", "password");

    expect(usePttSocketStore.getState()).toMatchObject({
      pttState: "duplicate_login",
      credentials: { username: "user", password: "password" },
    });

    login.mockResolvedValueOnce({ ok: true, value: { userId: "user" } });
    await submitDuplicateLoginDecision(true);
    expect(login).toHaveBeenLastCalledWith({
      username: "user",
      password: "password",
      disconnectExistingSession: true,
    });
  });

  it("preserves an existing PTT session when the user declines the duplicate decision", async () => {
    usePttSocketStore.setState({
      client,
      credentials: { username: "user", password: "password" },
      pttState: "duplicate_login",
    });

    await submitDuplicateLoginDecision(false);

    expect(login).toHaveBeenCalledWith({
      username: "user",
      password: "password",
      disconnectExistingSession: false,
    });
    expect(usePttSocketStore.getState()).toMatchObject({
      pttState: "ready",
      credentials: { username: "user", password: "password" },
    });
  });

  it("keeps favorite-board error semantics on the public client", async () => {
    listBoards.mockRejectedValue(new Error("sync failed"));
    usePttSocketStore.setState({
      client,
      wsStatus: "connected",
      pttState: "ready",
    });

    const { result } = renderHook(() => useFavoriteBoards(true));
    await waitFor(() => expect(listBoards).toHaveBeenCalledOnce());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.boards).toEqual([]);
  });
});
