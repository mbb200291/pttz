// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArticleData } from "../../hooks/useArticle";
import { Article } from "../Article";

const mocks = vi.hoisted(() => ({
  votePush: vi.fn(),
  withdrawPushVote: vi.fn(),
  replyToArticle: vi.fn(),
  reload: vi.fn(),
}));

vi.mock("../../hooks/usePttActions", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../hooks/usePttActions")>();
  return {
    ...original,
    usePttActions: () => ({
      isLoggedIn: true,
      votePush: mocks.votePush,
      withdrawPushVote: mocks.withdrawPushVote,
      replyToArticle: mocks.replyToArticle,
      replyToPush: vi.fn(),
      voteArticle: vi.fn(),
      postArticle: vi.fn(),
      editArticle: vi.fn(),
      editPush: vi.fn(),
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

const article: ArticleData = {
  title: "[測試] 回文投票",
  author: "op",
  date: "08/11",
  board: "Test",
  body: "正文",
  articleNotes: [],
  revisions: [],
  score: 0,
  pushes: [
    {
      id: "push-1",
      type: "neutral" as const,
      author: "alice",
      content: "第一則回文",
      time: "12:00",
      ipAddresses: [],
      isOP: false,
      replyTo: null,
      score: 0,
      floorNumber: 1,
      anchorOrder: 1,
      sourceFloors: [1],
      pushVoters: [],
      booVoters: [],
    },
    {
      id: "push-3",
      type: "neutral" as const,
      author: "carol",
      content: "第二則回文",
      time: "12:02",
      ipAddresses: [],
      isOP: false,
      replyTo: null,
      score: 0,
      floorNumber: 3,
      anchorOrder: 3,
      sourceFloors: [3],
      pushVoters: [],
      booVoters: [],
    },
  ],
};

function renderArticle(
  mockArticle = article,
  currentUser = "viewer",
) {
  return render(
    <Article
      boardName="Test"
      articleIndex={99}
      onBack={() => {}}
      currentUser={currentUser}
      mockArticle={mockArticle}
    />,
  );
}

afterEach(cleanup);

beforeEach(() => {
  mocks.votePush.mockReset();
  mocks.withdrawPushVote.mockReset();
  mocks.replyToArticle.mockReset();
  mocks.reload.mockReset().mockResolvedValue(undefined);
});

describe("Article push voting", () => {
  it("disables article push and boo for the article author regardless of ID case", () => {
    renderArticle(article, "OP");

    const pushButton = screen.getAllByRole("button", { name: "推" })[0] as HTMLButtonElement;
    const booButton = screen.getAllByRole("button", { name: "噓" })[0] as HTMLButtonElement;
    expect(pushButton.disabled).toBe(true);
    expect(booButton.disabled).toBe(true);
    expect(screen.getByText("作者本人, 使用 → 加註方式")).toBeTruthy();

    act(() => {
      pushButton.click();
      booButton.click();
    });
    expect(mocks.replyToArticle).not.toHaveBeenCalled();
  });

  it("keeps article voting available for another logged-in user", () => {
    renderArticle(article, "viewer");

    expect((screen.getAllByRole("button", { name: "推" })[0] as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getAllByRole("button", { name: "噓" })[0] as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("作者本人, 使用 → 加註方式")).toBeNull();
  });

  it("limits the article author composer to neutral replies", () => {
    renderArticle(article, "OP");

    act(() => screen.getByRole("button", { name: "回覆此文" }).click());

    const pushButtons = screen.getAllByRole("button", { name: "推" });
    const booButtons = screen.getAllByRole("button", { name: "噓" });
    expect((pushButtons[pushButtons.length - 1] as HTMLButtonElement).disabled).toBe(true);
    expect((booButtons[booButtons.length - 1] as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "→" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getAllByText("作者本人, 使用 → 加註方式")).toHaveLength(2);
  });

  it("keeps all directions available when the article author replies to a floor", () => {
    renderArticle(article, "OP");

    act(() => screen.getAllByRole("button", { name: "回覆" })[0].click());

    const pushButtons = screen.getAllByRole("button", { name: "推" });
    const booButtons = screen.getAllByRole("button", { name: "噓" });
    expect((pushButtons[pushButtons.length - 1] as HTMLButtonElement).disabled).toBe(false);
    expect((booButtons[booButtons.length - 1] as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "→" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it.each([
    ["推", "推1樓 同意"],
    ["→", "回1樓：同意"],
    ["噓", "噓1樓 同意"],
  ] as const)("sends floor reply direction %s as a neutral pattern", async (label, expectedBody) => {
    mocks.replyToArticle.mockResolvedValue({ ok: true });
    renderArticle(article, "OP");

    act(() => screen.getAllByRole("button", { name: "回覆" })[0].click());
    act(() => screen.getAllByRole("button", { name: label }).at(-1)?.click());
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "同意" },
    });
    act(() => screen.getByRole("button", { name: "送出" }).click());

    await waitFor(() =>
      expect(mocks.replyToArticle).toHaveBeenCalledWith(expectedBody, "neutral", "Test"),
    );
  });

  it("reloads and retries once when no reply content was sent", async () => {
    mocks.replyToArticle
      .mockResolvedValueOnce({
        ok: false,
        code: "push-entry-timeout",
        reason: "PTT 未顯示推文方式，請重新載入文章後再試",
      })
      .mockResolvedValueOnce({ ok: true });
    renderArticle();

    act(() => screen.getByRole("button", { name: "回覆此文" }).click());
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "安全重試" },
    });
    act(() => screen.getByRole("button", { name: "送出" }).click());

    await waitFor(() => expect(mocks.replyToArticle).toHaveBeenCalledTimes(2));
    expect(mocks.reload).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("does not retry after reply content may have been sent", async () => {
    mocks.replyToArticle.mockResolvedValue({
      ok: false,
      code: "push-confirm-timeout",
      reason: "無法確認回文是否送出，請重新整理文章檢查",
    });
    renderArticle();

    act(() => screen.getByRole("button", { name: "回覆此文" }).click());
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "不可重送" },
    });
    act(() => screen.getByRole("button", { name: "送出" }).click());

    expect((await screen.findByRole("alert")).textContent).toContain(
      "無法確認回文是否送出，請重新整理文章檢查",
    );
    expect(mocks.replyToArticle).toHaveBeenCalledTimes(1);
    expect(mocks.reload).not.toHaveBeenCalled();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("不可重送");
  });
  it("clicking the selected reply direction sends a withdrawal", async () => {
    mocks.withdrawPushVote.mockResolvedValue({ ok: true });
    renderArticle(
      {
        ...article,
        pushes: [
          {
            ...article.pushes[0],
            pushVoters: ["VIEWER"],
          },
        ],
      },
      "viewer",
    );

    act(() => screen.getAllByRole("button", { name: "推" })[1].click());

    expect(mocks.votePush).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.withdrawPushVote).toHaveBeenCalledWith(1, "push", "Test"),
    );
    expect(screen.getAllByRole("button", { name: "推" })[1].getAttribute("aria-pressed")).toBe("false");
  });

  it("hydrates article vote buttons from parsed application state", () => {
    renderArticle({
      ...article,
      articlePushVoters: ["viewer", "bob"],
      articleBooVoters: ["carol"],
    });

    const pushButton = screen.getAllByRole("button", { name: "推" })[0];
    const booButton = screen.getAllByRole("button", { name: "噓" })[0];
    expect(pushButton.getAttribute("aria-pressed")).toBe("true");
    expect(pushButton.textContent).toContain("2");
    expect(booButton.textContent).toContain("1");
  });

  it("withdraws an article push by sending an inverse pure boo", async () => {
    mocks.replyToArticle.mockResolvedValue({ ok: true });
    renderArticle({ ...article, articlePushVoters: ["viewer"] });

    act(() => screen.getAllByRole("button", { name: "推" })[0].click());

    await waitFor(() =>
      expect(mocks.replyToArticle).toHaveBeenCalledWith("噓", "boo", "Test"),
    );
    expect(screen.getAllByRole("button", { name: "推" })[0].getAttribute("aria-pressed")).toBe("false");
  });

  it("moves the current user from push to boo after switching direction", async () => {
    mocks.votePush.mockResolvedValue({ ok: true });
    renderArticle(
      {
        ...article,
        pushes: [
          {
            ...article.pushes[0],
            pushVoters: ["VIEWER"],
          },
        ],
      },
      "viewer",
    );

    act(() => screen.getAllByRole("button", { name: "噓" })[1].click());

    await waitFor(() => expect(mocks.votePush).toHaveBeenCalledTimes(1));
    const pushButton = screen.getAllByRole("button", { name: "推" })[1];
    const booButton = screen.getAllByRole("button", { name: "噓" })[1];
    expect(pushButton.textContent).toContain("0");
    expect(booButton.textContent).toContain("1");
    expect(pushButton.getAttribute("aria-pressed")).toBe("false");
    expect(booButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("reconciles an optimistic vote after refreshed article data confirms it", async () => {
    mocks.votePush.mockResolvedValue({ ok: true });
    const view = renderArticle();

    act(() => screen.getAllByRole("button", { name: "推" })[1].click());
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "推" })[1].textContent).toContain("1"),
    );

    const confirmedArticle = {
      ...article,
      pushes: [
        { ...article.pushes[0], pushVoters: ["viewer"] },
        article.pushes[1],
      ],
    };
    view.rerender(
      <Article
        boardName="Test"
        articleIndex={99}
        onBack={() => {}}
        currentUser="viewer"
        mockArticle={confirmedArticle}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "推" })[1].getAttribute("aria-pressed"),
      ).toBe("true"),
    );

    view.rerender(
      <Article
        boardName="Test"
        articleIndex={99}
        onBack={() => {}}
        currentUser="viewer"
        mockArticle={{
          ...confirmedArticle,
          pushes: [
            { ...confirmedArticle.pushes[0], pushVoters: ["viewer", "bob"] },
            confirmedArticle.pushes[1],
          ],
        }}
      />,
    );

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "推" })[1].textContent).toContain("2"),
    );
  });

  it("sends only one vote for rapid clicks on the same reply", async () => {
    let resolveVote!: (result: { ok: boolean }) => void;
    mocks.votePush.mockReturnValue(
      new Promise((resolve) => {
        resolveVote = resolve;
      }),
    );
    renderArticle();

    const pushButton = screen.getAllByRole("button", { name: "推" })[1];
    const booButton = screen.getAllByRole("button", { name: "噓" })[1];

    act(() => {
      pushButton.click();
      pushButton.click();
    });

    expect(mocks.votePush).toHaveBeenCalledTimes(1);
    expect(mocks.votePush).toHaveBeenCalledWith(1, "push", "Test");
    expect((pushButton as HTMLButtonElement).disabled).toBe(true);
    expect((booButton as HTMLButtonElement).disabled).toBe(true);

    resolveVote({ ok: true });
    await waitFor(() =>
      expect((pushButton as HTMLButtonElement).disabled).toBe(false),
    );
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });

  it("shows a reply vote immediately while the request is pending", () => {
    mocks.votePush.mockReturnValue(new Promise(() => {}));
    renderArticle();
    const pushButton = screen.getAllByRole("button", { name: "推" })[1];

    act(() => pushButton.click());

    expect(pushButton.getAttribute("aria-pressed")).toBe("true");
    expect(pushButton.textContent).toContain("1");
    expect((pushButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("rolls back a failed reply vote and displays the reason", async () => {
    mocks.votePush.mockResolvedValue({
      ok: false,
      reason: "PTT 拒絕寫入",
    });
    renderArticle();
    const pushButton = screen.getAllByRole("button", { name: "推" })[1];

    act(() => pushButton.click());
    expect(pushButton.getAttribute("aria-pressed")).toBe("true");

    expect((await screen.findByRole("alert")).textContent).toContain("PTT 拒絕寫入");
    expect(pushButton.getAttribute("aria-pressed")).toBe("false");
    expect(pushButton.textContent).toContain("0");
    expect((pushButton as HTMLButtonElement).disabled).toBe(false);

    act(() => pushButton.click());
    await waitFor(() => expect(mocks.votePush).toHaveBeenCalledTimes(2));
    expect(mocks.reload).not.toHaveBeenCalled();
  });

  it("allows votes for different replies while one is pending", () => {
    mocks.votePush.mockReturnValue(new Promise(() => {}));
    renderArticle();
    const pushButtons = screen.getAllByRole("button", { name: "推" });

    act(() => {
      pushButtons[1].click();
      pushButtons[2].click();
    });

    expect(mocks.votePush).toHaveBeenCalledTimes(2);
    expect(mocks.votePush).toHaveBeenNthCalledWith(1, 1, "push", "Test");
    expect(mocks.votePush).toHaveBeenNthCalledWith(2, 3, "push", "Test");
  });
});
