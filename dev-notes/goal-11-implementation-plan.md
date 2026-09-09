# Goal 11 鍵盤與排版 Implementation Plan

## 已批准：網站閱讀樣式與登入中斷提示

- [ ] 以 parser 保留「未指定顏色／作者指定顏色」差異，預設繼承網站文字與背景，只調整明確設定的顏色；手動原始排版採終端原色。一般正文網站字體，保守識別表格／ASCII 才等寬。
- [x] 查核官方 PTT 重複登入流程；不真站測試、不使用舊帳密。補閉線後登入結果覆蓋狀態的 RED→GREEN 測試，closed 畫面顯示可能原因與重新整理入口，不自動踢人。
- [ ] 更新文件、完整驗證並分別提交閱讀樣式與登入提示，不 merge/push。

## 已批准：自適應 ANSI 正文

正文採安全 SGR 樣式解析，不執行游標或任意控制碼；兩種排版均保留顏色。以隱藏且不影響布局的同字型正文量測自然行寬，ResizeObserver 觀察文章容器與量測節點。容器足夠採 pre，不足採 pre-wrap；手動「原始排版」強制 pre 加局部橫向捲動，再次點擊回到自動。媒體固定於正文下方，網址仍在正文，不因模式變動搬移。

- [x] 新增 ANSI parser 測試後實作安全 SGR 分段。
- [x] RichContent 測試寬／窄容器、縮放、手動鎖定、顏色與原文網址保存後實作 AdaptiveArticleBody；媒體固定另列。
- [x] Article 不再移除完整正文 ANSI，保留 inline 回文現有呈現；更新文件。
- [x] 執行完整 verify 與離線寬／窄視覺檢查，程式和文件同批提交 Goal 11，不 merge/push。

**Goal:** 第一階段加入列表鍵盤導覽與原始排版切換；PTT 格式化編輯不在本階段。

**Architecture:** 沿用 React 元件與既有 callback。鍵盤事件僅由聚焦的列表接收；正文切換只影響 CSS 與媒體呈現，不修改核心解析或發送資料。

**Tech Stack:** React、TypeScript、Vitest、Testing Library、原生鍵盤與 CSS white-space。

## 已批准下一階段：PTT 相容文字格式

設計：正文保持普通文字，另附依 JavaScript UTF-16 左含右不含索引定位的非重疊格式範圍；只支援高亮與 8 種前景色。Core 驗證範圍／控制字元，browser 在已確認編輯器中將受控 SGR 以 Ctrl+U 插入 ESC 後送出。UI 選字套用格式，預覽同一份範圍；修改碰到的範圍清除、後方範圍平移。不將 Markdown 轉成終端命令，不宣稱斜體／刪除線支援。本階段既有文章讀取仍為純文字，編輯不承諾保留原 ANSI 樣式。

- [x] `packages/core/src/articleFormatting.test.ts` 測合法樣式、多行、重疊／超界／代理字元邊界／控制字元拒絕；新增公開型別、驗證及文字分段 helper。`client.test.ts` 驗證非法格式不送 gateway。
- [x] browser 新增 `articleFormatting` 編碼測試：受控 ESC 轉 Ctrl+U，普通文字不變，unsupported／控制字元不送；串接發文／編輯／文章回應，未確認 editor 不送 formatted body。補終端傳送回歸。
- [x] Web 新增格式範圍編輯 helper 測試與 ComposeScreen 整合測試；選字高亮／顏色／清除、預覽及 payload 一致；App 傳遞 formatting，寫入不確定狀態鎖仍有效。
- [x] 更新 core/browser/UI 文件與 notes，完整 verify 與獨立審查；規則層不改，不 merge/push、不真站發文。程式與文件同批提交。
- [ ] 手動編輯器視覺驗收：本次離線瀏覽器僅確認頁面載入；格式互動由元件整合測試覆蓋，不能替代視覺驗收。

## 已完成：統計整合、分頁與快捷鍵

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
