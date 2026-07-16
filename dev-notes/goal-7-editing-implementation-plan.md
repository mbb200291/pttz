# Goal 7 編輯功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成可保存摘要的安全文章編輯，以及以新推文表達的補充、更正與撤回流程。

**Architecture:** parser 負責把 `※ PTTzzz 編輯摘要：` 從正文抽離成 revision；adapter 接收完整文章識別資料並以可驗證的終端狀態機執行編輯；React view 只在 adapter 確認成功後離開或 reload。Fake adapter 實際更新儲存資料，避免 preview 假成功。

**Tech Stack:** TypeScript、React、Zustand、ptt-client、Vitest、Testing Library、Vite

---

## 檔案責任

- `src/lib/ptt/parser.ts`：摘要 marker 正規化、抽離與 revision 資料型別
- `src/lib/ptt/adapter.ts`：文章編輯 request、PTT 終端狀態機、回文編輯委派
- `src/lib/ptt/fakeAdapter.ts`：可持久化的 fake 編輯行為
- `src/hooks/usePttActions.ts`：穩定的 UI action API
- `src/lib/ptt/viewState.ts`、`src/App.tsx`：把完整文章快照帶入 compose-edit view 並處理成功／失敗
- `src/components/ComposeScreen.tsx`：既有正文預填、送出狀態、錯誤與 revision history
- `src/components/Article.tsx`、`src/components/Composer.tsx`：回文編輯送出及錯誤保留
- `src/components/ArticleRevisions.tsx`：正文末端、回文上方的獨立 revision UI

### Task 1：解析及格式化 PTTzzz 編輯摘要

**Files:**
- Modify: `src/lib/ptt/parser.ts`
- Test: `src/lib/ptt/__tests__/parser.test.ts`

- [ ] **Step 1：寫入失敗測試**

加入測試，要求 parser 從正文移除 marker 並保留順序：

```ts
it("extracts PTTzzz edit summaries from the article body", () => {
  const parsed = splitArticleBody("原始正文\n※ PTTzzz 編輯摘要：修正來源\n※ 編輯: alice (1.2.3.4), 07/16/2026 10:30:00");
  expect(parsed.body).toBe("原始正文");
  expect(parsed.revisions).toMatchObject([
    { summary: "修正來源" },
  ]);
});
```

另測試摘要中的換行、ANSI/control characters 會被 `formatPttzzzEditSummary()` 正規化成單行，空摘要會回傳 `null`。

- [ ] **Step 2：確認測試因缺少 revisions API 而失敗**

Run: `npx vitest run src/lib/ptt/__tests__/parser.test.ts`

Expected: FAIL，顯示 `revisions` 或 `formatPttzzzEditSummary` 尚不存在。

- [ ] **Step 3：實作最小 parser API**

新增：

```ts
export interface ArticleRevision {
  summary: string;
  rawBlock: string;
  markerOffset: number;
}

export function formatPttzzzEditSummary(summary: string): string | null;
```

擴充 `splitArticleBody()` 回傳 `{ body, pushLines, revisions }`，只辨識行首固定 marker，不把一般包含相同文字的段落誤判。

- [ ] **Step 4：執行 parser 測試並確認通過**

Run: `npx vitest run src/lib/ptt/__tests__/parser.test.ts`

Expected: PASS。

### Task 2：定義文章與回文編輯 action contract

**Files:**
- Modify: `src/lib/ptt/adapter.ts`
- Modify: `src/hooks/usePttActions.ts`
- Test: `src/hooks/__tests__/usePttActions.test.ts`

- [ ] **Step 1：寫入完整參數轉交的失敗測試**

定義 request：

```ts
export interface EditArticleRequest {
  boardName: string;
  articleIndex: number;
  expectedAuthor: string;
  expectedTitle: string;
  body: string;
  editSummary: string;
}
```

測試 `usePttActions().editArticle(request)` 完整轉交；測試 `editPush()` 使用 `formatEditPush()` 並強制以 `neutral` 呼叫 adapter 的 `replyToArticle()`。

- [ ] **Step 2：確認測試因舊 method signature 與 stub 而失敗**

Run: `npx vitest run src/hooks/__tests__/usePttActions.test.ts`

Expected: FAIL，edit request 未轉交且 editPush 回傳 `{ ok: false }`。

