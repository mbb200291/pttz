// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replyArticleToBoard: vi.fn(),
}));

vi.mock("../../hooks/usePttSocket", () => ({
  usePttSocket: () => ({ wsStatus: "connected", pttState: "ready", client: null }),
  useHotBoards: () => ({ boards: [], loading: false }),
  useFavoriteBoards: () => ({ boards: [], loading: false }),
  useRecentBoards: () => ({ recent: [], addRecent: vi.fn() }),
  usePttSocketStore: (selector: (state: unknown) => unknown) => selector({
    credentials: { username: "pttzzz" },
  }),
}));

vi.mock("../../hooks/usePttActions", () => ({
  usePttActions: () => ({
    replyArticleToBoard: mocks.replyArticleToBoard,
  }),
}));

vi.mock("../LoginModal", () => ({ LoginModal: () => null }));
vi.mock("../BoardInput", () => ({ BoardInput: () => null }));
vi.mock("../ArticleList", () => ({
  ArticleList: (props: { onSelectArticle?: (article: { index: number; title: string; author: string; date: string; mark: string; pushCount: string }) => void }) => (
    <div>
      看板頁
      <button type="button" onClick={() => props.onSelectArticle?.({
        index: 30215, title: "原文", author: "alice", date: "08/22", mark: "", pushCount: "0",
      })}>
        重新開文
      </button>
    </div>
  ),
}));
vi.mock("../Article", () => ({
  Article: (props: {
    mockArticle?: unknown;
    onReplyToBoard?: (article: unknown) => void;
  }) => (
    <button
      type="button"
      onClick={() => props.onReplyToBoard?.(props.mockArticle)}
    >
      開啟回應
    </button>
  ),
}));
vi.mock("../ComposeScreen", () => ({
  ComposeScreen: (props: {
    mode: string;
    initial?: { title?: string };
    submitError?: string | null;
    onCancel: () => void;
    isSubmitLocked?: (payload: { board: string; category: string; title: string; body: string }) => boolean;
    onSubmit: (payload: { board: string; category: string; title: string; body: string }) => void;
  }) => {
    const payload = (body: string) => ({
      board: "Gossiping", category: "", title: props.initial?.title ?? "", body,
    });
    return (
    <div>
      <span>{props.mode}</span>
      <span>{props.initial?.title}</span>
      {props.submitError && <div role="alert">{props.submitError}</div>}
      <button
        type="button"
        disabled={props.isSubmitLocked?.(payload("回應正文"))}
        onClick={() => props.onSubmit(payload("回應正文"))}
      >
        送出回應
      </button>
      <button type="button" onClick={() => props.onSubmit(payload("修改後正文"))}>
        修改後送出
      </button>
      <button type="button" onClick={() => props.onSubmit(payload("第三個正文"))}>
        第三個送出
      </button>
      <button type="button" onClick={props.onCancel}>取消回應</button>
    </div>
    );
  },
}));

beforeEach(() => {
  window.history.replaceState(null, "", "/?preview=article");
  mocks.replyArticleToBoard.mockReset();
});

afterEach(cleanup);

describe("App article board reply navigation", () => {
  it("uses the locked Re title and returns to the board after success", async () => {
    mocks.replyArticleToBoard.mockResolvedValue({ ok: true });
    const { default: App } = await import("../../App");
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "開啟回應" }));
    expect(screen.getByText("reply-article")).toBeTruthy();
    expect(screen.getByText("Re: [分享] 我做了一個現代化 PTT 閱讀器 PTTzzz")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "送出回應" }));

    await waitFor(() => expect(screen.getByText("看板頁")).toBeTruthy());
    expect(mocks.replyArticleToBoard).toHaveBeenCalledWith({
      article: { board: "Gossiping", index: 30215 },
      content: "回應正文",
    });
  });

  it("keeps the reply composer and shows the adapter reason after failure", async () => {
    mocks.replyArticleToBoard.mockResolvedValue({
      ok: false,
      error: { code: "PTT_REJECTED", message: "PTT 拒絕回應", outcome: "not-sent", retryable: false },
    });
    const { default: App } = await import("../../App");
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "開啟回應" }));
    await userEvent.click(screen.getByRole("button", { name: "送出回應" }));

    expect((await screen.findByRole("alert")).textContent).toContain("PTT 拒絕回應");
    expect(screen.getByText("reply-article")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "送出回應" }));
    expect(mocks.replyArticleToBoard).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "取消回應" }));
    await userEvent.click(screen.getByRole("button", { name: "開啟回應" }));
    await userEvent.click(screen.getByRole("button", { name: "送出回應" }));
    expect(mocks.replyArticleToBoard).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "修改後送出" }));
    expect(mocks.replyArticleToBoard).toHaveBeenCalledTimes(2);
  });

  it("does not erase earlier unsafe DTO locks when a different payload succeeds", async () => {
    const unsafe = {
      ok: false as const,
      error: { code: "UNKNOWN", message: "無法確認", outcome: "uncertain" as const, retryable: false },
    };
    mocks.replyArticleToBoard
      .mockResolvedValueOnce(unsafe)
      .mockResolvedValueOnce(unsafe)
      .mockResolvedValueOnce({ ok: true });
    const { default: App } = await import("../../App");
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "開啟回應" }));
    await userEvent.click(screen.getByRole("button", { name: "送出回應" }));
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: "修改後送出" }));
    await userEvent.click(screen.getByRole("button", { name: "第三個送出" }));
    await waitFor(() => expect(screen.getByText("看板頁")).toBeTruthy());
    expect(mocks.replyArticleToBoard).toHaveBeenCalledTimes(3);

    await userEvent.click(screen.getByRole("button", { name: "重新開文" }));
    await userEvent.click(screen.getByRole("button", { name: "開啟回應" }));
    expect((screen.getByRole("button", { name: "送出回應" }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "送出回應" }));
    expect(mocks.replyArticleToBoard).toHaveBeenCalledTimes(3);
  });
});
