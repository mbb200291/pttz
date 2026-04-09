# 2026-04-09 ptt-client 遷移筆記

這份文件記錄這次把 PTT 存取層從「自寫 terminal parser/state machine」遷移到 `ptt-client` 過程中，實際踩過的坑、最後採用的解法，以及目前專案所處的狀態。

## 目前結論

- 專案主流程已切到 `ptt-client`。
- 舊的 `client.ts` / `session.ts` / `navigation.ts` 已移除。
- 舊 `parser.ts` 只保留目前仍需要的字串處理能力：
  - `stripAnsi`
  - `parsePushLine`
  - `parsePushBuffer`
  - `splitArticleBody`
  - 共用型別 `ArticleSummary` / `RawPush` / `PushType`
- 實際網頁測試已驗證：
  - 可以登入
  - 可以進看板
  - 可以開文章
  - 可以讀正文與推文
  - 沒有使用發文、回文、推文等危險操作

## 遷移後的主架構

- [`src/lib/ptt/adapter.ts`](/Users/linbangqi/pttzzz/src/lib/ptt/adapter.ts)
  - 新的 PTT 存取層入口
  - 封裝 `ptt-client`
  - 提供 `login()` / `listArticles()` / `getArticle()` / `disconnect()`
- [`src/hooks/usePttSocket.ts`](/Users/linbangqi/pttzzz/src/hooks/usePttSocket.ts)
  - UI 與 adapter 的狀態橋接
- [`src/hooks/useBoard.ts`](/Users/linbangqi/pttzzz/src/hooks/useBoard.ts)
  - 看板文章列表直接走 adapter
- [`src/hooks/useArticle.ts`](/Users/linbangqi/pttzzz/src/hooks/useArticle.ts)
  - 文章內容與推文直接走 adapter

## 踩過的坑與解法

### 1. `ptt-client` 在 Vite 瀏覽器 runtime 直接炸掉

症狀：
- 瀏覽器載入時出現 `inherits is not a function`
- 根因是 `terminal.js` 依賴 Node 內建模組

解法：
- 在 [`vite.config.ts`](/Users/linbangqi/pttzzz/vite.config.ts) 加入 `vite-plugin-node-polyfills`
- 補上 `Buffer` / `global` / `process` 相關 polyfill

### 2. `ptt-client` 內建登入流程不穩

症狀：
- 訪客過多或登入提示切換時，library 內建高階登入流程不可靠
- 實站上容易卡住，無法穩定判斷登入成功/失敗

解法：
- 沒有直接信任 library 的整段登入 abstraction
- 改在 [`adapter.ts`](/Users/linbangqi/pttzzz/src/lib/ptt/adapter.ts) 自己做 polling
- 依 terminal snapshot 判斷：
  - `guest_overload`
  - `login_rate_limited`
  - `invalid_credentials`
  - 成功登入畫面

### 3. 成功登入後沒有進到 `ready`

症狀：
- 真實登入後，畫面停在 `分類看板` / `看板列表`
- UI 沒認成成功登入

解法：
- 擴充 adapter 的成功判斷
- 不只接受 `主功能表`，也接受：
  - `【分類看板】`
  - `分類看板`
  - `批踢踢實業坊`

### 4. `ptt-client` 的文章列表對 `Re:` 文章拆欄方式和 UI 不一致

症狀：
- library 會把 `Re:` 拆到 `status`
- UI 原本只看 `title`
- 結果列表看起來像原文，實際 row 對應的卻是回文

解法：
- 在 [`mapArticleRow()`](/Users/linbangqi/pttzzz/src/lib/ptt/adapter.ts) 補回 `Re: `
- 若 `status === "R:"`：
  - `title` 改成 `Re: ${row.title}`
  - `mark` 改回空白，避免 UI 把 `R:` 當一般標記

### 5. 直接手動送 index 開文，真站上會開錯篇

症狀：
- 嘗試自己送 `${index}\r` 或其他鍵序時
- 真站上會開到隔壁文章或上一頁文章

解法：
- 不再自己猜文章開啟鍵序
- 優先走 `ptt-client` 內建的 `getArticle()`

### 6. `ptt-client` 內建 `getArticle()` 讀完後會往外退太多層

症狀：
- library 內部的 `enterIndex()` 只是連送多次左鍵
- 真站上可能一路退到 `Goodbye` / 離站確認畫面

解法：
- 在 [`fetchArticleFromBot()`](/Users/linbangqi/pttzzz/src/lib/ptt/adapter.ts) 內暫時把 `enterIndex()` 替換成 no-op
- 等 `getArticle()` 讀完後再還原
- 保留 library 開文邏輯，但避開它危險的退場動作

