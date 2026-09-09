# Goal 12 實作紀錄

## 完成範圍

新增 `apps/threads`，獨立唯讀 TypeScript/Vite UI，以熱門看板精選為入口。不改 core/browser、原有 Web UI 或 spec.md。UI 取捨與啟動方式集中於 [介面 README](../apps/threads/README.md)。

## 讀取佇列與刷新容錯修訂（2026-09-09）

- 先合併本機 dev `87a9254`，merge commit `5e5384d`；無文字衝突。Threads dependency／compatibility metadata 及 lockfile 同步 core/browser 0.2.0、rules 0.2.x，保留 Goal 10 核心規則。
- 回歸先重現重試直接呼叫 `readArticle` 導致與 viewport 讀取重疊，再統一到 FIFO。去重集合只保留排隊／讀取中的文章，完成後移除；失敗不因展開或 viewport 自動重試，必須使用重試按鈕。
- 重試立即清除舊 error 並通知畫面，排隊與正在讀取分別呈現；已有 partial 繼續可讀，不因重試清空正文。
- 刷新先停止未開始的排隊，再等待目前不可取消的讀取。快取與展開狀態延後至成功取得新串流才清除；來源 Result 失敗、拋出例外、所有看板失敗均保留舊資料。
- `completed` 包含成功與失敗看板，每個失敗看板對應一筆 error；以此區分全部失敗與成功空結果。部分成功接受新列表並呈現單板錯誤；單板 rejected promise 轉成該板錯誤後繼續，避免遺失先前批次。
- modern-web-guidance 線上請求 `ENOTFOUND`，離線 `ENOTCACHED`；依 [MDN await](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await) 的 Promise 等待語意沿用原生 TypeScript 流程，不新增依賴。
- 測試只使用 fake client／jsdom；本次沒有新增視覺布局，未操作真實 PTT 或使用帳密。
- 完整 `npm run verify` 通過：core 363、browser 168、Web 205、Threads 28，另 11 helper、build、lint、package smoke。Threads 比合併後基準新增 9 個案例；先重現 4 個 app 失敗及 1 個 feed 失敗，再修正通過。既有 3 個 Fast Refresh、bundle size 與 Node module.register deprecation 警告保留。

## 原位討論與媒體修訂（2026-09-08）

