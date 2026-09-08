# Human-Readable pttzzz Core Whitepaper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the pttzzz core whitepaper as a concise, human-readable vision and architecture document, with four core rule groups, five representative examples, and a self-contained visual casebook under `docs/whitepaper/`.

**Architecture:** Keep the whitepaper narrative short and approachable, while retaining every existing rule ID and precise boundary in a technical appendix so fixtures and implementations do not change semantics. Copy the existing 25-case HTML into the whitepaper directory, rebrand and regroup it as a visual companion, and remove every reader-facing dependency on `dev-notes`.

**Tech Stack:** Markdown, static HTML/CSS, shell validation with `rg`, existing Vitest/package verification.

---

### Task 1: Rewrite the whitepaper narrative

**Files:**
- Modify: `docs/whitepaper/pttzzz-core.md`
- Reference: `dev-notes/pttzzz-core-whitepaper-rewrite-design.md`
- Reference: `docs/whitepaper/pttzzz-core.md` before replacement, for exact rule semantics and IDs

- [x] **Step 1: Record the failing content checks**

Run:

```bash
rg -n "dev-notes|文件地位|規則分類" docs/whitepaper/pttzzz-core.md
rg -n "三層架構|分散推文聚合|嵌套回文|文章單純推噓和回文推噓|回文編輯與撤回" docs/whitepaper/pttzzz-core.md
```

Expected: the first command finds the old implementation-oriented introduction and `dev-notes` links; the second command does not find the complete new narrative structure.

- [x] **Step 2: Replace the opening and architecture sections**

Use `apply_patch` to make the document begin with this structure and approved wording:

```markdown
# pttzzz 核心白皮書

## 讓 PTT 再次進化

> 我們要共同打造一個新生的 PTT 社群。
>
> pttzzz 重新解析終端頁面，讓 PTT 在保有原始文化與資料的同時，轉型為現代化社群論壇。聚合分散推文、建立嵌套回文、加入回文推噓與編輯紀錄——這些只是開始。
>
> 我們不只想讓 PTT 繼續存在，更要推動它再次進化，成為下一個世代依然充滿生命力的社群。這場改造沒有終點，只有不斷向前。

本白皮書介紹 pttzzz 的目標、三層架構與核心解析規則。正文提供人類可讀的概念與代表案例；精確邊界與 rule IDs 收錄於技術附錄，完整視覺案例另見 [pttzzz 核心規則完整案例集](./core-rules-examples.html)。

## 三層架構

```text
規則層
定義推文如何聚合、嵌套、投票、編輯與撤回
        ↓
核心層
讀取 PTT 資料，套用規則，輸出穩定的文章與討論結構
        ↓
UI 層
以網頁、行動介面或其他形式呈現，並透過核心執行操作
```
```

After the diagram, explain each layer in one paragraph and end with the invariant: UI uses core, core follows rules, UI never reparses control text, and rules do not depend on a UI framework.

- [x] **Step 3: Write the four human-readable core rule groups**

Use these exact headings:

```markdown
## 核心規則

### 1. 分散推文聚合
### 2. 嵌套回文
### 3. 文章單純推噓和回文推噓
### 4. 回文編輯與撤回
```

Each section must explain, in prose and short bullets, the following already-approved semantics:

- Aggregation: same author, continuation timing, terminators `.。!?！？;；`, `||`, and target isolation.
- Nested replies: `回x樓`, `TO xF`, `reply to xF`, `>>xF`, aggregation-card targeting, and maximum three display levels.
- Votes: pure `推`/`噓` versus `推x樓`/`噓x樓`, hidden pure vote events, last direction per account, and vote-plus-body becoming both a vote and visible nested reply.
- Editing: Append, Replace, Withdraw, outer-command-only parsing, opaque updated content, and the single-space withdrawal placeholder.

Do not use the old repeated `輸入／結果／限制` template in the narrative.

- [x] **Step 4: Add five representative examples**

Add `## 代表案例` with five compact subsections. Each must contain exactly these three labels:

