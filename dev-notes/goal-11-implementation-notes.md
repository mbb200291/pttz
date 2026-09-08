# Goal 11 第一階段實作紀錄

本階段僅修改 Web 介面：列表鍵盤導覽、返回焦點、正文空白保存與原始排版切換。PTT 格式編輯尚未實作，core/browser 契約與寫入格式不變。

## 實作取捨

共用 navigation helper 只處理帶明確資料標記的元素，↑↓ 只移焦點而不觸發網路讀取。保留原生按鈕 Enter/Space、Tab、輸入與文字選取。看板名稱改為獨立原生按鈕，不把最愛按鈕嵌入另一個按鈕。

Article 移除正文 trim；原始排版使用 pre 與局部 overflow-x，媒體另列，不引入 Markdown/table parser。React 的 text rendering 保持原文不被當成 HTML 執行。

## 驗證

`npm run verify` 通過：core 329、browser 168、Web 212 項測試，11 項輔助測試、build、lint 與 package smoke。保留既有 lint 與 bundle 大小／Node 棄用警告。

新增 helper、RichContent 與實際 ArticleList/BoardInput 整合測試，共 7 項。以本機 agent-browser 預覽驗證 ↓ 選到 30214、→ 開文、← 返回並恢復 30214 焦點；390px 視窗的原始正文使用 white-space:pre，頁面寬度維持 390px。未登入真 PTT。

參考 [W3C keyboard interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/) 與 [MDN white-space](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/white-space)。modern-web-guidance CLI 因沒有離線快取無法使用，改查上述官方文件。
