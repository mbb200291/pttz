# PTTzzz Code Architecture Guide

這份指南描述 Goal 9 完成後的 repository。讀程式碼時先把「領域規則」、「PTT terminal transport」與「React UI」分開。

## 1. 依賴方向

```text
apps/web → @pttzzz/core ← PttGateway ← @pttzzz/browser → ptt-client
```

- UI 不操作 terminal、raw floor 或控制 pattern。
- Core 不知道 React、DOM、WebSocket 或 `ptt-client`。
- Browser gateway 將 terminal driver 的結果轉成 core contracts。
- 依賴方向不可反轉；browser 可以使用 reserved `@pttzzz/core/internal`，app 不可以。

## 2. 從哪裡開始讀

| 問題 | 入口 |
|---|---|
| 公開 DTO、events、commands | [`packages/core/src/contracts.ts`](../packages/core/src/contracts.ts) |
| 高階 read/write lifecycle | [`packages/core/src/client.ts`](../packages/core/src/client.ts) |
| parser 與正文切分 | [`packages/core/src/parser.ts`](../packages/core/src/parser.ts) |
| 聚合、巢狀、投票、編輯 | [`packages/core/src/pushAggregator.ts`](../packages/core/src/pushAggregator.ts) |
| Browser gateway mapping | [`packages/browser/src/gateway.ts`](../packages/browser/src/gateway.ts) |
| PTT terminal workflows | [`packages/browser/src/internal/terminalDriver.ts`](../packages/browser/src/internal/terminalDriver.ts) |
| Fake PTT | [`packages/browser/src/internal/fakeTerminalDriver.ts`](../packages/browser/src/internal/fakeTerminalDriver.ts) |
| React connection bridge | [`apps/web/src/hooks/usePttSocket.ts`](../apps/web/src/hooks/usePttSocket.ts) |
| Board/article reads | [`apps/web/src/hooks/useBoard.ts`](../apps/web/src/hooks/useBoard.ts)、[`useArticle.ts`](../apps/web/src/hooks/useArticle.ts) |
| UI writes | [`apps/web/src/hooks/usePttActions.ts`](../apps/web/src/hooks/usePttActions.ts) |
| 頂層 navigation | [`apps/web/src/App.tsx`](../apps/web/src/App.tsx) |

產品規則先查 [core whitepaper](../docs/whitepaper/pttzzz-core.md)，公開 API 查 [contracts](../docs/api/contracts.md)。HTML 是 review example，不是另一份規範。

## 3. Read path

```text
React hook
  → PttzzzClient.listArticles/getArticle
  → PttGateway
  → BrowserPttGateway
  → private terminal driver
  → RawArticleSource async iterator
  → core parser/aggregator
  → Article DTO + partial/updated events
```

`useArticle` 必須同時檢查 active `ArticleKey`、request generation 與 revision。Promise final result與 events 走同一 stale gate；不要新增第二套 raw parser。Production view 不保留 raw/debug全文，只有明確 opt-in 診斷才請求 metadata。

## 4. Write path

```text
Component → usePttActions → PttzzzClient domain method
          → replyId target map → PttCommand
          → BrowserPttGateway → serial terminal workflow
          → ActionReceipt → Result<void>
```

UI 送 `replyId`，不能送 floor，也不能 import formatter。Core 的 final formatter同時負責完整 wire command與 PTT 80-byte 近似驗證；browser 不能再加第二次 prefix。

處理 write error 時：

- `not-sent && retryable`：允許相同操作手動重試。
- `sent`：提示已送出但確認失敗，重新載入確認。
- `uncertain`：禁止自動重送。

新增 terminal workflow 時要明確標示不可逆 confirmation boundary；未知 throw 預設保守處理。

## 5. Reply identity

一般 `replyId` 以第一個 immutable source event為 anchor。它不是 card array index，也不是完整 aggregation membership。Core 私下保存 target floors；reload 造成 anchor 消失時舊 ID 必須回 `REPLY_NOT_FOUND`，不能錯綁別張卡。

原始樓號只允許存在 core private reply target map／`PttCommand`、gateway transport，以及明確 opt-in debug metadata。只有 browser terminal driver 理解 terminal screen、按鍵和 workflow；一般 UI 不接觸上述任何 transport 細節。

## 6. Connection 與 store

`usePttSocket` 持有 public `PttzzzClient` singleton，訂閱 connection/session events，再映射到 Zustand。Effect cleanup 必須取消訂閱並用 generation guard 忽略晚到 connect/login。`@pttzzz/browser/testing` 支援 Fake PTT runtime mode 與 tests；fake 與 real runtime 分開，切換 mode 不可沿用錯誤 singleton。

作者本人對文章的 PTT 原生推／噓限制是 gateway/session語意；PTTzzz 對某則回覆的應用層操作仍由 public reply methods 表達，不要在 component 重新推導 terminal 規則。

## 7. 測試位置

- Core rules/client：`packages/core/src/**/*.test.ts`
- Browser gateway/terminal/fake：`packages/browser/src/**/*.test.ts`
- React hooks/components：`apps/web/src/**/*.test.ts(x)`
- Rule fixtures：`docs/fixtures/thread-events`
- Publish/consumer smoke：`scripts/smoke-packages.mjs`
- Minimal alternate UI：`docs/examples/minimal-browser`

修改規則時先更新或新增白皮書對應 fixture/test；修改 gateway 要同時檢查 real、fake contract；修改 UI 不應重測 parser，而應測 public DTO/Result wiring。

## 8. Commands 與 host

```bash
npm run dev
npm test
npm run build
npm run lint
npm run verify
```

`npm run verify` 包含三個 workspaces tests、helper tests、build、lint 與實際 pack/install/example smoke。

`apps/web/vite.config.ts` 提供開發用 `/ptt-ws` proxy。任何 production host 也必須代理到 `wss://ws.ptt.cc/bbs` 並設定 `Origin: https://term.ptt.cc`；browser bundler 還需 Buffer polyfill。參考 [`docs/examples/minimal-browser/vite.config.ts`](../docs/examples/minimal-browser/vite.config.ts)。

## 9. 常見陷阱

1. 不要從 app deep import package `src`、`internal` 或 terminal driver。
2. 不要用卡片順序或 debug `sourceFloors` 當 write identity。
3. 不要讓較舊 Promise result 覆寫較新 event/cache。
4. 不要把 `uncertain` 網路錯誤改成可 retry。
5. 不要在 UI 再解析 `推x樓`、`回x樓` 或隱藏控制 pattern。
6. 不要並行操作同一 terminal；driver write ranges 必須在同一 serial workflow。
7. 不要只驗 workspace source import；發布變更必須跑 tarball consumer smoke。
