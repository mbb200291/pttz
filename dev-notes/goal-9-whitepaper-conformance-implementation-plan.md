# Whitepaper Core and UI Conformance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使 `@pttzzz/core`、`@pttzzz/browser` 與參考網頁介面符合目前白皮書的合併、嵌套、文章／回文推噓及回文編輯規則。

**Architecture:** 核心先把原始 PTT 事件解析成不受介面深度限制的結構化事件，再分別計算提案文章推噓、PTT 原生推噓與回文推噓。Public DTO 以 `VoteSummary` 暴露完整計數；介面只負責把任意深度核心樹投影到最多三層的顯示樹。所有送出端格式由 core internal formatter 統一產生，browser 只執行已驗證命令。

**Tech Stack:** TypeScript、Vitest、React、Testing Library、JSON fixtures、Vite workspaces

**目前進度（2026-08-29）：** Task 1–9 已完成並通過完整驗證；變更保留在 `feature/goal-9-core-architecture`，尚未 merge。計畫中的文章推噓語意已同步為：可見嵌套回覆與純回文推噓均不計入提案文章推噓，但原始 PTT 推／噓仍保留於 PTT 原生分數。

---

### Task 1: Repair the executable whitepaper contract and add vote-model fixtures

**Files:**
- Modify: `packages/core/src/whitepaperFixtures.test.ts`
- Modify: `docs/fixtures/thread-events/schema.json`
- Modify: `docs/fixtures/thread-events/vote.json`
- Modify: `docs/fixtures/thread-events/README.md`

- [x] **Step 1: Write failing contract tests for heading boundaries and score expectations**

Add a parser regression proving numbered risk-list items after `OP-002` are not interpreted as `OP-002.6` and `OP-002.7`. Extend fixture validation with optional exact score expectations:

```ts
interface ExpectedArticleScores {
  articlePushCount: number;
  articleBooCount: number;
  articleScore: number;
  nativePushCount: number;
  nativeBooCount: number;
  nativeArticleScore: number;
}
```

- [x] **Step 2: Run the focused fixture contract and observe RED**

Run: `npm test -w @pttzzz/core -- --run src/whitepaperFixtures.test.ts --reporter=dot`

Expected: the heading-boundary test reports duplicated rule details, and new score cases fail because `AggregatedThread` has no proposal article counts.

- [x] **Step 3: Reset active rule parsing at every Markdown heading and add four vote fixtures**

Add cases covering:

```text
top-level PTT 推/噓 comment -> proposal article score changes
visible nested PTT 推/噓 reply -> proposal article score unchanged
pure external 推12樓 sent as PTT 推 -> proposal article unchanged, native PTT +1, reply +1
PTTzzz 推12樓 sent as → -> article unchanged and reply +1
```

Keep `nativeArticleScore` as the unfiltered PTT comparison value.

- [x] **Step 4: Re-run the contract section**

Run: `npm test -w @pttzzz/core -- --run src/whitepaperFixtures.test.ts -t "fixture contract" --reporter=dot`

Expected: PASS. Behavior tests for the newly declared proposal score remain RED until Task 2.

### Task 2: Separate proposal article votes, native PTT votes, and reply votes

**Files:**
- Modify: `packages/core/src/pushAggregator.ts`
- Modify: `packages/core/src/pushAggregator.test.ts`
- Modify: `packages/core/src/contracts.ts`
- Modify: `packages/core/src/contracts.test.ts`
- Modify: `packages/core/src/client.ts`
- Modify: `packages/core/src/client.test.ts`

- [x] **Step 1: Add failing aggregator tests for the three score domains**

Assert an `AggregatedThread` shape containing:

```ts
{
  articlePushCount: 2,
  articleBooCount: 1,
  articleScore: 1,
  nativePushCount: 3,
  nativeBooCount: 1,
  nativeArticleScore: 2,
}
```

where one native push is a visible nested reply and is excluded only from the proposal article counts.

- [x] **Step 2: Run RED**

Run: `npm test -w @pttzzz/core -- --run src/pushAggregator.test.ts -t "proposal article" --reporter=dot`

Expected: FAIL because proposal counts do not exist and article votes still depend on pure command text.

- [x] **Step 3: Compute nesting before article score classification**

Preserve all raw native counts. Add proposal counts by including raw `push`/`boo` events unless their visible event belongs to a group whose exact `replyTo` is non-null or the event is a pure reply-vote control. An external native reply vote therefore changes only the PTT native comparison and its target reply; the official sender remains neutral.

- [x] **Step 4: Add a public vote summary instead of reconstructing voters in UI**

Define and project:

```ts
export interface VoteSummary {
  pushCount: number;
  booCount: number;
  score: number;
  viewerVote?: VoteDirection;
}

interface Article {
  nativeVotes: VoteSummary;
  articleVotes: VoteSummary;
}

interface Reply {
  votes: VoteSummary;
}
```

Keep temporary scalar aliases only where required for the current board/article compatibility view, and mark their removal in Task 6.

- [x] **Step 5: Run GREEN**

Run: `npm test -w @pttzzz/core -- --run src/pushAggregator.test.ts src/client.test.ts src/contracts.test.ts --reporter=dot`

