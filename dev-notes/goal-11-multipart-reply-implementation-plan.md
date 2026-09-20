# Goal 11 自動分段回文 Implementation Plan

歷史初版計畫。下列五／三分鐘與 `||`／`|!` 發送決策已由規則 0.3.0 取代；目前進度與驗證以 [規則對齊計畫](goal-11-multipart-rules-update-plan.md) 及 [implementation notes](goal-11-multipart-reply-implementation-notes.md) 為準。

> **For agentic workers:** Use superpowers:subagent-driven-development for independent aggregation work; the primary agent integrates the transport and UI. No commits for this iteration.

**Goal:** 長回文按 PTT 真實容量依序送出，讀回後依既有規則聚合；最後一段以 `|!` 結束，單段不加。

**Architecture:** 核心新增可選三分鐘聚合設定與回文草稿操作，原單則 API 保持相容。browser 在取消的確認畫面取得容量，以 UAO 編碼規劃，再於同一終端序列工作內逐段傳送。UI 只在全部確認後關閉，暫停時保留草稿與不可變傳送識別。

**Tech Stack:** TypeScript、React、Vitest、PTT terminal、uao-js。

## Task 1：接收規則與相容設定

- [ ] 在 `packages/core/src/pushAggregator.test.ts` 先加入：`甲||`、`乙|!`、`丙` 形成兩則且尾標不顯示；連續六分鐘仍合併，插入其他作者後三分鐘合併、四分鐘在 web profile 不合併、預設五分鐘仍合併。
- [ ] `pushAggregator.ts` 增加結束標記與可选聚合時間；`client.ts` 接收 constructor options；`createBrowserClient.ts` 傳遞 options；`usePttSocket.ts` 設定三分鐘。不得在 UI 重組 replyId。
- [ ] 更新白皮書及 fixture；預設五分鐘不變。執行 `npm test -w @pttzzz/core`。

## Task 2：容量與分段規劃

- [ ] 新增 `packages/browser/src/internal/multipartReply.test.ts`，覆蓋容量、中文／符號、前綴、滿行與空白行、最後一段、控制語句及 codec 不支援字元。
- [ ] 新增 `multipartReply.ts`：`planReplyDraft(content, capacity, floor?)` 回傳完整 wire 片段。以 UAO round-trip 驗證字元；各片段預留兩欄尾標；主動換行在滿行邊界使用 `||` 橋接。正式送出前，以核心實際聚合器校驗草稿還原；無法安全表示者整批拒絕，不能偷偷截字。
- [ ] 單段未超容量且無主動換行時不加尾標。多段中間 `||`、末段 `|!`；回覆樓號各段明確帶同一前綴。
- [ ] 容量以 PTT 確認画面取得：在推文輸入框輸入探測文字、Enter 至確認但永不確認 y；由 padded input 長度扣除 NUL 得到容量，再以 n 取消。每段確認畫面需核對正文完全相同，變短／變動不得確認。

## Task 3：分段傳送與重試

- [ ] 新增可選 gateway `sendReplyDraft`、核心同名方法及 `ReplyDelivery`：`operationId/status/confirmed/total`；狀態為 complete、paused 或 uncertain。原 `Result<void>` API 不改義。
- [ ] `multipartReply.ts` 的 runner 保存每個 operation 的 immutable content、article、floor、pushType、plan 與已確認游標。重複 complete 呼叫不重送；not-sent 可續送；uncertain 不再自動重送。
- [ ] `terminalDriver.ts` 整批持有 runSerial，使用既有文章身分與送出確認／讀回校驗；例外在送出前後保守分類。其餘片段統一 native neutral，首段沿用使用者文章推噓方向。
- [ ] 同 operationId 內容變動拒絕。跨登入清空／拒絕舊工作。保留未送全文供 UI，不把局部成功当整批完成。
- [ ] 測試第一段失敗、第二段失敗、uncertain、重複請求、並行提交及不可變內容。

## Task 4：UI 與整合驗證

- [ ] `usePttActions.ts` 與 `Article.tsx` 接新 API，`Composer.tsx` 草稿模式解除單則 80-byte 限制，編輯控制命令維持單則限制。按鈕局部顯示分段進度。
- [ ] 完成後 refresh 並關閉；暫停保留原草稿，已開始傳送後鎖定文字與推噓選擇，允許安全續送；uncertain 只允許查驗，不盲目重送。關閉不丟失已開始工作。
- [ ] 補 hook/UI 測試：長文可送、進度、暫停保留、完整成功才關閉、編輯仍受限制。
- [ ] 執行 `npm run verify`；更新本計畫勾選、implementation-notes 與 `dev-notes/implement.md`。不 commit，不在線上 PTT 發送測試文章。
