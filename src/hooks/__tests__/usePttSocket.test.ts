import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PttClient } from "../../lib/ptt/client";

function createClientStub() {
  return {
    send: vi.fn(),
  } as unknown as PttClient;
}

async function loadModule() {
  vi.resetModules();
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: {
      protocol: "http:",
      host: "127.0.0.1:4173",
    },
  });

  return import("../usePttSocket");
}

describe("usePttSocket login flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("clears stale terminal buffer before submitting credentials", async () => {
    const { submitLogin, usePttSocketStore } = await loadModule();
    const client = createClientStub();
    usePttSocketStore.setState({
      client,
      wsStatus: "idle",
      pttState: "need_login",
      credentials: null,
      recentBuffer: "Welcome\r\nLogin: ",
    });

    submitLogin("testuser", "secret");

    expect(usePttSocketStore.getState().recentBuffer).toBe("");
    expect(client.send).toHaveBeenCalledWith("testuser\r");
    expect(usePttSocketStore.getState().pttState).toBe("logging_in");
  });

  it("clears stale buffer after duplicate login decision", async () => {
    const { submitDuplicateLoginDecision, usePttSocketStore } =
      await loadModule();
    const client = createClientStub();
    usePttSocketStore.setState({
      client,
      pttState: "duplicate_login",
      recentBuffer: "刪除其他重複登入(Y/N)",
    });

    submitDuplicateLoginDecision(true);

    expect(usePttSocketStore.getState().recentBuffer).toBe("");
    expect(client.send).toHaveBeenCalledWith("y\r");
    expect(usePttSocketStore.getState().pttState).toBe("waiting_auth");
  });

  it("clears credentials immediately when declining duplicate login takeover", async () => {
    const { submitDuplicateLoginDecision, usePttSocketStore } =
      await loadModule();
    const client = createClientStub();

    usePttSocketStore.setState({
      client,
      wsStatus: "connected",
      pttState: "duplicate_login",
      credentials: { username: "testuser", password: "secret" },
      recentBuffer: "刪除其他重複登入(Y/N)",
    });

    submitDuplicateLoginDecision(false);

    expect(usePttSocketStore.getState().credentials).toBeNull();
    expect(client.send).toHaveBeenCalledWith("n\r");
  });

  it("reconnects and returns to login when the socket closes before ready", async () => {
    const { handleSocketStatusChange, usePttSocketStore } = await loadModule();
    const connect = vi.fn();
    usePttSocketStore.setState({
      client: { send: vi.fn(), connect } as never,
      wsStatus: "connected",
      pttState: "waiting_auth",
      credentials: { username: "testuser", password: "secret" },
      recentBuffer: "",
    });

    handleSocketStatusChange("closed");

    expect(usePttSocketStore.getState().pttState).toBe("need_login");
    expect(usePttSocketStore.getState().wsStatus).toBe("closed");
    expect(connect).toHaveBeenCalled();
  });

  it("clears credentials when auth flow falls back to the login prompt", async () => {
    const { detectAndRespond, usePttSocketStore } = await loadModule();
    const client = createClientStub();

    usePttSocketStore.setState({
      client,
      wsStatus: "connected",
      pttState: "waiting_auth",
      credentials: { username: "testuser", password: "secret" },
      recentBuffer: "",
    });

    detectAndRespond("請輸入代號，或以 guest 參觀，或以 new 註冊:");

    expect(usePttSocketStore.getState().pttState).toBe("need_login");
    expect(usePttSocketStore.getState().credentials).toBeNull();
  });

  it("marks the session ready when auth lands on the board list", async () => {
    const { detectAndRespond, usePttSocketStore } = await loadModule();
    const client = createClientStub();

    usePttSocketStore.setState({
      client,
      wsStatus: "connected",
      pttState: "waiting_auth",
      credentials: { username: "testuser", password: "secret" },
      recentBuffer: "",
    });

    detectAndRespond(
      "AskBoard     新手 ◎【問與板有關的問題，非ask板】        akaume\r\nNewhand   新手 ◎批踢踢新手客服中心…〃非test板       HWBA",
    );

    expect(usePttSocketStore.getState().pttState).toBe("ready");
  });

  it("marks the session syncing when PTT is updating online users and friends", async () => {
    const { detectAndRespond, usePttSocketStore } = await loadModule();
    const client = createClientStub();

    usePttSocketStore.setState({
      client,
      wsStatus: "connected",
      pttState: "waiting_auth",
      credentials: { username: "testuser", password: "secret" },
      recentBuffer: "",
    });

    detectAndRespond(
      "正在更新與同步線上使用者及好友名單，系統負荷量大時會需時較久...",
    );

    expect(usePttSocketStore.getState().pttState).toBe("syncing_users");
  });

  it("continues past the post-sync any-key prompt", async () => {
    const { detectAndRespond, usePttSocketStore } = await loadModule();
    const client = createClientStub();

    usePttSocketStore.setState({
      client,
      wsStatus: "connected",
      pttState: "syncing_users",
      credentials: { username: "testuser", password: "secret" },
      recentBuffer: "正在更新與同步線上使用者及好友名單，系統負荷量大時會需時較久...",
    });

    detectAndRespond("歡迎您再度拜訪。\r\n請按任意鍵繼續");

    expect(client.send).toHaveBeenCalledWith(" ");
    expect(usePttSocketStore.getState().recentBuffer).toBe("");
  });

  it("marks the session rate-limited when login attempts are too frequent", async () => {
    const { detectAndRespond, usePttSocketStore } = await loadModule();
    const client = createClientStub();

    usePttSocketStore.setState({
      client,
      wsStatus: "connected",
      pttState: "waiting_auth",
      credentials: { username: "testuser", password: "secret" },
      recentBuffer: "",
    });

    detectAndRespond(
      "登入太頻繁, 為避免系統負荷過重, 請稍後再試",
    );

    expect(usePttSocketStore.getState().pttState).toBe("login_rate_limited");
  });
});
