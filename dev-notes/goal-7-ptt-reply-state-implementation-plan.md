# Goal 7 PTT 回文狀態修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓原作者回文限制、回應到看板的成功確認，以及一般回文失敗恢復都與 PTT 實際終端狀態一致。

**Architecture:** 保留現有 `Article → usePttActions → adapter` 資料流。`Composer` 僅新增 neutral-only 呈現與提交保護；adapter 的推文結果改用既有 `ActionResult` 加上 failure code，讓 `Article` 只對內容尚未送出的失敗重載文章並重試一次。回應到看板沿用現有流程，補上成功後任意鍵畫面與失敗時的看板歸位。

**Tech Stack:** TypeScript, React, ptt-client, Vitest, Testing Library.

---

### Task 1: 回傳可判斷的推文失敗階段

**Files:**
- Modify: `src/lib/ptt/adapter.ts:157-159,2349-2414`
- Modify: `src/hooks/usePttActions.ts:79-103`
- Modify: `src/lib/ptt/fakeAdapter.ts:384-416`
- Test: `src/lib/ptt/__tests__/adapter.test.ts:35-130`

- [ ] **Step 1: 新增失敗測試**

在 adapter 測試覆蓋三個階段：沒有推文選單、選完類型後沒有內容提示、內容送出後沒有確認提示。預期結果分別包含：

```ts
{
  ok: false,
  code: "push-entry-timeout",
  reason: "PTT 未顯示推文方式，請重新載入文章後再試",
}
{
  ok: false,
  code: "push-content-prompt-timeout",
  reason: "PTT 未顯示推文輸入框，請重新載入文章後再試",
}
{
  ok: false,
  code: "push-confirm-timeout",
  reason: "無法確認回文是否送出，請重新整理文章檢查",
}
```

- [ ] **Step 2: 驗證 RED**

Run: `npx vitest run src/lib/ptt/__tests__/adapter.test.ts`

Expected: FAIL，現有結果只有 `{ ok: false }`。

- [ ] **Step 3: 擴充共用結果型別並回傳最小必要資訊**

在 `adapter.ts` 定義並套用：

```ts
export type ActionFailureCode =
  | "push-entry-timeout"
  | "push-content-prompt-timeout"
  | "push-confirm-timeout";

export interface ActionResult {
  ok: boolean;
  reason?: string;
  code?: ActionFailureCode;
}
```

將 `PttAdapter`、`PttActionsResult`、real/fake adapter 的回文與投票方法回傳型別統一為 `Promise<ActionResult>`。`submitPushFromCurrentArticle` 在三個既有 return point 回傳上列 code/reason；前兩個階段維持送出 Ctrl-C，第三階段不得自動重送。

- [ ] **Step 4: 驗證 GREEN**

Run: `npx vitest run src/lib/ptt/__tests__/adapter.test.ts src/hooks/__tests__/usePttActions.test.ts src/lib/ptt/__tests__/fakeAdapter.test.ts`

Expected: all pass。

- [ ] **Step 5: Commit**

```bash
git add src/lib/ptt/adapter.ts src/hooks/usePttActions.ts src/lib/ptt/fakeAdapter.ts src/lib/ptt/__tests__/adapter.test.ts
git commit -m "fix: report PTT push failure stages"
```

### Task 2: 原作者回文只能使用箭頭

**Files:**
- Modify: `src/components/Composer.tsx:40-118,191-218`
- Modify: `src/components/Article.tsx:513-586,836-887`
- Test: `src/components/__tests__/Composer.test.tsx`
- Test: `src/components/__tests__/ArticlePushVoting.test.tsx`

- [ ] **Step 1: 新增 Composer 失敗測試**

以 `neutralOnly` render Composer，驗證：

```ts
expect(pushButton.disabled).toBe(true);
expect(neutralButton.disabled).toBe(false);
expect(booButton.disabled).toBe(true);
expect(screen.getByText("作者本人, 使用 → 加註方式")).toBeTruthy();
```

輸入內容並送出後，驗證 payload 的 `pushType` 為 `neutral`，即使 `initial.pushType` 傳入 `push` 仍相同。再新增非原作者測試，三個按鈕皆可用。

- [ ] **Step 2: 驗證 RED**

Run: `npx vitest run src/components/__tests__/Composer.test.tsx src/components/__tests__/ArticlePushVoting.test.tsx`

Expected: FAIL，Composer 尚無 `neutralOnly` prop，且文章提示仍是改寫文字。

- [ ] **Step 3: 實作 neutral-only selector**

新增 prop：

```ts
neutralOnly?: boolean;
```

初始值與提交 payload 都用：

```ts
const effectivePushType = neutralOnly ? "neutral" : pushType;
```

對 `push`、`boo` selector button 加上 `disabled={submitting || (neutralOnly && value !== "neutral")}`，套用現有 disabled opacity/cursor class，並在 selector 下方顯示 PTT 原文。

`Article` 傳入 `neutralOnly={isArticleAuthor}`，並將文章投票旁提示改為同一文字。`handleComposerSubmit` 對原作者再次強制使用 `neutral`。

- [ ] **Step 4: 驗證 GREEN**

Run: `npx vitest run src/components/__tests__/Composer.test.tsx src/components/__tests__/ArticlePushVoting.test.tsx`

Expected: all pass。

- [ ] **Step 5: Commit**

```bash
git add src/components/Composer.tsx src/components/Article.tsx src/components/__tests__/Composer.test.tsx src/components/__tests__/ArticlePushVoting.test.tsx
git commit -m "fix: limit article authors to neutral replies"
```

### Task 3: 安全重試與顯示 adapter 原因

