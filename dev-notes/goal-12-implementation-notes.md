# Goal 12 實作紀錄

## 完成範圍

新增 `apps/threads`，獨立唯讀 TypeScript/Vite UI，以熱門看板精選為入口。不改 core/browser、原有 Web UI 或 spec.md。UI 取捨與啟動方式集中於 [介面 README](../apps/threads/README.md)。

## 實作注意事項

- feed 先寫失敗測試，再實作五板、每板六篇、推數門檻、去重與交錯順序；只用公開 core/browser API。
- API 的結果數上限不代表終端頁面數上限；不宣稱全站排名。純數字熱度與「爆」保留來源語意。
- 初版曾使用 final-only 讀取；審查指出與逐步閱讀要求不符，已補 article.partial/updated。每次開文獨立訂閱，以世代／文章 key／revision 過濾，離頁即停止接受；正文及導覽 DOM 保持穩定。
- 討論 partial 可以重繪，編輯歷程等互動展開只在 final 開放，避免讀取中展開狀態重置。
- 真實 browser gateway 在 closed/error 狀態不能直接 connect；登出／斷線後提供明確重新載入入口，建立新 client，不沿用 fake gateway 的較寬鬆行為。
- pagehide 清理後需處理 pageshow.persisted；BFCache 返回重新建立介面，避免空白畫面。
- Vite 的 node polyfill plugin 僅供 app 建置／開發；Vitest 關閉此 plugin，避免 node:url 被改寫為瀏覽器 polyfill。
- 預覽只用公開 fake gateway，不登入真實 PTT、不使用歷史帳密、不發送內容或修改最愛。

## 驗證

- 9 個新測試：feed 上限／序列、取消、部分失敗、世代隔離、斷線清除、過期完成值、partial revision／錯誤 key、純文字防 HTML 注入、公開 API 與唯讀入口。
- 全專案 verify：core 329、browser 168、原 Web 205、threads 9；另 11 個 smoke helper 測試、build、lint、package smoke。
- 瀏覽器本機預覽：桌面串流、逐步讀文、返回／焦點恢復、登出／重載，以及離頁後上一頁返回；390×844 正文保留 pre，body/viewport 同為 390px，無整頁橫向溢出。
- 既有三個 Fast Refresh lint warning 與 bundle size warning 保留；無新 lint error。
- 不宣稱真站登入、熱門資料或 PTT 效能已實測；正式部署仍需相容的 WebSocket host。
