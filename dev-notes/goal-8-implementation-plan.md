# Goal 8：回文投票一致性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓回文分數只反映已去重的明確投票，並阻止同一回文在送票完成前重複送出 PTT 推文。

**Architecture:** `pushAggregator` 以 `pushVoters` 與 `booVoters` 作為回文分數的唯一來源。`Article` 以同步 `Set` 防止同一事件迴圈內的重複請求，再把 pending ID 集合傳入 `PushThread`，由 `VotePair` 停用該回文的兩個投票按鈕。

**Tech Stack:** TypeScript、React、Vitest、Testing Library

---

## 檔案配置

- 修改 `src/lib/ptt/pushAggregator.ts`：統一回文 `score` 的計算來源。
- 修改 `src/lib/ptt/__tests__/pushAggregator.test.ts`：鎖定方案 A、去重與混合情境。
- 修改 `src/components/VotePair.tsx`：接受共用 disabled 狀態。
- 修改 `src/components/PushThread.tsx`：把 per-push pending 狀態傳到所有層級回文。
- 修改 `src/components/__tests__/PushThread.test.tsx`：驗證指定回文的兩個按鈕停用。
- 修改 `src/components/Article.tsx`：加入同步 per-push in-flight guard。
- 新增 `src/components/__tests__/ArticlePushVoting.test.tsx`：驗證快速連點、跨回文並行、成功與失敗解鎖。
- 新增 `dev-notes/goal-8-implementation-notes.md`：記錄實作結果與樓號驗證。
- 修改 `dev-notes/implement.md`：完成後補上高階架構說明。

### Task 1：將回文 score 改為明確投票淨值

**Files:**
- Modify: `src/lib/ptt/__tests__/pushAggregator.test.ts`
- Modify: `src/lib/ptt/pushAggregator.ts`

- [ ] **Step 1：新增會失敗的方案 A 測試**

在 `投票者收集` 測試群組新增以下案例，並將既有「嵌套推文的 score 正確累計」改成單一推類別巢狀回覆但預期父回文仍為 `0`：

```ts
it("一般巢狀回覆不影響父回文 score", () => {
  const raw = [
    push("alice", "第一樓"),
    push("bob", "回1樓：同意", "01/01 12:01", "push"),
  ];
  const thread = aggregatePushes(raw, OP);
  const target = thread.pushes.find((item) => item.author === "alice")!;
  expect(target.score).toBe(0);
});

it("score 等於已去重的明確投票淨值", () => {
  const raw = [
    push("alice", "第一樓", "01/01 12:00", "neutral", 10, 1),
    push("bob", "推1樓", "01/01 12:01", "push", 20, 2),
    push("bob", "推1樓", "01/01 12:02", "push", 30, 3),
    push("carol", "推1樓", "01/01 12:03", "push", 40, 4),
    push("dave", "噓1樓", "01/01 12:04", "boo", 50, 5),
  ];
  const thread = aggregatePushes(raw, OP);
  const target = thread.pushes.find((item) => item.author === "alice")!;
  expect(target.pushVoters).toEqual(["bob", "carol"]);
  expect(target.booVoters).toEqual(["dave"]);
  expect(target.score).toBe(1);
});

it("同一 ID 先推後噓時 score 採最後方向", () => {
  const raw = [
    push("alice", "第一樓", "01/01 12:00", "neutral", 10, 1),
    push("bob", "推1樓", "01/01 12:01", "push", 20, 2),
    push("bob", "噓1樓", "01/01 12:02", "boo", 30, 3),
  ];
  const thread = aggregatePushes(raw, OP);
  const target = thread.pushes.find((item) => item.author === "alice")!;
  expect(target.score).toBe(-1);
});

it("混合明確投票與一般巢狀回覆時只計明確投票", () => {
  const raw = [
    push("alice", "第一樓", "01/01 12:00", "neutral", 10, 1),
    push("bob", "推1樓", "01/01 12:01", "push", 20, 2),
    push("carol", "回1樓：不同意", "01/01 12:02", "boo", 30, 3),
  ];
  const thread = aggregatePushes(raw, OP);
  const target = thread.pushes.find((item) => item.author === "alice")!;
  expect(target.score).toBe(1);
});
```

- [ ] **Step 2：執行測試並確認 RED**

Run:

```bash
npx vitest run src/lib/ptt/__tests__/pushAggregator.test.ts
```

Expected: FAIL；父回文仍由一般巢狀回覆累計，明確投票尚未寫入 `score`。

