import { expect, it, vi } from "vitest";
import type { Article, Reply } from "@pttzzz/core";
import { mount, renderArticle } from "./view";
import type { Reader, ReaderState } from "./controller";
import { Reader as RealReader } from "./controller";
import { ok, type PttzzzClient } from "@pttzzz/core";

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
  expect(node.querySelectorAll(".reply")).toHaveLength(3);
  expect(node.querySelector(".reply .reply")).not.toBeNull();
  expect(node.querySelector('[data-reply-id="hidden"] > .withdrawn')?.textContent).toBe("此回文已撤回");
  expect(node.textContent).not.toContain("999");
  expect(node.textContent).not.toContain("PTT 原生");
  expect(node.querySelector(".native-votes")).toBeNull();
  expect(node.textContent).toContain("文章評分：推 4 / 噓 1 / 分數 3");
  expect(node.querySelector(".reply-meta .reply-votes")?.textContent).toBe("推 3 / 噓 1 / -> 2");
  expect(node.textContent).not.toContain("回覆評分：");
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
it("restores the opened article button and board scroll after returning without a read", async () => {
  const second = { ...article, key: { board: "Test", index: 2 }, title: "Second page" };
  const client = {
    subscribe: () => () => {},
    listArticles: vi.fn().mockResolvedValueOnce(ok({ items: [article], nextCursor: "second" }))
      .mockResolvedValueOnce(ok({ items: [second], nextCursor: "third" })),
    getArticle: vi.fn(async () => ok(second)),
  };
  let render = () => {};
  const reader = new RealReader(client as unknown as PttzzzClient, () => render());
  reader.state.user = "preview";
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  render = mount(root, reader, true);
  await reader.openBoard("Test");
  await reader.moreArticles();
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(window, "scrollX", "get").mockReturnValue(12);
  const scrollY = vi.spyOn(window, "scrollY", "get").mockReturnValue(640);
  try {
    const opened = root.querySelectorAll<HTMLButtonElement>("[data-article-id]")[1];
    const id = opened.dataset.articleId;
    opened.focus();
    opened.click();
    await Promise.resolve();
    scrollY.mockReturnValue(80);
    [...root.querySelectorAll("button")].find((item) => item.textContent === "回看板")!.click();
    expect(reader.state.view).toBe("board");
    expect(client.listArticles).toHaveBeenCalledTimes(2);
    expect((document.activeElement as HTMLElement).dataset.articleId).toBe(id);
    expect(scroll).toHaveBeenLastCalledWith({ left: 12, top: 640, behavior: "instant" });
    expect(root.querySelectorAll("[data-article-id]")).toHaveLength(2);
    scroll.mockClear();
    render();
    expect(scroll).not.toHaveBeenCalled();
  } finally { vi.restoreAllMocks(); }
});
it.each([true, false])("only displays a rejected article read while it is current (returned=%s)", async (returned) => {
  let reject!: (error: Error) => void;
  const pending = new Promise<never>((_, fail) => { reject = fail; });
  const client = { subscribe: () => () => {}, listArticles: async () => ok({ items: [article] }), getArticle: () => pending };
  let render = () => {};
  const reader = new RealReader(client as unknown as PttzzzClient, () => render());
  reader.state.user = "preview";
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  render = mount(root, reader, true);
  await reader.openBoard("Test");
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  try {
    root.querySelector<HTMLButtonElement>("[data-article-id]")!.click();
    if (returned) reader.returnToBoard();
    const before = root.querySelector(".status")!.textContent;
    reject(new Error("late transport failure"));
    await vi.waitFor(() => {
      expect(root.querySelector(".status")!.textContent).toBe(returned ? before : "操作失敗：late transport failure");
    });
    await Promise.resolve();
    expect(root.querySelector(".status")!.textContent).toBe(returned ? before : "操作失敗：late transport failure");
  } finally { scroll.mockRestore(); }
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
  expect([...root.querySelectorAll("button")].find((button) => button.textContent === "重新登入")?.hidden).toBe(false);
});

