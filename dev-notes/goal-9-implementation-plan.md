# Goal 9 Core Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 PTTzzz 拆成可獨立發布的 `@pttzzz/core`、`@pttzzz/browser` 與官方 React 參考應用，並建立白皮書、conformance fixtures 與供 AI 建立替代 UI 的公開介面文件。

**Architecture:** 先用白皮書和 fixture 固定 Goal 3／Goal 7 語意，再以相容 re-export 將純 parser／aggregator 移入 core、將現有 adapter 移入 browser，最後以 `PttzzzClient` 收斂 hooks。全程保持既有功能可執行；不重寫 terminal workflow、不引入 monorepo framework，也不在第一版實作 Node gateway。

**Tech Stack:** TypeScript 5、npm workspaces、Vitest、Vite、React 18、Zustand、`ptt-client`。

---

## 執行界線

- 分支：`feature/goal-9-core-architecture`；工作樹：`.worktrees/goal-9-core-architecture`。
- 規範：`dev-notes/goal-9-core-architecture-design.md`；不得修改 `dev-notes/spec.md`。
- 初始基準：26 個測試檔、385 項測試通過。
- 每個 task 單獨 commit；失敗時在原 task 修正，不帶破損狀態往後。
- Core 不依賴 React、Zustand、DOM、WebSocket、`ptt-client` 或 browser storage。
- 第一版只發布 core 與 browser；不新增 Node gateway、framework package、`ptt-client-browser` 或 Turborepo。

## 最終結構

```text
packages/core/src/        規則、DTO、contracts、PttzzzClient
packages/browser/src/     ptt-client adapter、fake adapter、browser factory
apps/web/                 現有 React UI 參考實作
docs/whitepaper/          規範性白皮書
docs/api/                 人類與 AI 可讀 API 文件
docs/examples/            最小整合範例
docs/fixtures/            rule-ID conformance fixtures
```

## Phase 1：固定規則與公開契約

### Task 1: 建立規則編號白皮書

**Files:**
- Create: `docs/whitepaper/pttzzz-core.md`
- Read: `dev-notes/reply-handling-rule.md`
- Read: `dev-notes/goal-7-vote-model-review.html`
- Read: `dev-notes/spec.md`

- [x] **Step 1: 建立分類表**

```markdown
| Prefix | 範圍 |
|---|---|
| `RAW-*` | 原始 PTT 推文與樓號 |
| `THREAD-*` | 續接、聚合與巢狀層級 |
| `VOTE-*` | 文章／回文投票、去重與撤回 |
| `EDIT-*` | append、replace、withdraw、opaque payload |
| `PARTIAL-*` | 漸進載入暫定與最終狀態 |
```

- [x] **Step 2: 逐條寫出輸入、結果與限制**

至少固定：`RAW-001` 原始樓號不等於 UI 順序；`THREAD-001` 五分鐘聚合；`THREAD-002` `||`；`THREAD-003` 滿行拼接；`THREAD-004` 各種回樓 pattern；`THREAD-005` 推／噓 x 樓加文字同時回覆與投票；`THREAD-006` 續行不跨 target；`THREAD-007` 最深三層；`VOTE-001` 純文章票；`VOTE-002` 純回文票；`VOTE-003` PTT 類別影響文章原生分數；`VOTE-004` 回文票依內容；`VOTE-005` 同帳號最後方向；`VOTE-006` 撤回；`EDIT-001` outer command；`EDIT-002` opaque payload；`EDIT-003` withdraw 空格；`PARTIAL-001` incomplete/final。

- [x] **Step 3: 引用 HTML cases**

每條規則連回對應 HTML case，並明列白皮書是 normative source、HTML 是 review example。

- [x] **Step 4: 驗證無 placeholder**

Run: `rg -n "TODO|TBD|待確認|之後再" docs/whitepaper/pttzzz-core.md`

Expected: 無輸出。

- [x] **Step 5: Commit**

```bash
git add docs/whitepaper/pttzzz-core.md
git commit -m "docs: define normative core rules"
```

### Task 2: 建立 machine-readable conformance fixtures

**Files:**
- Create: `docs/fixtures/thread-events/schema.json`
- Create: `docs/fixtures/thread-events/aggregation.json`
- Create: `docs/fixtures/thread-events/nested-replies.json`
- Create: `docs/fixtures/thread-events/votes-and-edits.json`
- Create: `src/lib/ptt/__tests__/whitepaperFixtures.test.ts`

- [x] **Step 1: 寫 fixture runner 測試**

```ts
function stableThread(rawPushes: RawPush[], articleAuthor: string) {
  const result = aggregatePushes(rawPushes, articleAuthor);
  const authorById = new Map(result.pushes.map((push) => [push.id, push.author]));
  return {
    replies: result.pushes.map((push) => ({
      author: push.author,
      content: push.content,
      replyToAuthor: push.replyTo ? authorById.get(push.replyTo) ?? null : null,
      score: push.score,
    })),
    nativeArticleScore: result.nativeArticleScore,
    articlePushVoters: result.articlePushVoters,
    articleBooVoters: result.articleBooVoters,
  };
}
```

- [x] **Step 2: Run to verify fixtures 尚不存在**

Run: `npx vitest run src/lib/ptt/__tests__/whitepaperFixtures.test.ts`

Expected: FAIL，指出 fixture module 不存在。

- [x] **Step 3: 加入 schema 與案例**

每個 case 必須有 `id`、`rules`、`articleAuthor`、完整 `RawPush[]` 與 `expected`。涵蓋一般／強制聚合、滿行、多 target 交錯、三層與超深回覆、文章票、回文票、帶文字回文票、重複與反向票、撤回、append、replace、withdraw、opaque payload。

```json
{
  "id": "VOTE-005-last-direction-wins",
  "rules": ["VOTE-002", "VOTE-005"],
  "articleAuthor": "op",
  "rawPushes": [
    { "type": "neutral", "author": "carol", "content": "原始內容", "time": "08/12 22:06" },
    { "type": "neutral", "author": "alice", "content": "推1樓", "time": "08/12 22:07" },
    { "type": "neutral", "author": "alice", "content": "噓1樓", "time": "08/12 22:08" }
  ],
  "expected": {
    "replies": [{ "author": "carol", "content": "原始內容", "replyToAuthor": null, "score": -1 }],
    "nativeArticleScore": 0,
    "articlePushVoters": [],
    "articleBooVoters": []
  }
}
```

- [x] **Step 4: Run fixtures and aggregator regression**

Run: `npx vitest run src/lib/ptt/__tests__/whitepaperFixtures.test.ts src/lib/ptt/__tests__/pushAggregator.test.ts`

Expected: PASS。

- [x] **Step 5: Commit**

```bash
git add docs/fixtures/thread-events src/lib/ptt/__tests__/whitepaperFixtures.test.ts
git commit -m "test: add core conformance fixtures"
```

