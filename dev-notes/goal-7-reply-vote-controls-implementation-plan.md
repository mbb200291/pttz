# Goal 7 回文推噓控制修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓文章作者可正常回覆及評分特定樓層，並讓回文推噓按鈕立即顯示操作結果及回報失敗。

**Architecture:** 保留既有 `Composer`、`usePttActions` 與 adapter 介面，只在 `Article` 區分文章回覆與樓層回覆的送出語意。回文卡片投票沿用現有 pending guard，但在呼叫 PTT 前先寫入 optimistic state，失敗時精確回復。

**Tech Stack:** React、TypeScript、Vitest、Testing Library

---

### Task 1: 修正樓層回覆的方向與送出格式

**Files:**
- Modify: `src/components/__tests__/ArticlePushVoting.test.tsx`
- Modify: `src/components/__tests__/Composer.test.tsx`
- Modify: `src/components/Article.tsx`

- [ ] **Step 1: 將舊的錯誤期待改成三個 failing tests**

在 `ArticlePushVoting.test.tsx` 驗證作者開啟樓層回覆時推／→／噓皆可用，並以參數化測試驗證送出內容：

```tsx
it("keeps all directions available when the article author replies to a floor", () => {
  renderArticle(article, "OP");
  act(() => screen.getAllByRole("button", { name: "回覆" })[0].click());

  expect((screen.getAllByRole("button", { name: "推" }).at(-1) as HTMLButtonElement).disabled).toBe(false);
  expect((screen.getByRole("button", { name: "→" }) as HTMLButtonElement).disabled).toBe(false);
  expect((screen.getAllByRole("button", { name: "噓" }).at(-1) as HTMLButtonElement).disabled).toBe(false);
});

it.each([
  ["推", "推1樓 同意", "push"],
  ["→", "回1樓：同意", "neutral"],
  ["噓", "噓1樓 同意", "boo"],
] as const)("sends floor reply direction %s as neutral pattern", async (label, expectedBody) => {
  mocks.replyToArticle.mockResolvedValue({ ok: true });
  renderArticle(article, "OP");
  act(() => screen.getAllByRole("button", { name: "回覆" })[0].click());
  act(() => screen.getAllByRole("button", { name: label }).at(-1)?.click());
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "同意" } });
  act(() => screen.getByRole("button", { name: "送出" }).click());

  await waitFor(() =>
    expect(mocks.replyToArticle).toHaveBeenCalledWith(expectedBody, "neutral", "Test"),
  );
});
```

在 `Composer.test.tsx` 將參數化的 `neutralOnly` 測試縮小為只驗證 `reply` 模式，避免測試再次宣告錯誤產品規則。

- [ ] **Step 2: 執行測試並確認 RED**

Run: `npx vitest run src/components/__tests__/ArticlePushVoting.test.tsx src/components/__tests__/Composer.test.tsx`

Expected: 樓層回覆的推／噓仍為 disabled，或送出內容仍是 `回1樓：同意`／raw 推噓類別，因此測試失敗。

- [ ] **Step 3: 實作最小格式分流**

在 `Article.tsx` 新增單一純函式：

```ts
function formatFloorReply(
  floor: number,
  body: string,
  direction: "push" | "neutral" | "boo",
): string {
  const content = body.trim();
  if (direction === "neutral") return `回${floor}樓：${content}`;
  return `${direction === "push" ? "推" : "噓"}${floor}樓 ${content}`;
}
```

Composer 僅在直接回覆文章時套用作者限制：

```tsx
neutralOnly={isArticleAuthor && composer.mode === "reply"}
```

送出樓層回覆時使用 pattern 並強制 raw neutral；直接回覆文章維持既有作者限制：

```ts
const isFloorReply = composer?.mode === "reply-push" && payload.targetFloor;
const body = isFloorReply
  ? formatFloorReply(payload.targetFloor, payload.body, payload.pushType)
  : payload.body;
const outgoingPushType = isFloorReply
  ? "neutral"
  : isArticleAuthor ? "neutral" : payload.pushType;
```

- [ ] **Step 4: 執行測試並確認 GREEN**

Run: `npx vitest run src/components/__tests__/ArticlePushVoting.test.tsx src/components/__tests__/Composer.test.tsx`

Expected: 兩個 test files 全部通過。

- [ ] **Step 5: 提交樓層回覆修正**

```bash
git add src/components/Article.tsx src/components/__tests__/ArticlePushVoting.test.tsx src/components/__tests__/Composer.test.tsx
git commit -m "fix: allow application votes in floor replies"
```

### Task 2: 讓回文推噓立即回饋並顯示錯誤

**Files:**
- Modify: `src/components/__tests__/ArticlePushVoting.test.tsx`
- Modify: `src/components/Article.tsx`

- [ ] **Step 1: 寫 optimistic UI 與 rollback failing tests**

新增一個未完成 promise 測試，點擊後不等待 PTT 即檢查 `aria-pressed` 與票數：

