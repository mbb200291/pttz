# Goal 7 回文推噓控制修正 Implementation Notes

## 完成內容

- 將作者只能用 `→` 的限制縮小到直接回覆自己的文章，不再套用到特定樓層回覆。
- 特定樓層回覆依使用者選擇產生 `推x樓 body`、`回x樓：body` 或 `噓x樓 body`，三者底層均以 PTT `→` 類別送出。
- 回文卡片投票在呼叫 adapter 前立即更新票數與選取狀態，同一樓層於等待期間仍以 pending guard 防止快速連點。
- adapter 拒絕或拋出例外時，僅回復該樓層點擊前的 optimistic state，並在討論串上方顯示原始失敗原因。

## 實作注意事項

- 樓層投票語意來自內容 pattern，不使用 raw PTT 推噓類別，因此文章作者可透過 PTTzzz 對回文評分而不觸發「作者不能推噓自己的文章」限制。
- rollback 需區分點擊前是否已有尚待 server data 確認的 optimistic entry；若有則還原該 entry，否則移除 map entry 並回到解析資料。
- 成功後仍重新載入文章，由既有 reconciliation 在解析資料確認相同投票方向後移除暫存 optimistic state。

## TDD 證據

- 樓層回覆測試先出現 3 個預期失敗：作者推／噓被停用，推／噓內容被格式化為一般 `回x樓`。
- 回文投票測試先出現 2 個預期失敗：pending 時未立即選取，失敗時沒有錯誤訊息。
- 修正後相關元件測試為 31/31 通過。

## 最終驗證

- `npm test`：26 個 test files、382/382 tests 通過。
- `npm run build`：TypeScript 與 Vite production build 通過；保留既有的 chunk size warning。
- `npm run lint`：0 errors、6 個既有 warnings，分布於 `ArticleList.tsx`、`PushThread.tsx` 與 `useArticle.ts`。
