# Rendering DTOs

Renderer 只消費 0.1 proposed DTO，不解析 raw pushes。規則語意見[白皮書](../../whitepaper/pttzzz-core.md)，型別見 [contracts](../../api/contracts.md)。

```tsx
import type { Article, PartialArticle, Reply } from "@pttzzz/core";

function ReplyNode({ reply }: { reply: Reply }) {
  if (!reply.visible) return null;
  return (
    <li data-reply-id={reply.replyId} aria-level={reply.depth}>
      <strong>{reply.author}</strong>
      <p>{reply.content}</p>
      <output>{reply.score}</output>
      {reply.children.length > 0 && (
        <ul>{reply.children.map((child) => <ReplyNode key={child.replyId} reply={child} />)}</ul>
      )}
    </li>
  );
}

export function Thread({ article }: { article: Article | PartialArticle }) {
  return (
    <section aria-busy={article.completeness === "incomplete"}>
      {article.completeness === "incomplete" && <p>內容載入中，回覆結構仍可能更新。</p>}
      <ul>{article.replies.map((reply) => <ReplyNode key={reply.replyId} reply={reply} />)}</ul>
    </section>
  );
}
```

列表 identity 與所有 actions 都用 `replyId`。`score`、`children`、`depth`、`visible` 直接採用 DTO。診斷畫面可透過 `getArticle({ article, includeDebugMetadata: true })` 明確 opt in，但 metadata 不得成為一般 UI identity，也不應呈現給一般使用者。
