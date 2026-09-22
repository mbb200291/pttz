/* @vitest-environment jsdom */
import { expect, it } from "vitest";
import type { Reply } from "@pttzzz/core";
import { renderReplies } from "./replyPresentation";

function reply(overrides: Partial<Reply> = {}): Reply {
  return {
    replyId: "r1", author: "alice", content: "目前內容", pushType: "neutral", depth: 0,
    votes: { pushCount: 2, booCount: 1, score: 1 }, score: 1, isOp: false, visible: true,
    edits: [], children: [], ...overrides,
  };
}

it("does not show history for an unedited reply", () => {
  const tree = renderReplies([reply({ originalVersion: { content: "目前內容" } })], true);

  expect(tree.querySelector("details")).toBeNull();
});

it("keeps a withdrawn parent as a placeholder and renders its children", () => {
  const tree = renderReplies([reply({ replyId: "parent", author: "alice", content: "不應顯示", visible: false,
    children: [reply({ replyId: "child", author: "bob", content: "子回覆" })] })], false);

  const items = tree.querySelectorAll<HTMLElement>(".reply");
  expect(items).toHaveLength(2);
  expect(items[0]?.dataset.replyId).toBe("parent");
  expect(items[0]?.textContent).toContain("此回覆已撤回");
  expect(items[0]?.textContent).not.toContain("不應顯示");
  expect(items[0]?.querySelector(".reply-content")?.textContent).toBe("此回覆已撤回");
  expect(items[1]?.dataset.replyId).toBe("child");
  expect(items[1]?.textContent).toContain("子回覆");
  expect(items[1]?.textContent).toContain("回覆 alice");
  expect(items[1]?.style.marginInlineStart).toBe("12px");
});

it("shows confirmed original and result versions without edit directives", () => {
  const tree = renderReplies([reply({
    content: "第三版", originalVersion: { content: "第一版", createdAt: "2026-09-20 10:00" },
    edits: [
      { kind: "append", author: "alice", content: "append: 第二版", resultContent: "第二版", createdAt: "2026-09-20 11:00" },
      { kind: "replace", author: "alice", content: "replace: 第三版", resultContent: "第三版", createdAt: "2026-09-20 12:00" },
    ],
  })], true);

  const history = tree.querySelector("details");
  expect(history?.textContent).toContain("編輯歷程");
  expect(history?.textContent).toContain("原始版本\n2026-09-20 10:00\n第一版");
  expect(history?.textContent).toContain("第二版");
  expect(history?.textContent).toContain("目前版本\n2026-09-20 12:00\n第三版");
  expect(history?.textContent).not.toContain("append:");
  expect(history?.textContent).not.toContain("replace:");
});

it("renders only confirmed legacy history and keeps malicious reply text literal", () => {
  const legacyEdit = { kind: "replace", author: "alice", content: "replace: 秘密" };
  const tree = renderReplies([reply({ content: "<img src=x onerror=alert(1)>", originalVersion: { content: "<b>原文</b>" },
    edits: [legacyEdit] as unknown as Reply["edits"] })], true);

  expect(tree.querySelector("img")).toBeNull();
  expect(tree.querySelector("b")).toBeNull();
  expect(tree.querySelector(".reply-content")?.textContent).toBe("<img src=x onerror=alert(1)>");
  expect(tree.querySelector("details")?.textContent).toContain("<b>原文</b>");
  expect(tree.querySelector("details")?.textContent).not.toContain("秘密");
});

it("does not expose history before final content or after withdrawal", () => {
  const changed = reply({ originalVersion: { content: "原文" }, edits: [
    { kind: "replace", author: "alice", content: "replace: 機密", resultContent: "更正後" },
  ] });
  expect(renderReplies([changed], false).querySelector("details")).toBeNull();

  const withdrawn = renderReplies([reply({ ...changed, visible: false })], true);
  expect(withdrawn.querySelector("details")).toBeNull();
  expect(withdrawn.textContent).not.toContain("原文");
  expect(withdrawn.textContent).not.toContain("更正後");
});

it("marks withdrawn cards and retains only author and parent context", () => {
  const tree = renderReplies([reply({ replyId: "parent", author: "alice", children: [reply({
    replyId: "withdrawn", author: "bob", pushType: "boo", visible: false,
  })] })], false);

  const withdrawn = tree.querySelector<HTMLElement>("[data-reply-id=withdrawn]")!;
  expect(withdrawn.classList).toContain("reply-withdrawn");
  expect(withdrawn.querySelector("strong")?.textContent).toBe("bob");
  expect(withdrawn.querySelector(".muted")?.textContent).toBe("回覆 alice");
  expect(withdrawn.textContent).not.toContain("噓");
  expect(withdrawn.textContent).not.toContain("推 2");
});

it("uses an explicit current snapshot when the latest legacy edit has no result", () => {
  const legacyEdit = { kind: "replace", author: "alice", content: "replace: 第三版" };
  const tree = renderReplies([reply({ content: "第三版", originalVersion: { content: "第一版" }, edits: [
    { kind: "replace", author: "alice", content: "replace: 第二版", resultContent: "第二版" },
    legacyEdit,
  ] as unknown as Reply["edits"] })], true);

  const history = Array.from(tree.querySelectorAll("details pre")).map(element => element.textContent);
  expect(history).toContain("版本\n第二版");
  expect(history).toContain("目前版本\n第三版");
  expect(history).not.toContain("目前版本\n第二版");
});
