# Goal 11 第一階段實作紀錄

本階段僅修改 Web 介面：列表鍵盤導覽、返回焦點、正文空白保存與原始排版切換。PTT 格式編輯尚未實作，core/browser 契約與寫入格式不變。

## 實作取捨

共用 navigation helper 只處理帶明確資料標記的元素，↑↓ 只移焦點而不觸發網路讀取。保留原生按鈕 Enter/Space、Tab、輸入與文字選取。看板名稱改為獨立原生按鈕，不把最愛按鈕嵌入另一個按鈕。

Article 移除正文 trim；原始排版使用 pre 與局部 overflow-x，媒體另列，不引入 Markdown/table parser。React 的 text rendering 保持原文不被當成 HTML 執行。

## 驗證

`npm run verify` 通過：core 329、browser 168、Web 212 項測試，11 項輔助測試、build、lint 與 package smoke。保留既有 lint 與 bundle 大小／Node 棄用警告。

新增 helper、RichContent 與實際 ArticleList/BoardInput 整合測試，共 7 項。以本機 agent-browser 預覽驗證 ↓ 選到 30214、→ 開文、← 返回並恢復 30214 焦點；390px 視窗的原始正文使用 white-space:pre，頁面寬度維持 390px。未登入真 PTT。

參考 [W3C keyboard interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/) 與 [MDN white-space](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/white-space)。modern-web-guidance CLI 因沒有離線快取無法使用，改查上述官方文件。

## 後續：統計整合、分頁與快捷鍵

文章移除重複原生統計列，既有 VotePair 與聚合後回覆數整合為同一操作列；保留權限、作者限制及原有送出流程，票數仍以核心 articleVotes 為準。

首頁採實際元素位置進行四方向導覽，Enter 沿用原生按鈕；首次聚焦僅在 body 持有焦點時進行。文章 X 開留言、R 開回應至看板，列表 Ctrl+P 開發文，全部只開啟既有編輯器。輸入、組字、dialog、文字選取與重複按鍵均排除。

本次另修改 browser 與 hook，不限於介面呈現：終端原本沿用分頁後的舊畫面，刷新沒有回到最新頁；重疊頁又可能回傳較新文章或置底，造成游標停滯。最新頁讀取須重新定位，舊頁依嚴格小於 beforeIndex 排除重疊與置底，游標取正常文章最小索引。hook 以同步 request ref 阻擋同一 tick 重複操作，generation 排除過期回應，刷新失敗／空頁保留原游標，快取等待重驗證時不誤報最舊。

瀏覽器使用本機 mockPtt，不登入真實 PTT。確認方向鍵選看板／Enter 進入、Ctrl+P 開發文、X 開留言、R 開回應，以及輸入文字不觸發快捷鍵；沒有實際送出文章或回文。文章預覽確認統計只保留一列。獨立程式碼審查指出篩選模式也需要最新頁定位，納入同一修正與回歸測試：同一搜尋條件分頁後刷新須回到最新結果，不重新疊加搜尋條件。

2026-09-09 最終 `npm run verify` 通過：core 329、browser 171、Web 222 項測試，加上 11 項輔助測試、build、lint（0 errors、3 個既有 warnings）及 package smoke。共新增 13 項測試；統計列既有測試亦改為檢查核心校正票數與單一操作列。保留既有 bundle 大小與 Node 棄用警告。審查複驗無未解決的 Critical／Important 問題。
