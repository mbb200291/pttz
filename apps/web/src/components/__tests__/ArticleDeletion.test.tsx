// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Article } from "../Article";

const mocks = vi.hoisted(() => ({
  deleteArticle: vi.fn(),
  reload: vi.fn(),
}));

vi.mock("../../hooks/usePttActions", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../hooks/usePttActions")>();
  return {
    ...original,
    usePttActions: () => ({
      isLoggedIn: true,
      deleteArticle: mocks.deleteArticle,
      editReply: vi.fn(),
      replyToArticle: vi.fn(),
      voteArticle: vi.fn(),
      voteReply: vi.fn(),
    }),
  };
});

vi.mock("../../hooks/useArticle", () => ({
  useArticle: () => ({
    article: null,
    partialArticle: null,
    cachedArticle: null,
    loading: false,
    reloading: false,
    error: null,
    reload: mocks.reload,
  }),
}));

const article = {
  title: "[測試] 可刪除文章",
  author: "alice",
  date: "08/14",
  board: "Test",
  body: "正文",
  articleNotes: [],
  revisions: [],
  score: 0,
  pushes: [],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  mocks.deleteArticle.mockReset();
  mocks.reload.mockReset();
});

describe("Article deletion", () => {
  it("keeps the delete control visible but disables it without permission or a locator", () => {
    const { rerender } = render(
      <Article
        boardName="Test"
        articleIndex={99}
        onBack={() => {}}
        currentUser="ALICE"
        mockArticle={article}
      />,
    );
    expect((screen.getByRole("button", { name: "刪除文章" }) as HTMLButtonElement).disabled).toBe(false);

    rerender(
      <Article
        boardName="Test"
        articleIndex={99}
        onBack={() => {}}
        currentUser="bob"
        mockArticle={article}
      />,
    );
    expect((screen.getByRole("button", { name: "刪除文章" }) as HTMLButtonElement).disabled).toBe(true);

    rerender(
      <Article
        boardName="Test"
        articleIndex={0}
        onBack={() => {}}
        currentUser="alice"
        mockArticle={article}
      />,
    );
    expect((screen.getByRole("button", { name: "刪除文章" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not send a delete when confirmation is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <Article
        boardName="Test"
        articleIndex={99}
        onBack={() => {}}
        currentUser="alice"
        mockArticle={article}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "刪除文章" }));

    expect(mocks.deleteArticle).not.toHaveBeenCalled();
  });

  it("deletes once and returns to the board after success", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.deleteArticle.mockResolvedValue({ ok: true });
    const onBack = vi.fn();
    render(
      <Article
        boardName="Test"
        articleIndex={99}
        onBack={onBack}
        currentUser="alice"
        mockArticle={article}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "刪除文章" }));

    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
    expect(mocks.deleteArticle).toHaveBeenCalledTimes(1);
    expect(mocks.deleteArticle).toHaveBeenCalledWith({
      article: { board: "Test", index: 99 },
    });
  });

  it("blocks repeated deletion while the first request is pending", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let resolveDelete!: (result: unknown) => void;
    mocks.deleteArticle.mockReturnValue(new Promise((resolve) => {
      resolveDelete = resolve;
    }));
    render(
      <Article
        boardName="Test"
        articleIndex={99}
        onBack={() => {}}
        currentUser="alice"
        mockArticle={article}
      />,
    );

    const button = screen.getByRole("button", { name: "刪除文章" });
    await userEvent.click(button);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.textContent).toBe("刪除中…");
    await userEvent.click(button);
    expect(mocks.deleteArticle).toHaveBeenCalledTimes(1);

    resolveDelete({
      ok: false,
      error: { code: "STOP", message: "停止測試", outcome: "not-sent", retryable: false },
    });
    await screen.findByRole("alert");
  });

  it("stays on the article and shows the adapter reason after failure", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.deleteArticle.mockResolvedValue({
      ok: false,
      error: { code: "PTT_REJECTED", message: "PTT 拒絕刪除", outcome: "not-sent", retryable: false },
    });
    const onBack = vi.fn();
    render(
      <Article
        boardName="Test"
        articleIndex={0}
        articleAid="1AbCdEf0"
        onBack={onBack}
        currentUser="alice"
        mockArticle={article}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "刪除文章" }));

    expect((await screen.findByRole("alert")).textContent).toContain("PTT 拒絕刪除");
    expect(onBack).not.toHaveBeenCalled();
    expect(mocks.deleteArticle).toHaveBeenCalledWith({
      article: { board: "Test", aid: "1AbCdEf0" },
    });
  });
});
