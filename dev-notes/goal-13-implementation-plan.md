# Goal 13 極簡閱讀介面 Implementation Plan

**Goal:** 獨立 `apps/minimal` 提供 ASCII-like、語意 HTML 的唯讀 PTT 閱讀器。

**Architecture:** 使用 `@pttzzz/core`／`@pttzzz/browser` 公開入口；vanilla TypeScript controller 管理單一連線與導覽，DOM renderer 不解析終端或重新計算討論語意。`?preview=1` 只使用公開 fake gateway。保留根目錄預設 web app。

**Tech Stack:** TypeScript、Vite、Vitest/jsdom；既有 Buffer polyfill 與同源 WebSocket host proxy。

## 已批准設計

- 視覺：等寬字、黑白、文字導覽、虛線分隔、單欄。無卡片、裝飾圖片、動畫與 terminal 模擬。
- 內容：登入、熱門／指定看板、列表分頁、完整文章、可見聚合回覆樹、三個投票領域、編輯紀錄。
- 互動：原生 button/form/details、Tab 焦點、區塊水平捲動；正文保持空白，選擇折行時提示表格可能不對齊。
- 安全：不發文／回覆／投票／編輯；登入預設保留其他連線，明確選擇中斷才傳 true。憑證不記錄、不持久化。
- 讀取：漸進呈現 partial 正文與整理狀態，以 getArticle／article.updated 完成 final。正文 DOM 保持穩定，完整編輯紀錄於 final 顯示。導覽、session、登出使舊 request 失效；每次登入清空列表、cursor、文章。
- 登入：延後到使用者提交才建立 client；duplicate prompt 續答同連線；登出／斷線／非 duplicate 失敗後透過明確重新載入按鈕重建 transport。

## Task 1：狀態與安全測試

- [x] 建立 `apps/minimal/package.json`、tsconfig、Vitest 設定與 `src/controller.test.ts`。
- [x] 執行 `npm test -w @pttzzz/minimal`，確認缺少 controller 的 RED。
- [x] 實作 `src/controller.ts`：public read API、generation gate、登入 session reset、分頁。
- [x] 測試 A→B 舊結果、登出時 pending read、A→B→A、分頁 token、失敗不回退、預設 keep session。

## Task 2：語意 HTML 與 host

- [x] 先新增 renderer 測試驗證純文字、空白、hidden reply、votes、edits、鍵盤原生元素。
- [x] 實作 `src/view.ts`、`src/style.css`、`src/main.ts`、`index.html`、`vite.config.ts`。
- [x] 預覽使用 `new PttzzzClient(createFakeBrowserGateway())`；實際模式只有按下登入後才 connect。
- [x] `npm run build:minimal` 與測試通過；瀏覽器預覽驗證桌機／手機、文章、無真實 PTT 連線。

## Task 3：整合與交付

- [x] 根 scripts 增加 dev/build/preview:minimal，將 minimal 加入完整 build/test，但不改預設 dev。
- [x] 更新 lockfile、`apps/minimal/README.md`、implementation notes 與 `dev-notes/implement.md`。
- [x] 執行 `npm run verify`，檢查 diff，在 feature/goal-13-minimal-ui commit；不 merge/push。

## Task 4：文章返回列表保留位置（2026-09-09）

- [x] 先將指定本機 dev `87a9254` 合併至 `ff5b76a`；保留 Goal 10 core/browser 0.2.0 與極簡介面。
- [x] 新增專用 `returnToBoard()`；保留目前看板所有已載入頁面及原 opaque cursor，不重新讀取第一頁。
- [x] 返回時使 pending article generation 與訂閱失效，清空文章與 busy/error 狀態，不讓晚到 partial/final/error 覆蓋列表。
- [x] renderer 記錄開啟文章的按鈕 identity 與 viewport 座標；僅返回相同列表時還原，重新開板、首頁與 session 結束不沿用。
- [x] TDD 覆蓋兩頁→文章→返回→下一頁、不重讀、stale article result、焦點與捲動；執行完整 verify。
- [x] 離線瀏覽器驗證；文件／實作共同交付，不操作真實 PTT，不 merge 回 dev/main、不 push。

## Task 5：接軌 dev（2026-09-23）

- [x] 合併本機 dev，保留 minimal 與 web 啟動、建置及測試指令。
- [x] 更新 core/browser 0.3.0、rules 0.4.x；重用 web 的開發代理與目標設定，新增 minimal local／ptt 指令，連線明確傳入環境協定。
- [x] 回歸測試先覆蓋撤回父節點、原始版本與完整編輯結果、ANSI 正文及漸進更新，再調整唯讀 renderer；聚合只採公開核心結果。
- [x] 已刪除列表項目禁止開啟；保留核心讀取失敗處理與返回列表位置。
- [x] 更新使用文件及開發紀錄，執行 minimal 測試與完整 verify，提交接軌改動。

## Task 6：回文評分與不完整文章（2026-09-24）

- [x] 評分放入回文資訊列，窄螢幕允許自然折行。
- [x] 補單頁 100% 再翻頁造成標頭遺失的回歸，完成單頁時直接結束讀取。
- [x] 不完整資料保留已知標題／作者；失敗顯示重新載入操作，重試保留已讀取內容。
- [x] 完整 verify、紀錄驗證限制並提交。
