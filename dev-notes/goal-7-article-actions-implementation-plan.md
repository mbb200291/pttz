# Goal 7 子項：作者推噓防護與文章動作列 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 停用作者對自己文章的推噓、統一文章右上角動作列，並以 PTT 原生流程新增回應至看板功能。

**Architecture:** `Article` 只負責權限呈現與發出刪除／編輯／回應意圖；全頁狀態由既有 `AppView` 管理。`ComposeScreen` 增加輕量的 `reply-article` 模式；真正的 PTT 操作封裝在 adapter 專用 `replyArticleToBoard()`，沿用既有文章重新定位、身分核對、逐行寫入與存檔偵測工具。

**Tech Stack:** React 19、TypeScript、Zustand、ptt-client、Vitest、Testing Library。

---

## 檔案配置

- Modify: `src/lib/ptt/adapter.ts` — 新增回應 request、adapter method 與 PTT 原生回應狀態機。
- Modify: `src/lib/ptt/fakeAdapter.ts` — 在 fake store 建立 `Re:` 文章。
- Modify: `src/hooks/usePttActions.ts` — 將新 adapter action 暴露給 UI。
- Modify: `src/lib/ptt/viewState.ts` — 新增 `compose-reply` view，保存原文章定位及返回資訊。
- Modify: `src/components/ComposeScreen.tsx` — 新增鎖定看板／標題且不顯示分類的回應模式。
- Modify: `src/components/Article.tsx` — 固定文章動作列、作者推噓防護與回應 callback。
- Modify: `src/App.tsx` — 串接回應 Composer、送出、取消及成功導航。
- Modify: `src/lib/ptt/__tests__/adapter.test.ts` — 覆蓋真實 adapter 的命令與失敗狀態。
- Modify: `src/lib/ptt/__tests__/fakeAdapter.test.ts` — 覆蓋 fake 回應文章。
- Modify: `src/hooks/__tests__/usePttActions.test.ts` — 覆蓋 action delegation。
- Modify: `src/components/__tests__/ComposeScreen.test.tsx` — 覆蓋回應模式。
- Modify: `src/components/__tests__/ArticleDeletion.test.tsx` — 更新固定顯示／disabled 的刪除與編輯權限測試。
- Modify: `src/components/__tests__/ArticlePushVoting.test.tsx` — 覆蓋作者文章推噓防護。
- Create: `src/components/__tests__/ArticleActions.test.tsx` — 覆蓋三按鈕與上下兩種回覆入口。
- Modify: `dev-notes/implement.md` — 記錄文章動作列與原生看板回應架構。
- Create: `dev-notes/goal-7-article-actions-implementation-notes.md` — 記錄實作結果與驗證。

### Task 1: 建立回應資料契約與 action delegation

**Files:**
- Modify: `src/lib/ptt/adapter.ts`
- Modify: `src/hooks/usePttActions.ts`
- Modify: `src/hooks/__tests__/usePttActions.test.ts`

- [ ] **Step 1: 寫失敗的 hook delegation 測試**

在 `usePttActions.test.ts` 建立 mock `replyArticleToBoard`，呼叫 hook 後確認 request 原封不動傳入：

```ts
const request = {
  boardName: "Test",
  articleIndex: 99,
  expectedAuthor: "alice",
  expectedTitle: "[測試] 原文",
  body: "回應正文",
};
await expect(result.current.replyArticleToBoard(request)).resolves.toEqual({ ok: true });
expect(replyArticleToBoard).toHaveBeenCalledWith(request);
```

- [ ] **Step 2: 執行測試並確認因 method 不存在而失敗**

Run: `npx vitest run src/hooks/__tests__/usePttActions.test.ts`

Expected: FAIL，指出 `replyArticleToBoard` 不存在或不是 function。

- [ ] **Step 3: 加入最小 request 與 method 定義**

在 `adapter.ts` 新增：

```ts
export interface ReplyArticleToBoardRequest {
  boardName: string;
  articleIndex: number;
  articleAid?: string;
  expectedAuthor: string;
  expectedTitle: string;
  body: string;
}
```

在 `PttAdapter`、真實 adapter class、`PttActionsResult` 與 `usePttActions()` 加入：

