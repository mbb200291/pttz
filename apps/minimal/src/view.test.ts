import { expect, it } from "vitest";
import type { Article, Reply } from "@pttzzz/core";
import { mount, renderArticle } from "./view";
import type { Reader, ReaderState } from "./controller";

const reply: Reply = {
  replyId: "opaque", author: "someone", content: "first  column\n  second", pushType: "push", depth: 0,
  votes: { pushCount: 3, booCount: 1, score: 2 }, score: 999, isOp: true, visible: true,
  edits: [{ kind: "append", author: "someone", content: "edit  text\nnext", resultContent: "" }], children: [],
};
const article: Article = {
  key: { board: "Test", aid: "#EXAMPLE" }, title: "<img src=x onerror=alert(1)>", author: "writer",
  body: "  | A | B |\n  | 1 | 2 |\n<script>bad()</script>", completeness: "final", revision: 1,
  nativePushCount: 8, nativeBooCount: 2, nativeNeutralCount: 0,
  nativeVotes: { pushCount: 8, booCount: 2, score: 6 }, articleVotes: { pushCount: 4, booCount: 1, score: 3 },
  replies: [{ ...reply, children: [{ ...reply, replyId: "child", author: "child", depth: 1 }, { ...reply, replyId: "hidden", author: "hidden", visible: false }] }],
  articleEdits: [{ marker: "※ 編輯", content: "保留  空白\n下一行", sequence: 1 }], revisions: [{ summary: "修改紀錄", sequence: 1 }],
};
it("preserves plain-text body and reply whitespace without interpreting HTML", () => {
  const node = renderArticle(article);
  expect(node.querySelector(".article-body")?.textContent).toBe(article.body);
  expect(node.querySelector(".reply-content")?.textContent).toBe(reply.content);
  expect(node.querySelector("img,script")).toBeNull();
});
it("renders visible nested replies, separate vote domains, and edit records without writes", () => {
  const node = renderArticle(article);
  expect(node.querySelectorAll(".reply")).toHaveLength(2);
  expect(node.querySelector(".reply .reply")).not.toBeNull();
  expect(node.textContent).not.toContain("hidden");
  expect(node.textContent).not.toContain("999");
  expect(node.textContent).toContain("PTT 原生：推 8 / 噓 2 / 分數 6");
  expect(node.textContent).toContain("文章評分：推 4 / 噓 1 / 分數 3");
  expect(node.textContent).toContain("回覆評分：推 3 / 噓 1 / 分數 2");
  expect(node.textContent).toContain("保留  空白\n下一行");
  expect(node.textContent).toContain("修改紀錄");
  expect(node.querySelector("form,textarea,input:not([type=checkbox])")).toBeNull();
  expect(node.querySelector("details > summary")).not.toBeNull();
});

function mountState(state: Partial<ReaderState>) {
  const reader = { state: {
    view: "home", user: "reader", board: "Test", boards: [], articles: [], article: null,
    busy: false, authenticating: false, duplicate: false, ended: false, message: "", error: false, ...state,
  } } as Reader;
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const render = mount(root, reader, false);
  return { reader, root, render };
}
it("updates the empty state when a read fails without changing the list reference", () => {
  const { reader, root, render } = mountState({ busy: true });
  expect(root.querySelector(".workspace")?.textContent).toContain("讀取中");
  reader.state.busy = false;
  reader.state.error = true;
  render();
  expect(root.querySelector(".workspace")?.textContent).not.toContain("讀取中");
});
it("preserves body DOM and keyboard focus between partial and final snapshots", () => {
  const { reader, root, render } = mountState({ view: "article", article: { ...article, completeness: "incomplete" } });
  const body = root.querySelector<HTMLElement>(".article-body")!;
  body.focus();
  reader.state.article = { ...article, revision: 2 };
  render();
  expect(root.querySelector(".article-body")).toBe(body);
  expect(document.activeElement).toBe(body);
  expect(root.querySelector<HTMLDetailsElement>(".article-history")?.hidden).toBe(false);
});
it("renders newly arriving replies before the final snapshot", () => {
  const { reader, root, render } = mountState({ view: "article", article: { ...article, completeness: "incomplete", replies: [] } });
  reader.state.article = { ...article, completeness: "incomplete", revision: 2 };
  render();
  expect(root.querySelector(".reply-content")?.textContent).toBe(reply.content);
  expect(root.querySelector<HTMLDetailsElement>(".article-history")?.hidden).toBe(true);
});
it("shows keep/kick controls only after a duplicate prompt and requires reload after ending", () => {
  const { reader, root, render } = mountState({ view: "login", user: null });
  expect(root.querySelector("fieldset")?.hidden).toBe(true);
  reader.state.duplicate = true;
  render();
  expect(root.querySelector("fieldset")?.hidden).toBe(false);
  reader.state.ended = true;
  render();
  expect(root.querySelector<HTMLFormElement>(".login")?.hidden).toBe(true);
  expect([...root.querySelectorAll("button")].find((button) => button.textContent === "[重新載入並登入]")?.hidden).toBe(false);
});
