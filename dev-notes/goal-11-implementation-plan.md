# Goal 11 鍵盤與排版 Implementation Plan

**Goal:** 第一階段加入列表鍵盤導覽與原始排版切換；PTT 格式化編輯不在本階段。

**Architecture:** 沿用 React 元件與既有 callback。鍵盤事件僅由聚焦的列表接收；正文切換只影響 CSS 與媒體呈現，不修改核心解析或發送資料。

**Tech Stack:** React、TypeScript、Vitest、Testing Library、原生鍵盤與 CSS white-space。

## 後續：統計整合、分頁與快捷鍵

- [x] 以 hook／gateway 回歸測試重現重複刷新後置底文章消失、提早顯示最舊、游標覆蓋與請求競態；修正根因，保留錯誤與可重試狀態。
- [x] 統計呈現提案：合併為一列可操作推噓按鈕（核心 articleVotes）、聚合回覆數與回覆此文；移除重複原生統計，不改動 vote handlers 與權限限制。
- [x] 快捷鍵提案：首頁四方向鍵選看板／Enter 進入；文章 X 開留言、R 開回覆文章；列表 Ctrl+P 開發文。沿用既有 callback，排除輸入、IME、dialog、重複按鍵及不相容修飾鍵，絕不直接送出。
- [x] 確認設計後補互動回歸測試，驗證焦點、無權限／彈窗阻擋、瀏覽器預覽；執行完整 verify，更新 README／notes，一起提交分支，不 merge/push。

- [x] 在 navigation 測試涵蓋箭頭移動、開啟／返回、disabled、輸入框、IME、修飾鍵與巢狀按鈕；先跑紅燈。
- [x] 新增小型 keyboardNavigation helper，整合 ArticleList、BoardInput、Article；保留原生 Tab/Enter，回程恢復列表焦點。
- [x] RichContent 加原始排版切換；原文保持等寬空白與水平捲動，媒體另列。Article 與 partial 不 trim 正文。
- [x] 新增 RichContent 與文章顯示回歸測試，檢查一般模式保有圖片預覽。
- [x] 執行完整 verify 與本機 preview 檢查，更新 Web README、notes 與 implement.md；一起 commit，不 merge／push。

鍵盤設計遵循 W3C APG 的焦點與鍵盤慣例，排版使用 CSS white-space。modern-web-guidance CLI 無離線快取，改查 W3C APG 與 MDN 原始文件。