### Task 2A: 修正抽取前的 conformance gaps

Task 2 首次 RED 揭露一個 normalized-state 可觀察性 gap、一個日期邊界 bug，以及白皮書對 canonical CASE 14 的表述偏差。先修正根因，再回到 Task 2 規格與品質審查；不得以放寬 fixture expected 取得綠燈。

**Files:**
- Modify: `docs/whitepaper/pttzzz-core.md`
- Modify: `docs/fixtures/thread-events/aggregation.json`
- Modify: `docs/fixtures/thread-events/votes-and-edits.json`
- Modify: `src/lib/ptt/pushAggregator.ts`
- Modify: `src/lib/ptt/__tests__/pushAggregator.test.ts`
- Modify: `src/lib/ptt/__tests__/whitepaperFixtures.test.ts`

- [x] **Step 1: 固定文章反向票的解析慣例**

依 canonical HTML CASE 14，將 VOTE-006 明確寫成：同作者相反方向的連續純文章票，在 raw-only reducer 中視為抵銷，應用層按鈕回到 0/0；兩筆 PTT 類別仍各自影響原生分數。第三筆純票才建立新的目前方向。Fixture expected 必須回復 Alice 不在 push/boo voters，不能把第二筆當成最後方向 boo。

- [x] **Step 2: 固定 THREAD-001／002 的時間語意**

依 `spec.md` 與 `reply-handling-rule.md`，同作者片段在「連續，或不連續但時間差 ≤5 分鐘」時符合時間條件。連續片段不因顯示時間超過五分鐘而拆開；不連續片段才必須能解析時間且差值 ≤5 分鐘。`||` 只覆蓋終止符，不能覆蓋作者或 target。

- [x] **Step 3: 寫日期與 malformed time 的 RED tests**

加入以下 direct tests：

- 連續同作者、同 target，即使相隔六分鐘仍可續接。
- 不連續同作者相隔六分鐘不續接。
- 不連續同作者從 `01/31 23:59` 到 `02/01 00:00` 視為一分鐘並可續接。
- 不連續且任一時間 malformed／缺失時不續接；連續片段仍由連續條件判定。

- [x] **Step 4: 修正時間解析根因**

以真正的月日換算取代固定每月 31 天；時間 parser 對 malformed／越界日期回傳 `null`。跨年取最短的年度環狀差。聚合條件保持：

```ts
if (canContinueFromPush(lastPush) && (isConsecutive || timeOk)) {
  sameGroup.pushes.push(cur);
}
```

其中 `timeOk` 只在兩個 timestamp 都有效時成立。不要改 terminator、author 或 target guard。

- [x] **Step 5: GREEN 並更新 fixtures**

Normative fixture 必須分別含：連續六分鐘仍合併、不連續六分鐘不合併、marker 後立即同作者不同 target 不合併。

Run: `npx vitest run src/lib/ptt/__tests__/pushAggregator.test.ts src/lib/ptt/__tests__/whitepaperFixtures.test.ts`

Expected: THREAD-001／002、日期邊界與文章反向票 cases PASS；只剩 EDIT-003 projection 尚待完成。

- [x] **Step 6: 先寫 EDIT-003 normalized-event failing test**

新增 `normalizeThreadEvents(rawPushes)` 的測試，輸入一則內容與同作者 Withdraw command，期待原事件保留原始樓號、`content: " "`、`withdrawn: true`、`visible: false`。Run focused test，Expected: FAIL，function 尚不存在。

- [x] **Step 7: 抽出最小 normalized-event projection**

將 aggregate 目前既有的 parse-intent + `applyPushEdits()` 初始化抽成共用內部 helper；公開純函式只回傳 conformance/debug 所需欄位，不暴露 mutable `ParsedRawPush`：

```ts
export interface NormalizedThreadEvent {
  rawFloor: number;
  author: string;
  content: string;
  withdrawn: boolean;
  visible: boolean;
}
```

Withdraw 的 `content` 從最後一筆 edit history 取得單一空格；一般內容取 outer edit 後 body。`aggregatePushes()` 重用同一 helper，避免測試與實際聚合產生兩套 parser。

- [x] **Step 8: 讓 EDIT-003 fixture 斷言完整 normalized projection**

Fixture 增加 `expectedNormalizedEvents`；runner 呼叫 `normalizeThreadEvents()` 比較完整陣列，不以 expected floors 過濾實際輸出。Visible aggregate 仍排除 withdrawn event，不建立空白卡片。

- [x] **Step 9: 執行 fixture schema validation**

不新增 dependency。以 `unknown` 輸入的 runtime validator 檢查三份 fixture arrays：required fields、push type enum、string/number/boolean、expected/stages/normalized shapes，並拒絕未宣告欄位。移除 `as FixtureCase[]` unchecked cast；加入一個缺少 `id` 或錯誤 push type 的 negative test，確認 validator throw。JSON Schema 保留為跨語言契約，TypeScript validator 是 test runner 的 executable boundary。

- [x] **Step 10: 完整驗證與 commit**

```bash
npx vitest run src/lib/ptt/__tests__/pushAggregator.test.ts src/lib/ptt/__tests__/whitepaperFixtures.test.ts
npm test
npm run build
git diff --check
```

Expected: focused/full/build PASS；conformance fixtures 18 個 rule IDs 全部有可執行 assertion。

```bash
git add docs/whitepaper/pttzzz-core.md docs/fixtures/thread-events src/lib/ptt/pushAggregator.ts src/lib/ptt/__tests__
git commit -m "fix: close core conformance gaps"
```

### Task 3: 建立 public contract 與 AI UI guide

**Files:**
- Create: `docs/api/contracts.md`
- Create: `docs/api/AI-INTERFACE.md`
- Create: `docs/examples/minimal-browser/README.md`
- Create: `docs/examples/react-store/README.md`
- Create: `docs/examples/vue-composable/README.md`
- Create: `docs/examples/rendering/README.md`
- Create: `docs/examples/error-handling/README.md`

- [x] **Step 1: 寫完整 contracts**

依設計文件定義 `Result`、`CoreError`、`WriteOutcome`、`CoreEvent`、`PttGateway` 與 `PttzzzClient`。每個 method 記錄 input、success value、expected errors、是否可能 `uncertain` 及是否產生 partial event。

- [x] **Step 2: 寫 AI interface guide**

順序固定為：安裝、建立 client、登入、讀看板、讀文章、subscribe/unsubscribe、寫入、錯誤、partial、禁止事項。禁止 deep import、自行格式化控制 pattern、用顯示順序當樓號、自動 retry uncertain、重算 score/tree、正常 UI 顯示 source floor、把 partial 當 complete。

- [x] **Step 3: 建立五個最小範例**

所有範例使用同一組 public API 名稱；Vue 只示範 composable，不宣告官方 Vue package。

- [x] **Step 4: 驗證名稱一致**

