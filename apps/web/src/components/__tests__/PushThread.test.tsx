// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  DEFAULT_REPLY_SORT,
  PushThread,
  sortTopLevelPushes,
} from "../PushThread";
import type { AggregatedPush } from "../../lib/ptt/uiTypes";

function push(overrides: Partial<AggregatedPush>): AggregatedPush {
  return {
    id: "push-0",
    type: "neutral",
    author: "user",
    content: "",
    time: "",
    ipAddresses: [],
    isOP: false,
    replyTo: null,
    score: 0,
    floorNumber: 0,
    anchorOrder: 0,
    sourceFloors: [],
    pushVoters: [],
    booVoters: [],
    ...overrides,
  };
}

describe("PushThread", () => {
  afterEach(() => {
    cleanup();
  });

  it("sorts top-level replies by time ascending by default", () => {
    const sorted = sortTopLevelPushes(
      [
        push({ id: "new", content: "new", anchorOrder: 30 }),
        push({ id: "old", content: "old", anchorOrder: 10 }),
        push({ id: "mid", content: "mid", anchorOrder: 20 }),
      ],
      DEFAULT_REPLY_SORT,
    );

    expect(sorted.map((item) => item.id)).toEqual(["old", "mid", "new"]);
  });

  it("sorts top-level replies by time descending", () => {
    const sorted = sortTopLevelPushes(
      [
        push({ id: "old", content: "old", anchorOrder: 10 }),
        push({ id: "mid", content: "mid", anchorOrder: 20 }),
        push({ id: "new", content: "new", anchorOrder: 30 }),
      ],
      { key: "time", direction: "desc" },
    );

    expect(sorted.map((item) => item.id)).toEqual(["new", "mid", "old"]);
  });

  it("sorts top-level replies by score with stable time tie-breakers", () => {
    const replies = [
      push({ id: "old-low", content: "old low", score: 1, anchorOrder: 10 }),
      push({ id: "mid-high", content: "mid high", score: 8, anchorOrder: 20 }),
      push({ id: "new-zero", content: "new zero", score: 0, anchorOrder: 30 }),
      push({ id: "new-high", content: "new high", score: 8, anchorOrder: 40 }),
    ];

    expect(
      sortTopLevelPushes(replies, { key: "score", direction: "desc" }).map(
        (item) => item.id,
      ),
    ).toEqual(["mid-high", "new-high", "old-low", "new-zero"]);
    expect(
      sortTopLevelPushes(replies, { key: "score", direction: "asc" }).map(
        (item) => item.id,
      ),
    ).toEqual(["new-zero", "old-low", "mid-high", "new-high"]);
  });

  it("renders nested replies deeper than one level", () => {
    const html = renderToStaticMarkup(
      <PushThread
        score={0}
        pushes={[
          push({
            id: "push-0",
            author: "askz0",
            content: "Ok?",
            anchorOrder: 10,
            sourceFloors: [1],
          }),
          push({
            id: "push-1",
            author: "MBB200291",
            content: "OK",
            replyTo: "push-0",
            anchorOrder: 20,
            sourceFloors: [2],
          }),
          push({
            id: "push-2",
            author: "askz0",
            content: "sure?",
            replyTo: "push-1",
            anchorOrder: 30,
            sourceFloors: [4],
          }),
        ]}
      />,
    );

    expect(html).toContain("Ok?");
    expect(html).toContain("OK");
    expect(html).toContain("sure?");
  });

  it("keeps the raw push badge without duplicating the reply score", () => {
    const html = renderToStaticMarkup(
      <PushThread
        score={0}
        pushes={[
          push({
            id: "push-0",
            type: "push",
            author: "askz0",
            content: "Ok?",
            score: 2,
            anchorOrder: 10,
            sourceFloors: [1],
          }),
          push({
            id: "push-1",
            type: "push",
            author: "MBB200291",
            content: "OK",
            replyTo: "push-0",
            anchorOrder: 20,
            sourceFloors: [2],
          }),
          push({
            id: "push-2",
            type: "push",
            author: "other",
            content: "good",
            replyTo: "push-0",
            anchorOrder: 30,
            sourceFloors: [3],
          }),
        ]}
      />,
    );

    expect(html).toContain(">推</span>");
    expect(html).not.toContain("推 +2");
    expect(html).not.toContain("此回文收到的明確投票分數");
  });

  it("keeps the raw boo badge without duplicating the negative reply score", () => {
    const html = renderToStaticMarkup(
      <PushThread
        score={0}
        pushes={[
          push({
            id: "push-0",
            type: "boo",
            author: "askz0",
            content: "Ok?",
            score: -1,
            anchorOrder: 10,
            sourceFloors: [1],
          }),
        ]}
      />,
    );

    expect(html).toContain(">噓</span>");
    expect(html).not.toContain("噓 -1");
    expect(html).not.toContain("此回文收到的明確投票分數");
  });

  it("shows reply IP address next to the author without hover", () => {
    const html = renderToStaticMarkup(
      <PushThread
        score={0}
        pushes={[
          push({
            id: "push-0",
            author: "askz0",
            content: "Ok?",
            ipAddresses: ["36.237.166.196"],
            anchorOrder: 10,
            sourceFloors: [1],
          }),
        ]}
      />,
    );

    expect(html).toContain("askz0");
    expect(html).toContain("36.237.166.196");
    expect(html).not.toContain("group-hover:block");
  });

  it("renders only the initial visible top-level batch", () => {
    const html = renderToStaticMarkup(
      <PushThread
        score={0}
        initialVisibleTopLevelCount={2}
        pushes={[
          push({ id: "push-0", content: "first", anchorOrder: 10 }),
          push({ id: "push-1", content: "second", anchorOrder: 20 }),
          push({ id: "push-2", content: "third", anchorOrder: 30 }),
        ]}
      />,
    );

    expect(html).toContain("first");
    expect(html).toContain("second");
    expect(html).not.toContain("third");
    expect(html).toContain("已顯示 2 / 3 則第一層回覆");
  });

  it("shows refresh controls when refresh is available", () => {
    const html = renderToStaticMarkup(
      <PushThread score={0} pushes={[]} onRefresh={() => undefined} />,
    );

    expect(html).toContain("重新整理回文");
  });

  it("uses 推噓分 wording for score sorting", () => {
    const html = renderToStaticMarkup(<PushThread score={0} pushes={[]} />);

    expect(html).toContain("推噓分");
    expect(html).not.toContain("推文數");
  });

  it("shows an end-of-thread message when all replies are visible", () => {
    const html = renderToStaticMarkup(
      <PushThread
        score={0}
        pushes={[push({ id: "push-0", content: "only", anchorOrder: 10 })]}
      />,
    );

    expect(html).toContain("沒有新回文");
  });

  it("hides source floors while retaining DOM metadata", () => {
    const html = renderToStaticMarkup(
      <PushThread
        score={0}
        pushes={[
          push({ id: "range", sourceFloors: [1, 2], floorNumber: 1 }),
          push({ id: "interleaved", sourceFloors: [4, 7], floorNumber: 4 }),
        ]}
      />,
    );

    expect(html).toContain('data-reply-id="range"');
    expect(html).toContain('data-reply-id="interleaved"');
    expect(html).not.toContain("1–2F");
    expect(html).not.toContain("4、7F");
  });

  it("hides standalone article votes from the discussion thread", () => {
    const html = renderToStaticMarkup(
      <PushThread
        score={0}
        pushes={[
          push({ id: "article-push", content: "推", anchorOrder: 10, visible: false }),
          push({ id: "article-boo", content: "噓", anchorOrder: 20, visible: false }),
          push({ id: "comment", content: "推 好文", anchorOrder: 30 }),
        ]}
      />,
    );

    expect(html).toContain("推 好文");
    expect(html).toContain("1 則第一層回覆");
    expect(html).not.toContain("2 則第一層回覆");
    expect(html).not.toContain(">推</div>");
    expect(html).not.toContain(">噓</div>");
  });

  it("trusts the projected visibility even when visible content is exactly 推", () => {
    const html = renderToStaticMarkup(
      <PushThread
        score={0}
        pushes={[
          push({ id: "visible-content", content: "推", visible: true }),
          push({ id: "hidden-content", content: "ordinary hidden event", visible: false }),
        ]}
      />,
    );

    expect(html).toContain("visible-content");
    expect(html).not.toContain("ordinary hidden event");
  });

  // ─── Action row tests ────────────────────────────────────────────────────────

  it("renders 回覆 button when onReply is provided", () => {
    render(
      <PushThread
        score={0}
        pushes={[push({ id: "push-0", content: "hello", anchorOrder: 10 })]}
        onReply={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "回覆" })).toBeDefined();
  });

  it("calls onReply with the correct push when 回覆 is clicked", () => {
    const onReply = vi.fn();
    const p = push({ id: "push-0", author: "alice", content: "hello", anchorOrder: 10 });

    render(
      <PushThread
        score={0}
        pushes={[p]}
        onReply={onReply}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "回覆" }));
    expect(onReply).toHaveBeenCalledTimes(1);
    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ id: "push-0", author: "alice" }));
  });

  it("shows push vote buttons with zero counts even when vote state is missing", () => {
    render(
      <PushThread
        score={0}
        pushes={[push({ id: "push-0", content: "hello", anchorOrder: 10 })]}
        onVote={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "推" })).toBeDefined();
    expect(screen.getByRole("button", { name: "噓" })).toBeDefined();
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(2);
  });

  it("disables both vote buttons only for the pending push", () => {
    render(
      <PushThread
        score={0}
        pushes={[
          push({ id: "pending", content: "pending reply", anchorOrder: 10 }),
          push({ id: "ready", content: "ready reply", anchorOrder: 20 }),
        ]}
        onVote={() => {}}
        pendingVoteIds={new Set(["pending"])}
      />,
    );

    const pushButtons = screen.getAllByRole("button", { name: "推" });
    const booButtons = screen.getAllByRole("button", { name: "噓" });
    expect((pushButtons[0] as HTMLButtonElement).disabled).toBe(true);
    expect((booButtons[0] as HTMLButtonElement).disabled).toBe(true);
    expect((pushButtons[1] as HTMLButtonElement).disabled).toBe(false);
    expect((booButtons[1] as HTMLButtonElement).disabled).toBe(false);
  });

  it("derives the current user's vote from push voter lists", () => {
    const onVote = vi.fn();

    render(
      <PushThread
        score={0}
        currentUser="alice"
        pushes={[
          push({
            id: "push-0",
            content: "hello",
            anchorOrder: 10,
            pushVoters: ["alice", "bob"],
            booVoters: ["charlie"],
          }),
        ]}
        onVote={onVote}
      />,
    );

    const pushButton = screen.getByRole("button", { name: "推" });
    const booButton = screen.getByRole("button", { name: "噓" });

    expect(pushButton.getAttribute("aria-pressed")).toBe("true");
    expect(pushButton.textContent).toContain("2");
    expect(booButton.textContent).toContain("1");

    fireEvent.click(pushButton);
    expect(onVote).toHaveBeenLastCalledWith("push-0", 1);

    fireEvent.click(booButton);
    expect(onVote).toHaveBeenLastCalledWith("push-0", -1);
  });

  it("keeps the boo direction when the selected boo button is clicked", () => {
    const onVote = vi.fn();
    render(
      <PushThread
        score={0}
        currentUser="alice"
        pushes={[
          push({
            id: "push-0",
            content: "hello",
            booVoters: ["alice"],
          }),
        ]}
        onVote={onVote}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "噓" }));
    expect(onVote).toHaveBeenCalledWith("push-0", -1);
  });

  it("shows 編輯 button when push.author === currentUser", () => {
    render(
      <PushThread
        score={0}
        pushes={[push({ id: "push-0", author: "alice", content: "hello", anchorOrder: 10 })]}
        currentUser="alice"
        onEdit={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "編輯" })).toBeDefined();
  });

  it("does NOT show 編輯 button when push.author !== currentUser", () => {
    render(
      <PushThread
        score={0}
        pushes={[push({ id: "push-0", author: "alice", content: "hello", anchorOrder: 10 })]}
        currentUser="bob"
        onEdit={() => {}}
      />,
    );

    expect(screen.queryByRole("button", { name: "編輯" })).toBeNull();
  });

  it("shows 編輯歷史 button when editData has history entries", () => {
    const editData = {
      content: "current content",
      history: [
        { time: "2024/01/01", content: "original" },
        { time: "2024/01/02", content: "current content" },
      ],
    };

    render(
      <PushThread
        score={0}
        pushes={[push({ id: "push-0", content: "current content", anchorOrder: 10 })]}
        pushEdits={new Map([["push-0", editData]])}
      />,
    );

    expect(screen.getByRole("button", { name: "編輯歷史" })).toBeDefined();
  });

  it("shows EditHistoryPanel after clicking 編輯歷史, hides after clicking 收起歷史", () => {
    const editData = {
      content: "current content",
      history: [
        { time: "2024/01/01", content: "original" },
        { time: "2024/01/02", content: "current content" },
      ],
    };

    render(
      <PushThread
        score={0}
        pushes={[push({ id: "push-0", content: "current content", anchorOrder: 10 })]}
        pushEdits={new Map([["push-0", editData]])}
      />,
    );

    // Panel history records should not be visible initially (panel is closed)
    expect(screen.queryByText("原始")).toBeNull();

    // Click to show
    fireEvent.click(screen.getByRole("button", { name: "編輯歷史" }));

    // History record badges should now be visible inside the panel
    expect(screen.getByText("原始")).toBeDefined();
    expect(screen.getByText("目前版本")).toBeDefined();
    // Button text should change to 收起歷史
    expect(screen.getByRole("button", { name: "收起歷史" })).toBeDefined();

    // Click to hide using the inline 收起 button inside the panel
    fireEvent.click(screen.getByRole("button", { name: "收起" }));

    // Panel content should be hidden again
    expect(screen.queryByText("原始")).toBeNull();
  });

  it("shows a refresh animation state after clicking 重新整理回文", () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    render(
      <PushThread
        score={0}
        pushes={[push({ id: "push-0", content: "hello", anchorOrder: 10 })]}
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "重新整理回文" }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
    const button = screen.getByRole("button", { name: "更新中..." });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect((button as HTMLButtonElement).disabled).toBe(true);

    vi.runAllTimers();
    vi.useRealTimers();
  });
});