- [ ] **Step 3：實作最小 action contract**

將 adapter method 改成：

```ts
editArticle: (request: EditArticleRequest) => Promise<ActionResult>;
```

其中 `ActionResult` 為 `{ ok: boolean; reason?: string }`。`editPush()` 格式化內容後呼叫 `replyToArticle(formatted, "neutral", boardName)`。

- [ ] **Step 4：執行 hook 測試並確認通過**

Run: `npx vitest run src/hooks/__tests__/usePttActions.test.ts`

Expected: PASS。

### Task 3：讓 Fake adapter 真正保存編輯

**Files:**
- Modify: `src/lib/ptt/fakeAdapter.ts`
- Test: `src/lib/ptt/__tests__/fakeAdapter.test.ts`

- [ ] **Step 1：寫入文章更新及權限失敗測試**

測試登入作者可更新指定 article body、摘要 marker 被附加、再次 `getArticle()` 可取得 revision；非作者、錯誤 index 與未登入回傳具體 `reason`。另測試 editPush 產生 neutral raw push。

- [ ] **Step 2：確認測試因 fake editArticle 無條件成功而失敗**

Run: `npx vitest run src/lib/ptt/__tests__/fakeAdapter.test.ts`

Expected: FAIL，正文未更新或非作者仍成功。

- [ ] **Step 3：實作 fake 資料更新**

在 `mutateStore()` 中定位正規化看板及 index，驗證 `currentUser === article.author` 與 expected identity，保存：

```ts
article.body = `${request.body.trimEnd()}\n${marker}`;
```

`toArticleData()` 使用 parser 產生乾淨正文與 revisions，不能再把 fake header 混入可編輯 body。

- [ ] **Step 4：執行 fake adapter 測試並確認通過**

Run: `npx vitest run src/lib/ptt/__tests__/fakeAdapter.test.ts`

Expected: PASS。

### Task 4：實作可驗證的正式文章編輯狀態機

**Files:**
- Modify: `src/lib/ptt/adapter.ts`
- Test: `src/lib/ptt/__tests__/adapter.test.ts`

- [ ] **Step 1：寫入狀態機失敗測試**

使用 deterministic `WriteBot` 畫面序列測試：

- 進入指定看板與 index 後才送 `E`
- 作者或標題不符時不送 `E`
- 未偵測到 editor 時取消且不儲存
- 正常流程清除舊 editable buffer、逐行輸入新正文與摘要 marker、`Ctrl-X` 儲存
- 儲存提示失敗或逾時時回傳原因，不回傳成功

- [ ] **Step 2：確認測試因 editArticle 尚未實作而失敗**

Run: `npx vitest run src/lib/ptt/__tests__/adapter.test.ts -t "edit article"`

Expected: FAIL，出現 `Article editing is not implemented yet`。

- [ ] **Step 3：實作狀態判定與取消 helper**

新增可獨立測試的 pure/helper functions：

```ts
export function isArticleEditorScreen(screen: string): boolean;
export function isArticleEditSavePrompt(screen: string): boolean;
async function cancelArticleEdit(bot: WriteBot): Promise<void>;
```

不得在 editor 未確認時輸入正文。清除 buffer 使用可測試的 pmore command sequence，次數由原始可編輯行數計算並設安全上限。

- [ ] **Step 4：實作 `submitArticleEditFromBot()`**

流程依 design 文件執行 identity check、editor check、內容重組、save dialog 與成功畫面 check。所有失敗結果提供 `reason`，且由 `runSerial()` 包覆。

- [ ] **Step 5：執行 adapter 編輯測試並確認通過**

Run: `npx vitest run src/lib/ptt/__tests__/adapter.test.ts -t "edit article"`

Expected: PASS。

### Task 5：接通文章編輯 UI 與 revision 顯示

**Files:**
- Create: `src/components/ArticleRevisions.tsx`
- Create: `src/components/__tests__/ArticleRevisions.test.tsx`
- Modify: `src/lib/ptt/adapter.ts`
- Modify: `src/hooks/useArticle.ts`
- Modify: `src/lib/ptt/viewState.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/Article.tsx`
- Modify: `src/components/ComposeScreen.tsx`
- Test: `src/components/__tests__/ComposeScreen.test.tsx`
- Test: `src/components/__tests__/Article.test.tsx`
- Test: `src/__tests__/appState.test.ts`

