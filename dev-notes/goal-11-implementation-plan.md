# Goal 11 鍵盤與排版 Implementation Plan

**Goal:** 第一階段加入列表鍵盤導覽與原始排版切換；PTT 格式化編輯不在本階段。

**Architecture:** 沿用 React 元件與既有 callback。鍵盤事件僅由聚焦的列表接收；正文切換只影響 CSS 與媒體呈現，不修改核心解析或發送資料。

**Tech Stack:** React、TypeScript、Vitest、Testing Library、原生鍵盤與 CSS white-space。

- [x] 在 navigation 測試涵蓋箭頭移動、開啟／返回、disabled、輸入框、IME、修飾鍵與巢狀按鈕；先跑紅燈。
- [x] 新增小型 keyboardNavigation helper，整合 ArticleList、BoardInput、Article；保留原生 Tab/Enter，回程恢復列表焦點。
- [x] RichContent 加原始排版切換；原文保持等寬空白與水平捲動，媒體另列。Article 與 partial 不 trim 正文。
- [x] 新增 RichContent 與文章顯示回歸測試，檢查一般模式保有圖片預覽。
- [x] 執行完整 verify 與本機 preview 檢查，更新 Web README、notes 與 implement.md；一起 commit，不 merge／push。

鍵盤設計遵循 W3C APG 的焦點與鍵盤慣例，排版使用 CSS white-space。modern-web-guidance CLI 無離線快取，改查 W3C APG 與 MDN 原始文件。