```bash
rg -n "PttzzzClient|PttGateway|WriteOutcome|CoreEvent|replyId" docs/api docs/examples
rg -n "TODO|TBD|待確認|from .*/src/" docs/api docs/examples
```

Expected: 第一個命令在 contracts 與 examples 有命中；第二個無輸出。

- [x] **Step 5: Commit**

```bash
git add docs/api docs/examples
git commit -m "docs: define public and AI interface contracts"
```

## Phase 2：抽出 pure core

### Task 4: 建立 npm workspace 與 core package

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `tsconfig.base.json`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/src/index.test.ts`

- [x] **Step 1: 寫 failing public-entry test**

```ts
import { describe, expect, it } from "vitest";
import * as core from "./index";

describe("@pttzzz/core public entry", () => {
  it("loads without browser globals", () => expect(core).toBeDefined());
});
```

- [x] **Step 2: Run to verify package 尚未建立**

Run: `npx vitest run packages/core/src/index.test.ts`

Expected: FAIL，找不到 package test。

- [x] **Step 3: 建立最小 workspace**

Root 加 `workspaces: ["packages/*", "apps/*"]` 與暫時只執行 core build 的 `build:packages`。Task 9 建立 browser package時再把 browser build 接在後面，避免不存在的 workspace 令 Task 4 失敗。`packages/core/package.json` 使用 `@pttzzz/core@0.1.0`、ESM、`files: ["dist"]`、root export 指向 dist、scripts `build: tsc -p tsconfig.json` 與 `test: vitest run src`。`tsconfig.base.json` 使用 ES2020、ESNext、bundler、strict、`resolveJsonModule: true`，不能包含 DOM lib。Package tsconfig 排除 `src/**/*.test.ts`，避免把 Vitest 與 repo 外 fixtures 納入發布 build。

- [x] **Step 4: 建立空 entry 並驗證**

```ts
export {};
```

```bash
npm install
npx vitest run packages/core/src/index.test.ts
npm run build -w @pttzzz/core
```

Expected: PASS，產生 core dist JS 與 declarations。

- [x] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.base.json packages/core
git commit -m "build: add core workspace package"
```

### Task 5: 將 parser 移入 core 並保留舊入口

**Files:**
- Move: `src/lib/ptt/parser.ts` → `packages/core/src/parser.ts`
- Move: `src/lib/ptt/__tests__/parser.test.ts` → `packages/core/src/parser.test.ts`
- Create: `src/lib/ptt/parser.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: 先讓 public-entry test 要求 parser export**

在既有 `packages/core/src/index.test.ts` 加入：

```ts
import { stripAnsi } from "./index.js";

it("exports parser helpers", () => {
  expect(stripAnsi("\u001b[31m推\u001b[0m")).toBe("推");
});
```

Run: `npx vitest run packages/core/src/index.test.ts`

Expected: FAIL，`stripAnsi` 尚未由 core export。

- [x] **Step 2: Mechanical move only**

```bash
git mv src/lib/ptt/parser.ts packages/core/src/parser.ts
git mv src/lib/ptt/__tests__/parser.test.ts packages/core/src/parser.test.ts
```

搬移後把 parser test import 改成 `./parser.js`。不得修改 regex、樓號、byte 或文章切割語意。

- [x] **Step 3: 建 public 與 compatibility export**

所有 package-local ESM specifier 都使用 `.js` 後綴，使 `tsc` 產物可直接由 Node ESM 載入。Core index 加 `export * from "./parser.js";`；舊檔完整內容：

```ts
export * from "../../../packages/core/src/parser";
```

- [x] **Step 4: 驗證**

```bash
npx vitest run packages/core/src/parser.test.ts src/lib/ptt/__tests__/adapter.test.ts
npm run build -w @pttzzz/core
```

Expected: PASS。

- [x] **Step 5: Commit**

```bash
git add packages/core/src src/lib/ptt/parser.ts
git commit -m "refactor: move parser into core package"
```

### Task 6: 將 aggregator、editing 與 action formatter 移入 core

**Files:**
- Move: `src/lib/ptt/pushAggregator.ts` → `packages/core/src/pushAggregator.ts`
- Move: `src/lib/ptt/__tests__/pushAggregator.test.ts` → `packages/core/src/pushAggregator.test.ts`
- Move: `src/lib/ptt/pushEditing.ts` → `packages/core/src/pushEditing.ts`
- Move: `src/lib/ptt/__tests__/whitepaperFixtures.test.ts` → `packages/core/src/whitepaperFixtures.test.ts`
- Create: `packages/core/src/actions.ts`
- Create: `packages/core/src/actions.test.ts`
- Create: compatibility files at old aggregator/editing paths
- Modify: `src/hooks/usePttActions.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: 寫 formatter failing tests**

```ts
expect(formatReplyToReply(12, " 同意 ")).toBe("回12樓：同意");
expect(formatReplyVote(12, "push")).toBe("推12樓");
expect(formatReplyVoteWithdrawal(12, "boo")).toBe("撤回我對12樓的噓");
expect(formatBoardReplyTitle("Re: Re: 標題")).toBe("Re: 標題");
expect(canVote(1, "push")).toBe(false);
expect(canVote(1, "boo")).toBe(true);
```

- [x] **Step 2: Run to verify missing actions**

Run: `npx vitest run packages/core/src/actions.test.ts`

Expected: FAIL。

- [x] **Step 3: Move pure files without semantic edits**

用 `git mv` 搬移四個檔案，改 package-local imports。舊檔僅 re-export core。

- [x] **Step 4: 實作最小 actions**

```ts
export type VoteDirection = "push" | "boo";
export const formatReplyToReply = (floor: number, content: string) =>
  `回${floor}樓：${content.trim()}`;
export const formatReplyVote = (floor: number, direction: VoteDirection) =>
  `${direction === "push" ? "推" : "噓"}${floor}樓`;
export const formatReplyVoteWithdrawal = (floor: number, direction: VoteDirection) =>
  `撤回我對${floor}樓的${direction === "push" ? "推" : "噓"}`;
export const formatBoardReplyTitle = (title: string) =>
  `Re: ${title.replace(/^(?:Re:\s*)+/giu, "").trim()}`;
export const canVote = (current: -1 | 0 | 1, direction: VoteDirection) =>
  !((current === 1 && direction === "push") || (current === -1 && direction === "boo"));
```

- [x] **Step 5: 移除 hook 重複 formatter 並驗證**

`usePttActions.ts` 先從 core import/re-export 相同名稱 alias，避免同 task 修改 component。

```bash
npx vitest run packages/core/src
npm test
npm run build -w @pttzzz/core
```

Expected: PASS。

- [x] **Step 6: Commit**

```bash
git add packages/core src/lib/ptt src/hooks/usePttActions.ts
git commit -m "refactor: extract thread rules into core"
```

## Phase 3：抽出 browser gateway

### Task 7: 定義 Result、event 與 gateway contracts

