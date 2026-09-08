import {
  articleKeyId,
  type Article,
  type ArticleKey,
  type CoreError,
  type CoreEvent,
  type PartialArticle,
  type PushType,
  type Reply,
  type Result,
} from "@pttzzz/core";
import { createBrowserClient } from "@pttzzz/browser";
import { ArticleViewState } from "./state.js";

declare const Buffer: { from(value: string): unknown };
if (typeof Buffer === "undefined") {
  throw new Error("The browser host must provide the Buffer compatibility global required by ptt-client");
}

const element = <T extends HTMLElement>(selector: string): T => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing UI element: ${selector}`);
  return found;
};

const client = createBrowserClient();
const status = element<HTMLOutputElement>("#status");
const loginForm = element<HTMLFormElement>("#login");
const boardInput = element<HTMLInputElement>("#board");
const boardsList = element<HTMLUListElement>("#boards");
const articlesList = element<HTMLUListElement>("#articles");
const articleTitle = element<HTMLHeadingElement>("#article-title");
const articleBody = element<HTMLPreElement>("#article-body");
const repliesList = element<HTMLUListElement>("#replies");
const replyForm = element<HTMLFormElement>("#reply");
const replyAuthor = element<HTMLSpanElement>("#reply-author");

const viewState = new ArticleViewState();
let activeArticle: ArticleKey | null = null;
let selectedReply: Reply | null = null;

function show(message: string, kind: "info" | "warning" | "error" = "info"): void {
  status.textContent = message;
  status.dataset.kind = kind;
}

function showError(error: CoreError): void {
  show(`${error.code}: ${error.message}`, "error");
}

function handleWrite(result: Result<void>): boolean {
  if (result.ok) {
    show("已送出");
    return true;
  }
  if (result.error.outcome === "uncertain") {
    show("無法確認是否送出；請重新載入，不會自動重試。", "warning");
  } else if (result.error.outcome === "sent") {
    show("已送出但確認失敗；請重新載入確認。", "warning");
  } else if (result.error.outcome === "not-sent" && result.error.retryable) {
    show(`${result.error.message}；可由使用者再次送出。`, "error");
  } else {
    showError(result.error);
  }
  return false;
}

function replyNode(reply: Reply): HTMLLIElement | null {
  if (!reply.visible) return null;
  const item = document.createElement("li");
  item.dataset.replyId = reply.replyId;

  const meta = document.createElement("div");
  meta.className = "reply-meta";
  meta.textContent = `${reply.author} · ${reply.score >= 0 ? "+" : ""}${reply.score}`;
  const content = document.createElement("p");
  content.textContent = reply.content;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "回覆";
  button.addEventListener("click", () => {
    selectedReply = reply;
    replyAuthor.textContent = reply.author;
    replyForm.hidden = false;
  });
  item.append(meta, content, button);

  const children = document.createElement("ul");
  for (const child of reply.children) {
    const rendered = replyNode(child);
    if (rendered) children.append(rendered);
  }
  if (children.childElementCount > 0) item.append(children);
  return item;
}

function renderArticle(article: Article | PartialArticle): void {
  articleTitle.textContent = article.title ?? "文章載入中";
  articleBody.textContent = article.body ?? "";
  repliesList.replaceChildren();
  for (const reply of article.replies) {
    const rendered = replyNode(reply);
    if (rendered) repliesList.append(rendered);
  }
  if (article.completeness === "incomplete") show("文章整理中…");
}

function acceptArticle(key: ArticleKey, revision: number, article: Article | PartialArticle): void {
  const id = articleKeyId(key);
  if (!viewState.accept(id, revision)) return;
  renderArticle(article);
}

function clearArticleView(): void {
  activeArticle = null;
  selectedReply = null;
  replyForm.hidden = true;
  articleTitle.textContent = "尚未選擇文章";
  articleBody.textContent = "";
  repliesList.replaceChildren();
}

function resetArticleView(): void {
  viewState.resetSession();
  clearArticleView();
}

const unsubscribe = client.subscribe((event: CoreEvent) => {
  if (event.type === "connection.changed") {
    if (event.status === "disconnected") resetArticleView();
    show(`連線狀態：${event.status}`);
  }
  if (event.type === "session.changed") {
    const nextUserId = event.session?.userId ?? null;
    if (viewState.changeSession(nextUserId)) clearArticleView();
    if (event.session) show(`已登入 ${event.session.userId}`);
  }
  if (event.type === "article.partial" || event.type === "article.updated") {
    acceptArticle(event.articleKey, event.revision, event.article);
  }
});

async function loadArticle(key: ArticleKey): Promise<void> {
  const requestedId = articleKeyId(key);
  const generation = viewState.begin(requestedId);
  activeArticle = key;
  selectedReply = null;
  replyForm.hidden = true;
  const result = await client.getArticle({ article: key });
  if (!viewState.isCurrent(requestedId, generation)) return;
  if (!result.ok) return showError(result.error);
  acceptArticle(result.value.key, result.value.revision, result.value);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(loginForm);
  const connected = await client.connect();
  if (!connected.ok) return showError(connected.error);
  const loggedIn = await client.login({
    username: String(data.get("username") ?? ""),
    password: String(data.get("password") ?? ""),
    disconnectExistingSession: data.get("disconnectExistingSession") === "on",
  });
  if (!loggedIn.ok) return showError(loggedIn.error);
  show(`已登入 ${loggedIn.value.userId}`);
});

element<HTMLButtonElement>("#load-boards").addEventListener("click", async () => {
  const result = await client.listBoards({ source: { kind: "hot" }, limit: 20 });
  if (!result.ok) return showError(result.error);
  boardsList.replaceChildren();
  if (result.value.kind === "boards") {
    for (const board of result.value.items) {
      const item = document.createElement("li");
      item.textContent = `${board.name} — ${board.title}`;
      boardsList.append(item);
    }
  }
});

element<HTMLButtonElement>("#load-articles").addEventListener("click", async () => {
  const board = boardInput.value.trim();
  const result = await client.listArticles({ board, limit: 20 });
  if (!result.ok) return showError(result.error);
  articlesList.replaceChildren();
  for (const article of result.value.items) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${article.title} — ${article.author}`;
    button.addEventListener("click", () => void loadArticle(article.key));
    item.append(button);
    articlesList.append(item);
  }
});

replyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeArticle || !selectedReply) {
    show("請先選擇文章與回覆", "error");
    return;
  }
  const targetArticle = activeArticle;
  const targetReply = selectedReply;
  const write = viewState.captureWrite(articleKeyId(targetArticle), targetReply.replyId);
  const data = new FormData(replyForm);
  const result = await client.replyToReply({
    article: targetArticle,
    replyId: targetReply.replyId,
    content: String(data.get("content") ?? ""),
    pushType: String(data.get("pushType") ?? "neutral") as PushType,
  });
  if (handleWrite(result) && viewState.shouldReloadAfterWrite(write)) {
    await loadArticle(targetArticle);
  }
});

element<HTMLButtonElement>("#disconnect").addEventListener("click", async () => {
  resetArticleView();
  await client.disconnect();
});

window.addEventListener("pagehide", () => {
  unsubscribe();
  void client.disconnect();
}, { once: true });
