// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Article } from "../Article";

vi.mock("../../hooks/usePttActions", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../hooks/usePttActions")>();
  return {
    ...original,
    usePttActions: () => ({
      isLoggedIn: true,
      deleteArticle: vi.fn(),
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
    reload: vi.fn(),
  }),
}));

const article = {
  title: "[測試] 文章動作",
  author: "alice",
  date: "08/19",
  board: "Test",
  body: "正文",
  articleNotes: [],
  revisions: [],
  score: 0,
  pushes: [],
};

afterEach(cleanup);

describe("Article actions", () => {
  it("shows the three header actions and invokes edit and board reply for the author", async () => {
    const onEditArticle = vi.fn();
    const onReplyToBoard = vi.fn();
    render(
      <Article
        boardName="Test"
        articleIndex={99}
        onBack={() => {}}
        currentUser="ALICE"
        mockArticle={article}
        onEditArticle={onEditArticle}
        onReplyToBoard={onReplyToBoard}
      />,
    );

    const deleteButton = screen.getByRole("button", { name: "刪除文章" }) as HTMLButtonElement;
    const editButton = screen.getByRole("button", { name: "編輯文章" }) as HTMLButtonElement;
    const replyButton = screen.getByRole("button", { name: "回應至看板" }) as HTMLButtonElement;
    expect(deleteButton.disabled).toBe(false);
    expect(editButton.disabled).toBe(false);
    expect(replyButton.disabled).toBe(false);
    expect(screen.queryByRole("button", { name: /^回文$/u })).toBeNull();
    expect(screen.getByRole("button", { name: "回覆此文" })).toBeTruthy();

    await userEvent.click(editButton);
    await userEvent.click(replyButton);
    expect(onEditArticle).toHaveBeenCalledWith(article);
    expect(onReplyToBoard).toHaveBeenCalledWith(article);
  });

  it("keeps owner actions visible but disabled for another user", () => {
    render(
      <Article
        boardName="Test"
        articleIndex={99}
        onBack={() => {}}
        currentUser="bob"
        mockArticle={article}
        onEditArticle={() => {}}
        onReplyToBoard={() => {}}
      />,
    );

    expect((screen.getByRole("button", { name: "刪除文章" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "編輯文章" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "回應至看板" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
