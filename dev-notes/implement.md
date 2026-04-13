# PTTzzz 實作概況

這份文件只維護 high-level 的架構與開發狀況。

- `spec.md`
  - 放需求、想法、產品方向
- `implement.md`
  - 放目前實作架構、能力邊界、開發進度
- `dev_notes/`
  - 放較細的開發筆記、踩坑記錄、遷移細節、每個spec的細項的實作討論結論

## 產品定位

PTTzzz 是一個純前端的 PTT 閱讀器。

目前定位是：

1. 用較現代的網頁 UI 呈現看板、文章、推文討論串
2. 由 client 端直接連接 PTT websocket
3. 針對推文/回文做前端聚合，建立較容易閱讀的討論串視圖

## 目前架構

### 1. PTT 存取層

核心入口在 [`src/lib/ptt/adapter.ts`](/Users/linbangqi/pttzzz/src/lib/ptt/adapter.ts)。

目前不是直接使用舊的自寫 terminal client，而是改成：

1. 以 `ptt-client` 作為底層 PTT bot
2. 在 adapter 層包裝成專案自己的穩定介面
3. 對外提供：
   - `login()`
   - `listArticles()`
   - `getArticle()`
   - `disconnect()`

這層也負責：

1. 真實登入流程判斷
2. PTT terminal snapshot 狀態觀察
3. 看板列表與文章資料映射
4. bot 命令序列化，避免競態
5. 文章 debug dump 產生，協助定位真站解析問題

### 2. 狀態橋接層

[`src/hooks/usePttSocket.ts`](/Users/linbangqi/pttzzz/src/hooks/usePttSocket.ts) 負責把 adapter 狀態橋接到前端 store。

目前管理的重點：

1. websocket 狀態
2. PTT 登入狀態
3. credentials
4. login error
5. recent terminal buffer
6. 是否中斷其他重複登入連線的使用者選項

這層的角色是「UI 狀態轉接」，不是直接做 terminal parser。

登入安全預設：

1. 預設保留其他已登入的 PTT 連線
2. 只有使用者明確勾選「中斷其他連線」時，才會在 PTT 重複登入提示回答是

### 3. 看板與文章資料層

[`src/hooks/useBoard.ts`](/Users/linbangqi/pttzzz/src/hooks/useBoard.ts)

1. 進看板
2. 載入文章列表
3. 手動載入更多文章

[`src/hooks/useArticle.ts`](/Users/linbangqi/pttzzz/src/hooks/useArticle.ts)

1. 讀單篇文章
2. 取得正文
3. 取得聚合後推文
4. 取得文章層級編輯紀錄
5. 在 dev 環境提供目前文章 debug dump

### 4. 推文聚合層

[`src/lib/ptt/pushAggregator.ts`](/Users/linbangqi/pttzzz/src/lib/ptt/pushAggregator.ts) 是目前回文/推文特殊處理的核心。

目前已實作：

1. 同作者臨近推文聚合
2. 不連續但時間間隔小於等於 5 分鐘時的同作者推文聚合
3. 回文終止符與 `||` 串接符號判斷
4. 依 raw line spacing 判斷滿行，決定聚合後直接接續或保留換行
5. `回x樓` 巢狀識別
6. 原始 PTT 樓號與聚合後 reply id 的對應
7. 自己回自己與不存在樓層的防護
8. OP 標示
9. 文章層級編輯紀錄與作者編輯補充 reply
10. 第一層文章總分計算
11. 單則聚合推文的 score 計算
12. 第一層聚合回文排序支援的穩定欄位

### 5. UI 呈現層

目前主要元件：

1. [`src/components/LoginModal.tsx`](/Users/linbangqi/pttzzz/src/components/LoginModal.tsx)
2. [`src/components/BoardInput.tsx`](/Users/linbangqi/pttzzz/src/components/BoardInput.tsx)
3. [`src/components/ArticleList.tsx`](/Users/linbangqi/pttzzz/src/components/ArticleList.tsx)
4. [`src/components/Article.tsx`](/Users/linbangqi/pttzzz/src/components/Article.tsx)
5. [`src/components/PushThread.tsx`](/Users/linbangqi/pttzzz/src/components/PushThread.tsx)
6. [`src/components/RichContent.tsx`](/Users/linbangqi/pttzzz/src/components/RichContent.tsx)
7. [`src/components/MediaPreview.tsx`](/Users/linbangqi/pttzzz/src/components/MediaPreview.tsx)

新增 lib / hook：

1. [`src/lib/ptt/contentSegments.ts`](/Users/linbangqi/pttzzz/src/lib/ptt/contentSegments.ts)

目前 UI 重點是先把：

1. 登入
2. 看板閱讀
3. 文章閱讀
4. 討論串顯示
5. 回文 score、IP、OP、作者編輯標籤
6. 第一層回文依時間 / 推噓分排序
7. 回文區塊 scroll lazy rendering
8. 手動重新整理回文
9. 文章與推文的 imgur 圖片 / YouTube 影片 inline 預覽

做成穩定可用版本。

## 已完成的能力

目前已完成並驗證過的能力：