```markdown
**PTT 原始畫面**
**pttzzz 結果**
**說明**
```

Cover:

1. Two same-author continuation lines becoming one card.
2. Three nested levels, with each level aggregating its own continuation.
3. Pure article `推` versus reply vote `推12樓`.
4. `推12樓 我同意` producing both `+1` and a visible nested reply.
5. Replace payload containing `回12樓`/`推12樓` without reparsing, followed by Withdraw retaining the position.

Use short text-mode PTT inputs and short pttzzz outcomes; do not reproduce the HTML decision tables.

- [x] **Step 5: Preserve precise semantics in a technical appendix**

Add `## 技術附錄` after the representative examples. Reorganize, but do not weaken or remove, the existing precise rules:

```markdown
### A. 原始事件與樓號
### B. 聚合邊界
### C. 嵌套 pattern
### D. 投票、去重與撤回
### E. 編輯 outer command 與 opaque payload
### F. 漸進載入
### G. Rule ID 索引
```

The appendix must still contain every rule ID exactly once:

```text
RAW-001
THREAD-001 through THREAD-007
VOTE-001 through VOTE-006
EDIT-001 through EDIT-003
PARTIAL-001
```

Link examples only to `./core-rules-examples.html`; do not link to `dev-notes`.

- [x] **Step 6: Validate and commit the Markdown rewrite**

Run:

```bash
rg -n "dev-notes" docs/whitepaper/pttzzz-core.md
for id in RAW-001 THREAD-001 THREAD-002 THREAD-003 THREAD-004 THREAD-005 THREAD-006 THREAD-007 VOTE-001 VOTE-002 VOTE-003 VOTE-004 VOTE-005 VOTE-006 EDIT-001 EDIT-002 EDIT-003 PARTIAL-001; do test "$(rg -o "$id" docs/whitepaper/pttzzz-core.md | wc -l | tr -d ' ')" = 1 || exit 1; done
rg -n "三層架構|分散推文聚合|嵌套回文|文章單純推噓和回文推噓|回文編輯與撤回|PTT 原始畫面|pttzzz 結果|技術附錄" docs/whitepaper/pttzzz-core.md
npm test -w @pttzzz/core
git diff --check
```

Expected: the first command has no output; every rule ID count is one; required headings and example labels are present; core tests and diff check pass.

Commit:

```bash
git add docs/whitepaper/pttzzz-core.md
git commit -m "docs: rewrite pttzzz core whitepaper"
```

### Task 2: Create the self-contained visual casebook

**Files:**
- Create: `docs/whitepaper/core-rules-examples.html`
- Source: `dev-notes/goal-7-vote-model-review.html`
- Modify: `docs/whitepaper/pttzzz-core.md` only if the final casebook filename or anchors require correction

- [x] **Step 1: Copy the existing visual cases unchanged**

Run the mechanical copy:

```bash
cp dev-notes/goal-7-vote-model-review.html docs/whitepaper/core-rules-examples.html
```

Immediately verify the copy contains all case title blocks:

```bash
test "$(rg -o '<span class="case-id">CASE [0-9]{2}</span>' docs/whitepaper/core-rules-examples.html | wc -l | tr -d ' ')" = 25
```

Expected: PASS with 25 case title blocks before editorial changes.

- [x] **Step 2: Rebrand the document and add the whitepaper backlink**

Use `apply_patch` to replace the old review header with:

```html
<title>pttzzz 核心規則完整案例集</title>
...
<div class="eyebrow">pttzzz Core Rules · Visual Examples</div>
<h1>pttzzz 核心規則完整案例集</h1>
<p class="lead">左側呈現 PTT 原始事件，右側呈現 pttzzz 解析後的局部 UI。</p>
<p class="backlink"><a href="./pttzzz-core.md">← 返回 pttzzz 核心白皮書</a></p>
```

Remove `Goal 7`, `Review Artifact`, and reader-facing development-history language.

- [x] **Step 3: Regroup navigation and case sections**

Reorder the existing `<article class="case">` blocks without changing their internal PTT/UI examples. Each case must appear once under these groups:

```text
分散推文聚合: CASE 16, 19, 24, 25
嵌套回文: CASE 03, 04, 15
文章單純推噓和回文推噓: CASE 05-12, 14, 17, 18, 20-22
回文編輯與撤回: CASE 13, 23
更多解析邊界: CASE 01, 02
```

Use these section anchors and navigation links:

```html
<a href="#aggregation">分散推文聚合</a>
<a href="#nested-replies">嵌套回文</a>
<a href="#votes">文章與回文推噓</a>
<a href="#editing">回文編輯與撤回</a>
<a href="#boundaries">更多解析邊界</a>
```

Update group headings and notes to describe the four whitepaper rule groups. Put `更多解析邊界` last.

- [x] **Step 4: Validate the casebook is self-contained and complete**

Run:

```bash
rg -n "dev-notes|Goal 7|Review Artifact" docs/whitepaper/core-rules-examples.html
rg -n "href=\"./pttzzz-core.md\"|id=\"aggregation\"|id=\"nested-replies\"|id=\"votes\"|id=\"editing\"|id=\"boundaries\"" docs/whitepaper/core-rules-examples.html
for n in $(seq -w 1 25); do test "$(rg -o "<span class=\"case-id\">CASE $n</span>" docs/whitepaper/core-rules-examples.html | wc -l | tr -d ' ')" = 1 || exit 1; done
git diff --check
```

Expected: the first command has no output; backlink and five anchors are present; every CASE 01–25 title appears exactly once; diff check passes.

- [x] **Step 5: Commit the visual casebook**

```bash
git add docs/whitepaper/core-rules-examples.html docs/whitepaper/pttzzz-core.md
git commit -m "docs: add pttzzz core visual casebook"
```

### Task 3: Final semantic and link verification

**Files:**
- Verify: `docs/whitepaper/pttzzz-core.md`
- Verify: `docs/whitepaper/core-rules-examples.html`
- Verify: `docs/fixtures/thread-events/*.json`
- Verify: `packages/core/src/whitepaperFixtures.test.ts`

- [x] **Step 1: Run the complete repository verification**

```bash
npm run verify
```

Expected: all workspace tests, helper tests, builds, lint, package smoke, packed minimal UI, and whitepaper fixture checks pass. Existing three Fast Refresh warnings and the documented bundle-size warning may remain; no new warning category is allowed.

- [x] **Step 2: Check reader-facing whitepaper boundaries**

```bash
rg -n "dev-notes|TODO|TBD|待確認" docs/whitepaper
rg -n "core-rules-examples.html" docs/whitepaper/pttzzz-core.md
rg -n "pttzzz-core.md" docs/whitepaper/core-rules-examples.html
git diff --check
git status --short
```

Expected: no forbidden markers; Markdown links to the casebook; HTML links back to the whitepaper; diff check passes; status contains only intentional plan/checklist documentation if any.

- [x] **Step 3: Review the final diff for semantic drift**

Compare the old whitepaper rules retained in Git history with the new technical appendix and confirm:

- No rule ID was removed or duplicated.
- Five-minute, terminator, `||`, target-isolation, and three-level display semantics remain.
- Pure article vote, reply vote, vote-plus-body, dedupe, and withdrawal semantics remain.
- Append, Replace, Withdraw, opaque payload, and single-space placeholder semantics remain.
- Incomplete/final semantics remain in the appendix even though they are absent from the four narrative rule groups.

Run:

```bash
git diff HEAD~2 -- docs/whitepaper/pttzzz-core.md docs/whitepaper/core-rules-examples.html
```

Expected: only documentation organization and presentation changed, plus the fixture test extraction and uniqueness validation required by the linked Rule ID index; runtime implementation and fixture JSON remain unchanged.

- [x] **Step 4: Record completion**

Update this plan's checkboxes only after each step and commit have actually completed. Then commit the checklist:

```bash
git add dev-notes/pttzzz-core-whitepaper-rewrite-implementation-plan.md
git commit -m "docs: complete core whitepaper rewrite plan"
```