```ts
replyArticleToBoard(request: ReplyArticleToBoardRequest): Promise<ActionResult>;
```

真實 adapter method 必須走既有 `runSerial()` 與 `waitUntilLoggedIn()`，再呼叫下一 Task 建立的 `submitArticleReplyToBoardFromBot()`。

- [ ] **Step 4: 執行 hook 測試**

Run: `npx vitest run src/hooks/__tests__/usePttActions.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/ptt/adapter.ts src/hooks/usePttActions.ts src/hooks/__tests__/usePttActions.test.ts
git commit -m "feat: add article board reply action"
```

### Task 2: 實作 Fake adapter 的 `Re:` 文章

**Files:**
- Modify: `src/lib/ptt/fakeAdapter.ts`
- Modify: `src/lib/ptt/__tests__/fakeAdapter.test.ts`

- [ ] **Step 1: 寫 fake adapter 失敗測試**

新增三個案例：登入作者可回應、未登入拒絕、原文章身分不符拒絕。成功案例需先讀取原看板最大 index，再驗證新文章：

```ts
const result = await adapter.replyArticleToBoard({
  boardName: "Test",
  articleIndex: source.index,
  expectedAuthor: source.author,
  expectedTitle: source.title,
  body: "回應正文",
});
expect(result).toEqual({ ok: true });
expect(created.title).toBe("Re: 測試文章");
expect(created.author).toBe("alice");
expect(created.body).toBe("回應正文");
expect(created.rawPushes).toEqual([]);
```

另加一個原標題已是 `Re: 測試文章` 的案例，預期仍為單一 `Re:`。

- [ ] **Step 2: 執行測試並確認失敗**

Run: `npx vitest run src/lib/ptt/__tests__/fakeAdapter.test.ts`

Expected: FAIL，fake adapter 尚未實作 method。

- [ ] **Step 3: 實作標題正規化與 fake 寫入**

在 adapter 模組匯出純函式供真實與 fake 共用：

```ts
export function formatBoardReplyTitle(title: string): string {
  return `Re: ${title.replace(/^(?:Re:\s*)+/iu, "").trim()}`;
}
```

Fake adapter 先檢查登入、正文非空、來源文章存在，以及作者／標題身分相符；接著用既有 `mutateStore()` 新增下一個 index 的文章，category 為空字串，title 使用 `formatBoardReplyTitle()`，body 使用 `trimEnd()` 後正文，最後 emit screen。

- [ ] **Step 4: 執行 fake adapter 測試**

Run: `npx vitest run src/lib/ptt/__tests__/fakeAdapter.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/ptt/adapter.ts src/lib/ptt/fakeAdapter.ts src/lib/ptt/__tests__/fakeAdapter.test.ts
git commit -m "feat: support board replies in fake PTT"
```

### Task 3: 實作真實 PTT 原生回應狀態機

**Files:**
- Modify: `src/lib/ptt/adapter.ts`
- Modify: `src/lib/ptt/__tests__/adapter.test.ts`

- [ ] **Step 1: 寫文章定位與命令序列的失敗測試**

使用現有可編程的 fake bot 測試 `submitArticleReplyToBoardFromBot()`。成功狀態依序提供：看板列表、正確原文、回應編輯器、儲存提示、看板列表。斷言命令包含：

```ts
expect(sent).toContain("99\r\r");
expect(sent).toContain("y");
expect(sent).toContain("\x1b,");
expect(sent).toContain("\x19".repeat(2000));
expect(sent).toContain("回應第一行\r");
expect(sent).toContain("回應第二行\r");
expect(sent).toContain("\x18");
expect(sent).toContain("y\r");
```

另寫來源作者／標題不符案例，斷言未送出 `y`；以及 `articleIndex=0` 且有 AID 時使用 `#AID\r` 重新開啟。

- [ ] **Step 2: 執行 targeted adapter 測試並確認失敗**

Run: `npx vitest run src/lib/ptt/__tests__/adapter.test.ts -t "reply article to board"`

Expected: FAIL，helper 尚不存在。

- [ ] **Step 3: 實作重新定位、核對與進入 editor**

`submitArticleReplyToBoardFromBot(bot, request)` 必須：