**Files:**
- Create: `packages/core/src/contracts.ts`
- Create: `packages/core/src/contracts.test.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: 寫 helper failing tests**

```ts
expect(ok(42)).toEqual({ ok: true, value: 42 });
expect(fail({ code: "NOT_FOUND", message: "missing", retryable: false })).toEqual({
  ok: false,
  error: { code: "NOT_FOUND", message: "missing", retryable: false },
});
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/src/contracts.test.ts`

Expected: FAIL。

- [x] **Step 3: 實作固定型別**

```ts
export type Result<T, E = CoreError> =
  | { ok: true; value: T }
  | { ok: false; error: E };
export type WriteOutcome = "not-sent" | "sent" | "uncertain";
export interface CoreError {
  code: string;
  message: string;
  retryable: boolean;
  outcome?: WriteOutcome;
  cause?: unknown;
}
export type Unsubscribe = () => void;
```

同檔定義 `CoreEvent`、公開 DTO 與目前 `PttAdapter` 能力的 `PttGateway`；排除任意 `send()`。將目前 adapter 內的 `AdapterArticleData` 正式改名為 `ArticleData`，並連同 `PartialArticleData`、login/action request shapes 移成 core-owned DTO；compatibility export 暫時提供 `type AdapterArticleData = ArticleData`。Browser adapter 後續只能 import，不能再定義副本。Gateway 寫入可接受 transport floor，公開 client input 不可接受。

- [x] **Step 4: Run tests/build and commit**

```bash
npx vitest run packages/core/src/contracts.test.ts
npm run build -w @pttzzz/core
```

Expected: PASS。

```bash
git add packages/core/src
git commit -m "feat: define core gateway contracts"
```

### Task 8: 依真實 PTT 能力收斂 gateway 與看板契約

Task 7 的型別先依設計稿建立；實作前必須以現有 adapter 與 `ptt-client` 能力校正，不能把尚未存在的 terminal workflow 假裝成已支援。0.1 直接採新 `PttGateway` 作為 browser 對外 gateway；舊 positional adapter 只會成為未發布的 terminal driver，不是第二套公開 API。

**Files:**
- Modify: `packages/core/src/contracts.ts`
- Modify: `packages/core/src/contracts.test.ts`
- Modify: `docs/api/contracts.md`
- Modify: `docs/api/AI-INTERFACE.md`
- Modify: `dev-notes/goal-9-core-architecture-design.md`

- [x] **Step 1: 用 type tests 固定看板語意**

看板清單必須區分 PTT 的熱門、我的最愛與分類目錄；搜尋明定為看板名稱 prefix search，不宣稱全文搜尋。分類位置以 session-scoped opaque cursor 表示，UI 不得解析 terminal offsets。

```ts
export type BoardListEntry =
  | { kind: "board"; board: Board }
  | { kind: "category"; title: string; categoryCursor: string };

export interface BoardPage {
  kind: "boards";
  items: readonly Board[];
  nextCursor?: string;
}

export interface BoardDirectoryPage {
  kind: "directory";
  items: readonly BoardListEntry[];
  nextCursor?: string;
}

export type BoardListPage = BoardPage | BoardDirectoryPage;

export type BoardListSource =
  | { kind: "hot" }
  | { kind: "favorite" }
  | { kind: "category"; categoryCursor?: string };

export interface ListBoardsInput {
  source?: BoardListSource;
  cursor?: string;
  limit?: number;
}

export interface SearchBoardsInput {
  prefix: string;
  cursor?: string;
  limit?: number;
}

