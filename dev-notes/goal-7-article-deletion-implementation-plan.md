# Goal 7 子項 Article Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓登入中的文章作者經過二次確認後，以 ptt-client 終端指令安全刪除自己的文章。

**Architecture:** 在既有 `PttAdapter` 寫入介面新增單一 `deleteArticle(request)` 動作；正式 adapter 在 serial queue 內定位並核對文章後，透過 `bot.send()` 操作 PTT 刪文畫面，Fake Adapter 則持久移除 fake store 記錄。`Article` 元件只保留確認、pending 與錯誤 local state，成功後沿用 `onBack()` 返回看板。

**Tech Stack:** React 19、TypeScript、Zustand、ptt-client、Vitest、Testing Library

---

### Task 1: 公開 API、action hook 與 Fake Adapter

**Files:**
- Modify: `src/lib/ptt/adapter.ts`
- Modify: `src/lib/ptt/fakeAdapter.ts`
- Modify: `src/hooks/usePttActions.ts`
- Test: `src/hooks/__tests__/usePttActions.test.ts`
- Test: `src/lib/ptt/__tests__/fakeAdapter.test.ts`

- [ ] **Step 1: 寫 action hook 的失敗測試**

在 `usePttActions adapter integration` 新增完整 request 轉交測試：

```ts
it("forwards the complete article delete request to the adapter", async () => {
  const deleteArticle = vi.fn().mockResolvedValue({ ok: true });
  usePttSocketStore.setState({
    client: {
      isLoggedIn: vi.fn().mockReturnValue(true),
      deleteArticle,
    } as unknown as PttAdapter,
    pttState: "ready",
  });
  const { usePttActions } = await import("../usePttActions");
  const { result } = renderHook(() => usePttActions());
  const request = {
    boardName: "Test",
    articleIndex: 123,
    expectedAuthor: "alice",
    expectedTitle: "[測試] 原標題",
  };

  await expect(result.current.deleteArticle(request)).resolves.toEqual({ ok: true });
  expect(deleteArticle).toHaveBeenCalledWith(request);
});
```

- [ ] **Step 2: 寫 Fake Adapter 的失敗測試**

新增三個行為測試：作者刪除後 `getArticle()` 回傳 `null`；非作者被拒絕且文章仍存在；過期標題被拒絕且文章仍存在。

```ts
it("deletes an article owned by the current fake user", async () => {
  const adapter = createFakePttAdapter();
  await adapter.login("opUser", "pw");
  await expect(adapter.deleteArticle({
    boardName: "test",
    articleIndex: 1001,
    expectedAuthor: "opUser",
    expectedTitle: "[測試] Fake PTT 多帳號互動測試",
  })).resolves.toEqual({ ok: true });
  await expect(adapter.getArticle("test", 1001)).resolves.toBeNull();
});
```

非作者預期 `{ ok: false, reason: "只有文章作者可以刪除文章" }`；身分過期預期 `{ ok: false, reason: "文章身分已變更，請重新載入" }`。

- [ ] **Step 3: 執行測試確認 RED**

Run:

```bash
npx vitest run src/hooks/__tests__/usePttActions.test.ts src/lib/ptt/__tests__/fakeAdapter.test.ts
```

Expected: TypeScript/runtime 因 `deleteArticle` 尚不存在而失敗。

- [ ] **Step 4: 新增最小公開型別與轉交方法**

在 `adapter.ts` 新增並加入 `PttAdapter`：

```ts
export interface DeleteArticleRequest {
  boardName: string;
  articleIndex: number;
  articleAid?: string;
  expectedAuthor: string;
  expectedTitle: string;
}

deleteArticle: (request: DeleteArticleRequest) => Promise<ActionResult>;
```

`PttClientAdapter.deleteArticle()` 使用既有 serial queue：

```ts
async deleteArticle(request: DeleteArticleRequest): Promise<ActionResult> {
  return this.runSerial(async () => {
    await this.waitUntilLoggedIn();
    return submitArticleDeleteFromBot(this.bot, request);
  });
}
```

在 `usePttActions.ts` 匯入型別、擴充 result interface，並直接轉交：

```ts
async deleteArticle(request: DeleteArticleRequest) {
  return client?.deleteArticle(request) ?? unavailable();
}
```

- [ ] **Step 5: 實作 Fake Adapter 的最小刪除**

使用現有 `readStore()`、`normalizeBoardName()` 與 `writeStore()`；以 index 找文章並依序驗證登入者、作者和標題，最後用 `splice(articlePosition, 1)` 移除並清除指向該文的 `currentArticle`。

```ts
async deleteArticle(request: DeleteArticleRequest): Promise<ActionResult> {
  if (!this.currentUser) return { ok: false, reason: "尚未登入 fake PTT" };
  const store = readStore();
  const board = store.boards[normalizeBoardName(request.boardName)];
  const articlePosition = board?.articles.findIndex(
    (article) => article.index === request.articleIndex,
  ) ?? -1;
  if (!board || articlePosition < 0) {
    return { ok: false, reason: "找不到要刪除的文章" };
  }
  const article = board.articles[articlePosition];
  if (article.author.toLowerCase() !== this.currentUser.toLowerCase()) {
    return { ok: false, reason: "只有文章作者可以刪除文章" };
  }
  if (
    article.author.toLowerCase() !== request.expectedAuthor.toLowerCase() ||
    article.title !== request.expectedTitle
  ) {
    return { ok: false, reason: "文章身分已變更，請重新載入" };
  }
  board.articles.splice(articlePosition, 1);
  writeStore(store);
  this.currentArticle = null;
  this.emitScreen("[Fake PTT] article deleted");
  return { ok: true };
}
```