1. 用 `sanitizePostBody(request.body).trimEnd()` 驗證正文非空。
2. 用 index 的 `fetchArticleFromBotManually()` 或 AID 的 `fetchArticleByAidFromBotManually()` 載入來源。
3. 以大小寫不敏感作者與正規化標題核對身分。
4. `ensureNormalBoardView()` 後用 `${index}\r\r` 或 `#${aid}\r` 開啟來源，並再次用 `parsePartialScreen()` 核對。
5. 送出 `y`，等待 `isPostEditorScreen()`；失敗則取消並回傳明確 reason。

- [ ] **Step 4: 實作可見正文替換與儲存**

原生回應的引文長度不保證等於解析後的正文行數，因此先回到編輯器頂端，再送出安全上限數量的刪行鍵；編輯器清空後多餘的 Ctrl-Y 不會產生正文：

```ts
await bot.send(PTT_KEY_EDITOR_TOP);
await bot.send(PTT_KEY_CTRL_Y.repeat(MAX_ARTICLE_EDIT_LINES));
for (const line of cleanBody.split("\n")) {
  await bot.send(`${line}\r`);
  await sleep(20);
}
```

然後送 `PTT_KEY_CTRL_X`。儲存對話沿用發文的多階段處理：儲存確認送 `y\r`、簽名檔送 `0\r`、分類規定送 `y\r`；成功條件為原看板文章列表或既有發表成功文字。無法確認時回傳 `{ ok: false, reason }`，不得 fallback 到 `postArticle()`。

- [ ] **Step 5: 補齊錯誤狀態測試**

覆蓋：缺少 locator、正文空白、來源身分變更、無法進入回應 editor、未出現儲存提示、無法確認成功。每一案例都斷言 `{ ok: false }` 及不會繼續送出後續正文／儲存命令。

- [ ] **Step 6: 執行 adapter 測試**