Expected: PASS.

### Task 3: Preserve exact thread structure and control-event merge barriers

**Files:**
- Modify: `packages/core/src/pushAggregator.ts`
- Modify: `packages/core/src/pushAggregator.test.ts`
- Modify: `packages/core/src/whitepaperFixtures.test.ts`

- [x] **Step 1: Run existing fixture RED cases individually**

Run:

```bash
npm test -w @pttzzz/core -- --run src/whitepaperFixtures.test.ts -t "merge-control-event-cuts-the-group|thread-core-retains-original-deep-target|thread-layer-adjustment-keeps-core-targets"
```

Expected: three behavior cases fail.

- [x] **Step 2: Preserve control barriers during grouping**

Represent the last intervening raw command order in each candidate group. Reject merging when a hidden control event appears between two visible fragments, even when author, target and time otherwise match.

- [x] **Step 3: Remove core depth clamping**

Delete `MAX_NESTED_REPLY_DEPTH`, `getReplyDepth`, and `clampReplyTargetDepth`. Assign `p.replyTo = target.id` and retain the exact source target after validation.

- [x] **Step 4: Run GREEN**

Run: `npm test -w @pttzzz/core -- --run src/pushAggregator.test.ts src/whitepaperFixtures.test.ts -t "merge-control|thread-core|thread-layer" --reporter=dot`

Expected: PASS.

### Task 4: Complete reply edit parsing and range application

**Files:**
- Modify: `packages/core/src/pushAggregator.ts`
- Modify: `packages/core/src/pushAggregator.test.ts`
- Modify: `packages/core/src/pushWire.ts`
- Modify: `packages/core/src/pushWire.test.ts`
- Modify: `packages/core/src/contracts.ts`
- Modify: `packages/core/src/client.ts`
- Modify: `packages/core/src/client.test.ts`

- [x] **Step 1: Use existing edit fixtures as RED tests**

Run: `npm test -w @pttzzz/core -- --run src/whitepaperFixtures.test.ts -t "section-edit|append-supports|replace-supports|edit-preserves-merged" --reporter=dot`

Expected: range insertion/deletion/replacement, `續xF`, `更正我在xF的留言`, and merged-fragment append cases fail.

- [x] **Step 2: Parse every whitepaper edit wrapper**

Recognize all EDIT-001 forms and retain opaque payload. Parse a wrapped section expression into:

```ts
interface SectionChange { start: number; end: number; replacement: string }
```

Reject invalid, overlapping, or out-of-bounds ranges without modifying the target.

- [x] **Step 3: Apply section changes right-to-left against the pre-edit content**

Support `[start,end)` insertion (`start === end`), deletion (empty replacement), and replacement. Apply an edit targeting any source floor to the complete aggregated reply in command order, rather than inserting an append before later source fragments.

- [x] **Step 4: Add a structured public range-edit input and formatter**

Extend `EditReplyInput` with:

```ts
| {
    article: ArticleKey;
    replyId: ReplyId;
    mode: "section";
    changes: readonly SectionChange[];
  }
```

Serialize it through the shared core-internal formatter used by the parser/browser boundary; browser receives one validated structured edit command and does not maintain a second range grammar.

- [x] **Step 5: Run GREEN**

Run: `npm test -w @pttzzz/core -- --run src/pushAggregator.test.ts src/pushWire.test.ts src/client.test.ts src/whitepaperFixtures.test.ts --reporter=dot`

Expected: all edit fixtures PASS; remaining failures belong only to later UI/browser tasks.

### Task 5: Move maximum display depth entirely into the reference UI

**Files:**
- Modify: `packages/core/src/contracts.ts`
- Modify: `packages/core/src/client.ts`
- Modify: `packages/core/src/client.test.ts`
- Modify: `apps/web/src/lib/ptt/uiTypes.ts`
- Modify: `apps/web/src/hooks/useArticle.ts`
- Modify: `apps/web/src/hooks/__tests__/useArticle.test.ts`
- Modify: `apps/web/src/components/PushThread.tsx`
- Modify: `apps/web/src/components/__tests__/PushThread.test.tsx`
- Modify: `apps/web/docs/thread-presentation.md`
- Modify: `apps/web/docs/fixtures/thread-presentation.json`

- [x] **Step 1: Add RED tests for an exact four-level core target and three-level UI projection**

Core expected chain:

```text
A <- B <- C <- D
```

UI expected display:

```text
A
  B
    C
    D
```

The D reply button must still dispatch D's own stable `replyId`, and D's core `replyTo` remains C.

- [x] **Step 2: Make core depth structural, not presentational**

Change `Reply.depth` from `1 | 2 | 3` to `number`, calculate the full acyclic depth, and retain exact nested `children`/`replyTo` data.

- [x] **Step 3: Add a UI-only display-parent projection**

Compute `displayReplyTo` for visible cards. For structural depth greater than three, attach the card to the ancestor displayed at depth three without changing `replyTo` or action identity. `PushThread` uses `displayReplyTo` only for rendering.

- [x] **Step 4: Run GREEN**

