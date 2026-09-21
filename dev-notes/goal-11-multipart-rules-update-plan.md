# Goal 11 長回文白皮書對齊 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the independent receiver task; the primary agent handles sender integration. No branch splitting, commits or remote changes in this iteration.

**Goal:** 將既有自動分段對齊使用者修訂的兩分鐘、`|` 續接、`_` 終止規則。

**Architecture:** 接收端兼容舊 `||`／`|!`，新送出只用新版標記。沿用容量證據、UAO 編碼、逐段確認與不可變續送；白皮書、fixtures、範例與測試一併對齊。

**Tech Stack:** TypeScript、Vitest、JSON fixtures、既有 PTT 終端 driver。

## Task 1：接收規則

- [x] 在 `packages/core/src/pushAggregator.test.ts` 加入 `前段。|`、`末段_`、`另起` 得到兩則；兩分鐘非連續允許、三分鐘不允許；連續超時仍合併。執行 `npm test -w @pttzzz/core` 確認新斷言先失敗。
- [x] 修改 `pushAggregator.ts` 預設為 2；尾標僅支援 `|`／`_`，只移除一個單字元標記，不保留舊版特殊語意。不放寬目標、作者、控制事件條件。
- [x] 新增／更新 `docs/fixtures/thread-events/merge.json`，新版 MERGE-004 與舊標記案例並存，保留舊五分鐘案例但改為兩分鐘規則的拆組預期。
- [x] 調整既有預設測試，保留 constructor 可選設定相容；核心測試全綠，依序規格及品質覆核。

## Task 2：發送規劃

- [x] `multipartReply.test.ts` 先測 `planReplyDraft("hello", 20) === ["hello_"]`、`hello。` 不加尾標、恰滿容量轉多段、新舊符號不混送、中文／巢狀／空白行往返及失敗續送。
- [x] 修改 `multipartReply.ts` 以新版一欄標記計算容量。中間片段以最少必要 `|` 跨過標點，未滿行保留換行；滿行後主動換行需空白橋接 `|`。最後一段以原有終止標點或 `_` 封口。完整計畫必須通過真正核心解析往返再發送。編輯後內容不得重新移除尾標，另補替換／附加／區段位移回歸。
- [x] 保留中斷／未知結果不盲目重送、登入世代、輸入快照及確認畫面驗證，補 fake gateway 到 core 的完整讀回測試。

## Task 3：設定、文件與驗證

- [x] 09-20 離線補強：以實測七段推文重現欄寬差一的額外換行；修正固定分隔空白容量，正式 preflight 經原始文字 parser 再聚合，加入帳號對齊／IP／嵌套／未知容量拒絕回歸。全套 verify 通過；依使用者要求不重測 PTT。

- [x] Web 移除三分鐘 override，真實／fake 一致使用兩分鐘預設；保留可選 API。
- [x] 補齊使用者白皮書未完成條目，將 THREAD-006 容量、標記、換行與末段語意寫清楚，保留原意。更新 HTML 範例與過時設計、implementation notes、implement.md。
- [x] 執行 `npm run verify`、`git diff --check`。記錄尚未真實 PTT 發送的限制與結果；本階段不切分 branch、不 commit、不推送。
