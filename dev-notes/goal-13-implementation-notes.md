# Goal 13 Implementation Notes

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
