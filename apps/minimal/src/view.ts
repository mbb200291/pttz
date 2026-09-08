import { articleKeyId, type Article, type PartialArticle, type Reply, type VoteSummary } from "@pttzzz/core";
import type { Reader } from "./controller";

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = "", className = ""): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.textContent = text;
  element.className = className;
  return element;
}
function button(text: string, action: () => void): HTMLButtonElement {
  const element = node("button", text);
  element.type = "button";
  element.addEventListener("click", action);
  return element;
}
function votes(label: string, value?: VoteSummary): string {
  return value ? `${label}：推 ${value.pushCount} / 噓 ${value.booCount} / 分數 ${value.score}` : `${label}：整理中…`;
}
function pre(text: string, className = ""): HTMLPreElement {
  const element = node("pre", text, className);
  element.tabIndex = 0;
  return element;
}
function replyList(replies: readonly Reply[], parentAuthor = "", complete = true): HTMLUListElement {
  const list = node("ul", "", "replies");
  for (const reply of replies) {
    // Invisible parents do not erase visible descendants.
    if (!reply.visible) {
      list.append(...replyList(reply.children, reply.author, complete).children);
      continue;
    }
    const item = node("li", "", "reply");
    item.dataset.replyId = reply.replyId;
    item.append(node("p", `+ ${reply.author}${reply.isOp ? " [原作者]" : ""}${parentAuthor ? ` / 回覆 ${parentAuthor}` : ""} / ${reply.pushType === "push" ? "推" : reply.pushType === "boo" ? "噓" : "→"}${reply.createdAt ? ` / ${reply.createdAt}` : ""}`, "reply-meta"),
      pre(reply.content, "reply-content"), node("p", `推 ${reply.votes.pushCount} / 噓 ${reply.votes.booCount} / -> ${reply.votes.score}`, "muted"));
    if (complete && reply.edits.length) {
      const details = node("details");
      details.append(node("summary", "回覆編輯紀錄"));
      for (const edit of reply.edits) details.append(pre(`${edit.author} / ${edit.kind}${edit.createdAt ? ` / ${edit.createdAt}` : ""}\n${edit.content}`));
      item.append(details);
    }
    if (reply.children.length) item.append(replyList(reply.children, reply.author, complete));
    list.append(item);
  }
  return list;
}

export function renderArticle(article: Article | PartialArticle): HTMLElement {
  const element = node("article");
  element.append(node("h2", article.title ?? "文章整理中…"), node("p", `${article.author ?? ""} / ${article.key.board}`, "byline"));
  const body = pre(article.body ?? "", "article-body");
  body.setAttribute("aria-label", "文章正文，可水平捲動");
  element.append(body, node("p", votes("文章評分", article.articleVotes), "article-votes"), node("p", votes("PTT 原生", article.nativeVotes), "native-votes muted"));
  const history = node("details", "", "article-history");
  history.hidden = article.completeness !== "final";
  history.append(node("summary", "文章編輯紀錄"));
  for (const edit of article.articleEdits ?? []) history.append(pre(`${edit.marker}\n${edit.content}`));
  for (const revision of article.revisions ?? []) history.append(pre(revision.summary));
  if (!(article.articleEdits?.length || article.revisions?.length)) history.append(node("p", "無編輯紀錄"));
  element.append(history, node("h3", "回覆 / REPLIES"), replyList(article.replies, "", article.completeness === "final"));
  return element;
}

