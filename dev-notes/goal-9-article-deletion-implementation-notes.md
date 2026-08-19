# Goal 9 文章刪除實作紀錄

## 完成範圍

- `PttAdapter`、`FakePttAdapter` 與 `usePttActions()` 新增 `deleteArticle(request)`。
- 文章作者在文章頁可看到「刪除」按鈕；PTT ID 比對不分大小寫。
- 使用瀏覽器原生確認視窗阻擋誤觸，刪除期間停用按鈕並防止同步連點。
- 成功後沿用 `onBack()` 返回原看板；失敗留在文章頁並顯示 adapter 原因。
- 支援用文章 index 或 AID 重新定位待刪文章。

## ptt-client 寫入方式

正式環境沒有在前端隱藏文章。`PttClientAdapter.deleteArticle()` 進入既有 serial queue，並使用目前登入中的 ptt-client bot `send()` 操作 PTT 終端：

1. 進入指定看板。
2. 以 index 或 `#AID` 開啟文章。
3. 重新解析並核對作者與標題。
4. 回到游標所在的文章列後送出 `d`。
5. 只有辨識到 PTT 刪除確認提示時才送出 `y` 與 Enter。
6. 確認 index 已不再對應原文章，或原 AID 已不存在，才回報成功。

沒有確認提示、權限被拒絕、文章身分改變或成功狀態無法確認時，都不會猜測成功。Adapter 會回傳失敗並要求使用者重新整理看板檢查。

## Fake Adapter

Fake Adapter 會驗證登入者、實際作者、預期作者與標題。通過後從 localStorage fake store 移除文章，後續 `getArticle()` 不再取得該文章；非作者與過期身分不會改動資料。

## 測試覆蓋

- action hook request 完整轉交。
- Fake Adapter 作者成功、非作者拒絕、過期身分拒絕。
- 正式 adapter 身分核對、確認提示 gate、index 成功路徑與 AID 成功路徑。
- UI 作者可見性、取消確認、成功返回、pending 防重與失敗留頁。
- 正式 PTT 流程只使用模擬 bot 與終端快照測試，沒有刪除真實文章。

最終驗證：

- `npm test`：24 個測試檔、330 項測試全數通過。
- `npm run build`：TypeScript 與 Vite production build 成功。
- `npm run lint`：0 error、6 個既有 warning；本次修改未新增 warning。
- `git diff --check`：通過。

## 已知邊界

- 刪除不可復原，PTTzzz 不提供復原功能。
- PTT 若新增未涵蓋的確認畫面，adapter 會安全失敗，不會自動送出確認。
- 真實 PTT smoke test 必須由使用者使用自己的測試文章手動確認。
- 回文撤回解析不屬於本 Goal。