1. 使用真實 PTT websocket 連線
2. 帳號登入
3. 看板文章列表讀取
4. 單篇文章讀取
5. 推文解析
6. 推文聚合與巢狀顯示
7. 原發文者標示
8. 文章編輯紀錄顯示
9. 作者編輯補充回覆顯示
10. 回文 score 顯示
11. 回文 IP 直接顯示
12. 基本的看板與文章閱讀 UI
13. 第一層聚合回文可依時間與推噓分排序
14. 回文列表隨滾動逐步渲染已取得的第一層回文
15. 討論串可手動重新整理，重新抓取文章取得新回文
16. 文章列表 IntersectionObserver scroll sentinel（自動觸發載入更多）
17. 文章 progressive render：開始載入後約 200–400ms 即顯示標題、作者、正文，推文區待完整資料後再渲染
18. 文章正文與推文內的 imgur 圖片 inline 顯示（lazy load、no-referrer、error fallback）
19. 文章正文與推文內的 YouTube 影片 click-to-play 預覽（縮圖 + 點擊後展開 iframe）
20. 看板文章標題關鍵字搜尋（PTT `/` 鍵，系列視圖）
21. 看板文章推噓文數篩選（PTT `Z` 鍵，快選 ≥10 / ≥30 / ≥100 / 爆 + 可清除）
22. 以 AID 直接跳轉文章（PTT `#` 鍵，搜尋欄輸入 #XXXXXXXX）

## 目前保留的舊程式邏輯

舊的 terminal state machine 與自寫 websocket client 已經移除。

目前仍保留的舊 parser 只有少量文字處理 helper，在 [`src/lib/ptt/parser.ts`](/Users/linbangqi/pttzzz/src/lib/ptt/parser.ts)：

1. `stripAnsi`
2. `parsePushLine`
3. `parsePushBuffer`
4. `splitArticleBody`
5. `extractArticleThreadEvents`
6. 推文滿行 metadata
7. 共用型別

也就是說，現在專案不再依賴舊的 terminal session parser，但仍沿用少量字串解析工具。

## 已移除的舊架構

以下舊層已清除：

1. 自寫 websocket client
2. 舊 session state machine
3. 舊 navigation command builder
4. 舊 article list parser
5. 舊 article page merge / page extraction parser

## 目前限制

目前專案仍有這些邊界：

1. 以只讀能力為主
2. 尚未實作發文、回文、推文等寫入操作
3. 推文聚合規則目前是 heuristic，不是完整語意解析
4. `ptt-client` 與瀏覽器整合仍偏脆弱，需要 adapter 層保護
5. UI 已可用，但仍屬第一版，不是完整產品化狀態
6. `ptt-client.getArticle()` 是否在所有熱門文章都能完整取回全部推文，仍需持續用 debug dump 驗證

## 開發狀態

### 已完成

1. `ptt-client` 接入
2. 前端 PTT 只讀主流程遷移
3. 聚合推文模型
4. 討論串 UI
5. 真站登入與閱讀驗證
6. 舊 terminal 架構清理
7. dev-only 文章 debug dump
8. 登入時中斷其他連線改為使用者 opt-in
9. 文章回文列表排序與 scroll lazy rendering
10. 討論串手動重新整理回文
11. 文章列表 scroll sentinel（IntersectionObserver 自動載入更多）
12. 文章 progressive render（partial screen parser + partialArticle hook 狀態）
13. 文章 / 推文 rich content：imgur 圖片 + YouTube click-to-play
14. 看板文章標題搜尋 + 推噓文數篩選 + AID 跳轉（adapter + useBoard filter + ArticleList UI）

### 正在維護

1. adapter 穩定性
2. 文章與推文解析正確率
3. 前端閱讀體驗
4. 實站特殊推文格式的 parser / aggregator case
5. 熱門文章回文列表的渲染效能與排序體驗

### 尚未開始

1. 寫入型功能
2. 更完整的論壇互動能力
3. 更完整的產品化整理

### Pending

1. **目標 5：使用者頭像** — 原始方案（PTT 名片存 URL）因名片讀取速度問題放棄。確定改用 Cloudflare Workers + KV 作為頭像 registry，但身分驗證方案尚未定案，優先級較低，暫時 pending。

## 細節文件

較細的開發事項請看 `dev_notes/`。

目前主要筆記：

1. [ptt-client-migration-notes.md](ptt-client-migration-notes.md)
2. [goal-3-implementation-plan.md](goal-3-implementation-plan.md)
3. [goal-3-implementation-notes.md](goal-3-implementation-notes.md)
4. [goal-4-reply-sort-implementation-plan.md](goal-4-reply-sort-implementation-plan.md)
5. [goal-4-implementation-notes.md](goal-4-implementation-notes.md)
6. [goal-5-implementation-plan.md](goal-5-implementation-plan.md)
7. [goal-5-implementation-notes.md](goal-5-implementation-notes.md)
8. [goal-6-implementation-plan.md](goal-6-implementation-plan.md)
9. [goal-6-implementation-notes.md](goal-6-implementation-notes.md)
