// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReplyDelivery, Result } from "@pttzzz/core";
import userEvent from "@testing-library/user-event";
import { Article } from "../Article";

const mocks = vi.hoisted(() => ({ send: vi.fn(), legacy: vi.fn(), reload: vi.fn() }));
vi.mock("../../hooks/usePttActions", () => ({ usePttActions: () => ({ isLoggedIn: true, sendReplyDraft: mocks.send, replyToArticle: mocks.legacy }) }));
vi.mock("../../hooks/useArticle", () => ({ useArticle: () => ({ article: null, partialArticle: null, cachedArticle: null, loading: false, reloading: false, error: null, reload: mocks.reload }) }));
const article = { title: "[測試] 分段", author: "op", date: "09/17", board: "Test", body: "正文", articleNotes: [], revisions: [], score: 0, pushes: [] };
const draft = "很長的回文".repeat(40);
const open = () => fireEvent.keyDown(screen.getByLabelText("文章閱讀區，左方向鍵返回"), { key: "x" });
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.reload.mockResolvedValue(true); });

describe("multipart article replies", () => {
  it("renders intermediate progress while the send remains pending", async () => {
    let reportProgress!: (delivery: ReplyDelivery) => void;
    let finishSend!: (result: Result<ReplyDelivery>) => void;
    mocks.send.mockImplementation((_input, onProgress) => {
      reportProgress = onProgress;
      return new Promise<Result<ReplyDelivery>>((resolve) => { finishSend = resolve; });
    });
    render(<Article boardName="Test" articleIndex={99} onBack={() => {}} currentUser="bob" mockArticle={article} />);
    open();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: draft } });
    await userEvent.click(screen.getByRole("button", { name: "送出" }));
    const delivery: ReplyDelivery = { operationId: mocks.send.mock.calls[0][0].operationId, status: "paused", confirmed: 1, total: 3 };
    act(() => reportProgress(delivery));
    expect(screen.getByRole("status")).toHaveTextContent("1 / 3");
    expect(screen.getByRole("button", { name: "送出中…" })).toBeDisabled();
    expect(screen.getByRole("textbox")).toHaveValue(draft);
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(mocks.reload).not.toHaveBeenCalled();
    await act(async () => finishSend({ ok: true, value: delivery }));
    expect(screen.getByRole("button", { name: "繼續送出" })).toBeEnabled();
  });
  it("keeps a completed draft open until its refresh resolves", async () => {
    let finishRefresh!: (refreshed: boolean) => void;
    mocks.reload.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finishRefresh = resolve; }));
    mocks.send.mockImplementation(async (input) => ({ ok: true, value: { operationId: input.operationId, status: "complete", confirmed: 3, total: 3 } }));
    render(<Article boardName="Test" articleIndex={99} onBack={() => {}} currentUser="bob" mockArticle={article} />);
    open();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: draft } });
    await userEvent.click(screen.getByRole("button", { name: "送出" }));
    expect(mocks.reload).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue(draft);
    expect(screen.getByRole("button", { name: "送出中…" })).toBeDisabled();
    await act(async () => finishRefresh(true));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.send).toHaveBeenCalledOnce();
  });
  it("routes nested replies by stable id and forces neutral", async () => {
    mocks.send.mockImplementation(async (input) => ({ ok: true, value: { operationId: input.operationId, status: "paused", confirmed: 1, total: 2 } }));
    render(<Article boardName="Test" articleIndex={99} onBack={() => {}} currentUser="bob" mockArticle={{ ...article, pushes: [{
      id: "reply:7", author: "alice", content: "回文", type: "neutral", time: "12:00", ipAddresses: [], isOP: false,
      replyTo: null, score: 0, floorNumber: 7, anchorOrder: 7, sourceFloors: [7], pushVoters: [], booVoters: [],
    }] }} />);
    await userEvent.click(screen.getByRole("button", { name: "回覆" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: draft } });
    await userEvent.click(screen.getByRole("button", { name: "送出" }));
    expect(mocks.send.mock.calls[0][0]).toMatchObject({ content: draft, replyId: "reply:7", pushType: "neutral" });
  });
  it("allows a new edited operation only after confirmed zero-send preflight rejection", async () => {
    mocks.send.mockResolvedValueOnce({ ok: false, error: { code: "INVALID", outcome: "not-sent", retryable: true, message: "private diagnostics" } })
      .mockImplementationOnce(async (input) => ({ ok: true, value: { operationId: input.operationId, status: "paused", confirmed: 1, total: 2 } }));
    render(<Article boardName="Test" articleIndex={99} onBack={() => {}} currentUser="bob" mockArticle={article} />);
    open();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: draft } });
    await userEvent.click(screen.getByRole("button", { name: "送出" }));
    expect(screen.getByRole("textbox")).not.toBeDisabled();
    expect(screen.queryByText("private diagnostics")).toBeNull();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "changed" } });
    await userEvent.click(screen.getByRole("button", { name: "送出" }));
    expect(mocks.send.mock.calls[1][0].operationId).not.toBe(mocks.send.mock.calls[0][0].operationId);
    expect(mocks.send.mock.calls[1][0].content).toBe("changed");
  });
  it("preserves the immutable operation across close and resumes only after explicit action", async () => {
    mocks.send.mockImplementationOnce(async (input) => ({ ok: true, value: { operationId: input.operationId, status: "paused", confirmed: 1, total: 3 } }))
      .mockImplementationOnce(async (input) => ({ ok: true, value: { operationId: input.operationId, status: "complete", confirmed: 3, total: 3 } }));
    render(<Article boardName="Test" articleIndex={99} onBack={() => {}} currentUser="bob" mockArticle={article} />);
    open();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: draft } });
    await userEvent.click(screen.getByRole("button", { name: "送出" }));
    expect(await screen.findByRole("button", { name: "繼續送出" })).toBeEnabled();
    expect(screen.getByRole("textbox")).toHaveValue(draft);
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(mocks.reload).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "關閉" }));
    open();
    expect(screen.getByRole("textbox")).toHaveValue(draft);
    await userEvent.click(screen.getByRole("button", { name: "繼續送出" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[1][0]).toEqual({ ...mocks.send.mock.calls[0][0], resume: true });
    expect(mocks.legacy).not.toHaveBeenCalled();
    expect(mocks.reload).toHaveBeenCalledOnce();
  });
  it("keeps uncertain drafts locked after a read refresh and reopening", async () => {
    mocks.send.mockImplementation(async (input) => ({ ok: true, value: { operationId: input.operationId, status: "uncertain", confirmed: 1, total: 3 } }));
    render(<Article boardName="Test" articleIndex={99} onBack={() => {}} currentUser="bob" mockArticle={article} />);
    open();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: draft } });
    await userEvent.click(screen.getByRole("button", { name: "送出" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "送出" })).toBeDisabled());
    await userEvent.click(screen.getByRole("button", { name: "重新整理" }));
    await userEvent.click(screen.getByRole("button", { name: "關閉" }));
    open();
    expect(screen.getByRole("textbox")).toHaveValue(draft);
    expect(screen.getByRole("button", { name: "送出" })).toBeDisabled();
    expect(mocks.send).toHaveBeenCalledOnce();
  });
});
