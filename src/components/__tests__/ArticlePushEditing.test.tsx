// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Article } from "../Article";

const mocks = vi.hoisted(() => ({
  editPush: vi.fn(),
  reload: vi.fn(),
}));

vi.mock("../../hooks/usePttActions", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../hooks/usePttActions")>();
  return {
    ...original,
    usePttActions: () => ({
      isLoggedIn: true,
      editPush: mocks.editPush,
      replyToArticle: vi.fn(),
      votePush: vi.fn(),
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
  title: "[測試] 推文編輯",
  author: "op",
  date: "07/16",
  board: "Test",
  body: "正文",
  articleNotes: [],
  revisions: [],
  score: 0,
  pushes: [
    {
      id: "push-1",
      type: "push" as const,
      author: "alice",
      content: "原推文",
      time: "12:00",
      ipAddresses: [],
      isOP: false,
      replyTo: null,
      score: 0,
      floorNumber: 4,
      anchorOrder: 4,
      sourceFloors: [4, 5],
      pushVoters: [],
      booVoters: [],
    },
  ],
};

afterEach(cleanup);

beforeEach(() => {
  mocks.editPush.mockReset();
  mocks.reload.mockReset();
});

describe("Article push editing", () => {
  it("renders parsed server edit history without local-only state", async () => {
    render(
      <Article
        boardName="Test"
        articleIndex={99}
        onBack={() => {}}
        currentUser="viewer"
        mockArticle={{
          ...article,
          pushes: [{
            ...article.pushes[0],
            content: "更新後推文",
            editHistory: [
              { kind: "original", commandOrder: 0, time: "12:00", content: "原推文", resultContent: "原推文" },
              { kind: "replace", commandOrder: 1, time: "12:05", content: "更新後推文", resultContent: "更新後推文" },
            ],
          }],
        }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "編輯歷史" }));
    expect(screen.getByText("原推文")).toBeTruthy();
    expect(screen.getAllByText("更新後推文").length).toBeGreaterThan(0);
  });

  it("keeps the composer and draft open when sending fails", async () => {
    mocks.editPush.mockResolvedValue({ ok: false, reason: "PTT 拒絕寫入" });
    render(
      <Article
        boardName="Test"
        articleIndex={99}
        onBack={() => {}}
        currentUser="alice"
        mockArticle={article}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "編輯" }));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "修正內容");
    await userEvent.click(screen.getByRole("button", { name: "送出" }));

    expect((await screen.findByRole("alert")).textContent).toContain("PTT 拒絕寫入");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("修正內容");
    expect(mocks.editPush).toHaveBeenCalledWith(
      "補充",
      4,
      5,
      "修正內容",
      "neutral",
      "Test",
    );
  });

  it("closes the composer and reloads after a successful edit", async () => {
    mocks.editPush.mockResolvedValue({ ok: true });
    render(
      <Article
        boardName="Test"
        articleIndex={99}
        onBack={() => {}}
        currentUser="alice"
        mockArticle={article}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "編輯" }));
    await userEvent.click(screen.getByRole("button", { name: "撤回" }));
    await userEvent.click(screen.getByRole("button", { name: "送出" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });
});
