# React / Zustand bridge

Core 本身沒有 store，也不依賴 React 或 Zustand。這個 0.1 proposed 範例只把 `PttzzzClient` events 橋接到 app-owned store；完整 API 見 [contracts](../../api/contracts.md)。

```ts
import { create } from "zustand";
import { articleKeyId, type Article, type ArticleKey, type CoreError, type PartialArticle, type PttzzzClient } from "@pttzzz/core";

type State = {
  article?: Article | PartialArticle;
  articleKey?: ArticleKey;
  activeArticleKey?: string;
  revisions: Readonly<Record<string, number>>;
  error?: CoreError;
};

export const usePttzzz = create<State>(() => ({ revisions: {} }));
let articleRequestGeneration = 0;

export function bindClient(client: PttzzzClient): () => void {
  return client.subscribe((event) => {
    if (event.type !== "article.partial" && event.type !== "article.updated") return;
    const key = articleKeyId(event.articleKey);
    usePttzzz.setState((state) => {
      if (event.revision <= (state.revisions[key] ?? -1)) return state;
      const revisions = { ...state.revisions, [key]: event.revision };
      if (state.activeArticleKey !== key) return { revisions };
      return {
        revisions,
        article: event.article,
        articleKey: event.articleKey,
        error: undefined,
      };
    });
  });
}

export async function loadArticle(client: PttzzzClient, article: ArticleKey) {
  const requestedKey = articleKeyId(article);
  const requestGeneration = ++articleRequestGeneration;
  usePttzzz.setState({ activeArticleKey: requestedKey, article: undefined, error: undefined });
  const result = await client.getArticle({ article });
  if (requestGeneration !== articleRequestGeneration) return;
  usePttzzz.setState((state) => {
    if (state.activeArticleKey !== requestedKey) return state;
    if (!result.ok) return { error: result.error };
    if (result.value.revision < (state.revisions[requestedKey] ?? -1)) return state;
    return {
      article: result.value,
      articleKey: result.value.key,
      revisions: { ...state.revisions, [requestedKey]: result.value.revision },
      error: undefined,
    };
  });
}
```

`activeArticleKey` filter 避免背景文章覆寫目前畫面；`revisions` 按 stable `ArticleKey` 分組。request generation 也阻止較舊 Promise 的 success/error 覆寫較新的 load。provider/component teardown 必須呼叫 `bindClient()` 回傳的 unsubscribe。
