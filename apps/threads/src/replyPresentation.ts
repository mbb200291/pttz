import type { Reply } from "@pttzzz/core";

function node(tag: string, text = "", className = ""): HTMLElement {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function historyVersions(reply: Reply): Array<{ label: string; content: string; createdAt?: string }> {
  const versions: Array<{ label: string; content: string; createdAt?: string }> = [];
  let hasUnconfirmedResult = false;
  if (reply.originalVersion) versions.push({ label: "原始版本", ...reply.originalVersion });
  for (const edit of reply.edits) {
    const resultContent = (edit as { resultContent?: unknown }).resultContent;
    if (typeof resultContent === "string") versions.push({ label: "版本", content: resultContent, createdAt: edit.createdAt });
    else hasUnconfirmedResult = true;
  }
  const latest = versions[versions.length - 1];
  if (hasUnconfirmedResult || !latest || latest.content !== reply.content) {
    versions.push({ label: "目前版本", content: reply.content });
  } else if (latest.label === "版本") {
    latest.label = "目前版本";
  }
  return versions;
}

function renderHistory(reply: Reply): HTMLElement | undefined {
  if (!reply.edits.length) return undefined;
  const versions = historyVersions(reply);
  if (!versions.length) return undefined;
  const history = node("details");
  history.append(node("summary", "編輯歷程"));
  for (const version of versions) {
    history.append(node("pre", [version.label, version.createdAt, version.content].filter(Boolean).join("\n")));
  }
  return history;
}

export function renderReplies(replies: readonly Reply[], final: boolean): HTMLElement {
  const list = node("div", "", "replies");
  const queue = [...replies].reverse().map(reply => ({ reply, depth: 0, parent: "" }));
  while (queue.length) {
    const { reply, depth, parent } = queue.pop()!;
    for (const child of [...reply.children].reverse()) queue.push({ reply: child, depth: depth + 1, parent: reply.author });

    const item = node("article", "", "reply");
    item.dataset.replyId = reply.replyId;
    item.style.marginInlineStart = `${Math.min(depth, 3) * 12}px`;
    if (!reply.visible) item.classList.add("reply-withdrawn");
    const label = reply.pushType === "push" ? "推" : reply.pushType === "boo" ? "噓" : "→";
    const author = reply.visible
      ? `${reply.author}${reply.isOp ? " · 原作者" : ""} · ${label}`
      : `${reply.author}${reply.isOp ? " · 原作者" : ""}`;
    item.append(
      node("strong", author),
      node("p", reply.visible ? reply.content : "此回覆已撤回", "reply-content"),
    );
    const context = reply.visible
      ? `推 ${reply.votes.pushCount} · 噓 ${reply.votes.booCount}${parent ? ` · 回覆 ${parent}` : ""}`
      : parent ? `回覆 ${parent}` : "";
    if (context) item.append(node("p", context, "muted"));
    if (reply.visible && final) {
      const history = renderHistory(reply);
      if (history) item.append(history);
    }
    list.append(item);
  }
  return list;
}