export type FilterBoardsInput = { cursor?: string; limit?: number } & (
  | { favorite: true; categoryCursor?: string }
  | { favorite?: true; categoryCursor: string }
);
```

`listBoards()` 回傳 `BoardListPage`；`searchBoards()`／`filterBoards()` 只回傳 `BoardPage`，category entry 不得混入搜尋或篩選結果。`filterBoards()` 至少需要 `favorite: true` 或 `categoryCursor`；兩者同時存在時取交集，`favorite: false` 無效。所有 cursor 都是不透明、session-scoped routing token，不可持久化或反解。

- [x] **Step 2: RED／GREEN contracts**

先加入 `expectTypeOf` 與 `@ts-expect-error` cases，證明 `query`、自由文字 `category` 與 terminal offsets 不能進入 public input；再修改型別與文件。

Run: `npx vitest run packages/core/src/contracts.test.ts --typecheck`

Expected: 先 FAIL，修改後 PASS。

- [x] **Step 3: 固定實作邊界**

文件明列：

- `PttGateway` 是 browser 與 fake 都必須實作的唯一 gateway contract。
- 真實 terminal driver 可有 positional args、raw floor 與 screen helpers，但只存在 `packages/browser/src/internal/`，不從 package exports 公開。
- `@pttzzz/browser` root 最終只提供 `createBrowserGateway()`、`createBrowserClient()` 與穩定 browser types；一般 UI 不可取得 raw `send()`。
- `listBoards()` 預設熱門看板；分類目錄可能回傳 category entry；`searchBoards()` 只做 prefix search。
- Connect/login/read gateway methods 以 core-owned `GatewayError` 傳遞可預期失敗；`PttzzzClient` 將其正規化成 public `Result<..., CoreError>`。未知 throw 才正規化為 `GATEWAY_FAILURE`。Gateway disconnect 的預期 `GatewayError` 由 client 在清除 local state 後吸收；未知程式錯誤仍可 throw。寫入仍只用 discriminated `ActionReceipt`，不得以 throw 取代可判定的送出結果。

```ts
export class GatewayError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly cause?: unknown,
  ) {
    super(message);
  }
}
```

- [x] **Step 4: 驗證並 commit**

```bash
npx vitest run packages/core/src/contracts.test.ts --typecheck
npm run build -w @pttzzz/core
git diff --check
git add packages/core/src/contracts.ts packages/core/src/contracts.test.ts docs/api/contracts.md docs/api/AI-INTERFACE.md dev-notes/goal-9-core-architecture-design.md
git commit -m "refactor: align gateway with ptt capabilities"
```

### Task 9: 建立 browser package 並私有化 terminal driver

**Files:**
- Create: `packages/browser/package.json`
- Create: `packages/browser/tsconfig.json`
- Create: `packages/browser/vitest.config.ts`
- Move: `src/lib/ptt/adapter.ts` → `packages/browser/src/internal/terminalDriver.ts`
- Move: `src/lib/ptt/__tests__/adapter.test.ts` → `packages/browser/src/internal/terminalDriver.test.ts`
- Create: `packages/browser/src/index.ts`
- Create: `src/lib/ptt/adapter.ts`
- Modify: `vite.config.ts`
- Modify: `tsconfig.app.json`
- Modify: root `package.json` and `package-lock.json`

- [x] **Step 1: 寫 package-boundary failing test**

測試 browser root 不 export `PttAdapter`、raw `send` 或 terminal driver；internal test 可直接建立 driver 以保留現有 UI 的過渡相容性。

Run: `npx vitest run packages/browser/src/index.test.ts`

Expected: FAIL，browser package 尚未完成。

- [x] **Step 2: 建立 package manifest**

使用 `@pttzzz/browser@0.1.0`、ESM、dist root、dependency `@pttzzz/core: 0.1.0` 與直接宣告的 `ptt-client: ^0.9.0`。不發布 `./internal` subpath；package root 暫時可以是空的穩定入口，Task 10 再加入 gateway factory，Task 12 加入 client factory。

- [x] **Step 3: Mechanical move only**

搬移 3,700 行 workflow 與原測試，不改 prompt regex、terminal keys 或成功／失敗判讀。將現有 `PttAdapter` 重新命名為 package-private `TerminalDriver`；它可以暫時保留 positional methods、raw floor 與 `send()`，但不得由 `packages/browser/src/index.ts` 或 package exports 暴露。

DTO 從 `@pttzzz/core` import；parser、aggregator、editing 與 actions 從 `@pttzzz/core/internal` import。所有 package-local ESM specifier 使用 `.js`。將未直接宣告的 `sleep-promise` 改為原生 `new Promise((resolve) => setTimeout(resolve, ms))` helper。

- [x] **Step 4: 保留 repo 內過渡 shim**

現有 `src/lib/ptt/adapter.ts` 只為尚未遷移的 React hooks 轉接到 workspace source，不成為 npm export；Task 17 遷移完 UI 後刪除。不得為此新增已發布的 legacy subpath。

- [x] **Step 5: 建 aliases 與驗證**

Vite／TypeScript aliases 同時解析 `@pttzzz/core`、`@pttzzz/core/internal` 與 `@pttzzz/browser`；publish exports 仍指 dist。Root `build:packages` 依序 build core、browser。

```bash
npx vitest run packages/browser/src/internal/terminalDriver.test.ts
npm test
npm run build:packages
npm run lint
```

Expected: PASS；browser root 沒有 legacy API，dist 無 React/Zustand import。

- [x] **Step 6: Commit**

```bash
git add package.json package-lock.json packages/browser src/lib/ptt/adapter.ts vite.config.ts tsconfig.app.json
git commit -m "refactor: isolate browser terminal driver"
```

### Task 10: 實作 BrowserPttGateway 與看板操作

**Files:**
- Create: `packages/browser/src/gateway.ts`
- Create: `packages/browser/src/gateway.test.ts`
- Create: `packages/browser/src/gatewayContract.test.ts`
- Modify: `packages/browser/src/internal/terminalDriver.ts`
- Modify: `packages/browser/src/index.ts`

- [x] **Step 1: 寫新 gateway failing tests**

以 stub Bot／terminal transcripts 建立真實 gateway 測試，不連 live PTT。至少覆蓋：

- `login(LoginInput)` object API。
- `subscribe()` 回傳 unsubscribe，並把 status 轉成 `GatewayEvent`。
- `readArticle()` 依序 yield incomplete／final `RawArticleSource`，且完整保留輸入的 `ArticleKey` 表示。
- `execute(PttCommand)` 分派到 terminal workflow 並正規化 `ActionReceipt`。
- behavioral contract 必須覆蓋全部 command variant，包含獨立的 `reply-article-to-board`、帶 category 的 create，以及只傳更新正文並保留 index/AID identity 的 edit。
- package root 沒有 `send()`、raw screen 或 positional action methods。

Run: `npx vitest run packages/browser/src/gateway.test.ts`

Expected: FAIL，`BrowserPttGateway` 尚不存在。

- [x] **Step 2: 實作薄 gateway，不重寫 terminal workflow**

`BrowserPttGateway implements PttGateway`，只負責 object/command/event 轉換與錯誤正規化。既有 terminal method 暫時由私有 driver 執行；不可讓新 gateway 同時實作 legacy interface，也不可把 raw floor 暴露到 UI contract。

`readArticle()` 必須在 terminal driver 的原始 snapshot 邊界取得 raw source，不可把已聚合的 `ArticleData` 假裝成 raw。stream 只保留最新 incomplete 與 final 的有界 pending 狀態；iterator `return()`／`AbortSignal` 必須停止後續事件、恢復穩定 terminal 狀態並立即釋放 serialized queue。

所有含 `ArticleKey` 的 push／vote／edit／withdraw／delete／回應看板 command，必須在 terminal driver 的同一個 serialized operation 內重新定位 index/AID、驗證開啟文章身分後才送出第一個不可逆按鍵；不得沿用前一次 read 留下的 article screen，也不得在 gateway 先 read、稍後另開 write task。index 的獨立證據來自實際看板分頁 row，AID 的獨立證據來自 `Q` 文章資訊中的 canonical AID／board；同一 locator 自行讀出 expected identity 不算驗證。transcript 至少覆蓋 read → board list → write、較舊 index 的分頁定位，以及錯誤 index/AID 對所有 write family 都不送 `X`／`E`／`d`／`y`。

- [x] **Step 3: 實作真實看板能力**

- `listBoards()`：以 `ptt-client` Board query／既有 screen parser 實作 hot、favorite、category；預設 hot。
- `searchBoards()`：使用 PTT prefix search；空 prefix reject core-owned `GatewayError("INVALID_INPUT", ...)`，不得宣稱全文搜尋。
- `filterBoards()`：favorite、category cursor 或交集；未知／跨 session cursor reject structured `GatewayError`，不把 cursor 當 terminal offset 公開。
- 分頁 cursor 由 gateway 發行且 session-scoped；cursor 綁定 normalized query 與 limit，保存 immutable remaining snapshot（或等價的穩定 backend continuation），續頁不得重新抓取後套用可變 offset。測試不得依賴 cursor 內部格式。
- board/article cursor 使用每 instance/session 的隨機 namespace；只有成功登入與 disconnect 輪替，登入失敗不得清除既有 cursor。文章 list/search/filter cursor 不得接受 caller 提供的 terminal index，且必須綁定原查詢 signature 與 limit。
- article filter 的 author 與 author+keyword 必須映射到真實 terminal search；不可回傳未過濾資料。

以 transcripts 覆蓋熱門、最愛、根分類、子分類、prefix 無結果、invalid cursor、分頁與 terminal 狀態復原。

- [x] **Step 4: 統一 write receipt**

第一個不可逆按鍵前失敗是 `not-sent`；成功畫面是 `sent`；save/delete/content confirmation key 已送出後的 timeout 或模糊結果是 `uncertain`。未標註的 legacy failure 預設 `uncertain`。所有 outcome 預設 `retryable: false`；只有 driver 明確標示的暫時性、安全 pre-send failure 可 opt in true，輸入錯誤、not found、stale identity 與 permission/rejected 不可重試。`sent`／`uncertain` 強制 false，不得自動重送。Listener exception 逐 listener 隔離，不可中止後續 listener 或 gateway 操作。多個 withdraw ranges 必須在同一 terminal `runSerial` 內逐段送出，其他 command 不可插入；部分成功或不確定時保留最保守 outcome 且不可重試。

- [x] **Step 5: 公開 factory 並驗證**

```ts
export function createBrowserGateway(): PttGateway;
```

```bash
npx vitest run packages/browser/src/gateway.test.ts packages/browser/src/gatewayContract.test.ts
npm test
npm run build:packages
npm run lint
```

Expected: PASS；browser package root 只公開 factory，不公開 `BrowserPttGateway` class、driver 或 internal seam，terminal driver 仍不可由 package subpath import。

```bash
git add packages/browser
git commit -m "feat: implement browser ptt gateway"
```

### Task 11: 搬移 fake transport 並以同一 gateway contract 驗證

**Files:**
- Move: `src/lib/ptt/fakeAdapter.ts` → `packages/browser/src/internal/fakeTerminalDriver.ts`
- Move: `src/lib/ptt/__tests__/fakeAdapter.test.ts` → `packages/browser/src/internal/fakeTerminalDriver.test.ts`
- Create: `packages/browser/src/testing.ts`
- Modify: `packages/browser/src/gatewayContract.test.ts`
- Create: `src/lib/ptt/fakeAdapter.ts`

- [x] **Step 1: 讓共同 contract test 對 fake 失敗**

共同 suite 只接受 `PttGateway`，驗證 lifecycle、board list/search/filter、partial/final、ActionReceipt、event unsubscribe 與 exact operation key。真實 gateway 使用 transcript driver；fake 使用 jsdom storage。

Run: `npx vitest run packages/browser/src/gatewayContract.test.ts`

Expected: FAIL，fake 尚未能建立新 gateway。

- [x] **Step 2: 搬移 fake driver 並重用 BrowserPttGateway**

Fake terminal data source 實作與真實 driver 相同的 package-private seam，再由相同的 gateway contract 包裝；不得再公開 legacy `createFakePttAdapter()`。`@pttzzz/browser/testing` 只 export：

```ts
export {
  createFakeBrowserGateway,
  FAKE_PTT_STORE_KEY,
  getFakePttCurrentUser,
  isFakePttMode,
} from "./fakeGateway.js";
```

舊 `src/lib/ptt/fakeAdapter.ts` 僅提供 UI 尚未遷移期間的 repo-local shim，Task 17 刪除。

- [x] **Step 3: 驗證並 commit**

```bash
npx vitest run packages/browser/src/internal/fakeTerminalDriver.test.ts packages/browser/src/gatewayContract.test.ts
npm test
npm run build:packages
git diff --check
```

Expected: real transcript gateway 與 fake gateway 通過相同契約。

```bash
git add packages/browser src/lib/ptt/fakeAdapter.ts
git commit -m "refactor: expose fake browser gateway"
```

## Phase 4：建立高階 PttzzzClient 並遷移 hooks

### Task 12: 實作 lifecycle、events 與 read facade

**Files:**
- Create: `packages/core/src/client.ts`
- Create: `packages/core/src/client.test.ts`
- Modify: `packages/core/src/contracts.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/browser/src/createBrowserClient.ts`
- Modify: `packages/browser/src/index.ts`

- [x] **Step 1: 用 in-memory gateway 寫 failing tests**

覆蓋 subscribe/unsubscribe、connection event、partial revision 遞增、final updated event、expected failure 轉 `Result`、gateway throw 轉 `CoreError`。另測 disconnect policy：gateway 以 `GatewayError` 回報預期 cleanup failure 時仍清除 session／connection local state 並 resolve；未知 `Error` 仍 reject，但 local state 同樣清除。

```ts
const client = new PttzzzClient(gateway);
const events: CoreEvent[] = [];
const unsubscribe = client.subscribe((event) => events.push(event));
const result = await client.getArticle({ board: "Test", index: 1 });
unsubscribe();
expect(result.ok).toBe(true);
expect(events.map((event) => event.type)).toEqual([
  "article.partial",
  "article.updated",
]);
```

- [x] **Step 2: Run to verify missing client**

Run: `npx vitest run packages/core/src/client.test.ts`

Expected: FAIL。

- [x] **Step 3: 實作最小 client 與 event emitter**

```ts
export class PttzzzClient {
  private readonly listeners = new Set<(event: CoreEvent) => void>();
  private readonly revisions = new Map<string, number>();

