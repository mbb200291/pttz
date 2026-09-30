# Goal 13 Implementation Notes

## 回文自然換行（2026-09-24）

- 討論串內的 pre 使用 pre-wrap 與 overflow-wrap: anywhere，涵蓋回文、嵌套回文及編輯歷史；保留原文空白與換行，長網址可折行。文章正文仍由原有折行選項控制。

## 不完整文章與回文評分（2026-09-24）

- 回文評分移至作者／時間同列，以 inline-block 保留窄螢幕換行能力。
- 重現讀取器在完整單頁 100% 後仍送 PgDn，若回傳正文覆寫原行號範圍，標頭遺失且最終讀取失敗。改以單頁頁數與 100% 的組合確認完成；原有多頁流程未擴大重構。
- 使用者當時的正式站畫面未保留於現有瀏覽器，這是離線重現的相同症狀路徑，尚未證實為該次實站錯誤的唯一原因。
- partial 缺少標題／作者時保留同文章已知資訊，失敗不再顯示整理中；回傳失敗不視為完整結果，保留 incomplete 與手動重新載入。重試期間不清空正文，尚未收到 partial 時也保留重試入口。
- 仍發現多頁 reader 以任意畫面變動視為翻頁回應、400ms 未變即結束的既有風險。本輪只修已重現的單頁越界，未宣稱解決多頁時序問題；較完整方案是以行號／頁數進展判定完成、停滯回報可重試，再考慮傳輸批次關聯。
- 未使用正式站帳密、未發起 PTT 寫入或斷線操作。
- 開發 console 保留 article read 的原始錯誤與 cause，介面改為可操作文案，便於再次發生時追查實際底層失敗。
- 完整 verify exit 0：core 448、browser 468、web 382、代理 21、minimal 36；smoke helper 11、建置、lint（3 既有 warnings）及 package smoke 通過。未實站重現使用者的該篇文章。

## 接軌 dev（2026-09-23）

- 合併本機 dev `36fc20a`，merge commit `8852d1f`。僅根 package.json 指令衝突，保留兩個 app 的建置、測試及開發指令。
- minimal 依賴升為 core/browser 0.3.0、rules 0.4.x。沿用核心目前預設聚合設定，不在 UI 重新解讀續接、終止、嵌套或編輯指令。
- 原 renderer 丟棄 invisible 父節點，改保留撤回占位與完整 children 關係；不顯示撤回內容、評分與歷史。可見回文顯示 originalVersion 及 edits.resultContent。
- ANSI 投影由 web 移至 apps/shared，移除 React 型別依賴，web 保留 re-export。共用 allowlist、反白、色彩重置與控制序列防護；minimal 用文字節點呈現，更新正文色彩時保留 pre 節點及焦點。
- 開發代理移至根 dev/，web 原入口保留 re-export。代理與 Telnet 實作內容不變；目標解析增加可配置預設值。共用 host helper 與 Goal 12 採相同內容，避免日後兩個介面各自維護代理。
- minimal 預設仍正式站，新增 local／ptt 明確指令，標示環境並將相同協定傳至 browser；禁止 local production build／preview。未修改根環境檔或帳號資料。
- 刪除文章依列表作者 `-` 禁用入口；列表過期後才被刪除的情況仍交由新版 browser 的文章狀態驗證處理。
- 四項新 renderer 測試先重現缺失再修正；另補終端原文經公開核心的撤回／完整版本／新版尾標整合測試，以及 host 模式測試。既有隱藏節點測試改依撤回占位的新需求斷言，沒有修改核心 fixture expected。
- 瀏覽器離線預覽驗證登入示例→看板→文章→返回列表，焦點回到原文章，無 console error；本機登入頁正確顯示 127.0.0.1:8888。未登入本機或正式站，未發文、推文或刪文。
- modern-web-guidance 離線套件缺少快取；使用既有安全投影並核對 [MDN textContent](https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent)。產品文件依 product-grade-ui 分離使用說明與開發設定。
- 第一輪完整驗證的代理測試因沙箱禁止 listen 而失敗；以允許 loopback 的執行環境重跑，不變更測試或網路行為。
- 完整 `npm run verify` exit 0：core 448、browser 467、web 382、代理 21、minimal 32（合計 1,350），另有 smoke helper 11；TypeScript／Vite build、package smoke 通過。lint 0 errors／3 既有 warnings，保留既有 bundle-size 與 Node deprecation warnings。

## 邊界

`apps/minimal` 為獨立唯讀介面，不能依賴 `apps/web`、其他 worktree 或 internal API。公開 minimal-browser 範例僅作 host wiring 參考；未搬入其寫入表單與 article revision cache。

## 檢查紀錄