### 7. 看板列表與文章讀取互相干擾

症狀：
- UI 點 A 文章，實際開到 B 文章
- 不是 index 算錯，而是 bot 正在被多條 async 路徑同時操作
- `listArticles()`、`getArticle()`、背景載入互相穿插 terminal 指令

解法：
- 在 [`adapter.ts`](/Users/linbangqi/pttzzz/src/lib/ptt/adapter.ts) 加了單線程序列化 runner
- 所有 bot 操作統一走 queue：
  - `send`
  - `login`
  - `listArticles`
  - `getArticle`
  - `disconnect`

### 8. 看板頁的自動 infinite scroll 會偷送背景命令

症狀：
- `IntersectionObserver` 在底部 sentinel 可見時自動 `loadMore()`
- 使用者剛點文章時，背景 `loadMore()` 仍可能排隊送命令
- 造成文章開啟競態

解法：
- 移除自動 infinite scroll
- 保留手動「載入更多」按鈕
- 先把 PTT bot 的命令來源收斂成可控、可預測

### 9. 文章 header 有時候 `作者` 和 `看板` 會黏在同一行

症狀：
- 文章頁 metadata 有時顯示成：
  - `作者 poggssi (...) 看板 Gossiping`
- 導致 author 欄位被污染

解法：
- 在 [`parseArticleHeaderBlock()`](/Users/linbangqi/pttzzz/src/lib/ptt/adapter.ts) 補 header block parser
- 優先用正則拆：
  - `作者 ... 看板 ... 標題 ... 時間 ...`
- 不行再退回逐行 fallback

## 目前保留的舊 parser 能力

雖然主流程已切到 `ptt-client`，但仍保留少量舊 parser 邏輯，原因如下：

- `stripAnsi`
  - adapter 判斷登入/畫面提示仍要用
- `parsePushBuffer`
  - `ptt-client` 回傳的文章內容仍是 terminal lines
  - 推文聚合前，還是需要把 raw push 解析出來
- `splitArticleBody`
  - 仍需把文章正文與推文切開

也就是說，現在專案不再使用舊的「terminal 畫面狀態機」，但仍保留少量「文字解析 helper」。

## 已清掉的舊實作

- 舊 WebSocket client：[`src/lib/ptt/client.ts`](/Users/linbangqi/pttzzz/src/lib/ptt/client.ts)
- 舊 session state machine：[`src/lib/ptt/session.ts`](/Users/linbangqi/pttzzz/src/lib/ptt/session.ts)
- 舊 navigation command builder：[`src/lib/ptt/navigation.ts`](/Users/linbangqi/pttzzz/src/lib/ptt/navigation.ts)
- 舊 article list parser
- 舊 article page merge/page-extraction parser
- 對應的過期測試

## 目前測試與驗證狀況

已驗證：
- [`adapter.test.ts`](/Users/linbangqi/pttzzz/src/lib/ptt/__tests__/adapter.test.ts)
  - adapter 基本介面
  - `Re:` 映射
  - header 解析
  - 序列化 runner
- [`parser.test.ts`](/Users/linbangqi/pttzzz/src/lib/ptt/__tests__/parser.test.ts)
  - 只保留現役 parser 測試
- [`pushAggregator.test.ts`](/Users/linbangqi/pttzzz/src/lib/ptt/__tests__/pushAggregator.test.ts)
  - 推文聚合規則

本次清理後執行結果：

```bash
pnpm vitest run src/lib/ptt/__tests__/adapter.test.ts src/lib/ptt/__tests__/parser.test.ts src/lib/ptt/__tests__/pushAggregator.test.ts
pnpm exec vite build
```

結果：
- 測試通過
- production build 成功

## 目前已知限制

- `ptt-client` 與瀏覽器整合仍然偏脆弱，很多行為其實是建立在 terminal 畫面假設上
- 目前先把「穩定讀」做完，尚未實作任何寫入行為
- build 雖然成功，但 bundle 仍偏大，Vite 會有 chunk size warning
- 若未來要做：
  - 發文
  - 回文
  - 推/噓文
  - 站內信
  需要重新檢視 `ptt-client` 在真站上的鍵序安全性，不能直接沿用現在這套只讀假設

## 建議下一步

- 若要繼續開發，只建議先做只讀能力的補強：
  - 看板分頁
  - 文章翻頁
  - 文章列表排序/搜尋
  - 更穩定的文章 metadata 解析
- 若要進入寫入操作，建議先另外做一份「危險操作設計文件」，把鍵序、確認提示、失敗回復策略先寫清楚，再動手。
