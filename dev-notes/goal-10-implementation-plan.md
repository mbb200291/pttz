# Goal 10 樓上回覆 Implementation Plan

**Goal:** 支援明確行首的 `推樓上` 與 `回樓上：內容`，沿用既有樓號、聚合與投票契約。

**Architecture:** 樓上固定指緊鄰上一筆原始 PTT 推文；先解析為絕對樓號，再由 `sourceFloors` 對應聚合卡。隱藏、撤回、缺失目標保留普通文字且不繼承舊回覆目標；不依時間或作者猜測，不擴充發送語法。

**Tech Stack:** TypeScript、Vitest、跨實作 JSON fixtures。

## 實作步驟

- [x] 在獨立 worktree 使用 `npm ci --no-audit --no-fund --cache /private/tmp/pttzzz-npm-cache` 安裝依賴，確認 workspace links 未指向主工作區。
- [x] 在 `packages/core/src/upstairsReplies.test.ts` 加入基本回覆、投票、同分鐘插隊、來源樓號、無效目標、控制邊界、編輯與分數測試；先執行 `npm test -w @pttzzz/core` 確認新增功能紅燈。
- [x] 修改 `packages/core/src/pushAggregator.ts` 的 intent 解析與群組邊界；沿用原始樓號投票、嵌套與 sender，不改 `parser.ts` 的終端事件解析。
- [x] 更新 `docs/whitepaper/pttzzz-core.md` 為規則 0.2.0、新增 THREAD-005，並於 `docs/fixtures/thread-events/thread.json` 提供每條細則的 primaryRule 案例；更新 manifest 版本。
- [x] 執行 core 測試、`npm run build:packages && npm run verify`、`git diff --check`；檢查規則與實作一致。
- [x] 記錄 `dev-notes/goal-10-implementation-notes.md` 並更新 `dev-notes/implement.md`，功能、文件與測試同一 commit；不 push、不 merge、不使用真實 PTT。

## 驗收案例

- [x] 補齊跨實作 fixture 與 HTML：12 個 `upstairs-*` 案例逐一對照，包含複合投票正文、半形冒號及不支援語法；核對校正分數和原生分數，保持靜態 HTML 可直接開啟。

`A。 → B。 → 回樓上：同意` 必須回覆 B，即使三者同分鐘；`A。 → 推 → 推樓上` 必須保留最後一行原文。`A片段 → A續行。 → 推樓上` 必須對來源樓號 `[1,2]` 的卡片加一票。`回樓上住戶` 與句中 `樓上` 不解析。原生分數保留全部推噓，成功解析的回文票與嵌套回覆排除提案文章分數。
