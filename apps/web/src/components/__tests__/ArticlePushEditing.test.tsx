// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Article } from "../Article";

const mocks = vi.hoisted(() => ({
  editReply: vi.fn(),
  withdrawReply: vi.fn(),
  reload: vi.fn(),
}));

vi.mock("../../hooks/usePttActions", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../hooks/usePttActions")>();
  return {
    ...original,
    usePttActions: () => ({
      isLoggedIn: true,
      editReply: mocks.editReply,
      withdrawReply: mocks.withdrawReply,
      replyToArticle: vi.fn(),
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
  mocks.editReply.mockReset();
  mocks.withdrawReply.mockReset();
  mocks.reload.mockReset();
});

describe("Article push editing", () => {
  it("sends a structured half-open section edit without exposing control syntax", async () => {
    mocks.editReply.mockResolvedValue({ ok: true, value: undefined });
    mocks.reload.mockResolvedValue(true);
    render(<Article boardName="Test" articleIndex={99} onBack={() => {}} currentUser="alice" mockArticle={article} />);

    await userEvent.click(screen.getByRole("button", { name: "編輯" }));
    await userEvent.click(screen.getByRole("button", { name: "區段" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "區段起點" }), { target: { value: "1" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "區段終點" }), { target: { value: "2" } });
    await userEvent.type(screen.getByRole("textbox"), "新");
    await userEvent.click(screen.getByRole("button", { name: "送出" }));

    expect(mocks.editReply).toHaveBeenCalledWith({
      article: { board: "Test", index: 99 },
      replyId: "push-1",
      mode: "section",
      changes: [{ start: 1, end: 2, replacement: "新" }],
    });
  });

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
    mocks.editReply.mockResolvedValue({
      ok: false,
      error: { code: "PTT_REJECTED", message: "PTT 拒絕寫入", outcome: "not-sent", retryable: false },
    });
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
    expect(mocks.editReply).toHaveBeenCalledWith({
      article: { board: "Test", index: 99 },
      replyId: "push-1",
      mode: "append",
      content: "修正內容",
    });
    await userEvent.click(screen.getByRole("button", { name: "送出" }));
    expect(mocks.editReply).toHaveBeenCalledTimes(1);
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "另一個修正");
    await userEvent.click(screen.getByRole("button", { name: "送出" }));
    expect(mocks.editReply).toHaveBeenCalledTimes(2);
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "修正內容");
    expect((screen.getByRole("button", { name: "送出" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.editReply).toHaveBeenCalledTimes(2);
  });

  it("keeps a failed withdrawal locked when irrelevant draft fields change", async () => {
    mocks.withdrawReply.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "無法確認", outcome: "uncertain", retryable: false },
    });
    render(<Article boardName="Test" articleIndex={99} onBack={() => {}} currentUser="alice" mockArticle={article} />);

    await userEvent.click(screen.getByRole("button", { name: "編輯" }));
    await userEvent.click(screen.getByRole("button", { name: "撤回" }));
    await userEvent.click(screen.getByRole("button", { name: "送出" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    const textarea = screen.getByRole("textbox");
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "不影響撤回 DTO");
    expect((screen.getByRole("button", { name: "送出" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.withdrawReply).toHaveBeenCalledTimes(1);
  });

  it("closes the composer and reloads after a successful edit", async () => {
    mocks.withdrawReply.mockResolvedValue({ ok: true, value: undefined });
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
    expect(mocks.withdrawReply).toHaveBeenCalledWith({
      article: { board: "Test", index: 99 }, replyId: "push-1",
    });
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });

  it("sends an in-flight edit only once", async () => {
    mocks.editReply.mockReturnValue(new Promise(() => {}));
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
    const submit = screen.getByRole("button", { name: "送出" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(mocks.editReply).toHaveBeenCalledTimes(1);
  });
});
