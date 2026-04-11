import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  submitLogin,
  usePttSocketStore,
  type PttState,
} from "../usePttSocket";
import type { PttAdapter } from "../../lib/ptt/adapter";

function createAdapter(overrides: Partial<PttAdapter> = {}): PttAdapter {
  return {
    send: vi.fn(),
    login: vi.fn().mockResolvedValue({ ok: true }),
    listArticles: vi.fn(),
    getArticle: vi.fn(),
    disconnect: vi.fn(),
    isLoggedIn: vi.fn().mockReturnValue(false),
    getStatus: vi.fn().mockReturnValue("connected"),
    getLastScreen: vi.fn().mockReturnValue(""),
    subscribeStatus: vi.fn().mockReturnValue(() => undefined),
    subscribeScreen: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  } as PttAdapter;
}

describe("submitLogin", () => {
  beforeEach(() => {
    usePttSocketStore.setState({
      client: null,
      wsStatus: "idle",
      pttState: "idle" as PttState,
      credentials: null,
      recentBuffer: "",
      loginError: null,
    });
  });

  it("keeps other PTT sessions by default", async () => {
    const login = vi.fn().mockResolvedValue({ ok: true });
    const adapter = createAdapter({ login });

    usePttSocketStore.getState().setClient(adapter);

    await submitLogin("user", "password");

    expect(login).toHaveBeenCalledWith("user", "password", false);
  });

  it("kicks other PTT sessions only when explicitly requested", async () => {
    const login = vi.fn().mockResolvedValue({ ok: true });
    const adapter = createAdapter({ login });

    usePttSocketStore.getState().setClient(adapter);

    await submitLogin("user", "password", true);

    expect(login).toHaveBeenCalledWith("user", "password", true);
  });
});