- [ ] **Step 1：寫入 UI 失敗測試**

測試：

- edit view 預填現有 title/body
- `ArticleRevisions` 位於正文後並顯示 summary
- submit 中停用按鈕
- adapter 失敗時顯示 reason 且保留正文與摘要
- adapter 成功時返回原文章 view，而非看板 view

- [ ] **Step 2：確認測試因 view 未攜帶文章資料而失敗**

Run: `npx vitest run src/components/__tests__/ArticleRevisions.test.tsx src/components/__tests__/ComposeScreen.test.tsx src/components/__tests__/Article.test.tsx src/__tests__/appState.test.ts`

Expected: FAIL，revision component 不存在或 compose initial body 為空。

- [ ] **Step 3：擴充 article data 與 compose-edit view**

`AdapterArticleData`、`PartialArticleData`、`ArticleData` 新增 `revisions: ArticleRevision[]`。`AppView.compose-edit` 保存 article snapshot：

```ts
{ type: "compose-edit"; board: string; articleIndex: number; article: ArticleData }
```

`Article.onEditArticle` 傳遞目前 article；無完整 article 時不顯示編輯按鈕。

- [ ] **Step 4：實作 UI loading/error 與 revision component**

`ComposeScreen` 接收 `submitting`、`submitError`、`revisions`。`App.tsx` 管理 async submit，成功後回到同一篇文章並觸發重新讀取；失敗只更新 error。

- [ ] **Step 5：執行 UI 測試並確認通過**

Run: `npx vitest run src/components/__tests__/ArticleRevisions.test.tsx src/components/__tests__/ComposeScreen.test.tsx src/components/__tests__/Article.test.tsx src/__tests__/appState.test.ts`

Expected: PASS。

### Task 6：接通回文編輯 UI

**Files:**
- Modify: `src/components/Article.tsx`
- Modify: `src/components/Composer.tsx`
- Test: `src/components/__tests__/Article.test.tsx`
- Test: `src/components/__tests__/Composer.test.tsx`

- [ ] **Step 1：寫入送出格式與失敗保留測試**

測試補充、更正使用單樓；撤回使用 `sourceFloors` 的最小至最大樓層；成功才關閉並 reload，失敗保留 Composer 並顯示錯誤。撤回模式允許正文為空。

- [ ] **Step 2：確認測試因 edit-push 分支只關閉 modal 而失敗**

Run: `npx vitest run src/components/__tests__/Article.test.tsx src/components/__tests__/Composer.test.tsx`

Expected: FAIL，adapter 未被呼叫或失敗後 modal 消失。

- [ ] **Step 3：實作最小回文編輯流程**

`openEditPush()` 保存 `targetFloor` 與撤回範圍；`handleComposerSubmit()` 呼叫 `actions.editPush()`。Composer 新增 `submitting`、`submitError` 並依 mode 決定 validation。

- [ ] **Step 4：執行回文 UI 測試並確認通過**

Run: `npx vitest run src/components/__tests__/Article.test.tsx src/components/__tests__/Composer.test.tsx`

Expected: PASS。

### Task 7：整體回歸、文件與完成檢查

**Files:**
- Modify: `dev-notes/goal-7-editing-implementation-notes.md`
- Modify: `dev-notes/implement.md`

- [ ] **Step 1：執行完整測試**

Run: `npm run test`

Expected: 所有 test files 與 tests PASS。

- [ ] **Step 2：執行 lint 與 build**

Run: `npm run lint`

Expected: 0 errors；既有 warning 需記錄，新程式不可新增 warning。

Run: `npm run build`

Expected: TypeScript 與 Vite build exit 0。

- [ ] **Step 3：更新實作筆記**

記錄實際終端狀態 pattern、buffer 清除策略、失敗取消行為、未做真站寫入驗證的限制，以及 red-green 驗證結果。

- [ ] **Step 4：檢查變更範圍**

Run: `git diff --check && git status --short`

Expected: 無 whitespace error；`dev-notes/spec.md` 未被修改。

- [ ] **Step 5：提交完成段落**

依 parser/action contract、adapter、UI、文件四個段落分別提交，只 stage 本計畫列出的檔案，不納入使用者的無關變更。

