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
  ArticleList: () => <div>看板頁</div>,
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
    onSubmit: (payload: { board: string; category: string; title: string; body: string; editSummary: string }) => void;
  }) => (
    <div>
      <span>{props.mode}</span>
      <span>{props.initial?.title}</span>
      {props.submitError && <div role="alert">{props.submitError}</div>}
      <button
        type="button"
        onClick={() => props.onSubmit({
          board: "Gossiping",
          category: "",
          title: props.initial?.title ?? "",
          body: "回應正文",
          editSummary: "",
        })}
      >
        送出回應
      </button>
    </div>
  ),
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
    expect(mocks.replyArticleToBoard).toHaveBeenCalledWith(expect.objectContaining({
      boardName: "Gossiping",
      articleIndex: 30215,
      expectedAuthor: "pttzzz",
      body: "回應正文",
    }));
  });

  it("keeps the reply composer and shows the adapter reason after failure", async () => {
    mocks.replyArticleToBoard.mockResolvedValue({ ok: false, reason: "PTT 拒絕回應" });
    const { default: App } = await import("../../App");
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "開啟回應" }));
    await userEvent.click(screen.getByRole("button", { name: "送出回應" }));

    expect((await screen.findByRole("alert")).textContent).toContain("PTT 拒絕回應");
    expect(screen.getByText("reply-article")).toBeTruthy();
  });
});
