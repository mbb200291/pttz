# Goal 3／7 投票與回文模型對齊 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以 `goal-7-vote-model-review.html` 的 25 個案例為主要契約，讓回文聚合、巢狀關係、文章原生分數、回文投票、撤回與編輯行為一致。

**Architecture:** `pushAggregator.ts` 在聚合前先把每一筆原始推文解析成結構化 intent，再套用編輯／撤回歷史、投票 reducer 與可見內容聚合。文章原生統計直接從所有原始 PTT 類別計算；文章投票狀態與回文投票狀態則分開還原。Adapter 只負責傳送規格指定的 PTT 類別與內容，React UI 從解析後狀態呈現並做 pending guard。

**Tech Stack:** TypeScript、React、Vitest、Testing Library、既有 `ptt-client` adapter。

---

## 檔案結構

- Modify: `src/lib/ptt/pushAggregator.ts` — intent 解析、編輯／撤回 reducer、投票狀態、聚合與巢狀映射。
- Modify: `src/lib/ptt/__tests__/pushAggregator.test.ts` — HTML 25 案例中的 parser／reducer 契約。
- Modify: `src/lib/ptt/adapter.ts` — 使用 raw push 計算文章原生統計，回文投票改送中立類別。
- Modify: `src/lib/ptt/fakeAdapter.ts` — 與真 adapter 相同的送出和還原語意。
- Modify: `src/hooks/usePttActions.ts` — 回文投票撤回與文章反向投票 API。
- Modify: `src/hooks/__tests__/usePttActions.test.ts` — 格式與 adapter delegation。
- Modify: `src/hooks/useArticle.ts` — 傳遞文章投票者與原生類別統計。
- Modify: `src/components/Article.tsx` — server-state reconciliation、投票／撤回操作、允許過深回覆由 parser 提升。
- Modify: `src/components/PushThread.tsx` — 顯示聚合來源樓號與 server-side 編輯歷史。
- Modify: related component tests — UI 送出格式、撤回與深層回覆。
- Modify: `dev-notes/goal-3-7-vote-model-alignment-implementation-notes.md`、`dev-notes/implement.md` — 記錄落地決策與架構結果。

### Task 1：建立解析與聚合契約

- [x] 在 `pushAggregator.test.ts` 加入失敗測試：複合 `推／噓x樓 body` 同時投票與巢狀顯示；`推12樓主` 不誤判；純控制不吞下一則留言。
- [x] 加入 CASE 24／25 失敗測試：同作者同目標可跨作者交錯聚合，不同目標必須分組，目標樓落在聚合卡任一 `sourceFloors` 都指向同一張卡。
- [x] 執行 `npx vitest run src/lib/ptt/__tests__/pushAggregator.test.ts`，確認新增案例因現行「先聚合後解析」而失敗。
- [x] 在 `pushAggregator.ts` 定義單一 intent parser：

```ts
type ParsedIntent =
  | { kind: "plain"; body: string }
  | { kind: "reply"; targetFloor: number; body: string }
  | { kind: "reply-vote"; targetFloor: number; direction: "push" | "boo"; body: string }
  | { kind: "article-vote"; direction: "push" | "boo" }
  | { kind: "reply-vote-withdraw"; targetFloor: number; direction: "push" | "boo" }
  | { kind: "edit"; mode: "append" | "replace" | "withdraw"; floors: number[]; body: string };
```

- [x] pattern 僅允許行首，樓號後必須結束或接空白／`:`／`：`；body 在第一次解析後保持 opaque。
- [x] 以 intent 的 `targetFloor` 作為 grouping key；無前綴續行只可繼承可續接的最近同作者群組，控制事件永不進入可見群組。
- [x] 保留群組第一次出現的 `anchorOrder`，`sourceFloors` 保留所有原始樓號並以其任一樓號提供父卡映射。
- [x] 執行聚合測試確認通過並提交：`git commit -m "fix: align reply parsing and aggregation model"`。

### Task 2：還原投票、撤回與編輯歷史

- [x] 新增失敗測試：回文同 ID 採最後方向、同方向去重、`撤回我對x樓的推／噓` 只清除投票並保留複合 body。
- [x] 新增失敗測試：Append／Replace 只改 body；Replace payload 的 `回99樓` 不重解析；整則 Withdraw 隱藏 body 並移除該事件投票。
- [x] 在 raw intent 上先套用 edit commands，再計算可見群組與 reply voter state；歷史紀錄附加到對應 `AggregatedPush`。
- [x] 文章投票 reducer 將純 `推／噓` 依作者還原；相反方向是抵銷到 neutral，同方向重複不重算。
- [x] `AggregatedThread` 回傳 `articleScore`、原始類別 counts 與文章投票者；`articleScore` 從所有 raw PTT type 計算，不受可見性或巢狀關係影響。
- [x] 執行 aggregator 全測試並提交：`git commit -m "feat: apply vote withdrawal and push edit history"`。

### Task 3：對齊 adapter 與 action 送出格式

- [x] 新增失敗測試：`votePush` 送出 `推x樓／噓x樓` 時 PTT 類別必須是 `neutral`。
- [x] 新增 `withdrawPushVote(floor, direction)`，以 `neutral` 送出 `撤回我對x樓的推／噓`。
- [x] 文章 active vote 再點或點反方向時，以反向 PTT 類別送出純 `推／噓`，作為抵銷事件。
- [x] 同步真 adapter、fake adapter 與 `usePttActions`，不改動一般 `replyToPush` 所選的 PTT 類別。
- [x] 執行 adapter／hook 測試並提交：`git commit -m "fix: send application votes with specified PTT types"`。

### Task 4：對齊文章與討論串 UI

- [x] 新增失敗元件測試：文章 VotePair 使用 server article voters；active article vote 可撤回；active reply vote 送 withdrawal；快速連點仍只有一個 request。
- [x] 移除深度達三層時禁止回覆的 alert；仍送原始目標樓號，由 aggregator 將第四層提升到第三層顯示。
- [x] Stats bar 改用 raw PTT 類別 counts；文章分數使用 `articleScore`；文章 VotePair 使用純文章投票 reducer 的人數。
- [x] `PushThread` 顯示非連續 `sourceFloors`（例如 `1、3F`），children 依首次 `anchorOrder` 排序，並使用解析後 edit history。
- [x] 執行 Article、PushThread、VotePair 測試並提交：`git commit -m "feat: align article and thread vote UI"`。

### Task 5：整合驗證與文件

- [x] 為 25 個 HTML 案例建立集中式 table-driven parser 測試或等價的完整覆蓋清單。
- [x] 執行 `npm test`、`npm run lint`、`npm run build`；修正本次改動造成的所有失敗。
- [x] 啟動 `npm run dev`，以文章 preview／fake PTT 驗證桌面與手機版巢狀、投票與撤回操作；不得對真 PTT 發文或回文。
- [x] 更新 implementation notes 與 `dev-notes/implement.md`，列出 HTML 案例覆蓋及仍屬 heuristic 的限制。
- [x] 提交文件：`git commit -m "docs: record goal 3 and 7 vote model alignment"`。