it("keeps withdrawn parents as empty anchors without exposing their history", () => {
  const node = renderArticle({ ...article, replies: [{ ...reply, visible: false,
    originalVersion: { content: "secret original" }, children: [{ ...reply, replyId: "nested", author: "child" }] }] });
  expect(node.querySelectorAll(".reply")).toHaveLength(2);
  expect(node.querySelector(".reply > .withdrawn")?.textContent).toBe("此回文已撤回");
  expect(node.querySelector(".reply > .replies .reply-content")?.textContent).toBe(reply.content);
  expect(node.textContent).not.toContain("secret original");
  expect(node.querySelector(".reply")!.querySelector(":scope > details")).toBeNull();
});

it("shows the original and complete edited versions rather than patch instructions", () => {
  const node = renderArticle({ ...article, replies: [{ ...reply, originalVersion: { content: "♥♥♥♥♥" },
    edits: [{ kind: "replace", author: "someone", content: "^1:4=♡♥♡", resultContent: "♥♡♥♡♥" }] }] });
  const history = node.querySelector(".reply details")!;
  expect(history.textContent).toContain("原始版本");
  expect(history.textContent).toContain("♥♥♥♥♥");
  expect(history.textContent).toContain("♥♡♥♡♥");
  expect(history.textContent).not.toContain("^1:4=");
});

it("renders ANSI colors safely and updates styles even when the text is unchanged", () => {
  const { reader, root, render } = mountState({ view: "article", article: { ...article,
    completeness: "incomplete", body: "\x1b[31m  <img>\x1b[0m\nnext" } });
  const body = root.querySelector<HTMLElement>(".article-body")!;
  expect(body.textContent).toBe("  <img>\nnext");
  expect(body.querySelector("img")).toBeNull();
  const color = body.querySelector("span")?.style.color;
  expect(color).toBeTruthy();
  body.focus();
  reader.state.article = { ...article, revision: 2, body: "\x1b[32m  <img>\x1b[0m\nnext" };
  render();
  expect(root.querySelector(".article-body")).toBe(body);
  expect(document.activeElement).toBe(body);
  expect(body.querySelector("span")?.style.color).not.toBe(color);
});

it("disables deleted article rows", () => {
  const { root } = mountState({ view: "board", articles: [{ ...article, author: "-", title: "(本文已被刪除) [someone]" }] });
  expect(root.querySelector<HTMLButtonElement>("[data-article-id]")?.disabled).toBe(true);
});

it("places reply votes in the metadata row before the body", () => {
  const element = renderArticle(article);
  expect(element.querySelector(".reply-meta .reply-votes")?.textContent).toBe("推 3 / 噓 1 / -> 2");
});

it("shows a retry action instead of an endless loading title after incomplete reading", () => {
  const { root, reader, render } = mountState({ view: "article", busy: false, error: true,
    article: { key: article.key, completeness: "incomplete", revision: 1, body: "已讀取部分", replies: [] } });
  reader.openArticle = vi.fn(async () => {});
  render();
  expect(root.textContent).not.toContain("文章整理中…");
  const retry = [...root.querySelectorAll("button")].find(item => item.textContent === "重新載入文章");
  expect(retry).toBeDefined();
  retry!.click();
  expect(reader.openArticle).toHaveBeenCalledWith(article.key);
});

it("allows retry when reading failed before the first partial", () => {
  const { root, reader } = mountState({ view: "article", busy: false, error: true,
    article: null, requestedArticle: article.key });
  reader.openArticle = vi.fn(async () => {});
  expect(root.textContent).not.toContain("文章載入中…");
  const retry = root.querySelector<HTMLButtonElement>(".retry-article")!;
  expect(retry.hidden).toBe(false);
  retry.click();
  expect(reader.openArticle).toHaveBeenCalledWith(article.key);
});
