# Goal 12 串流互動修訂紀錄

## 範圍

補齊 Threads UI 的統計／討論／分享操作列、分享網址開文、頁首下拉刷新與動態樣式，README 明列 core/browser 到畫面的流程與計數意義。使用者後續指定真實 PTT 登入後留言無法點開的問題暫緩，本次不宣稱已修復該問題。

## 實作細節

- 固定操作列使用公開 articleVotes，遍歷全部回覆子樹只計算 visible 節點；隱藏父節點下的可見回覆仍被計數與呈現。未載入用 —，partial 顯示更新中／+，final 零才是確定零。
- 討論入口沿用同篇 FIFO 與展開狀態；展開後焦點落在回覆標題，避免長文後方留言缺乏可到達入口。預覽可看到 alice 與 bob 巢狀回覆，不代表實站資料路徑已驗證。
- articleLink 只序列化公開 key 的 board + aid/index；驗證 board、AID、正整數 index 與重複／歧義參數。分享直接使用瀏覽器 Web Share，取消不複製；其他失敗提供複製與手動選取欄位。
- 分享文章登入後直接讀取，不依賴熱門列表命中。獨立審查指出返回熱門後 URL 仍留文章參數，先新增失敗回歸再同步清除 URL，避免重新登入回到舊文章。
- pullRefresh 獨立處理 touch 狀態、72px 門檻、半速阻尼、多指／橫移／取消、非頁首、互動區排除與事件清理；只有接管向下手勢才 preventDefault。下拉刷新與按鈕共用 Promise，等待既有 getArticle 後再讀熱門看板；保留舊列表至成功。
- CSS 固定頁首、調整作者／看板／時間層級、操作列圖示和 44px 手機按鈕。動態包含文章進場、討論淡入、按壓與刷新指示；減少動態偏好停用過場。無新增套件或跨 UI 匯入。

## 指引與驗證方式

modern-web-guidance 線上命令無結果、離線 ENOTCACHED，改查官方文件：[MDN overscroll-behavior](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overscroll-behavior)、[Web Share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)、[prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)。

新增測試先重現操作列／分享／直接開文缺失、刷新清空舊畫面，再修改實作通過。下拉手勢以 jsdom touch 事件和 app 整合驗證，瀏覽器檢查以本機 fake gateway 桌面與 390px 手機為主；不把滑鼠拖曳當成實機觸控驗證。

## 最終驗證

- `npm run verify` 通過：core 363、browser 168、Web 205、Threads 74，另 11 helper tests、全部建置、lint 與 package smoke。既有三個 Fast Refresh 與 bundle size 警告保留。
- 新增 46 項 Threads 測試（基準 28 → 74），包含分享參數驗證、觸控單元／app 整合、計數、複製失敗、分享取消、直接開文與返回 URL。
- 瀏覽器預覽桌面及 390×844：文件 scrollWidth 與 viewport 同為 390，操作按鈕高度 44px；Enter 展開後焦點是回覆標題，可見 alice／bob。
- 分享欄位產生 test/index=1001 預覽連結，開啟新分頁直接顯示指定文章與兩則討論；返回熱門後 URL 移除 board/index、保留 preview。原生分享失敗後手動複製欄位可見，未宣稱原生分享或 clipboard 成功。
- 審查分別覆蓋分享路由與刷新／手勢整合；前者 URL 狀態問題已修正，後者建議的整合測試已補。未操作真實 PTT 登入、發文或回覆。