  constructor(private readonly gateway: PttGateway) {}

  subscribe(listener: (event: CoreEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: CoreEvent): void {
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* listener isolation */ }
    }
  }
}
```

實作設計文件列出的 connect/login/disconnect、board list/search/filter 與 article read methods；Promise 表示單次結果，events 表示狀態與 partial 更新。

- [x] **Step 4: 建立 browser factory**

```ts
export function createBrowserClient(): PttzzzClient {
  return new PttzzzClient(createBrowserGateway());
}
```

Core 不得 import browser factory。

- [x] **Step 5: 驗證並 commit**

```bash
npx vitest run packages/core/src/client.test.ts
npm run build:packages
```

Expected: PASS。

```bash
git add packages/core packages/browser
git commit -m "feat: add high-level pttzzz client"
```

### Task 13: 加入 replyId 映射與 write outcome

**Files:**
- Modify: `packages/core/src/client.ts`
- Modify: `packages/core/src/client.test.ts`
- Modify: `packages/core/src/contracts.ts`
- Modify: `packages/browser/src/gateway.ts`
- Modify: `packages/browser/src/gateway.test.ts`

- [x] **Step 1: 寫 identity failing tests**

```ts
const article = await client.getArticle({ board: "Test", index: 1 });
if (!article.ok) throw new Error("fixture article missing");
await client.replyToReply({
  article: { board: "Test", index: 1 },
  replyId: article.value.replies[0].replyId,
  content: "同意",
  pushType: "neutral",
});
expect(gateway.execute).toHaveBeenCalledWith({
  type: "reply-floor",
  article: { board: "Test", index: 1 },
  floor: 1,
  content: "回1樓：同意",
  pushType: "neutral",
});
```

另測不存在 replyId → `REPLY_NOT_FOUND`、聚合卡多個 source floor、以及 `uncertain` 保留 outcome 且不重送。

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run packages/core/src/client.test.ts`

Expected: FAIL，client 尚未解析 replyId。

- [x] **Step 3: 實作 mapping 與高階 writes**

每次 final article 建立 `Map<articleKey, Map<replyId, number[]>>`。`replyToReply`、`voteReply`、`withdrawReplyVote`、`editReply` 先解析 target；公開 input 不接受 raw floor。寫入映射固定如下：

