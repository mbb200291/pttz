// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArticleData } from "../../hooks/useArticle";
import { Article } from "../Article";

const mocks = vi.hoisted(() => ({
  voteReply: vi.fn(),
  withdrawReplyVote: vi.fn(),
  voteArticle: vi.fn(),
  withdrawArticleVote: vi.fn(),
  replyToReply: vi.fn(),
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
      voteReply: mocks.voteReply,
      withdrawReplyVote: mocks.withdrawReplyVote,
      voteArticle: mocks.voteArticle,
      withdrawArticleVote: mocks.withdrawArticleVote,
      replyToReply: mocks.replyToReply,
      replyToArticle: mocks.replyToArticle,
      createArticle: vi.fn(),
      editArticle: vi.fn(),
      editReply: vi.fn(),
      withdrawReply: vi.fn(),
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
  mocks.voteReply.mockReset();
  mocks.withdrawReplyVote.mockReset();
  mocks.voteArticle.mockReset();
  mocks.withdrawArticleVote.mockReset();
  mocks.replyToReply.mockReset();
  mocks.replyToArticle.mockReset();
  mocks.reload.mockReset().mockResolvedValue(true);
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
    expect(screen.getByText("作者本人, 使用 → 加註方式").style.visibility).toBe("hidden");
  });

  it("renders authoritative article and reply vote totals from the core model", () => {
    renderArticle({
      ...article,
      nativeVotes: { pushCount: 8, booCount: 3, score: 5 },
      articleVotes: { pushCount: 5, booCount: 2, score: 3, viewerVote: "boo" },
      pushes: [{
        ...article.pushes[0],
        votes: { pushCount: 6, booCount: 4, score: 2, viewerVote: "push" },
      }],
    });

    expect(screen.queryByText("PTT 原生推")).toBeNull();
    expect(screen.queryByText("PTT 原生噓")).toBeNull();
    const toolbar=screen.getByRole("group", {name:"文章推噓與回覆"});
    expect(toolbar.contains(screen.getByLabelText("聚合後回覆 1"))).toBe(true);
    expect(toolbar.contains(screen.getByRole("button",{name:"回覆此文"}))).toBe(true);
    const pushButtons = screen.getAllByRole("button", { name: "推" });
    const booButtons = screen.getAllByRole("button", { name: "噓" });
    expect(pushButtons[0].textContent).toContain("5");
    expect(booButtons[0].textContent).toContain("2");
    expect(toolbar.contains(pushButtons[0])).toBe(true);
    expect(toolbar.contains(booButtons[0])).toBe(true);
    expect(pushButtons[1].textContent).toContain("6");
    expect(booButtons[1].textContent).toContain("4");
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

  it.each(["OP", "viewer"])("sends floor replies as neutral for %s through the stable replyId", async (user) => {
    mocks.replyToReply.mockResolvedValue({ ok: true, value: undefined });
    renderArticle(article, user);
    act(() => screen.getAllByRole("button", { name: "回覆" })[0].click());
    const dialog = screen.getByRole("dialog");
    for (const label of ["推", "→", "噓"]) {
      expect(Array.from(dialog.querySelectorAll("button")).some((button) => button.textContent === label)).toBe(false);
    }
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "同意" } });
    act(() => screen.getByRole("button", { name: "送出" }).click());
    await waitFor(() => expect(mocks.replyToReply).toHaveBeenCalledWith({
      article: { board: "Test", index: 99 }, replyId: "push-1", content: "同意", pushType: "neutral",
    }));
  });

  it("does not automatically retry a not-sent article reply", async () => {
    mocks.replyToArticle.mockResolvedValue({
      ok: false,
      error: { code: "PTT_REJECTED", message: "PTT 拒絕回文", outcome: "not-sent", retryable: true },
    });
    renderArticle();

    act(() => screen.getByRole("button", { name: "回覆此文" }).click());
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "安全重試" },
    });
    act(() => screen.getByRole("button", { name: "送出" }).click());

    expect((await screen.findByRole("alert")).textContent).toContain("PTT 拒絕回文");
    expect(mocks.replyToArticle).toHaveBeenCalledTimes(1);
    act(() => screen.getByRole("button", { name: "送出" }).click());
    await waitFor(() => expect(mocks.replyToArticle).toHaveBeenCalledTimes(2));
    expect(mocks.reload).not.toHaveBeenCalled();
  });

  it.each(["uncertain", "sent"])("refreshes then closes a %s reply without a warning or duplicate send", async (outcome) => {
    mocks.replyToArticle.mockResolvedValue({
      ok: false, error: { code: "push-confirm-timeout", message: "無法確認回文是否送出", outcome, retryable: false },
    });
    let finishReload!: (value: boolean) => void;
    mocks.reload.mockReturnValue(new Promise<boolean>((resolve) => { finishReload = resolve; }));
    renderArticle();
    act(() => screen.getByRole("button", { name: "回覆此文" }).click());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "不可重送" } });
    act(() => screen.getByRole("button", { name: "送出" }).click());
    await waitFor(() => expect(mocks.reload).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("尚未同步")).toBeNull();
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(mocks.replyToArticle).toHaveBeenCalledTimes(1);
    await act(async () => finishReload(true));
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
    act(() => screen.getByRole("button", { name: "回覆此文" }).click());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "不可重送" } });
    expect((screen.getByRole("button", { name: "送出" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.replyToArticle).toHaveBeenCalledTimes(1);
  });
  it("closes after an unsuccessful refresh without retrying the floor reply", async () => {
    mocks.replyToReply.mockResolvedValue({
      ok: false, error: { code: "push-confirm-timeout", message: "unknown", outcome: "uncertain", retryable: false },
    });
    mocks.reload.mockResolvedValue(false);
    renderArticle();
    act(() => screen.getAllByRole("button", { name: "回覆" })[0].click());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "TEST" } });
    act(() => screen.getByRole("button", { name: "送出" }).click());
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
    expect(mocks.reload).toHaveBeenCalledTimes(1);
    expect(mocks.replyToReply).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("尚未同步")).toBeNull();
  });
  it("clicking the selected reply direction sends a withdrawal", async () => {
    mocks.withdrawReplyVote.mockResolvedValue({ ok: true, value: undefined });
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

    expect(mocks.voteReply).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.withdrawReplyVote).toHaveBeenCalledWith({
        article: { board: "Test", index: 99 }, replyId: "push-1", direction: "push",
      }),
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

  it("withdraws an article push through the public article action", async () => {
    mocks.withdrawArticleVote.mockResolvedValue({ ok: true, value: undefined });
    renderArticle({ ...article, articlePushVoters: ["viewer"] });

    act(() => screen.getAllByRole("button", { name: "推" })[0].click());

    await waitFor(() =>
      expect(mocks.withdrawArticleVote).toHaveBeenCalledWith({
        article: { board: "Test", index: 99 }, direction: "push",
      }),
    );
    expect(screen.getAllByRole("button", { name: "推" })[0].getAttribute("aria-pressed")).toBe("false");
  });

  it("moves the current user from push to boo after switching direction", async () => {
    mocks.voteReply.mockResolvedValue({ ok: true, value: undefined });
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

    await waitFor(() => expect(mocks.voteReply).toHaveBeenCalledTimes(1));
    const pushButton = screen.getAllByRole("button", { name: "推" })[1];
    const booButton = screen.getAllByRole("button", { name: "噓" })[1];
    expect(pushButton.textContent).toContain("0");
    expect(booButton.textContent).toContain("1");
    expect(pushButton.getAttribute("aria-pressed")).toBe("false");
    expect(booButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("reconciles an optimistic vote after refreshed article data confirms it", async () => {
    mocks.voteReply.mockResolvedValue({ ok: true, value: undefined });
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
    mocks.voteReply.mockReturnValue(
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

    expect(mocks.voteReply).toHaveBeenCalledTimes(1);
    expect(mocks.voteReply).toHaveBeenCalledWith({
      article: { board: "Test", index: 99 }, replyId: "push-1", direction: "push",
    });
    expect((pushButton as HTMLButtonElement).disabled).toBe(true);
    expect((booButton as HTMLButtonElement).disabled).toBe(true);

    resolveVote({ ok: true });
    await waitFor(() =>
      expect((pushButton as HTMLButtonElement).disabled).toBe(false),
    );
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });

  it("shows a reply vote immediately while the request is pending", () => {
    mocks.voteReply.mockReturnValue(new Promise(() => {}));
    renderArticle();
    const pushButton = screen.getAllByRole("button", { name: "推" })[1];

    act(() => pushButton.click());

    expect(pushButton.getAttribute("aria-pressed")).toBe("true");
    expect(pushButton.textContent).toContain("1");
    expect((pushButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("rolls back a failed reply vote and displays the reason", async () => {
    mocks.voteReply.mockResolvedValue({
      ok: false,
      error: { code: "PTT_REJECTED", message: "PTT 拒絕寫入", outcome: "not-sent", retryable: false },
    });
    renderArticle();
    const pushButton = screen.getAllByRole("button", { name: "推" })[1];

    act(() => pushButton.click());
    expect(pushButton.getAttribute("aria-pressed")).toBe("true");

    expect((await screen.findByRole("alert")).textContent).toContain("PTT 拒絕寫入");
    expect(pushButton.getAttribute("aria-pressed")).toBe("false");
    expect(pushButton.textContent).toContain("0");
    expect((pushButton as HTMLButtonElement).disabled).toBe(true);

    act(() => pushButton.click());
    expect(mocks.voteReply).toHaveBeenCalledTimes(1);
    expect(mocks.reload).not.toHaveBeenCalled();
  });

  it("keeps unsafe vote locks after failed refresh and clears them after confirmed refresh", async () => {
    mocks.voteReply.mockResolvedValue({
      ok: false,
      error: { code: "PTT_REJECTED", message: "拒絕", outcome: "not-sent", retryable: false },
    });
    mocks.reload.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    renderArticle();
    const pushButton = screen.getAllByRole("button", { name: "推" })[1] as HTMLButtonElement;

    act(() => pushButton.click());
    await waitFor(() => expect(pushButton.disabled).toBe(true));
    act(() => screen.getByRole("button", { name: "重新整理回文" }).click());
    await waitFor(() => expect(screen.getByRole("button", { name: "重新整理回文" })).toBeTruthy());
    expect(pushButton.disabled).toBe(true);

    act(() => screen.getByRole("button", { name: "重新整理回文" }).click());
    await waitFor(() => expect(pushButton.disabled).toBe(false));
  });

  it("locks a stale reply independently and also locks an uncertain reply", async () => {
    mocks.voteReply
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "REPLY_NOT_FOUND",
          message: "找不到回文，請重新載入文章",
          outcome: "not-sent",
          retryable: false,
        },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "GATEWAY_FAILURE",
          message: "連線在確認前中斷",
          outcome: "uncertain",
          retryable: false,
        },
      });
    renderArticle();
    const pushButtons = screen.getAllByRole("button", { name: "推" });

    act(() => pushButtons[1].click());
    expect((await screen.findByRole("alert")).textContent).toContain("找不到回文");
    act(() => pushButtons[1].click());
    expect(mocks.voteReply).toHaveBeenCalledTimes(1);

    act(() => pushButtons[2].click());
    expect((await screen.findByRole("status")).textContent).toContain("尚未同步");
    expect(screen.getByRole("button", { name: "重新整理" })).toBeTruthy();
    expect(mocks.voteReply).toHaveBeenCalledTimes(2);
    act(() => pushButtons[2].click());
    expect(mocks.voteReply).toHaveBeenCalledTimes(2);
    expect(mocks.reload).not.toHaveBeenCalled();
  });

  it("allows votes for different replies while one is pending", () => {
    mocks.voteReply.mockReturnValue(new Promise(() => {}));
    renderArticle();
    const pushButtons = screen.getAllByRole("button", { name: "推" });

    act(() => {
      pushButtons[1].click();
      pushButtons[2].click();
    });

    expect(mocks.voteReply).toHaveBeenCalledTimes(2);
    expect(mocks.voteReply).toHaveBeenNthCalledWith(1, {
      article: { board: "Test", index: 99 }, replyId: "push-1", direction: "push",
    });
    expect(mocks.voteReply).toHaveBeenNthCalledWith(2, {
      article: { board: "Test", index: 99 }, replyId: "push-3", direction: "push",
    });
  });
});