```tsx
it("shows a reply vote immediately while the request is pending", () => {
  mocks.votePush.mockReturnValue(new Promise(() => {}));
  renderArticle();
  const pushButton = screen.getAllByRole("button", { name: "推" })[1];

  act(() => pushButton.click());

  expect(pushButton.getAttribute("aria-pressed")).toBe("true");
  expect(pushButton.textContent).toContain("1");
  expect((pushButton as HTMLButtonElement).disabled).toBe(true);
});
```

將既有失敗測試擴充為失敗後 rollback 並顯示 adapter 原因：

```tsx
it("rolls back a failed reply vote and displays the reason", async () => {
  mocks.votePush.mockResolvedValue({ ok: false, reason: "PTT 拒絕寫入" });
  renderArticle();
  const pushButton = screen.getAllByRole("button", { name: "推" })[1];

  act(() => pushButton.click());
  expect(pushButton.getAttribute("aria-pressed")).toBe("true");

  expect((await screen.findByRole("alert")).textContent).toContain("PTT 拒絕寫入");
  expect(pushButton.getAttribute("aria-pressed")).toBe("false");
  expect(pushButton.textContent).toContain("0");
  expect((pushButton as HTMLButtonElement).disabled).toBe(false);
});
```

- [ ] **Step 2: 執行測試並確認 RED**

Run: `npx vitest run src/components/__tests__/ArticlePushVoting.test.tsx`

Expected: pending 時仍未選取且失敗原因未出現在頁面，測試失敗。

- [ ] **Step 3: 實作 optimistic state 與精確 rollback**

在 `Article` 增加 `pushVoteError`。`handlePushVote` 在建立 request 前保存 `previousOptimistic`，立即寫入 transition 後的 state；失敗或 throw 時，若先前已有 optimistic state 就復原，否則刪除該 map entry，並保存 `result.reason` 或例外訊息。

```ts
const [pushVoteError, setPushVoteError] = useState<string | null>(null);

const previousOptimistic = pushVotes.get(pushId);
const optimisticState = transitionVoteState(currentState, resultingVote);
setPushVoteError(null);
setPushVotes((previous) => new Map(previous).set(pushId, optimisticState));

const rollback = () => {
  setPushVotes((previous) => {
    const rolledBack = new Map(previous);
    if (previousOptimistic) rolledBack.set(pushId, previousOptimistic);
    else rolledBack.delete(pushId);
    return rolledBack;
  });
};
```

在討論串前方顯示錯誤：

```tsx
{pushVoteError && (
  <p role="alert" className="mb-3 text-sm text-red-400">{pushVoteError}</p>
)}
```

- [ ] **Step 4: 執行測試並確認 GREEN**

Run: `npx vitest run src/components/__tests__/ArticlePushVoting.test.tsx`

Expected: test file 全部通過。

- [ ] **Step 5: 提交回文投票回饋修正**

```bash
git add src/components/Article.tsx src/components/__tests__/ArticlePushVoting.test.tsx
git commit -m "fix: show pending reply votes immediately"
```

### Task 3: 文件與完整驗證

**Files:**
- Create: `dev-notes/goal-7-reply-vote-controls-implementation-notes.md`
- Modify: `dev-notes/implement.md`

- [ ] **Step 1: 記錄實作結果**

建立 notes，記錄 Composer 限制只適用 direct article reply、樓層回覆使用 raw neutral pattern，以及 optimistic rollback 的實作細節。同步在 `dev-notes/implement.md` 的 Goal 7 段落加入一行高階說明。

- [ ] **Step 2: 執行完整驗證**

Run: `npm test`

Expected: 所有 Vitest tests 通過。

Run: `npm run build`

Expected: TypeScript 與 Vite build exit code 0。

Run: `npm run lint`

Expected: ESLint 0 errors；既有 warnings 可保留並於 notes 記錄。

- [ ] **Step 3: 提交文件與驗證紀錄**

```bash
git add dev-notes/goal-7-reply-vote-controls-implementation-plan.md dev-notes/goal-7-reply-vote-controls-implementation-notes.md dev-notes/implement.md
git commit -m "docs: record reply vote control fix"
```

### Task 4: 將中立統計改為聚合後回覆總數

**Files:**
- Modify: `src/components/__tests__/Article.test.tsx`
- Modify: `src/components/Article.tsx`

- [ ] **Step 1: 寫回覆總數 failing test**

在 `Article.test.tsx` render 一篇包含第一層回覆、巢狀回覆、synthetic edit 與相容性 pure article vote 的文章，驗證統計列顯示 `回覆 2`，不顯示 `中立`：

使用 Testing Library 以「回覆」標籤定位同一個統計項目，再斷言其數值為 `2`；不要只搜尋頁面上任意的 `2`。同時驗證頁面不再出現「中立」標籤。

- [ ] **Step 2: 執行測試並確認 RED**

Run: `npx vitest run src/components/__tests__/Article.test.tsx`

