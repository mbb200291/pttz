# Goal 13 介面修訂紀錄

## 變更

極簡版移除重複功能說明、英文副標及按鈕括號，保留等寬字與暖白底色；統一細實線、列表與回文間距，沿用正文與回文閱讀行為。

## 實作取捨

正文仍保留原始換行與水平捲動；折行選项改用簡短標籤，表格對齊提示放於 title。既有測試同步新的操作名稱，不變更資料 fixture。

## 瀏覽器驗證

使用 agent-browser 與離線 preview，檢查 1280px 桌面、390px 手機、登入頁、列表與文章；頁面無水平溢出。未登入或寫入 PTT。
文章正文保留水平捲動，回文自然換行；兩個尺寸皆正常呈現。

## 自動驗證

首次同時執行兩個 worktree 的 verify，browser multipartTerminal 個案在 5 秒限制內逾時；改為逐一執行。代理測試需要 sandbox 外的本機監聽權限。

最終通過：core 448、browser 468、web 382、代理 21、minimal 36、smoke helpers 11；型別檢查、建置、套件 smoke 與 diff check 通過。lint 為 0 errors、3 項既有 react-refresh warnings。完整 npm run verify 結束碼為 0。

獨立程式碼審查未發現需修正項目。

## 合併 dev

Goal 12 與 Goal 13 各整併為單一 commit。合併保留根目錄 dev/ 共用代理，避免 rename 偵測將轉接檔覆寫到實作；根 scripts 與 lockfile 同時涵蓋 threads、minimal，兩個目標的實作紀錄均保留。新 worktree 需先 build:packages，供跨層整合測試使用套件 exports。

合併後完整 npm run verify 通過：core 448、browser 468、web 382、代理 21、threads 106、minimal 36、smoke helpers 11，建置與套件 smoke 通過；lint 0 errors／3 既有 warnings。未進行 PTT 實站操作。
