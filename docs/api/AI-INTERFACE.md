# AI 建立 PTTzzz UI 的最短正確路徑

此頁描述 repository 內已實作並通過 packed-consumer 驗證的 0.1 API；是否已發布至 npm registry 是另一件事。完整型別見 [public contracts](./contracts.md)，討論串語意見[核心規則白皮書](../whitepaper/pttzzz-core.md)，套件邊界見[核心架構設計](../../dev-notes/goal-9-core-architecture-design.md)。

## 1. 安裝

瀏覽器 UI 依賴兩個 package：

```bash
npm install @pttzzz/core @pttzzz/browser
```

`@pttzzz/core` 可在 Node-like 環境載入純規則，但 0.1 真實 PTT 連線只保證 browser，不提供 Node gateway 保證。

`@pttzzz/browser` 目前包裝 legacy `ptt-client`，因此 browser bundler 必須提供 `Buffer`。所有要實際連線的 host（開發、preview 與 production）都必須提供同源 `/ptt-ws` WebSocket proxy，轉送至 `wss://ws.ptt.cc/bbs` 並注入 PTT 接受的 Origin；這是 host/server 責任，不應由 UI 呼叫 terminal API 解決。

## 2. Create client

瀏覽器應用從 package root 建立 client：

```ts
import { createBrowserClient } from "@pttzzz/browser";

const client = createBrowserClient();
```

UI 操作 `PttzzzClient`；不要直接操作 gateway 或 terminal engine。

## 3. Subscribe

先訂閱長生命週期狀態與文章更新，並保存 cleanup function：

```ts
import { articleKeyId, type CoreEvent } from "@pttzzz/core";

const revisions = new Map<string, number>();
let activeArticleKey: string | null = null;
let articleRequestGeneration = 0;
const unsubscribe = client.subscribe((event: CoreEvent) => {
  if (event.type === "article.partial" || event.type === "article.updated") {
    const key = articleKeyId(event.articleKey);
    if (key !== activeArticleKey) return;
    if (event.revision <= (revisions.get(key) ?? -1)) return;
    revisions.set(key, event.revision);
    renderArticle(event.article);
  }
});
```

每個 article 各自追蹤 revision；stable serialization 同時包含 board、key kind 與 `index`／`aid`。active-key filter 防止背景文章事件覆寫目前畫面。

## 4. Connect / login

credentials 必須來自使用者輸入。預設不要中斷其他登入中的 session：

```ts
const form = document.querySelector<HTMLFormElement>("#login")!;
const data = new FormData(form);

const connected = await client.connect();
if (!connected.ok) showError(connected.error);
else {
  const loggedIn = await client.login({
    username: String(data.get("username") ?? ""),
    password: String(data.get("password") ?? ""),
    disconnectExistingSession: data.get("disconnectExistingSession") === "on",
  });
  if (!loggedIn.ok) showError(loggedIn.error);
}
```

## 5. Read boards / articles

```ts
const boards = await client.searchBoards({ prefix: "Gossip", limit: 20 });
if (boards.ok) renderBoards(boards.value.items);

const directory = await client.listBoards({
  source: { kind: "category", categoryCursor: selectedCategoryCursor },
});
if (directory.ok) {
  if (directory.value.kind === "boards") renderBoards(directory.value.items);
  else renderDirectoryEntries(directory.value.items);
}

const favoritesInCategory = await client.filterBoards({
  favorite: true,
  categoryCursor: selectedCategoryCursor,
});

const page = await client.listArticles({ board: "Gossiping", limit: 30 });
if (page.ok) renderArticleList(page.value.items);

const articleKey = { board: "Gossiping", aid: "example-aid" } as const;
const requestedKey = articleKeyId(articleKey);
const requestGeneration = ++articleRequestGeneration;
activeArticleKey = requestedKey;
const article = await client.getArticle({ article: articleKey });
if (requestGeneration === articleRequestGeneration && activeArticleKey === requestedKey) {
  if (article.ok) {
    const currentRevision = revisions.get(requestedKey) ?? -1;
    if (article.value.revision >= currentRevision) {
      revisions.set(requestedKey, article.value.revision);
      renderArticle(article.value);
    }
  } else {
    showError(article.error);
  }
}
```

切換文章時先遞增 request generation 並更新 `activeArticleKey`，再呼叫 `getArticle()`。Promise settle 時同時檢查 captured generation 與 requested key，因此舊 request 的 success/error 都不會覆寫目前畫面。

`getArticle()` Promise 成功值是 final `Article`；讀取途中由 subscription 接收 partial。