Expected: 現有 UI 仍顯示 `nativeNeutralCount` 與「中立」，測試失敗。

- [ ] **Step 3: 以既有可見性規則計算回覆數**

在 `Article.tsx` 以與 `PushThread` 相同的相容性條件過濾文章 pushes，再排除 edit：

```ts
const replyCount = (article?.pushes ?? []).filter((push) =>
  push.type !== "edit" &&
  (Boolean(push.editHistory?.length) || detectArticleVote(push.content) === null)
).length;
```

統計列第三項沿用 neutral 色系與 arrow badge，但數字改用 `replyCount`、標籤改為「回覆」。原生 push／boo 數保持不變。

- [ ] **Step 4: 執行測試並確認 GREEN**

Run: `npx vitest run src/components/__tests__/Article.test.tsx`

Expected: test file 全部通過。

- [ ] **Step 5: 提交統計修正**

```bash
git add src/components/Article.tsx src/components/__tests__/Article.test.tsx
git commit -m "fix: show aggregated reply count in article stats"
```

### Task 5: 移除回文卡片淨分 badge

**Files:**
- Modify: `src/components/__tests__/PushThread.test.tsx`
- Modify: `src/components/PushThread.tsx`

- [ ] **Step 1: 將 score badge 測試改為 failing absence test**

保留一筆 raw `push`、score `2` 的回文，驗證原始類別仍出現，但淨分標籤與 title 不再存在：

```tsx
expect(html).toContain(">推<");
expect(html).not.toContain("推 +2");
expect(html).not.toContain("此回文收到的明確投票分數");
```

負分案例同樣驗證不顯示 `噓 -1`。

- [ ] **Step 2: 執行測試並確認 RED**

Run: `npx vitest run src/components/__tests__/PushThread.test.tsx`

Expected: 現有卡片仍 render score badge，測試失敗。

- [ ] **Step 3: 刪除淨分 badge render code**

從 `PushItem` 移除 `scoreAbs`、`scoreLabel`、`scoreFg`、`scoreBg` 及 `push.score !== 0` 的 badge block；保留 `<PushBadge type={push.type} />` 與右側 `VotePair`。

- [ ] **Step 4: 執行測試並確認 GREEN**

Run: `npx vitest run src/components/__tests__/PushThread.test.tsx`

Expected: test file 全部通過。

- [ ] **Step 5: 提交卡片顯示修正**

```bash
git add src/components/PushThread.tsx src/components/__tests__/PushThread.test.tsx
git commit -m "fix: remove duplicate reply score badge"
```

### Task 6: 辨認作者專用 neutral 輸入畫面

**Files:**
- Modify: `src/lib/ptt/__tests__/adapter.test.ts`
- Modify: `src/lib/ptt/adapter.ts`

- [ ] **Step 1: 寫作者輸入畫面 failing tests**

新增測試讓 `X` 後畫面成為作者專用提示：

```ts
screen = "作者本人，使用 → 加註方式\n→ MBB200291:";
```

驗證 raw neutral 會直接送出內容並確認：

```ts
expect(sent).toEqual(["X", "噓1樓\r", "y\r"]);
```

另以相同畫面要求 raw `boo`，驗證只送 `X` 與 Ctrl-C，並回傳 `push-entry-timeout`，防止繞過 PTT 原生限制。

- [ ] **Step 2: 執行測試並確認 RED**

Run: `npx vitest run src/lib/ptt/__tests__/adapter.test.ts`

Expected: neutral 案例因現有 regex 不認得作者提示而回傳 `push-entry-timeout`。

- [ ] **Step 3: 擴充內容輸入狀態 regex**

將作者提示加入 `PUSH_CONTENT_PROMPT_RE`：

```ts
const PUSH_CONTENT_PROMPT_RE =
  /請輸入推文內容|輸入推文內容|推文內容[:：]|作者本人[，,]?\s*使用\s*→\s*加註方式/u;
```

不修改 `entry !== "content" || pushType !== "neutral"` 的既有安全檢查。

- [ ] **Step 4: 執行測試並確認 GREEN**

Run: `npx vitest run src/lib/ptt/__tests__/adapter.test.ts`

Expected: adapter test file 全部通過。

- [ ] **Step 5: 更新 notes 並執行完整驗證**

在 `dev-notes/goal-7-reply-vote-controls-implementation-notes.md` 記錄 follow-up 行為與真站提示根因，再執行：

```bash
npm test
npm run build
npm run lint
```

Expected: tests 與 build 通過；lint 0 errors，既有 warnings 另行記錄。

- [ ] **Step 6: 提交 terminal 修正與文件**

```bash
git add src/lib/ptt/adapter.ts src/lib/ptt/__tests__/adapter.test.ts dev-notes/goal-7-reply-vote-controls-implementation-plan.md dev-notes/goal-7-reply-vote-controls-implementation-notes.md dev-notes/implement.md
git commit -m "fix: support author neutral push input"
```
