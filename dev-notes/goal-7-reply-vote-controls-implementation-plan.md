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
