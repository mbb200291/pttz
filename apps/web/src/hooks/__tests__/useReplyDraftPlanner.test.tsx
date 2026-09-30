// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReplyDraftPlanner, Result } from "@pttzzz/core";
import { useReplyDraftPlanner } from "../useReplyDraftPlanner";

afterEach(cleanup);
const planner: ReplyDraftPlanner = { plan: () => ({ ok: true, value: { total: 1, capacity: 55 } }) };
it("does not offer retry for a missing preparation capability", async () => {
  const { result } = renderHook(() => useReplyDraftPlanner({ article: { board: "A", index: 1 } }));
  await waitFor(() => expect(result.current.state).toMatchObject({ status: "error", error: { code: "UNSUPPORTED", retryable: false } }));
});
it("discards an old article preparation and retains the newer planner", async () => {
  let resolveA!: (value: Result<ReplyDraftPlanner>) => void;
  const prepare = vi.fn(async ({ article }: { article: { board: string } }): Promise<Result<ReplyDraftPlanner>> =>
    article.board === "A" ? new Promise(resolve => { resolveA = resolve; }) : { ok: true, value: planner });
  const { result, rerender } = renderHook(({ board }) => useReplyDraftPlanner({ article: { board, index: 1 } }, prepare), { initialProps: { board: "A" } });
  rerender({ board: "B" });
  await waitFor(() => expect(result.current.state.status).toBe("ready"));
  await act(async () => resolveA({ ok: false, error: { code: "OLD", message: "old", retryable: true } }));
  expect(result.current.state).toEqual({ status: "ready", planner });
  expect(prepare).toHaveBeenCalledTimes(2);
});
it("can retry a rejected preparation without retrying a write", async () => {
  const prepare = vi.fn().mockRejectedValueOnce(new Error("private")).mockResolvedValueOnce({ ok: true, value: planner });
  const { result } = renderHook(() => useReplyDraftPlanner({ article: { board: "A", index: 1 } }, prepare));
  await waitFor(() => expect(result.current.state.status).toBe("error"));
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.state.status).toBe("ready"));
  expect(prepare).toHaveBeenCalledTimes(2);
});