- [ ] **Step 6: 執行測試確認 GREEN**

Run:

```bash
npx vitest run src/hooks/__tests__/usePttActions.test.ts src/lib/ptt/__tests__/fakeAdapter.test.ts
```

Expected: 兩個測試檔全部通過。

- [ ] **Step 7: 提交 Task 1**

```bash
git add src/lib/ptt/adapter.ts src/lib/ptt/fakeAdapter.ts src/hooks/usePttActions.ts src/hooks/__tests__/usePttActions.test.ts src/lib/ptt/__tests__/fakeAdapter.test.ts
git commit -m "feat: add article deletion action"
```

### Task 2: ptt-client 終端刪文流程

**Files:**
- Modify: `src/lib/ptt/adapter.ts`
- Test: `src/lib/ptt/__tests__/adapter.test.ts`

- [ ] **Step 1: 寫身分防護的失敗測試**

建立模擬 bot：`getLines()` 回傳作者或標題不同的文章，記錄所有 `send()` command。呼叫 `submitArticleDeleteFromBot()` 後應回傳身分變更，且 commands 不含 `d` 或 `y\r`。

```ts
expect(result).toEqual({ ok: false, reason: "文章身分已變更，請重新載入" });
expect(sent).not.toContain("d");
expect(sent).not.toContain("y\r");
```

- [ ] **Step 2: 寫確認提示防護的失敗測試**

模擬正確文章，離開文章後停在看板，收到 `d` 後顯示非刪文畫面。預期回傳 `{ ok: false, reason: "PTT 未顯示文章刪除確認" }`，可包含 `d` 但不得包含 `y\r`。

- [ ] **Step 3: 寫成功刪除的失敗測試**

模擬 command 狀態轉移：

```ts
if (command === "123\r\r") screenRows = articleRows;
if (command === "q") screenRows = boardRows;
if (command === "d") screenRows = ["確定要刪除這篇文章嗎? [y/N]"];
if (command === "y\r") screenRows = [
  "看板《Test》",
  buildBoardLine({ index: 123, author: "-", title: "(本文已被刪除) [alice]" }),
];
```

預期 `{ ok: true }`，且 `d` 僅一次並在 `y\r` 之前。

- [ ] **Step 4: 寫 AID 定位的失敗測試**

request 使用 `articleIndex: 0, articleAid: "#1AbCdEf"`；預期開文 command 正規化成 `#1AbCdEf\r`，完成相同的身分核對與刪除確認流程。

- [ ] **Step 5: 執行測試確認 RED**

Run:

```bash
npx vitest run src/lib/ptt/__tests__/adapter.test.ts
```

Expected: `submitArticleDeleteFromBot` 尚不存在而失敗。

- [ ] **Step 6: 實作畫面辨識 helper**

在 `adapter.ts` 新增可直接單元測試的純函式：

```ts
export function isArticleDeletePrompt(screen: string): boolean {
  const plain = stripAnsi(screen).replace(/\r/g, "");
  return /(?:確定|是否).*刪除.*(?:文章|本文)|刪除.*\[[yY]\/[nN]\]/u.test(plain);
}

function isArticleDeleteRejectedScreen(screen: string): boolean {
  return /(?:沒有|無|權限不足|不可|不能|禁止).{0,12}刪除|刪除.{0,12}(?:失敗|禁止)/u.test(
    stripAnsi(screen),
  );
}
```

- [ ] **Step 7: 實作定位、核對與刪除**

新增 `submitArticleDeleteFromBot(bot, request)`：驗證 `send/getLine/getLines`；選擇 index 或 AID opener；使用 `fetchArticleFromBotManually()` 或 `fetchArticleByAidFromBotManually()` 讀取並自動回到看板；以現有 `normalizeArticleIdentity()` 核對；送 `d` 後輪詢 `readVisibleScreen()`，只有 `isArticleDeletePrompt()` 為真才送 `y\r`。

確認後輪詢至指定看板畫面，使用 `parsePartialBoardScreen()` 確認 target index 不再同時匹配預期作者與標題。AID 路徑則重新送出 `#AID\r`，只有出現不存在提示或無法重新解析為同一文章才成功；若仍開啟同一文章，送 `q` 並回傳無法確認。

任何超時都回傳具體 `ActionResult`；不把 `send()` 的 boolean 當成刪除成功。

- [ ] **Step 8: 執行 adapter 測試確認 GREEN**

Run:

```bash
npx vitest run src/lib/ptt/__tests__/adapter.test.ts
```

Expected: adapter 測試檔全部通過。

- [ ] **Step 9: 提交 Task 2**