Run: `npm test -w @pttzzz/core -- --run src/client.test.ts --reporter=dot && npm test -w @pttzzz/web-example -- --run src/hooks/__tests__/useArticle.test.ts src/components/__tests__/PushThread.test.tsx --reporter=dot`

Expected: PASS.

### Task 6: Render true article and reply vote totals in the reference UI

**Files:**
- Modify: `apps/web/src/hooks/useArticle.ts`
- Modify: `apps/web/src/hooks/__tests__/useArticle.test.ts`
- Modify: `apps/web/src/lib/ptt/uiTypes.ts`
- Modify: `apps/web/src/components/Article.tsx`
- Modify: `apps/web/src/components/PushThread.tsx`
- Modify: `apps/web/src/components/__tests__/ArticlePushVoting.test.tsx`

- [x] **Step 1: Add RED projection and rendering tests**

Use an article with native `3/1`, proposal article `2/1`, and reply `4/2`. Assert the stats bar labels native PTT totals separately, the article VotePair shows `2/1`, and the reply VotePair shows `4/2` independent of the viewer's own vote.

- [x] **Step 2: Remove fabricated voter arrays from `useArticle`**

Project `VoteSummary` counts directly into the current UI model. Viewer state controls only `myVote`; it must never synthesize total voters or total counts.

- [x] **Step 3: Clarify labels and keep aggregate reply count independent**

Label the comparison stats as `PTT 原生推` and `PTT 原生噓`. Keep the article VotePair as the proposal article score and each reply VotePair as that reply's score.

- [x] **Step 4: Run GREEN**

Run: `npm test -w @pttzzz/web-example -- --run src/hooks/__tests__/useArticle.test.ts src/components/__tests__/ArticlePushVoting.test.tsx --reporter=dot`

Expected: PASS.

### Task 7: Verify actual browser command syntax, including article edit summaries

**Files:**
- Modify: `packages/core/src/whitepaperFixtures.test.ts`
- Modify: `packages/core/src/parser.test.ts`
- Modify: `packages/browser/src/gateway.test.ts`
- Modify: `packages/browser/src/internal/terminalDriver.test.ts`
- Modify: `docs/fixtures/thread-events/schema.json`
- Modify: `docs/fixtures/thread-events/edit.json`
- Modify: `docs/whitepaper/pttzzz-core.md`

- [x] **Step 1: Add RED command-conformance tests**

Execute every fixture `expectedCommand` through public `PttzzzClient` and a recording gateway. Assert neutral reply vote/withdraw, inverse article vote withdrawal, wrapped append/replace/section edit, and suppression behavior.

- [x] **Step 2: Specify article edit summary markers in the whitepaper**

Keep article editing aligned with the whitepaper: send only the revised body, rely on native `※ 編輯:` records, and preserve legacy `※ PTTzzz 編輯摘要：<摘要>` markers only for backward-compatible reading.

- [x] **Step 3: Assert terminal transcript output**

Verify the browser writes one summary marker, preserves existing signature/footer/edit records, and formats reply/edit commands exactly once.

- [x] **Step 4: Run GREEN**

Run: `npm test -w @pttzzz/core -- --run src/whitepaperFixtures.test.ts src/parser.test.ts --reporter=dot && npm test -w @pttzzz/browser -- --run src/gateway.test.ts src/internal/terminalDriver.test.ts --reporter=dot`

Expected: PASS.

### Task 8: Full verification and architecture records

**Files:**
- Modify: `dev-notes/goal-9-whitepaper-conformance-implementation-notes.md`
- Modify: `dev-notes/implement.md`

- [x] **Step 1: Run all automated verification**

Run:

```bash
npm test
npm run build
npm run lint
npm run verify
git diff --check
```

Expected: all tests/build/package smoke pass; lint has no new warnings.

- [x] **Step 2: Record implementation boundaries and accepted risks**

Document the three vote domains, core-vs-UI nesting ownership, structured range edits, command formatting ownership, and any compatibility aliases that remain.

- [x] **Step 3: Do not merge or commit without user direction**

Leave all verified changes on `feature/goal-9-core-architecture` for review.

### Task 9: Follow up on terminal-width merging and image previews

**Files:**
- Modify: `packages/core/src/parser.ts`
- Modify: `packages/core/src/parser.test.ts`
- Modify: `packages/core/src/pushAggregator.ts`
- Modify: `packages/core/src/pushAggregator.test.ts`
- Modify: `docs/fixtures/thread-events/merge.json`
- Modify: `docs/fixtures/thread-events/edit.json`
- Modify: `apps/web/src/lib/ptt/contentSegments.ts`
- Create: `apps/web/src/lib/ptt/__tests__/contentSegments.test.ts`

- [x] **Step 1: Add RED cases from real PTT time-only and IP-plus-time rows**

- [x] **Step 2: Measure the normalized right-side gap and remove byte-length fallback**

- [x] **Step 3: Swap MERGE-002／MERGE-003 fixture references and cover unknown spacing**

- [x] **Step 4: Replace the opaque edit fixture prose with a readable example**

- [x] **Step 5: Recognize direct HTTPS image URLs across hosts**

- [x] **Step 6: Run complete repository verification**
