# 真站畫面回放測試實作計畫

使用已提交的真站資料驗證正式 parser 與 terminal driver，並保留歷史資料的獨特分支。不連線 PTT，不更改原始畫面，不納入其他尚未提交的功能修改。

1. 先提交並推送採集成果與巢狀回覆解析測試：`4b3e4f5`，已完成。
2. 建立 `packages/browser/test-support/realPttReplay.ts`：固定畫面、嚴格按鍵順序、Vitest 虛擬時間；實際擷取與衍生故障情境分別標示。
3. 新增 `realPttTerminalFlows.test.ts`：登入 n/y、首次重複登入暫停、分類與 AID 解析、推文選單、冷卻分支、不確定結果不重送。
4. 新增 `realPttArticleWrites.test.ts`：發文／回文／編輯的畫面辨識、存檔問題、舊／新刪文提示與已刪除畫面。完整寫入狀態機重播列為後續缺口，不將畫面辨識冒充端到端驗證。
5. 將 `pushEntry.test.ts` 改用虛擬時間，排除 15ms 真實時鐘造成的負載敏感失敗，保留既有斷言。
6. 記錄 fixture 對照、資料遮蔽限制與未覆蓋範圍；執行 test/build/lint 並在乾淨 HEAD 加上本次差異後驗證，提交、推送。

成果與後續缺口見 [測試資料使用說明](../packages/browser/src/internal/__fixtures__/real-ptt/TEST-COVERAGE.md)。不更動 `spec.md`。