```text
voteArticle(push)       → PTT type push，content「推」
voteArticle(boo)        → PTT type boo，content「噓」
voteReply(push)         → PTT type neutral，content「推x樓」
voteReply(boo)          → PTT type neutral，content「噓x樓」
replyToReply            → 依 UI 選擇的 PTT type，content「回x樓：body」
withdrawReplyVote       → PTT type neutral，content「撤回我對x樓的推／噓」
editReply               → edit-floor，使用聚合回文的單一 primary source floor
withdrawReply           → withdraw-floor，將 source floors 分成連續 ranges；不連續樓號不得被擴張
```

文章投票與回文投票必須是不同 public methods；不得沿用目前名稱混淆的 floor-based `voteArticle()`。

- [x] **Step 4: 驗證 browser receipt 符合既有 discriminated contract**

不得在 browser 重定義 `ActionReceipt`。第一個不可逆按鍵前失敗回 core-owned `{ ok: false, outcome: "not-sent", retryable }`；成功是 `{ ok: true, outcome: "sent" }`；已送內容但確認 timeout 是 `{ ok: false, outcome: "uncertain", retryable: false }`。加入 type/runtime tests，確保 `sent`／`uncertain` 無法標成可重試且 client 永不自動重送。

- [x] **Step 5: 驗證並 commit**

```bash
npx vitest run packages/core/src/client.test.ts packages/browser/src/gateway.test.ts
npm test
```

Expected: PASS。

```bash
git add packages/core packages/browser
git commit -m "feat: target replies by stable identity"
```

### Task 14: 將 socket store 改為持有 PttzzzClient

**Files:**
- Modify: `src/hooks/usePttSocket.ts`
- Modify: `src/hooks/__tests__/usePttSocket.test.ts`
- Modify: `src/lib/ptt/viewState.ts`

- [x] **Step 1: 更新 tests 使用 public client stub**

Stub 只實作 public methods 與 `subscribe()`，不得有 `send()`、`getLastScreen()` 或 terminal method；加入 unsubscribe 與 connection/session event 驗證。

- [x] **Step 2: Run to verify hook still expects adapter**

Run: `npx vitest run src/hooks/__tests__/usePttSocket.test.ts`

Expected: FAIL。

- [x] **Step 3: 改 store 與 singleton**

`client` 改為 `PttzzzClient | null`；正式模式用 `createBrowserClient()`，fake 模式用 `new PttzzzClient(createFakeBrowserGateway())`。`wsStatus`、`pttState`、登入錯誤由 event/Result 更新；terminal screen 只留 debug，不作正常狀態來源。

- [x] **Step 4: 驗證並 commit**

Run: `npx vitest run src/hooks/__tests__/usePttSocket.test.ts src/__tests__/appState.test.ts`

Expected: PASS。

```bash
git add src/hooks/usePttSocket.ts src/hooks/__tests__/usePttSocket.test.ts src/lib/ptt/viewState.ts
git commit -m "refactor: bridge connection state from core client"
```

### Task 15: 遷移 board/article read hooks

**Files:**
- Modify: `src/hooks/useBoard.ts`
- Modify: `src/hooks/__tests__/useBoard.test.ts`
- Modify: `src/hooks/useArticle.ts`
- Modify: `src/hooks/__tests__/useArticle.test.ts`
- Modify: `src/lib/ptt/viewCache.ts`
- Modify: `src/components/Article.tsx`
- Modify: `src/components/ArticleList.tsx`

- [x] **Step 1: 更新 tests 期待 Result 與 events**

