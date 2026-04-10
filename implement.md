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

### 2. 狀態橋接層

[`src/hooks/usePttSocket.ts`](/Users/linbangqi/pttzzz/src/hooks/usePttSocket.ts) 負責把 adapter 狀態橋接到前端 store。

目前管理的重點：

1. websocket 狀態
2. PTT 登入狀態
3. credentials
4. login error
5. recent terminal buffer

這層的角色是「UI 狀態轉接」，不是直接做 terminal parser。

### 3. 看板與文章資料層

[`src/hooks/useBoard.ts`](/Users/linbangqi/pttzzz/src/hooks/useBoard.ts)

1. 進看板
2. 載入文章列表
3. 手動載入更多文章

[`src/hooks/useArticle.ts`](/Users/linbangqi/pttzzz/src/hooks/useArticle.ts)

1. 讀單篇文章
2. 取得正文
3. 取得聚合後推文

### 4. 推文聚合層

[`src/lib/ptt/pushAggregator.ts`](/Users/linbangqi/pttzzz/src/lib/ptt/pushAggregator.ts) 是目前回文/推文特殊處理的核心。

目前已實作：

1. 同作者連續推文合併
2. 同作者非連續但符合條件時合併
3. `回x樓：` 巢狀識別
4. OP 標示
5. 第一層文章總分計算
6. 單則聚合推文的 score 計算

### 5. UI 呈現層

目前主要元件：

1. [`src/components/LoginModal.tsx`](/Users/linbangqi/pttzzz/src/components/LoginModal.tsx)
2. [`src/components/BoardInput.tsx`](/Users/linbangqi/pttzzz/src/components/BoardInput.tsx)
3. [`src/components/ArticleList.tsx`](/Users/linbangqi/pttzzz/src/components/ArticleList.tsx)
4. [`src/components/Article.tsx`](/Users/linbangqi/pttzzz/src/components/Article.tsx)
5. [`src/components/PushThread.tsx`](/Users/linbangqi/pttzzz/src/components/PushThread.tsx)

目前 UI 重點是先把：

1. 登入
2. 看板閱讀
3. 文章閱讀
4. 討論串顯示

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
8. 基本的看板與文章閱讀 UI

## 目前保留的舊程式邏輯

舊的 terminal state machine 與自寫 websocket client 已經移除。

目前仍保留的舊 parser 只有少量文字處理 helper，在 [`src/lib/ptt/parser.ts`](/Users/linbangqi/pttzzz/src/lib/ptt/parser.ts)：

1. `stripAnsi`
2. `parsePushLine`
3. `parsePushBuffer`
4. `splitArticleBody`
5. 共用型別

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

## 開發狀態

### 已完成

1. `ptt-client` 接入
2. 前端 PTT 只讀主流程遷移
3. 聚合推文模型
4. 討論串 UI
5. 真站登入與閱讀驗證
6. 舊 terminal 架構清理

### 正在維護

1. adapter 穩定性
2. 文章與推文解析正確率
3. 前端閱讀體驗

### 尚未開始

1. 寫入型功能
2. 更完整的論壇互動能力
3. 更完整的產品化整理

## 細節文件

較細的開發事項請看 `dev_notes/`。

目前主要筆記：

1. [2026-04-09-ptt-client-migration-notes.md](/Users/linbangqi/pttzzz/dev_notes/2026-04-09-ptt-client-migration-notes.md)
