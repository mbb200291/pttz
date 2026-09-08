# Goal 12 Threads 風格 UI Implementation Plan

**Goal:** 獨立 apps/threads，登入後直接提供熱門看板精選與文章閱讀；第一版唯讀。

**Architecture:** 沿用 core/browser 公開 API。串行讀熱門前5板，每板最多6篇、PTT推數>=20，排除置頂，輪流混合。依可視範圍依序載入內文，不做全站排名、推薦引擎或初始全量正文預抓。

**Tech Stack:** Vanilla TypeScript、Vite、Vitest；無新UI框架。

## 串流內文與緊湊排版修訂

### 原位討論與媒體（後續修訂）

使用者確認：點文章區塊原位展開全文與回覆；移除獨立討論頁入口。深色、緊湊單欄，媒體放正文下方，右側露出下一張。使用原生捲動吸附與焦點回饋，不加輪播依賴或自動播放。

- [x] `app.test.ts` 先驗證點區塊／標題原位展開、共用讀取、收合後晚到內容、媒體與選字不誤觸。以 `npm test -w @pttzzz/threads-example` 驗證新斷言先失敗；鍵盤原生按鈕在瀏覽器檢查。
- [x] `media.test.ts` 驗證 HTTPS 圖片與 YouTube 主機／ID、去重、失敗連結、穩定 DOM；新增 `media.ts` 作 UI 媒體解析及呈現，不依賴另一個 UI。
- [x] `app.ts` 移除另頁閱讀流程，沿用回覆 renderer 與快取；展開時才顯示回覆，partial 不重建播放器。點擊排除互動元素、選取文字與滑動。
- [x] `style.css` 媒體使用 overflow-x、scroll-snap、限定寬度與圖片 contain；鍵盤可捲動、手機不整頁溢出。
- [x] 更新 README／notes，執行 tests、build、lint 與假資料瀏覽器驗證；文件和實作同 commit，不 merge/push。

依使用者 review：直接顯示內文、過長收合，於原位向下展開；沿用深色、細分隔與單欄，減少標頭與列間距，動態僅用原生展開及焦點回饋。

- [x] 先補 app 測試：可視文章逐筆讀取、partial 內文、展開／收合不換頁、不重讀、離頁停止排隊、斷線清除快取。
- [x] 修改 app.ts：IntersectionObserver 啟動可視範圍預覽，重用同篇 in-flight／final，保留查看討論入口；快取限本次最多 30 篇串流。
- [x] 修改 style.css：正文最多五行（max-height fallback），縮小上下留白；長文原位展開，ResizeObserver 更新收合按鈕。
- [x] 更新 UI README／notes；測試、build、lint 與桌面／手機 preview，實作與文件同一 commit；不 merge/push。

**視覺方向:** 深色單欄閱讀串流、細分隔、單一暖白文字層級；作者與看板提供脈絡。主區直接呈現內文預覽，長文原位展開。焦點與 hover 輕量回饋，明確載入狀態與返回導覽，不加入裝飾動畫。

- [x] feed tests：串行與上限、置頂/重複、部分失敗、取消後不發新請求。
- [x] feed 實作與文章 generation/revision gate；先建立失敗案例再實作。
- [x] 獨立登入、登出、feed、手動刷新、逐步讀文與返回快照；session 重置清空資料，不儲存帳密。
- [x] 公開 fake gateway 預覽（示例門檻 0、明確標示非實站），不使用真實 PTT。
- [x] UI 邊界、build/test/lint、瀏覽器桌面與手機預覽；整合 workspace scripts/lockfile。docs 與實作一起 commit，保留分支、不 merge/push。
