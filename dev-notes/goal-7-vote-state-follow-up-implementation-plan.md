# Goal 7 子項 Follow-up：投票狀態與文章投票隱藏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 隱藏文章層級的單獨推噓事件、讓同一 ID 的回文投票只保留最後方向，並確保系統推噓使用正確的 PTT 類型。

**Architecture:** `pushAggregator` 提供文章投票辨識與 PTT ID 正規化的共用純函式；UI 保留完整 article data 做統計，只在討論串呈現前排除文章投票事件。`Article` 維護二態投票狀態機及短期 optimistic override；adapter 在送內容前等待並確認推文類型選單。

**Tech Stack:** TypeScript、React、Vitest、Testing Library、ptt-client adapter

---

### Task 1：辨識並隱藏文章投票事件

**Files:**
- Modify: `src/lib/ptt/pushAggregator.ts`
- Modify: `src/lib/ptt/__tests__/pushAggregator.test.ts`
- Modify: `src/components/PushThread.tsx`
- Modify: `src/components/__tests__/PushThread.test.tsx`
- Modify: `src/components/Article.tsx`
- Modify: `src/components/__tests__/Article.test.tsx`

- [ ] 新增 `detectArticleVote(content)` 測試：只有 trim 後恰為 `推`／`噓` 才回傳方向，`推 好文` 與 `噓1樓` 回傳 null；marker 為 neutral、內容為 `噓` 時，`calcArticleScore` 計為 -1。
- [ ] 執行 `npx vitest run src/lib/ptt/__tests__/pushAggregator.test.ts`，確認因 helper 不存在及 neutral 尚未被內容覆寫而失敗。
- [ ] 在 `pushAggregator.ts` 匯出：

```ts
export function detectArticleVote(content: string): "push" | "boo" | null {
  const normalized = content.trim();
  if (normalized === "推") return "push";
  if (normalized === "噓") return "boo";
  return null;
}
```

並讓 `calcArticleScore` 對第一層推文使用 `detectArticleVote(p.content) ?? p.type`。
- [ ] 執行聚合器測試，確認通過。
- [ ] 新增 `PushThread` 測試：單獨 `推`／`噓` 不顯示且第一層回文數不包含它們；`推 好文` 仍顯示。
- [ ] 執行 `npx vitest run src/components/__tests__/PushThread.test.tsx`，確認舊 UI 仍顯示事件而失敗。
- [ ] 在 `PushThread` 建立 children map 與 top-level 前，以 `detectArticleVote(push.content) === null` 取得 visible pushes。
- [ ] 在 `Article.test.tsx` 新增 partial article 案例，確認單獨 `噓` 不顯示而普通回文顯示。
- [ ] 執行 Article 測試，確認 partial list 尚未過濾而失敗。
- [ ] 在 `LightweightPushList` 過濾文章投票事件；Article 統計以 `detectArticleVote(content) ?? type` 分類，保留既有事件於 article data。
- [ ] 執行三個相關測試檔並確認通過。
- [ ] Commit：`fix: hide standalone article vote events`。

### Task 2：正規化 voter ID 並保證最後方向互斥

**Files:**
- Modify: `src/lib/ptt/pushAggregator.ts`
- Modify: `src/lib/ptt/__tests__/pushAggregator.test.ts`

- [ ] 新增測試：同一作者以 `MBB200291` 推、`mbb200291` 噓，只出現在 `booVoters`；序列 `推、推、噓、推` 最終只出現在 `pushVoters`，score 為 +1。
- [ ] 執行聚合器測試並確認大小寫案例失敗。
- [ ] 匯出 `normalizePttId`，使用 `extractAuthorId(value).toLowerCase()`；voter direction map 以正規化 ID 作 key，方向改變時以正規化 ID 移除舊陣列成員。
- [ ] 執行聚合器測試並確認通過。
- [ ] Commit：`fix: normalize reply voter identities`。