- [ ] **Step 3：以 voter 陣列計算 score**

在 voter 收集完成後設定：

```ts
for (const push of firstLayer) {
  push.score = push.pushVoters.length - push.booVoters.length;
}
```

刪除 Step 4 中依 `replyTo` 與推文類別建立 `scoreMap` 的舊邏輯，並更新檔案頂端與欄位註解，使 `score` 明確表示特殊投票淨值。

- [ ] **Step 4：執行聚合器測試並確認 GREEN**

Run:

```bash
npx vitest run src/lib/ptt/__tests__/pushAggregator.test.ts
```

Expected: PASS。

- [ ] **Step 5：提交分數修正**

```bash
git add src/lib/ptt/pushAggregator.ts src/lib/ptt/__tests__/pushAggregator.test.ts
git commit -m "fix: derive reply scores from explicit votes"
```

### Task 2：讓 VotePair 顯示回文 pending 狀態

**Files:**
- Modify: `src/components/VotePair.tsx`
- Modify: `src/components/PushThread.tsx`
- Modify: `src/components/__tests__/PushThread.test.tsx`

- [ ] **Step 1：新增會失敗的 pending UI 測試**

在 `PushThread.test.tsx` 新增：

```tsx
it("disables both vote buttons only for the pending push", () => {
  render(
    <PushThread
      score={0}
      pushes={[
        push({ id: "pending", content: "pending reply", anchorOrder: 10 }),
        push({ id: "ready", content: "ready reply", anchorOrder: 20 }),
      ]}
      onVote={() => {}}
      pendingVoteIds={new Set(["pending"])}
    />,
  );

  const pushButtons = screen.getAllByRole("button", { name: "推" });
  const booButtons = screen.getAllByRole("button", { name: "噓" });
  expect((pushButtons[0] as HTMLButtonElement).disabled).toBe(true);
  expect((booButtons[0] as HTMLButtonElement).disabled).toBe(true);
  expect((pushButtons[1] as HTMLButtonElement).disabled).toBe(false);
  expect((booButtons[1] as HTMLButtonElement).disabled).toBe(false);
});
```

- [ ] **Step 2：執行測試並確認 RED**

Run:

```bash
npx vitest run src/components/__tests__/PushThread.test.tsx
```

Expected: FAIL；`PushThread` 尚無 `pendingVoteIds` prop。

- [ ] **Step 3：加入最小 disabled 資料流**

在 `VotePairProps` 新增：

```ts
disabled?: boolean;
```

以同一個 `disabled` 值設定推與噓按鈕，並在 disabled 時使用 `not-allowed` cursor 與較低 opacity。

在 `PushThreadProps` 與遞迴 `PushItemProps` 新增：

```ts
pendingVoteIds?: ReadonlySet<string>;
```

將集合傳給所有 `PushItem`，並設定：

```tsx
<VotePair disabled={pendingVoteIds?.has(push.id) ?? false} />
```

- [ ] **Step 4：執行元件測試並確認 GREEN**

Run:

```bash
npx vitest run src/components/__tests__/PushThread.test.tsx
```

Expected: PASS。

- [ ] **Step 5：提交 pending UI**

```bash
git add src/components/VotePair.tsx src/components/PushThread.tsx src/components/__tests__/PushThread.test.tsx
git commit -m "fix: disable reply votes while submitting"
```

### Task 3：阻止同一回文重複送票

**Files:**
- Create: `src/components/__tests__/ArticlePushVoting.test.tsx`
- Modify: `src/components/Article.tsx`

- [ ] **Step 1：建立 Article 投票測試 fixture**

以 `ArticlePushEditing.test.tsx` 的 hook mock 結構建立 `ArticlePushVoting.test.tsx`。fixture 包含兩則第一層回文，並讓 `votePush` 與 `reload` 使用 hoisted mocks：

```ts
const mocks = vi.hoisted(() => ({
  votePush: vi.fn(),
  reload: vi.fn(),
}));
```

測試檔案使用以下完整 fixture 與 hook mocks：