- modern-web-guidance 離線快取缺少套件，改參考 MDN 官方 white-space、button、keyboard accessibility 文件。
- 保留空白採 `white-space: pre`；DOM 使用 textContent，不將 PTT 文字當 HTML 或 Markdown 執行。
- 文章讀取以每次 request 的 generation／ArticleKey／revision gate 接收 partial／updated／最終 promise；不重算討論語意。切換 A→B→A 可正常重新呈現，不沿用範例的全域 revision cache。
- partial 更新保留正文 DOM／焦點並漸進呈現回覆；回覆正文焦點以 replyId 恢復，編輯歷程控制只於 final 顯示。可見子回覆不因隱藏父回覆而消失，深度超過三級僅停止視覺縮排，回覆作者標籤保留對象。
- browser driver 為 singleton：即使重新呼叫 createBrowserClient 也無法復活已關閉 transport。因此 client 延至首次登入才建立；登出、斷線、非 duplicate 登入失敗後顯示重新載入按鈕，沒有在 UI 擴大修改 transport。
- duplicate_login 表示 terminal 正等待選擇；第二次語意 login 須沿用同連線，不可先 disconnect/connect。選擇僅在 prompt 後出現，保留 false／明確中斷 true，無預先勾選框或自動重試。
- 斷線使 authentication generation 同時失效，晚到的 login Result 不會恢復帳號。pagehide 清理連線；BFCache pageshow persisted 重新載入。
- Node 26 的 localStorage 全域與 jsdom 不同，fake-preview 測試明確採用 jsdom Storage；不改 production storage 行為。

## 驗證

- TDD：controller／renderer 初始缺實作 RED；duplicate 同連線、登入中斷競態、lazy client／重新載入生命週期、空列表錯誤狀態均有實際 RED→GREEN。
- minimal 測試 16 項，涵蓋 stale read、opaque cursor、登入安全、partial/final、文字注入與空白、回覆／votes／edits、穩定正文焦點、後續 partial 回覆及公開 fake gateway 無 WebSocket。
- agent-browser 本機預覽已走熱門看板→test→文章。桌機及 390×844 手機檢查通過；手機 document scrollWidth=390、body white-space=pre，final history 可見。截圖暫存 `/private/tmp/goal13-desktop.png`、`/private/tmp/goal13-mobile.png`，不加入 repo。
- 正式模式僅檢查未登入頁：沒有預先踢除選項；未提交任何正式帳密或進行真實 PTT 連線。
- 2026-09-08 最後一輪 `npm run verify` exit 0：718 項測試（core 329、browser 168、web 205、minimal 16）與 helper 11 項通過；TypeScript／Vite build、lint（0 errors，3 個既有 Fast Refresh warnings）與 package smoke 通過。既有 gateway payload 仍有 >500 kB bundle warning，未擴大到 transport／bundle 重構。

## 返回列表階段（2026-09-09）

- 首先合併指定本機 dev `87a9254` 至 Goal 13 `ff5b76a`，merge commit `c5f32d1`，無衝突；沒有變更 dev/main 或遠端。minimal 公開依賴與 metadata／頁尾同步至 core/browser 0.2.0、rules 0.2.x。
- 根因為回看板按鈕沿用 `openBoard()`，清空列表與 cursor。新增 `returnToBoard()`，共用 generation／article subscription 失效流程但不進行 network read，保留目前列表陣列 identity 和 opaque cursor。
- renderer 只記錄從目前列表開啟的 article key 與 viewport x/y；返回相同陣列時重新建立列表後以 `focus({ preventScroll: true })` 和 `scrollTo({ behavior: "instant" })` 恢復，不在 partial 或一般 render 重複捲動。位置記錄在返回或離開列表流程後消耗；未新增跨看板快取、文章 cache 或持久化。
- 同儕審查發現 Result error 之外的 rejected Promise 可從 `run.catch` 覆蓋返回狀態；新增實際 Reader + DOM 測試確認 RED，再於 article catch 依 generation 排除舊拒絕，當前文章錯誤仍顯示。
- TDD 共新增 7 項，minimal 23 項通過：兩頁→文章→返回→第三頁且不重讀、stale partial/updated/final/error/rejection、fresh board/session reset、原 article focus／viewport 恢復。
- modern-web-guidance npm 搜尋遭 DNS 限制、離線快取 ENOTCACHED；改依 MDN [focus](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus) 與 [scrollTo](https://developer.mozilla.org/en-US/docs/Web/API/Window/scrollTo) 官方 API 文件。
- agent-browser 獨立 session 使用 `?preview=1`，只在離線 localStorage 建立 75 篇假資料。已載入 60 篇後開啟 index 1034，返回仍為 60 篇、focus identity 相同、scrollY 精確為 1300；再載入成為 75 篇且移除載入更多按鈕。未使用正式帳密或真實 PTT WebSocket。
- 最後一輪 `npm run verify` exit 0：759 項測試（core 363、browser 168、web 205、minimal 23）及 helper 11 項通過；TypeScript／Vite build、lint（0 errors、3 個既有 Fast Refresh warnings）、package smoke 通過。保留既有 large-chunk 與 Node deprecation warnings，未擴大修改。
