# Minimal browser lifecycle

這是 0.1 proposed API 的最小 browser lifecycle；package 尚未代表已發布。型別與錯誤細節見 [contracts](../../api/contracts.md)。真實 PTT 連線第一版只保證 browser。

```ts
import { createBrowserClient } from "@pttzzz/browser";
import type { CoreEvent } from "@pttzzz/core";

const client = createBrowserClient();
const unsubscribe = client.subscribe((event: CoreEvent) => {
  if (event.type === "article.partial" || event.type === "article.updated") {
    console.log(event.articleKey, event.revision, event.article.completeness);
  }
});

const form = document.querySelector<HTMLFormElement>("#login")!;
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const connected = await client.connect();
  if (!connected.ok) return showError(connected.error);

  const login = await client.login({
    username: String(data.get("username") ?? ""),
    password: String(data.get("password") ?? ""),
    disconnectExistingSession: data.get("disconnectExistingSession") === "on",
  });
  if (!login.ok) return showError(login.error);

  const articles = await client.listArticles({ board: "Gossiping", limit: 20 });
  if (!articles.ok) return showError(articles.error);
  renderList(articles.value.items);
});

window.addEventListener("pagehide", () => {
  unsubscribe();
  void client.disconnect();
});
```

`showError` 與 `renderList` 是應用自己的 UI functions；credentials 由使用者表單提供。
