# Goal 12 介面修訂紀錄

## 變更

串流移除宣傳標語與英文副標；討論區加入獨立底色、細線及子回覆引導，回文上下 padding 調整為 9px。展開／收合與箭頭使用短過渡，收合時即時設定 inert／aria-hidden。

## 實作取捨

動畫使用 CSS display 離散過渡；支援 interpolate-size 時補上 220ms 高度插值，否則以淡入淡出呈現，不使用固定高度或 JavaScript 計時器。prefers-reduced-motion 關閉動畫。既有逐篇載入與討論展開邏輯沿用。

## 瀏覽器驗證

使用 agent-browser 與離線 preview，檢查 1280px 桌面、390px 手機、登入頁、列表與文章；頁面無水平溢出。未登入或寫入 PTT。
驗證討論開關、快速重複切換、鍵盤 Enter、收合後焦點、hidden／inert 狀態，以及 reduced-motion 下無動畫；回文上下 padding 實測為 9px。

## 自動驗證

首次同時執行兩個 worktree 的 verify，browser multipartTerminal 個案在 5 秒限制內逾時；改為逐一執行。代理測試需要 sandbox 外的本機監聽權限。

最終通過：core 448、browser 467、web 382、代理 21、threads 106、smoke helpers 11；型別檢查、建置、套件 smoke 與 diff check 通過。lint 為 0 errors、3 項既有 react-refresh warnings。verify 因 sandbox 限制中斷後，補跑剩餘項目至全部通過。

獨立程式碼審查未發現需修正項目。