export function mount(root: HTMLElement, reader: Reader, preview: boolean): () => void {
  const header = node("header");
  const identity = node("div");
  identity.append(node("h1", "pttzzz / minimal"), node("p", preview ? "[離線預覽] 唯讀示例資料" : "[唯讀] PTT 文字閱讀器", "muted"));
  const account = node("span", "尚未登入");
  const logout = button("[登出]", () => run(reader.logout()));
  header.append(identity, account, logout);
  const status = node("p", "", "status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const login = node("form", "", "login");
  const username = node("input"); username.name = "username"; username.autocomplete = "username"; username.required = true;
  const password = node("input"); password.name = "password"; password.type = "password"; password.autocomplete = "current-password"; password.required = true;
  const usernameLabel = node("label", "PTT 帳號 "); usernameLabel.append(username);
  const passwordLabel = node("label", "密碼 "); passwordLabel.append(password);
  const choice = node("fieldset"); choice.append(node("legend", "PTT 偵測到其他連線"));
  choice.append(button("[保留其他連線並繼續]", () => continueLogin(false)), button("[中斷其他連線並繼續]", () => continueLogin(true)));
  const submit = node("button", "[連線並登入]"); submit.type = "submit";
  login.append(node("h2", "登入"), usernameLabel, passwordLabel, choice, submit, node("p", "密碼只用於本次登入，不會儲存。", "muted"));
  login.addEventListener("submit", (event) => {
    event.preventDefault();
    const secret = password.value;
    password.value = "";
    run(reader.login(username.value, secret).then(async () => {
      if (reader.state.user) await reader.hotBoards();
    }));
  });
  function continueLogin(kick: boolean): void {
    run(reader.login(username.value, "", kick).then(async () => { if (reader.state.user) await reader.hotBoards(); }));
  }
  const nav = node("nav"); nav.setAttribute("aria-label", "看板導覽");
  const boardForm = node("form");
  const boardInput = node("input"); boardInput.name = "board"; boardInput.placeholder = "例如 Test"; boardInput.required = true; boardInput.pattern = "[A-Za-z0-9_\\-]+";
  const boardLabel = node("label", "看板 "); boardLabel.append(boardInput);
  const go = node("button", "[前往]"); go.type = "submit";
  boardForm.append(boardLabel, go);
  boardForm.addEventListener("submit", (event) => { event.preventDefault(); run(reader.openBoard(boardInput.value)); });
  nav.append(button("[熱門看板]", () => run(reader.hotBoards())), boardForm);
  const workspace = node("section", "", "workspace");
  const restart = button("[重新載入並登入]", () => location.reload());
  const main = node("main"); main.id = "main"; main.append(status, restart, login, nav, workspace);
  const skip = node("a", "跳至內容", "skip"); skip.href = "#main";
  const footer = node("footer", "只閱讀，不發文、不回覆、不投票。 / core 0.1.x");
  root.replaceChildren(skip, header, main, footer);
  let lastView = "";
  let lastArticle: Article | PartialArticle | null = null;
  let lastList: unknown = null;
  let articleElement: HTMLElement | null = null;
  let wrap = false;

  function run(operation: Promise<void>): void {
    void operation.catch((error: unknown) => {
      status.textContent = `操作失敗：${error instanceof Error ? error.message : "請重新登入後再試"}`;
      status.dataset.error = "true";
    });
  }
  function render(): void {
    const state = reader.state;
    status.textContent = state.message;
    status.dataset.error = String(state.error);
    account.textContent = state.user ? `${state.user}` : "尚未登入";
    logout.hidden = !state.user;
    logout.disabled = state.authenticating;
    login.hidden = state.user !== null || state.ended;
    restart.hidden = !state.ended;
    restart.disabled = state.authenticating;
    submit.disabled = state.authenticating;
    submit.hidden = state.duplicate;
    usernameLabel.hidden = state.duplicate;
    passwordLabel.hidden = state.duplicate;
    password.required = !state.duplicate;
    choice.hidden = !state.duplicate;
    choice.disabled = state.authenticating;
    nav.hidden = state.user === null;
    workspace.hidden = state.user === null;
    workspace.setAttribute("aria-busy", String(state.busy));
    if (state.view === "login") { workspace.replaceChildren(); lastView = "login"; lastArticle = null; lastList = null; return; }
    if (state.view === "article") {
      const id = `article:${state.board}`;
      if (lastView !== id || (!state.article && lastArticle)) {
        const toolbar = node("div", "", "toolbar");
        const wrapLabel = node("label");
        const toggle = node("input"); toggle.type = "checkbox"; toggle.checked = wrap;
        wrapLabel.append(toggle, " 自動折行（可能影響表格對齊）");
        toggle.addEventListener("change", () => { wrap = toggle.checked; workspace.classList.toggle("wrap", wrap); });
        toolbar.append(button("[< 回看板]", () => run(reader.openBoard(state.board))), wrapLabel);
        const heading = node("h2", "文章載入中…"); heading.tabIndex = -1;
        workspace.replaceChildren(toolbar, heading);
        articleElement = null; lastArticle = null; lastView = id;
        heading.focus({ preventScroll: true });
      }
      if (state.article && state.article !== lastArticle) {
        const next = renderArticle(state.article);
        if (articleElement) {
          // Keep the reading surface, keyboard focus and selection stable across partials.
          for (const selector of ["h2", ".byline", ".article-body", ".article-votes", ".native-votes"]) {
            const current = articleElement.querySelector(selector)!;
            const content = next.querySelector(selector)!.textContent;
            if (current.textContent !== content) current.textContent = content;
          }
          if (state.article.completeness === "final") {
            articleElement.querySelector(".article-history")!.replaceWith(next.querySelector(".article-history")!);
          }
          const focused = document.activeElement;
          const focusedReply = focused?.classList.contains("reply-content") ? focused.closest<HTMLElement>(".reply")?.dataset.replyId : undefined;
          articleElement.querySelector(":scope > .replies")!.replaceWith(next.querySelector(":scope > .replies")!);
          if (focusedReply) {
            [...articleElement.querySelectorAll<HTMLElement>(".reply")].find((item) => item.dataset.replyId === focusedReply)?.querySelector<HTMLElement>(".reply-content")?.focus({ preventScroll: true });
          }
        } else {
          workspace.querySelector(":scope > h2")?.remove();
          articleElement = next;
          workspace.append(next);
        }
        lastArticle = state.article;
      }
      workspace.classList.toggle("wrap", wrap);
      return;
    }
    const items = state.view === "home" ? state.boards : state.articles;
    const emptyText = state.busy ? "讀取中…" : "尚無資料。可選擇熱門看板或輸入看板名稱。";
    if (lastView === state.view && lastList === items) {
      workspace.querySelector<HTMLButtonElement>(".more")?.toggleAttribute("disabled", state.busy);
      const empty = workspace.querySelector(".empty");
      if (empty) empty.textContent = emptyText;
      return;
    }
    lastView = state.view; lastList = items; lastArticle = null;
    const title = node("h2", state.view === "home" ? "熱門看板 / BOARDS" : `${state.board} / ARTICLES`);
    const list = node("ul", "", "index-list");
    if (state.view === "home") {
      for (const board of state.boards) {
        const item = node("li");
        const link = button("", () => run(reader.openBoard(board.name)));
        link.append(node("span", board.name, "board-name"), node("span", board.title), node("span", String(board.onlineUsers ?? board.popularityLabel ?? ""), "muted"));
        item.append(link); list.append(item);
      }
    } else {
      for (const article of state.articles) {
        const item = node("li");
        const link = button("", () => run(reader.openArticle(article.key)));
        link.dataset.articleId = articleKeyId(article.key);
        link.append(node("span", article.nativeScoreLabel ?? String(article.nativeScore ?? "-"), "score"), node("span", article.title, "title"), node("span", `${article.author} / ${article.publishedAt ?? ""}`, "muted byline"));
        item.append(link); list.append(item);
      }
    }
    workspace.replaceChildren(title, list);
    if (!items.length) workspace.append(node("p", emptyText, "empty muted"));
    const cursor = state.view === "home" ? state.boardCursor : state.articleCursor;
    if (cursor) {
      const more = button("[載入更多]", () => run(state.view === "home" ? reader.hotBoards(true) : reader.moreArticles()));
      more.className = "more"; more.disabled = state.busy; workspace.append(more);
    }
  }
  render();
  return render;
}
