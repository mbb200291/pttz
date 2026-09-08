# Vue composable

這只是 framework independence 範例，不代表存在或規劃官方 Vue package。composable 接收公開 `PttzzzClient`；0.1 型別見 [contracts](../../api/contracts.md)。

```ts
import { onUnmounted, readonly, ref } from "vue";
import { articleKeyId, type Article, type ArticleKey, type CoreError, type PartialArticle, type PttzzzClient } from "@pttzzz/core";

export function usePttzzzArticle(client: PttzzzClient) {
  const article = ref<Article | PartialArticle>();
  const error = ref<CoreError>();
  const activeArticleKey = ref<string>();
  const revisions = new Map<string, number>();
  let articleRequestGeneration = 0;

  const unsubscribe = client.subscribe((event) => {
    if (event.type !== "article.partial" && event.type !== "article.updated") return;
    const key = articleKeyId(event.articleKey);
    if (event.revision <= (revisions.get(key) ?? -1)) return;
    revisions.set(key, event.revision);
    if (key !== activeArticleKey.value) return;
    article.value = event.article;
  });

  async function load(articleKey: ArticleKey) {
    const requestedKey = articleKeyId(articleKey);
    const requestGeneration = ++articleRequestGeneration;
    activeArticleKey.value = requestedKey;
    article.value = undefined;
    error.value = undefined;
    const result = await client.getArticle({ article: articleKey });
    if (requestGeneration !== articleRequestGeneration || activeArticleKey.value !== requestedKey) return;
    if (result.ok) {
      if (result.value.revision < (revisions.get(requestedKey) ?? -1)) return;
      revisions.set(requestedKey, result.value.revision);
      article.value = result.value;
    } else {
      error.value = result.error;
    }
  }

  onUnmounted(unsubscribe);
  return { article: readonly(article), error: readonly(error), load };
}
```

active key filter 防止其他文章事件覆寫目前畫面；revision 按 stable `ArticleKey` 分組。request generation 也阻止較舊 Promise 的 success/error 覆寫較新的 load。component teardown 只取消 subscription；整個 app 結束時才呼叫 `client.disconnect()`。
