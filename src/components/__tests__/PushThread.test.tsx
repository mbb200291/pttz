// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  DEFAULT_REPLY_SORT,
  PushThread,
  sortTopLevelPushes,
} from "../PushThread";
import type { AggregatedPush } from "../../lib/ptt/pushAggregator";

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

  it("shows reply score on the aggregated reply card", () => {
    const html = renderToStaticMarkup(
      <PushThread
        score={0}
        pushes={[
          push({
            id: "push-0",
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

    expect(html).toContain("推 +2");
  });

  it("shows negative reply score as boo count", () => {
    const html = renderToStaticMarkup(
      <PushThread
        score={0}
        pushes={[
          push({
            id: "push-0",
            author: "askz0",
            content: "Ok?",
            score: -1,
            anchorOrder: 10,
            sourceFloors: [1],
          }),
        ]}
      />,
    );

    expect(html).toContain("噓 -1");
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
});
