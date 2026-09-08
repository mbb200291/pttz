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