```tsx
// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Article } from "../Article";

const mocks = vi.hoisted(() => ({
  votePush: vi.fn(),
  reload: vi.fn(),
}));

vi.mock("../../hooks/usePttActions", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../hooks/usePttActions")>();
  return {
    ...original,
    usePttActions: () => ({
      isLoggedIn: true,
      votePush: mocks.votePush,
      replyToArticle: vi.fn(),
      replyToPush: vi.fn(),
      voteArticle: vi.fn(),
      postArticle: vi.fn(),
      editArticle: vi.fn(),
      editPush: vi.fn(),
    }),
  };
});

vi.mock("../../hooks/useArticle", () => ({
  useArticle: () => ({
    article: null,
    partialArticle: null,
    cachedArticle: null,
    loading: false,
    reloading: false,
    error: null,
    reload: mocks.reload,
  }),
}));

const article = {
  title: "[測試] 回文投票",
  author: "op",
  date: "08/11",
  board: "Test",
  body: "正文",
  articleNotes: [],
  revisions: [],
  score: 0,
  pushes: [
    {
      id: "push-1",
      type: "neutral" as const,
      author: "alice",
      content: "第一則回文",
      time: "12:00",
      ipAddresses: [],
      isOP: false,
      replyTo: null,
      score: 0,
      floorNumber: 1,
      anchorOrder: 1,
      sourceFloors: [1],
      pushVoters: [],
      booVoters: [],
    },
    {
      id: "push-3",
      type: "neutral" as const,
      author: "carol",
      content: "第二則回文",
      time: "12:02",
      ipAddresses: [],
      isOP: false,
      replyTo: null,
      score: 0,
      floorNumber: 3,
      anchorOrder: 3,
      sourceFloors: [3],
      pushVoters: [],
      booVoters: [],
    },
  ],
};

function renderArticle() {
  return render(
    <Article
      boardName="Test"
      articleIndex={99}
      onBack={() => {}}
      currentUser="viewer"
      mockArticle={article}
    />,
  );
}

afterEach(cleanup);

beforeEach(() => {
  mocks.votePush.mockReset();
  mocks.reload.mockReset().mockResolvedValue(undefined);
});
```

- [ ] **Step 2：新增會失敗的快速連點測試**

```tsx
it("sends only one vote for rapid clicks on the same reply", async () => {
  let resolveVote!: (result: { ok: boolean }) => void;
  mocks.votePush.mockReturnValue(
    new Promise((resolve) => { resolveVote = resolve; }),
  );
  renderArticle();

  const pushButton = screen.getAllByRole("button", { name: "推" })[1];
  const booButton = screen.getAllByRole("button", { name: "噓" })[1];

  act(() => {
    pushButton.click();
    pushButton.click();
  });

  expect(mocks.votePush).toHaveBeenCalledTimes(1);
  expect(mocks.votePush).toHaveBeenCalledWith(1, "push", "Test");
  expect((pushButton as HTMLButtonElement).disabled).toBe(true);
  expect((booButton as HTMLButtonElement).disabled).toBe(true);

  resolveVote({ ok: true });
  await waitFor(() => expect((pushButton as HTMLButtonElement).disabled).toBe(false));
  expect(mocks.reload).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 3：執行測試並確認 RED**

Run:

```bash
npx vitest run src/components/__tests__/ArticlePushVoting.test.tsx
```

Expected: FAIL；快速連點呼叫兩次 `votePush`，且按鈕未進入 disabled。

- [ ] **Step 4：加入同步 per-push guard**

在 `Article` 新增：

```ts
const pendingPushVoteIdsRef = useRef(new Set<string>());
const [pendingPushVoteIds, setPendingPushVoteIds] = useState<Set<string>>(new Set());
```

在 `handlePushVote` 對非撤回操作加入同步 guard：

```ts
if (pendingPushVoteIdsRef.current.has(pushId)) return;
pendingPushVoteIdsRef.current.add(pushId);
setPendingPushVoteIds(new Set(pendingPushVoteIdsRef.current));

void actions.votePush(targetFloor, direction, boardName)
  .then((result) => {
    if (!result.ok) return;
    setMyPushVotes((previous) => new Map(previous).set(pushId, next));
    setPushVotes((previous) =>
      new Map(previous).set(pushId, buildOptimisticVoteState(push, currentUser, next)),
    );
    void liveReload();
  })
  .finally(() => {
    pendingPushVoteIdsRef.current.delete(pushId);
    setPendingPushVoteIds(new Set(pendingPushVoteIdsRef.current));
  });