**Files:**
- Modify: `src/components/Article.tsx:547-586`
- Test: `src/components/__tests__/ArticlePushVoting.test.tsx`

- [ ] **Step 1: 新增失敗測試**

新增兩個互斥案例：

```ts
mocks.replyToArticle
  .mockResolvedValueOnce({ ok: false, code: "push-entry-timeout", reason: "PTT 未顯示推文方式，請重新載入文章後再試" })
  .mockResolvedValueOnce({ ok: true });
```

驗證 `reload` 一次、`replyToArticle` 兩次且 composer 關閉。另一案例回傳 `push-confirm-timeout`，驗證不 reload、不重試，而且 alert 顯示 adapter reason、草稿仍在。

- [ ] **Step 2: 驗證 RED**

Run: `npx vitest run src/components/__tests__/ArticlePushVoting.test.tsx`

Expected: FAIL，現有程式不重試且覆蓋 reason。

- [ ] **Step 3: 實作單次安全恢復**

在 `handleComposerSubmit` 內使用局部 async function：

```ts
const recoverable = new Set([
  "push-entry-timeout",
  "push-content-prompt-timeout",
]);

let result = await actions.replyToArticle(body, outgoingType, boardName);
if (!result.ok && result.code && recoverable.has(result.code)) {
  await liveReload();
  result = await actions.replyToArticle(body, outgoingType, boardName);
}
```

最終失敗使用 `result.reason ?? "回文送出失敗"`；`push-confirm-timeout` 不在 recoverable 集合內，因此內容送出後絕不重試。

- [ ] **Step 4: 驗證 GREEN**

Run: `npx vitest run src/components/__tests__/ArticlePushVoting.test.tsx src/components/__tests__/Composer.test.tsx`

Expected: all pass。

- [ ] **Step 5: Commit**

```bash
git add src/components/Article.tsx src/components/__tests__/ArticlePushVoting.test.tsx
git commit -m "fix: safely recover article reply state"
```

### Task 4: 補齊回應到看板的完成狀態

**Files:**
- Modify: `src/lib/ptt/adapter.ts:2149-2310`
- Test: `src/lib/ptt/__tests__/adapter.test.ts:3224-3318`

- [ ] **Step 1: 新增 continuation 與 uncertain 測試**

成功案例在 `0\r` 後顯示 `文章已發表，請按任意鍵繼續`，收到 Enter 後才切換為看板列，並驗證回傳 `{ ok: true }`。

不確定案例使用短 timeout，使畫面在回答儲存後停在未知文字；驗證正文只送出一次、adapter 嘗試返回看板，並回傳：

```ts
{
  ok: false,
  reason: "無法確認回應是否送出，已返回看板，請重新整理檢查",
}
```

- [ ] **Step 2: 驗證 RED**

Run: `npx vitest run src/lib/ptt/__tests__/adapter.test.ts`

Expected: continuation 案例逾時或未返回看板，uncertain 案例未執行 cleanup。

- [ ] **Step 3: 實作完成狀態與可測 timeout**

新增 optional timeout override：

```ts
export interface ArticleReplyTimeouts {
  completionMs: number;
  pollMs: number;
  afterPromptMs: number;
}
```

在 completion loop 中，先檢查 continuation screen，僅於 `answeredSave` 後把 `/請按任意鍵繼續|按任意鍵繼續/u` 視為成功證據，送 Enter、呼叫 `ensureNormalBoardView` 後回傳成功。原有 `isPostSuccessScreen` 也需處理同一畫面可能同時包含 `文章已發表` 的情況，再先歸位看板後回傳。

逾時後呼叫 `ensureNormalBoardView`；若 `answeredSave`，回傳上列不確定提示，否則保留 `PTT 未顯示回應儲存確認`。cleanup 不得重送正文。

- [ ] **Step 4: 驗證 GREEN**

Run: `npx vitest run src/lib/ptt/__tests__/adapter.test.ts src/components/__tests__/AppArticleReply.test.tsx`

Expected: all pass。

- [ ] **Step 5: Commit**

```bash
git add src/lib/ptt/adapter.ts src/lib/ptt/__tests__/adapter.test.ts
git commit -m "fix: confirm native board replies reliably"
```

### Task 5: 文件、完整回歸與交付

**Files:**
- Create: `dev-notes/goal-7-ptt-reply-state-implementation-notes.md`
- Modify: `dev-notes/implement.md`
- Modify: `dev-notes/goal-7-ptt-reply-state-implementation-plan.md`

- [ ] **Step 1: 記錄實作細節**

implementation notes 需記錄：原作者 neutral-only 的雙層保護、三個 push failure code、只有送出內容前可重試、回應到看板 continuation screen，以及不確定結果不得重送。

- [ ] **Step 2: 更新高階架構文件**

在 `dev-notes/implement.md` 的 Goal 7 段落補充：PTT 操作以終端畫面證據判定成功，並以結構化失敗狀態維持 UI 與 terminal 同步。

- [ ] **Step 3: 勾選完成的 plan steps**

將本文件已執行項目由 `[ ]` 更新為 `[x]`。

- [ ] **Step 4: 執行完整驗證**

Run: `npm test && npm run lint && npm run build && git diff --check`

Expected: 0 test failures、0 lint errors、production build success、no whitespace errors。既有 lint warnings 可記錄但不可新增。

- [ ] **Step 5: Commit**

```bash
git add dev-notes/goal-7-ptt-reply-state-implementation-plan.md dev-notes/goal-7-ptt-reply-state-implementation-notes.md dev-notes/implement.md
git commit -m "docs: record goal 7 reply state fixes"
```
