# Goal 12 Threads 風格 UI Implementation Plan

**Goal:** 獨立 apps/threads，登入後直接提供熱門看板精選與文章閱讀；第一版唯讀。

**Architecture:** 沿用 core/browser 公開 API。串行讀熱門前5板，每板最多6篇、PTT推數>=20，排除置頂，輪流混合。不做全站排名、推薦引擎或全文預抓。

**Tech Stack:** Vanilla TypeScript、Vite、Vitest；無新UI框架。

**視覺方向:** 深色單欄閱讀串流、細分隔、單一暖白文字層級；作者與看板提供脈絡。主區工作內容為文章摘要，點入才載入內文。焦點與 hover 輕量回饋，明確載入狀態與返回導覽，不加入裝飾動畫。

- [x] feed tests：串行與上限、置頂/重複、部分失敗、取消後不發新請求。
- [x] feed 實作與文章 generation/revision gate；先建立失敗案例再實作。
- [x] 獨立登入、登出、feed、手動刷新、逐步讀文與返回快照；session 重置清空資料，不儲存帳密。
- [x] 公開 fake gateway 預覽（示例門檻 0、明確標示非實站），不使用真實 PTT。
- [x] UI 邊界、build/test/lint、瀏覽器桌面與手機預覽；整合 workspace scripts/lockfile。docs 與實作一起 commit，保留分支、不 merge/push。