Run: `npx vitest run src/lib/ptt/__tests__/adapter.test.ts`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/lib/ptt/adapter.ts src/lib/ptt/__tests__/adapter.test.ts
git commit -m "feat: reply to articles through native PTT flow"
```

### Task 4: 新增回應至看板 Composer 模式

**Files:**
- Modify: `src/components/ComposeScreen.tsx`
- Modify: `src/components/__tests__/ComposeScreen.test.tsx`

- [ ] **Step 1: 寫 `reply-article` 模式失敗測試**

新增 props：

```ts
const defaultReplyProps = {
  mode: "reply-article" as const,
  initial: { board: "Test", title: "Re: 原文", body: "" },
  onCancel: vi.fn(),
  onSubmit: vi.fn(),
};
```

斷言頁首與送出按鈕顯示「回應」、看板及標題 input 為 readonly、畫面找不到「分類」、空正文 disabled、填入正文後 payload 的 board/title/body 正確、`submitting` 時顯示「回應中…」且 disabled。

- [ ] **Step 2: 執行測試並確認 union type／文案失敗**

Run: `npx vitest run src/components/__tests__/ComposeScreen.test.tsx`

Expected: FAIL，`reply-article` 尚未支援。

- [ ] **Step 3: 加入最小模式條件**

將 `ComposeMode` 擴充為：

```ts
export type ComposeMode = "post" | "edit-article" | "reply-article";
```

以 `const isLockedArticleMode = mode !== "post"` 共用 board/title readonly；`reply-article` 的 `canSubmit` 只要求 board、title、body；分類整列只在 `mode !== "reply-article"` 顯示；修訂摘要與修訂歷史仍只在 edit 模式顯示。頁首／送出文字分別為 `回應`、`回應中…`。

`titlePreview` 在 reply 模式不得加 category，右側資訊也不顯示分類列。

- [ ] **Step 4: 執行 Composer 測試**

Run: `npx vitest run src/components/__tests__/ComposeScreen.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/components/ComposeScreen.tsx src/components/__tests__/ComposeScreen.test.tsx
git commit -m "feat: add article board reply composer"
```

### Task 5: 統一文章動作列並阻擋作者推噓

**Files:**
- Modify: `src/components/Article.tsx`
- Modify: `src/components/__tests__/ArticleDeletion.test.tsx`
- Modify: `src/components/__tests__/ArticlePushVoting.test.tsx`
- Create: `src/components/__tests__/ArticleActions.test.tsx`

- [ ] **Step 1: 寫作者推噓防護失敗測試**

在 `ArticlePushVoting.test.tsx` 將 `replyToArticle` 提升成 hoisted mock。以 `currentUser="ALICE"`、`article.author="alice"` render，斷言文章層級的第一組推／噓 button disabled、顯示：

```ts
expect(screen.getByText("作者不能推噓自己的文章，可使用回覆加註。")).toBeTruthy();
```

直接 click 兩個按鈕後 `replyToArticle` 不被呼叫。另以非作者 render，斷言提示不存在且按鈕可用；回文卡片的推噓維持可用。

- [ ] **Step 2: 寫固定動作列失敗測試**

在 `ArticleActions.test.tsx` 注入 `onEditArticle`、`onReplyToBoard`：

- 作者看到「刪除文章」「編輯文章」「回應至看板」且三者可用。
- 非作者仍看到三者，但刪除／編輯 disabled，回應可用。
- 未登入三者都顯示且 disabled。
- 點編輯傳入 article；點回應傳入 article。
- header 不存在名為「回文」的按鈕；下方「回覆此文」仍開啟一般 `Composer`。

更新 `ArticleDeletion.test.tsx`：原本「非作者時不存在」改成「存在且 disabled」，既有確認、防重與錯誤案例保留。

- [ ] **Step 3: 執行三個測試檔並確認失敗**

Run: `npx vitest run src/components/__tests__/ArticleDeletion.test.tsx src/components/__tests__/ArticlePushVoting.test.tsx src/components/__tests__/ArticleActions.test.tsx`

Expected: FAIL，現況仍隱藏動作且未阻擋作者文章推噓。

- [ ] **Step 4: 建立單一作者與 locator 判斷**

在 `ArticleProps` 新增：

```ts
onReplyToBoard?: (article: ArticleData) => void;
```

在 component 中只計算一次：

```ts
const isArticleAuthor = Boolean(
  article && currentUser &&
  normalizePttId(article.author) === normalizePttId(currentUser),
);
const hasArticleLocator = articleIndex > 0 || Boolean(articleAid);
const canDeleteArticle = isLoggedIn && isArticleAuthor && hasArticleLocator;
const canEditArticle = isLoggedIn && isArticleAuthor && articleIndex > 0 && Boolean(onEditArticle);
const canReplyToBoard = isLoggedIn && hasArticleLocator && Boolean(onReplyToBoard);
```

刪除、編輯、回應三按鈕在文章存在時固定 render；disabled 與 opacity/cursor 由上述值控制。按鈕可存取名稱固定為「刪除文章」「編輯文章」「回應至看板」，可見文字為「刪除」「編輯」「回應」。移除 header 的 `openReply` 按鈕。

- [ ] **Step 5: 加入作者文章推噓雙層防護**

將 article VotePair 傳入 `disabled={!isLoggedIn || isArticleAuthor}`，並在 handler 開頭加入：

```ts
if (!isLoggedIn || isArticleAuthor) return;
```

只有 `isArticleAuthor` 時在 VotePair 旁固定 render 指定提示。不要將這個 disabled 傳給 PushThread，確保回文投票不受影響。

- [ ] **Step 6: 執行文章 UI 測試**

Run: `npx vitest run src/components/__tests__/ArticleDeletion.test.tsx src/components/__tests__/ArticlePushVoting.test.tsx src/components/__tests__/ArticleActions.test.tsx`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/components/Article.tsx src/components/__tests__/ArticleDeletion.test.tsx src/components/__tests__/ArticlePushVoting.test.tsx src/components/__tests__/ArticleActions.test.tsx
git commit -m "feat: consolidate article actions and guard OP votes"
```

### Task 6: 串接 AppView 與回應送出導航