Board stub 回傳 `ok({ items, nextCursor })`；article 以 `article.partial`／`article.updated` 推進，並測 stale revision 不覆蓋新 revision。

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run src/hooks/__tests__/useBoard.test.ts src/hooks/__tests__/useArticle.test.ts`

Expected: FAIL，hooks 仍直接使用 array/null adapter API 或 screen parser。

- [x] **Step 3: 改 hooks 只使用 public DTO**

- `useBoard` 處理 Result 與 core pagination DTO。
- `useArticle` 訂閱 matching article key，以 revision 排除 stale event。
- 移除 hooks 對 `parsePartialScreen`、fake storage key、fake-mode 判斷與 adapter debug function 的 import。
- `viewCache` 型別改從 `@pttzzz/core` 匯入。

- [x] **Step 4: 驗證並 commit**

Run: `npx vitest run src/hooks/__tests__/useBoard.test.ts src/hooks/__tests__/useArticle.test.ts src/components/__tests__/Article.test.tsx src/components/__tests__/ArticleList.test.tsx`

Expected: PASS。

```bash
git add src/hooks src/lib/ptt/viewCache.ts src/components/Article.tsx src/components/ArticleList.tsx
git commit -m "refactor: read boards and articles through core client"
```

### Task 16: 遷移所有寫入 actions 到 stable replyId

**Files:**
- Modify: `src/hooks/usePttActions.ts`
- Modify: `src/hooks/__tests__/usePttActions.test.ts`
- Modify: `src/components/Article.tsx`
- Modify: `src/components/PushThread.tsx`
- Modify: `src/components/Composer.tsx`
- Modify: action/edit/vote tests under `src/components/__tests__/`

- [x] **Step 1: 更新 tests 使用 replyId**

回覆、投票、撤回、編輯 assert high-level input DTO，不 assert raw command。加入 uncertain 顯示「可能已送出，請重新載入確認」且 client 只呼叫一次的測試。

- [x] **Step 2: Run to verify floor-based API failure**

Run: `npx vitest run src/hooks/__tests__/usePttActions.test.ts src/components/__tests__/ArticlePushVoting.test.tsx`

Expected: FAIL。

- [x] **Step 3: 改 hook 成 thin delegation layer**

Hook 不再格式化控制文字，只轉成 `PttzzzClient` input DTO。`PushThread` callback 用 `push.id`；`Article` 不用 `getPushEditFloorRange()` 當 transport target；`Composer` 只提交內容與 mode。

- [x] **Step 4: 加入 outcome UI**

`uncertain`、`not-sent` 與 expected PTT errors 分開顯示；只有 `not-sent && retryable` 可安全重試。

- [x] **Step 5: 驗證並 commit**

```bash
npx vitest run src/hooks/__tests__/usePttActions.test.ts src/components/__tests__
npm test
rg -n "sourceFloors|formatPushVote|formatReplyToPush" src/components src/hooks
```

Expected: tests PASS；rg 無正常 UI 操作命中。

```bash
git add src/hooks src/components
git commit -m "refactor: write through stable core actions"
```

## Phase 5：移動官方參考 UI

### Task 17: 移除相容入口並將 React app 移入 apps/web

**Files:**
- Move: `src/` → `apps/web/src/`
- Move: `index.html` → `apps/web/index.html`
- Move: `vite.config.ts` → `apps/web/vite.config.ts`
- Move: `tsconfig.app.json` → `apps/web/tsconfig.app.json`
- Move: `tsconfig.node.json` → `apps/web/tsconfig.node.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/package.json`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `eslint.config.js`
- Delete: compatibility re-exports under `src/lib/ptt/`

- [x] **Step 1: 建 app manifest**

使用 `@pttzzz/web-example`、`private: true`；dependencies 包含 core、browser、React、React DOM、Zustand；保留 dev/build/test scripts。

- [x] **Step 2: 先移除 app 對相容入口的依賴**

以 `rg` 找出 app 與 UI tests 對舊 parser、aggregator、editing、adapter、fakeAdapter 的 import。正常 UI 必須已在 Tasks 14–16 改成只用 `@pttzzz/core`、`@pttzzz/browser` 或 `@pttzzz/browser/testing`；不得把舊 parser／aggregator deep import 改成新的 internal deep import。`Article.tsx` 的 `getLastArticleOpenTrace()` 改讀 article DTO 的 opt-in debug metadata，不直接 import browser terminal driver。執行 `npm test` 通過後，刪除所有 repo-local compatibility re-export。

- [x] **Step 3: Mechanical move**

```bash
mkdir -p apps/web
git mv src apps/web/src
git mv index.html apps/web/index.html
git mv vite.config.ts apps/web/vite.config.ts
git mv tsconfig.app.json apps/web/tsconfig.app.json
git mv tsconfig.node.json apps/web/tsconfig.node.json
```

新增 solution-style `apps/web/tsconfig.json`，只 reference `tsconfig.app.json` 與 `tsconfig.node.json`。更新 Vite 相對路徑、setupFiles 與 aliases；不重構 components。

Root `tsconfig.json` 最終只負責 project references：

```json
{
  "files": [],
  "references": [
    { "path": "./packages/core" },
    { "path": "./packages/browser" },
    { "path": "./apps/web" }
  ]
}
```

- [x] **Step 4: 更新 root scripts**

```json
{
  "dev": "npm run dev -w @pttzzz/web-example",
  "build": "npm run build:packages && npm run build -w @pttzzz/web-example",
  "lint": "eslint .",
  "test": "vitest run packages apps/web/src"
}
```

- [x] **Step 5: 驗證完整 workspace**

```bash
npm install
npm test
npm run build
npm run lint
```

Expected: tests/build PASS，lint 0 errors；不得增加 warning 類別。

- [x] **Step 6: 驗證無 deep import 並 commit**

Run: `rg -n "packages/(core|browser)/src|@pttzzz/(core|browser)/src" apps/web/src`

Expected: 無輸出。

```bash
git add package.json package-lock.json tsconfig.json eslint.config.js apps/web
git commit -m "refactor: move React UI into reference app"
```

## Phase 6：發布驗證與文件收尾

### Task 18: 驗證 npm pack 產物

**Files:**
- Create: `scripts/smoke-packages.mjs`
- Create: `packages/core/README.md`
- Create: `packages/browser/README.md`
- Modify: both package manifests
- Modify: `package.json`

- [x] **Step 1: 寫 failing smoke script**

只用 Node standard library 的 `mkdtemp`、`execFileSync` 與 dynamic import：pack 兩個 package、在暫存目錄安裝 tarballs、import public roots，assert：

```js
if (typeof core.PttzzzClient !== "function") throw new Error("core client missing");
if (typeof browser.createBrowserClient !== "function") throw new Error("browser factory missing");
```

- [x] **Step 2: Run before metadata completion**

Run: `node scripts/smoke-packages.mjs`

Expected: FAIL，指出 dist/export/tarball dependency 問題。

- [x] **Step 3: 完成 manifests**

補 description、license、repository、engines、`sideEffects: false`、files/exports。Core tarball 不含 React/Zustand/ptt-client；browser 不複製 core source。

- [x] **Step 4: 驗證並加入 root verify**

```bash
npm run build:packages
node scripts/smoke-packages.mjs
npm pack -w @pttzzz/core --dry-run
npm pack -w @pttzzz/browser --dry-run
```

Expected: PASS；dry-run 只列 README、package.json、dist。

Root 加：`"verify": "npm test && npm run build && npm run lint && node scripts/smoke-packages.mjs"`。

- [x] **Step 5: Commit**

```bash
git add scripts packages package.json package-lock.json
git commit -m "build: verify publishable packages"
```

### Task 19: 驗證 AI 文件能建立替代 UI

**Files:**
- Modify: `docs/api/AI-INTERFACE.md`
- Modify: `docs/api/contracts.md`
- Modify: `docs/examples/`
- Create: `docs/examples/minimal-browser/index.html`
- Create: `docs/examples/minimal-browser/main.ts`
- Modify: `scripts/smoke-packages.mjs`

- [x] **Step 1: 只用 public roots 寫可執行範例**

```ts
import type { CoreEvent } from "@pttzzz/core";
import { createBrowserClient } from "@pttzzz/browser";
```

展示 create、subscribe、connect、login、listArticles、getArticle、unsubscribe、disconnect；帳密只從使用者輸入取得。

- [x] **Step 2: Type-check packed example**

Smoke script 將範例複製到暫存 project 後執行 `tsc --noEmit`。

Expected: PASS，無 deep import。

- [x] **Step 3: 文件一致性檢查**

Run: `rg -n "TODO|TBD|待確認|/src/" docs/api docs/examples`

Expected: 無輸出。

- [x] **Step 4: Commit**

```bash
git add docs/api docs/examples scripts/smoke-packages.mjs
git commit -m "docs: verify alternate UI integration guide"
```

### Task 20: 更新實作 notes 與整體架構紀錄

**Files:**
- Create: `dev-notes/goal-9-implementation-notes.md`
- Modify: `dev-notes/implement.md`
- Modify: `dev-notes/code-architecture-guide.md`
- Modify: `dev-notes/goal-9-core-architecture-design.md`

- [x] **Step 1: 記錄已發生的實作限制**

只記錄 adapter imports、partial ordering、write outcome、npm pack、compatibility re-export 等實際坑，不複製本計畫。

- [x] **Step 2: 更新高階文件**

改成最終 package paths、依賴方向、commands 與 UI integration；design 狀態標為 implemented，差異以 decision log 說明。

- [x] **Step 3: Final verification**

```bash
npm run verify
git diff --check
git status --short
```

Expected: tests/build/lint/pack smoke PASS；diff check 無輸出；status 只含本 task 文件。

- [x] **Step 4: Commit**

```bash
git add dev-notes
git commit -m "docs: record goal 9 core extraction"
```

## 完成條件

- `npm run verify` 通過，reference UI 的正式、preview 與 Fake PTT 功能保留。
- 兩個 packed packages 可在乾淨專案 import。
- Core 無 UI、DOM、storage、WebSocket 或 `ptt-client` dependency。
- App 不 deep import，也不自行格式化控制 pattern。
- 所有回覆操作使用 `replyId`；原始樓號只存在 gateway/debug metadata。
- 白皮書 rule IDs、fixtures、tests 與 HTML cases 無矛盾。
- `uncertain` 寫入永不自動 retry。
- 第一版 non-goals 均未實作。