```

把集合傳給討論串：

```tsx
<PushThread pendingVoteIds={pendingPushVoteIds} />
```

- [ ] **Step 5：確認快速連點測試 GREEN**

Run:

```bash
npx vitest run src/components/__tests__/ArticlePushVoting.test.tsx
```

Expected: PASS。

- [ ] **Step 6：新增失敗解鎖與不同回文並行測試**

加入以下失敗解鎖與不同回文並行案例：

```tsx
it("unlocks the reply after a failed vote", async () => {
  mocks.votePush.mockResolvedValue({ ok: false, reason: "PTT 拒絕寫入" });
  renderArticle();
  const pushButton = screen.getAllByRole("button", { name: "推" })[1];
  pushButton.click();
  await waitFor(() => expect((pushButton as HTMLButtonElement).disabled).toBe(false));
  pushButton.click();
  await waitFor(() => expect(mocks.votePush).toHaveBeenCalledTimes(2));
  expect(mocks.reload).not.toHaveBeenCalled();
});

it("allows votes for different replies while one is pending", () => {
  mocks.votePush.mockReturnValue(new Promise(() => {}));
  renderArticle();
  const pushButtons = screen.getAllByRole("button", { name: "推" });
  pushButtons[1].click();
  pushButtons[2].click();
  expect(mocks.votePush).toHaveBeenCalledTimes(2);
  expect(mocks.votePush).toHaveBeenNthCalledWith(1, 1, "push", "Test");
  expect(mocks.votePush).toHaveBeenNthCalledWith(2, 3, "push", "Test");
});
```

- [ ] **Step 7：執行 Article 與 PushThread 測試**

Run:

```bash
npx vitest run src/components/__tests__/ArticlePushVoting.test.tsx src/components/__tests__/PushThread.test.tsx
```

Expected: PASS。

- [ ] **Step 8：提交送票防重修正**

```bash
git add src/components/Article.tsx src/components/__tests__/ArticlePushVoting.test.tsx
git commit -m "fix: prevent duplicate reply vote submissions"
```

### Task 4：記錄樓號驗證並完成整體檢查

**Files:**
- Create: `dev-notes/goal-8-implementation-notes.md`
- Modify: `dev-notes/implement.md`

- [ ] **Step 1：驗證隱藏投票推文後的目標樓號**

在聚合器測試中使用 raw floor 1 的一般回文、raw floor 2 的 `推1樓`、raw floor 3 的一般回文及 raw floor 4 的 `推3樓`。確認：

```ts
expect(thread.pushes.some((item) => item.content === "推1樓")).toBe(false);
expect(thread.pushes.some((item) => item.content === "推3樓")).toBe(false);
expect(thirdFloor.pushVoters).toEqual(["dave"]);
expect(thirdFloor.sourceFloors).toEqual([3]);
```

此案例鎖定 PTT 原始推文樓號作為命令目標；隱藏投票可造成視覺樓號間隔，但 UI 以 `sourceFloors[0]` 送出，仍會投到正確目標。

- [ ] **Step 2：執行聚合器測試**

Run:

```bash
npx vitest run src/lib/ptt/__tests__/pushAggregator.test.ts
```

Expected: PASS；`sourceFloors[0]` 與投票解析皆使用相同的 PTT 原始樓號。

- [ ] **Step 3：新增 implementation notes**

記錄以下內容：

```markdown
# Goal 8：回文投票一致性 Implementation Notes

## 結果

- 回文 score 改由已去重的明確投票者清單推導。
- 同一回文送票期間以同步 guard 阻止重複 PTT 推文。
- pending 狀態只鎖定目標回文，成功與失敗皆會解除。
- 投票命令沿用 PTT 原始推文樓號；隱藏命令不會改變後續目標解析。

## 實作細節

- React state 負責畫面，ref 內的 Set 負責同一 render 期間的同步防重。
- 一般 `回x樓：` 不再參與父回文 score。
- 未納入投票撤回；由 Goal 9 處理。
```

- [ ] **Step 4：更新高階實作文件**

在 `dev-notes/implement.md` 的投票相關段落補充：

```markdown
- 回文推噓分以 `pushVoters.length - booVoters.length` 計算；一般巢狀回覆不影響父回文分數。
- 回文送票以 per-push 同步 pending guard 防止快速連點造成重複 PTT 推文。
```

- [ ] **Step 5：執行完整驗證**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: 23 個以上測試檔案全部通過；lint 無 error；build 成功；diff check 無錯誤。

- [ ] **Step 6：提交文件與樓號回歸測試**

```bash
git add src/lib/ptt/__tests__/pushAggregator.test.ts dev-notes/goal-8-implementation-notes.md dev-notes/implement.md
git commit -m "docs: record reply vote consistency implementation"
```

- [ ] **Step 7：確認分支狀態**

```bash
git status --short --branch
git log --oneline dev..HEAD
```

Expected: worktree clean；提交只存在 `bugfix/reply-vote-consistency`，未合併至 `dev` 或 `main`。