### Task 3：修正回文投票二態狀態機

**Files:**
- Modify: `src/components/PushThread.tsx`
- Modify: `src/components/Article.tsx`
- Modify: `src/components/__tests__/PushThread.test.tsx`
- Modify: `src/components/__tests__/ArticlePushVoting.test.tsx`

- [ ] 修改既有 PushThread 行為測試，要求點已選推時呼叫 `onVote(pushId, 1)`，而不是產生 0；新增已選噓同方向案例。
- [ ] 執行 PushThread 測試並確認舊 toggle 行為失敗。
- [ ] 將 VotePair handler 改為固定傳 `1` 或 `-1`。
- [ ] 執行 PushThread 測試並確認通過。
- [ ] 在 Article 測試加入：server 已含目前使用者推票時，連點推不呼叫 `votePush`；推改噓成功後推數減一、噓數加一，且不會同時保留兩邊。
- [ ] 執行 ArticlePushVoting 測試並確認舊的大小寫／optimistic 重建邏輯失敗。
- [ ] 移除 `myPushVotes` 與 next=0 的本地假撤回路徑；目前方向改由 `pushVotes.get(pushId)?.value ?? getViewerPushVote(...)` 決定，`getViewerPushVote` 使用 `normalizePttId`。
- [ ] 新增最小 count transition：先扣除舊方向，再增加新方向；送出成功才寫入 optimistic map。
- [ ] 新增 reconciliation effect：article data 中目前使用者方向與 optimistic value 相同時刪除該 override。
- [ ] 執行 ArticlePushVoting 與 PushThread 測試並確認通過。
- [ ] Commit：`fix: keep reply votes on the last direction`。

### Task 4：嚴格確認 PTT 推噓類型

**Files:**
- Modify: `src/lib/ptt/adapter.ts`
- Modify: `src/lib/ptt/__tests__/adapter.test.ts`

- [ ] 匯出可測試的 `submitPushFromCurrentArticle`，加入選用 `SubmitPushTimeouts`；production defaults 保持秒級等待，測試可用 1ms polling 與 0ms post-send delay。
- [ ] 新增 delayed menu 測試：送 `X` 後第二次輪詢才出現選單，boo 必須先送 `2` 再送 `噓` 內容。
- [ ] 新增 strict timeout 測試：push／boo 未出現類型選單時不得送內容，必須回傳 `{ ok: false }` 並送 Ctrl-C 取消。
- [ ] 執行 `npx vitest run src/lib/ptt/__tests__/adapter.test.ts`，確認舊固定 180ms 流程不符合 delayed／strict 行為。
- [ ] 新增共用推文類型選單 regex 與內容輸入 regex；在送出內容前以條件輪詢等待畫面。
- [ ] 選單出現時送 `getPushTypeKey(pushType)`；push／boo 未確認選單就取消並失敗；neutral 可相容直接進入內容輸入畫面。
- [ ] 執行 adapter 測試並確認通過。
- [ ] Commit：`fix: require confirmed PTT vote types`。

### Task 5：文件與完整驗證

**Files:**
- Create: `dev-notes/goal-7-vote-state-follow-up-implementation-notes.md`
- Modify: `dev-notes/implement.md`

- [ ] 記錄文章投票事件、ID 正規化、二態狀態機與 strict PTT 類型選擇的實作細節及真站寫入未執行的限制。
- [ ] 更新 `implement.md` 的推噓解析與 UI 能力摘要。
- [ ] 執行 `npm test`，預期所有測試通過。
- [ ] 執行 `npm run lint`，預期 0 errors；既有 warnings 可保留。
- [ ] 執行 `npm run build`，預期 TypeScript 與 Vite build 成功。
- [ ] 執行 `git diff --check`，預期無 whitespace error。
- [ ] Commit：`docs: record vote state follow-up implementation`。
- [ ] 確認 branch clean，且未修改 `dev-notes/spec.md`、未合併至 `dev`。