- 使用者確認整塊文章原位展開全文與回覆，移除「查看討論」及獨立文章頁流程。標題使用原生 button 保留 Enter／Space 操作，媒體、回覆、連結、選字及拖曳不切換收合。
- `media.ts` 只在 UI 識別媒體網址，不引用另一個 UI 或修改 core。HTTPS 圖片、單張 Imgur、YouTube 主機及 11 字元 ID 通過 URL 驗證後才嵌入；任意 HTML 不執行。
- 原生橫向捲動、右側露出下一張、scroll snap proximity；圖片 lazy/no-referrer，YouTube lazy/privacy-enhanced iframe、不自動播放，來源連結一直保留。第三方連線風險已寫入 UI README。
- 參考 [MDN scroll-snap-type](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scroll-snap-type)、[YouTube 嵌入說明](https://support.google.com/youtube/answer/171780)；modern-web-guidance 離線未命中，改查官方文件。未新增依賴。
- 審查發現 partial 重建 PTT 統計 details 會清除展開及焦點；以失敗測試重現後改為穩定容器。媒體追加或移除前方圖片均保留既有播放器、不 detach；若原文真的重新排列既有媒體，仍可能因 DOM 排序重啟播放器。
- 以本機 fake gateway 驗證，未登入真實 PTT。外部測試圖片載入失敗時會保留原圖連結；正常圖片版面另用記憶體 SVG 示意圖驗證，不宣稱所有圖床可用。
- 手機 390px：頁面無橫向溢出，媒體列 clientWidth 316／scrollWidth 854，滑至影片後點播放器仍維持文章收合。YouTube 顯示播放器控制項；標題 Enter／Space 及點正文能原位展開／收合。測試假資料與網路攔截已還原。
- 完整 `npm run verify` 通過：core 329、browser 168、Web 205、Threads 19，另 11 helper、build、lint、package smoke；只有既有 Fast Refresh／bundle size 警告。

## 實作注意事項

- feed 先寫失敗測試，再實作五板、每板六篇、推數門檻、去重與交錯順序；只用公開 core/browser API。
- API 的結果數上限不代表終端頁面數上限；不宣稱全站排名。純數字熱度與「爆」保留來源語意。
- 初版曾使用 final-only 讀取；審查指出與逐步閱讀要求不符，已補 article.partial/updated。每次開文獨立訂閱，以世代／文章 key／revision 過濾，離頁即停止接受；正文及導覽 DOM 保持穩定。
- 討論 partial 可以重繪，編輯歷程等互動展開只在 final 開放，避免讀取中展開狀態重置。
- 真實 browser gateway 在 closed/error 狀態不能直接 connect；登出／斷線後提供明確重新載入入口，建立新 client，不沿用 fake gateway 的較寬鬆行為。
- pagehide 清理後需處理 pageshow.persisted；BFCache 返回重新建立介面，避免空白畫面。
- Vite 的 node polyfill plugin 僅供 app 建置／開發；Vitest 關閉此 plugin，避免 node:url 被改寫為瀏覽器 polyfill。
- 預覽只用公開 fake gateway，不登入真實 PTT、不使用歷史帳密、不發送內容或修改最愛。

## 內文串流修訂（2026-09-08）

- 依使用者 review 改為直接顯示內文、五行以上原位展開／收合；縮小標頭與列間距、頭像 32px、標題 16px，保留手機可讀性及原生按鈕。
- `IntersectionObserver` 觸發可視文章的依序讀取；使用公開 `getArticle`，共享同篇進行中的請求與結果。此 API 沒有獨立摘要或 cancel，停止排隊不代表已取消目前終端讀取。
- 快取生命週期限本次最多 30 篇串流，刷新、登出、斷線及 dispose 清除；返回串流保留已讀正文與展開狀態。新的預覽可接續同篇已發出的合法讀取，但不跳回已離開的討論頁。
- 原本文字標頭只在前三行作者／標題精確對應卡片時由預覽略去，避免摘要僅顯示重複 metadata；核心及討論頁原文不變。
- CSS 以五行 clamp 搭配 max-height fallback；ResizeObserver 隨寬度與 partial 內容調整按鈕。依 [MDN line-clamp](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/line-clamp) 及 [Intersection Observer](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API) 指引，沒有新增依賴。
- 新增可視範圍、依序讀取、共用快取、離頁／斷線、inline 展開與短文、失敗重試、精確 header 比對等檢查。既有「返回後晚到正文完全不可見」斷言改為「允許更新同篇串流預覽，但不可返回文章頁」，符合新的可見內文要求。

### 修訂驗證

- 完整 `npm run verify` 通過：core 329、browser 168、原 Web 205、threads 14；另 11 個 helper 測試、build、lint、package smoke。既有三個 Fast Refresh warning 與 bundle size warning 保留。
- 本機 fake gateway 桌面／390px 手機預覽：短文不出現展開按鈕，長文五行收合高度 115px，展開後顯示完整內容；手機頁面寬度等於 viewport，沒有整頁橫向溢出。另測試無手動換行的長文自動折行。
- 獨立唯讀審查未發現 Important／Critical 問題；未實測真實 PTT。

## 初版驗證

- 9 個新測試：feed 上限／序列、取消、部分失敗、世代隔離、斷線清除、過期完成值、partial revision／錯誤 key、純文字防 HTML 注入、公開 API 與唯讀入口。
- 全專案 verify：core 329、browser 168、原 Web 205、threads 9；另 11 個 smoke helper 測試、build、lint、package smoke。
- 瀏覽器本機預覽：桌面串流、逐步讀文、返回／焦點恢復、登出／重載，以及離頁後上一頁返回；390×844 正文保留 pre，body/viewport 同為 390px，無整頁橫向溢出。
- 既有三個 Fast Refresh lint warning 與 bundle size warning 保留；無新 lint error。
- 不宣稱真站登入、熱門資料或 PTT 效能已實測；正式部署仍需相容的 WebSocket host。