**Files:**
- Modify: `src/lib/ptt/viewState.ts`
- Modify: `src/lib/ptt/__tests__/viewState.test.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: 寫 view state 失敗測試**

建立完整 `compose-reply` view，確認 ready 時保留、連線離開 ready 時回 home：

```ts
const view: AppView = {
  type: "compose-reply",
  board: "Test",
  articleIndex: 99,
  article: sourceArticle,
  summary: sourceSummary,
  filter: null,
};
expect(getSafeViewForPttState(view, "ready")).toBe(view);
expect(getSafeViewForPttState(view, "closed")).toEqual({ type: "home" });
```

- [ ] **Step 2: 執行 viewState 測試並確認 union type 失敗**

Run: `npx vitest run src/lib/ptt/__tests__/viewState.test.ts`

Expected: FAIL，`compose-reply` 不在 `AppView`。

- [ ] **Step 3: 新增 compose-reply view**

在 `AppView` 新增：

```ts
| {
    type: "compose-reply";
    board: string;
    articleIndex: number;
    articleAid?: string;
    article: ArticleData;
    summary?: ArticleSummary;
    filter?: BoardFilter | null;
  }
```

- [ ] **Step 4: 在 App 串接 normal index 與 AID 文章**

新增獨立 `replySubmitting`、`replySubmitError`。兩個 Article route 都傳 `onReplyToBoard`，將當前 locator、article 及返回資訊存入 `compose-reply`。普通 index route 保留既有 edit callback；AID route 不提供 edit callback，因此該頁編輯按鈕固定顯示但 disabled。

render `ComposeScreen mode="reply-article"`，initial 使用：

```ts
{
  board: view.board,
  title: formatBoardReplyTitle(view.article.title),
  body: "",
}
```

取消時依 locator 回到原文；送出呼叫 `actions.replyArticleToBoard()`。失敗設定 inline error 並留在 Composer，成功回 `{ type: "board", name: view.board, filter: view.filter }`，finally 清除 submitting。

- [ ] **Step 5: 執行相關測試、typecheck build**

Run: `npx vitest run src/lib/ptt/__tests__/viewState.test.ts src/components/__tests__/ComposeScreen.test.tsx src/components/__tests__/ArticleActions.test.tsx`

Expected: PASS。

Run: `npm run build`

Expected: TypeScript 與 Vite build 成功。

- [ ] **Step 6: 提交**

```bash
git add src/lib/ptt/viewState.ts src/lib/ptt/__tests__/viewState.test.ts src/App.tsx
git commit -m "feat: connect article board reply navigation"
```

### Task 7: 文件與完整驗證

**Files:**
- Create: `dev-notes/goal-7-article-actions-implementation-notes.md`
- Modify: `dev-notes/implement.md`

- [ ] **Step 1: 撰寫 implementation notes**

記錄 commit、修改檔案、PTT 原生回應命令、引文清除策略、index/AID 支援、錯誤保留草稿與測試結果。不得修改 `dev-notes/spec.md`。

- [ ] **Step 2: 更新高階架構文件**

在 `dev-notes/implement.md` 的文章寫入流程加入：Article header 權限來自正規化作者判斷；推文的「回覆此文」與建立 `Re:` 文章的 `replyArticleToBoard` 是兩條獨立路徑；真實 adapter 重新定位並核對文章後使用原生 `y` 流程。

- [ ] **Step 3: 執行完整驗證**

Run: `npm test`

Expected: 全部測試通過。

Run: `npm run lint`

Expected: 0 errors。

Run: `npm run build`

Expected: TypeScript 與 Vite build 成功。

Run: `git diff --check`

Expected: 無輸出。

- [ ] **Step 4: 提交文件**

```bash
git add dev-notes/goal-7-article-actions-implementation-notes.md dev-notes/implement.md
git commit -m "docs: record goal 10 implementation"
```

## Self-review

- Spec coverage：作者文章推噓、固定提示、固定三按鈕、非作者反灰、移除 header 推文入口、保留下方推文入口、既有編輯、原生回應、locked `Re:` Composer、index/AID locator、草稿錯誤處理及 fake 行為皆有對應 Task。
- 禁用詞掃描：沒有未決標記或省略實作指示；每項變更都有明確檔案、測試與命令。
- Type consistency：全程統一使用 `ReplyArticleToBoardRequest`、`replyArticleToBoard`、`reply-article`、`compose-reply`、`onReplyToBoard` 與 `formatBoardReplyTitle`。