`listBoards()` 預設列熱門看板，也可指定 `{ source: { kind: "favorite" } }` 或 category source；先依 `kind` 判斷普通看板頁或分類目錄頁。`searchBoards()`／`filterBoards()` 的 items 永遠都是 `Board[]`，不需處理 category entry。看板搜尋的 `prefix` 只比對看板名稱前綴，不是全文 query。`filterBoards()` 至少要傳 `favorite: true` 或 `categoryCursor`；兩者並存表示取交集，請勿傳 `favorite: false`。

`searchArticles()` 需要非空 query；`filterArticles()` 至少提供非空 author 或 keyword。兩者同時提供表示交集，不要用空 filter 代替 `listArticles()`。

所有 `cursor`／`categoryCursor` 都是 opaque、gateway-instance/session-scoped token。只可把 gateway 回傳值原樣交回同一成功登入 session；不要解析、改寫、持久化或當成 terminal offset。登入失敗不會輪替現有 session 的 cursor；成功登入與 disconnect 會使舊 cursor 失效。

## 6. Render partial / final

```ts
function renderArticle(article: import("@pttzzz/core").Article | import("@pttzzz/core").PartialArticle) {
  setLoading(article.completeness === "incomplete");
  renderBody(article.body ?? "");
  renderReplies(article.replies, (reply) => ({
    key: reply.replyId,
    author: reply.author,
    content: reply.content,
    score: reply.score,
    depth: reply.depth,
  }));
}
```

partial 是暫定投影：後續內容可改變聚合、樹狀關係、票數、編輯與可見性。只有 `completeness === "final"` 才能移除 loading/incomplete 提示。

## 7. Writes

所有 reply 操作使用 DTO 的 `replyId`：

```ts
const result = await client.replyToReply({
  article: articleKey,
  replyId: selectedReply.replyId,
  content: replyTextFromUser,
  pushType: "neutral",
});

const vote = await client.voteReply({
  article: articleKey,
  replyId: selectedReply.replyId,
  direction: "push",
});
```

發文、文章回覆、編輯、撤回與文章投票也只傳 contracts 定義的語意 input；core/browser 負責正確 transport formatting。

```ts
await client.createArticle({
  board: "Test",
  category: "問卦", // 看板不需分類時可省略
  title: "標題",
  content: "正文",
});

await client.editArticle({
  article: articleKey,
  content: revisedBody,
  editSummary: "修正第二段錯字", // 必填且不可為空
});

// PTT 原生「回應至看板」，會建立另一篇文章；不是推文。
await client.replyArticleToBoard({
  article: articleKey,
  content: responseBody,
});
```

## 8. Error / outcome

```ts
import type { CoreError, Result } from "@pttzzz/core";

function handleWrite(result: Result<void>): void {
  if (result.ok) return;
  const error: CoreError = result.error;

  if (error.outcome === "uncertain") {
    showWarning("可能已送出，請先重新載入確認；不會自動重試。");
    return;
  }
  if (error.outcome === "sent") {
    showWarning("已送出但確認失敗，請重新載入確認。");
    return;
  }
  showError(error);
  if (error.outcome === "not-sent" && error.retryable) enableManualRetry();
}
```

預期的 PTT 失敗讀 `Result`，不要用 broad `catch` 取代。只有程式設計錯誤或 internal invariant 破壞才預期 throw。

## 9. Cleanup

頁面、component 或 store scope 結束時取消訂閱；應用離開或明確登出時中斷連線：

```ts
unsubscribe();
await client.disconnect();
```

`disconnect()` 是 best-effort cleanup：client 即使收到 gateway 的預期 cleanup error，也會清除本地連線／session 狀態並 resolve。未知的程式錯誤仍可能 reject，不能用空的 broad catch 吞掉。

## 10. 禁止事項

- UI 不 deep import，也不使用保留給官方 browser adapter 的 `@pttzzz/core/internal`；只使用 `@pttzzz/core` 與 `@pttzzz/browser` package root。
- 不自行格式化任何 terminal control pattern；只傳語意 input DTO。
- 不用畫面排序後的第幾張卡片作為 target；只用 `replyId`。
- 不自動 retry `uncertain` 寫入；先重新讀取或請使用者決定。
- 不從 raw pushes 重算 score、tree 或 visibility；DTO 是權威投影。
- 不在一般 UI 顯示 source floor；debug metadata 必須明確 opt in。
- 不將看板 search 當成全文查詢；只傳 `prefix`。
- 不解析或跨 session 保存 board/article cursor，也不自行使用 terminal offset。
- 不把 partial 當 complete；保留 incomplete 狀態直到 final event/Result。
