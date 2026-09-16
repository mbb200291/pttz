# Goal 12 串流互動修訂 Implementation Plan

**Goal:** 補齊可發現的留言入口、統計、分享與頂部下拉更新，改善閱讀質感並記錄資料呈現邏輯。

**Architecture:** apps/threads 沿用 core/browser 公開 API，僅擴充 UI。文章正文與討論共用單筆 FIFO；刷新共用同一進行中操作。分享 URL 使用明確 board + aid/index 參數，登入後開啟目標文章，不序列化 opaque articleKeyId。

**Tech Stack:** 原生 TypeScript、CSS、Vite、Vitest/jsdom，無新依賴。

## 設計

- 深色、暖白與淡綠單一重點色，細分隔單欄；以文字層級、間距和固定操作列改善可讀性。
- 文章列固定顯示核心 articleVotes 的推噓與 visible 回覆樹節點總數；未讀使用未知符號，partial 標示尚在更新，零與未知區分。
- 討論按鈕原位展開完整討論並將入口導向留言；正文仍可獨立使用原有整篇展開操作。空留言、讀取中與失敗均有明確可見狀態。
- Web Share 可用時由直接點擊啟動；不支援或失敗時提供可複製 URL，clipboard 失敗保留可選取連結。取消不顯示成功。
- 手機頁首向下拉動達門檻並放開刷新；排除橫向媒體、控制項、多指、中途取消及非頁首操作。手動刷新保留，兩個入口不可重疊。
- 動態限於按鈕回饋、展開淡入、下拉阻尼與刷新指示；減少動態偏好停用非必要動畫。

## 步驟

- [x] 驗證預覽與留言互動，新增討論按鈕／統計、分享及刷新重入失敗測試；真實登入後留言問題依後續指示暫緩。
- [x] 修正 app.ts，增加獨立 articleLink.ts 與 pullRefresh.ts 及對應回歸測試。
- [x] 調整 style.css，瀏覽器檢查桌面／手機、鍵盤、展開／分享、刷新及溢出。
- [x] 更新 apps/threads/README.md 的資料來源、樹呈現、計數、快取、互動與限制；記錄 notes 和 implement.md。
- [x] 執行 npm run verify，review 後提交 feature branch；不合併 dev/main。