```bash
git add src/lib/ptt/adapter.ts src/lib/ptt/__tests__/adapter.test.ts
git commit -m "feat: delete verified PTT articles"
```

### Task 3: 作者刪除按鈕與二次確認

**Files:**
- Modify: `src/components/Article.tsx`
- Create: `src/components/__tests__/ArticleDeletion.test.tsx`

- [ ] **Step 1: 寫按鈕可見性的失敗測試**

mock `usePttActions()` 與 `useArticle()`，用 `mockArticle` render。`currentUser="alice"` 且作者為 `alice` 時可找到「刪除文章」；不同使用者與沒有 index/AID 時查無按鈕。另測試 `ALICE` 與 `alice` 視為同一 PTT ID。

- [ ] **Step 2: 寫取消與成功流程的失敗測試**

```ts
vi.spyOn(window, "confirm").mockReturnValue(false);
await userEvent.click(screen.getByRole("button", { name: "刪除文章" }));
expect(mocks.deleteArticle).not.toHaveBeenCalled();
```

確認情境改回 `true`，mock `{ ok: true }`；預期只呼叫一次完整 request，然後 `onBack` 一次。

- [ ] **Step 3: 寫 pending 與失敗流程的失敗測試**

用 deferred promise 保持 pending，連點按鈕仍只呼叫一次並顯示「刪除中…」。resolve `{ ok: false, reason: "PTT 拒絕刪除" }` 後預期 `role="alert"` 顯示原因，且 `onBack` 不會執行。

- [ ] **Step 4: 執行 UI 測試確認 RED**

Run:

```bash
npx vitest run src/components/__tests__/ArticleDeletion.test.tsx
```

Expected: 找不到「刪除文章」按鈕。

- [ ] **Step 5: 實作最小 Article local state 與 handler**

在 `Article` 新增：

```ts
const [deletingArticle, setDeletingArticle] = useState(false);
const [deleteArticleError, setDeleteArticleError] = useState<string | null>(null);
const canDeleteArticle = Boolean(
  article && currentUser &&
  normalizePttId(article.author) === normalizePttId(currentUser) &&
  (articleIndex > 0 || articleAid),
);
```

handler 先以 synchronous guard 防重複，再呼叫 `window.confirm("確定要刪除這篇文章嗎？刪除後無法復原。")`。確認後呼叫：

```ts
actions.deleteArticle({
  boardName,
  articleIndex,
  ...(articleAid ? { articleAid } : {}),
  expectedAuthor: article.author,
  expectedTitle: article.title,
});
```

成功 `onBack()`；失敗設定 error；finally 清除 pending。

- [ ] **Step 6: 加入按鈕與錯誤訊息**

把「刪除」放在作者的「修改」旁，使用危險操作顏色；`aria-label="刪除文章"`，pending 時文字為「刪除中…」且 disabled。錯誤訊息使用 `<div role="alert">`，不使用 alert popup。

- [ ] **Step 7: 執行 UI 測試確認 GREEN**

Run:

```bash
npx vitest run src/components/__tests__/ArticleDeletion.test.tsx
```

Expected: Article deletion UI 測試全部通過。

- [ ] **Step 8: 執行相關回歸測試**

Run:

```bash
npx vitest run src/components/__tests__/ArticleDeletion.test.tsx src/components/__tests__/ArticlePushEditing.test.tsx src/components/__tests__/ArticlePushVoting.test.tsx
```

Expected: 三個測試檔全部通過。

- [ ] **Step 9: 提交 Task 3**

```bash
git add src/components/Article.tsx src/components/__tests__/ArticleDeletion.test.tsx
git commit -m "feat: add article delete control"
```

### Task 4: 文件與完整驗證

**Files:**
- Create: `dev-notes/goal-7-article-deletion-implementation-notes.md`
- Modify: `dev-notes/implement.md`

- [ ] **Step 1: 建立 implementation notes**

記錄實際 API、ptt-client `bot.send()` 指令流程、身分防護、UI 確認、Fake Adapter 行為、測試結果，以及未對真實 PTT 自動執行刪除。

- [ ] **Step 2: 更新架構摘要**

在 `dev-notes/implement.md` 的已完成功能加入：文章作者可經二次確認，透過 adapter serial queue 與 ptt-client bot 刪除文章；成功必須由 PTT 終端狀態確認。

- [ ] **Step 3: 執行格式與靜態檢查**

Run:

```bash
git diff --check
npm run lint
npm run build
```

Expected: diff check 與 build 成功；lint 無 error，若只有既有 warning 則逐項確認未增加新 warning。

- [ ] **Step 4: 執行完整測試**

Run:

```bash
npm test
```

Expected: 全部測試通過。

- [ ] **Step 5: 提交文件**

```bash
git add dev-notes/goal-7-article-deletion-implementation-notes.md dev-notes/implement.md
git commit -m "docs: record article deletion implementation"
```

- [ ] **Step 6: 確認分支狀態**

Run:

```bash
git status --short --branch
git log --oneline dev..HEAD
```

Expected: 功能 worktree 乾淨；只包含 Goal 7 文章刪除子項的設計、計畫、實作與文件 commits。
