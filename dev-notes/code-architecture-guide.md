# pttzzz 程式架構與技術指南

這是 pttzzz repository 的內部實作與讀碼指南，描述 Goal 9 完成後的程式結構。讀程式碼時先把「領域規則」、「PTT terminal transport」與「React UI」分開。公開且穩定的套件分層以[核心架構](../packages/core/docs/architecture.md)與[公開契約](../packages/core/docs/contracts.md)為準；本文件進一步記錄目前 repository 的技術選型、資料流與實作限制。

## 1. 依賴方向

```text
apps/web → @pttzzz/core ← PttGateway ← @pttzzz/browser → ptt-client
```

- UI 不操作 terminal、raw floor 或控制 pattern。
- Core 不知道 React、DOM、WebSocket 或 `ptt-client`。
- Browser gateway 將 terminal driver 的結果轉成 core contracts。
- 依賴方向不可反轉；browser 可以使用 reserved `@pttzzz/core/internal`，app 不可以。

## 2. 目前技術 stack

版本以各 workspace 的 `package.json` 為準；下表記錄目前架構所依賴的主要技術及其用途，而不是對未來版本的相容承諾。

| 範圍 | 技術 | 用途與邊界 |
|---|---|---|
| Repository | Node.js ESM、npm workspaces、TypeScript 5.6 project references | 管理 `packages/*` 與 `apps/*`、跨 workspace 型別檢查及建置順序 |
| 設計層 | Markdown、JSON fixtures、static HTML/CSS | 白皮書供人閱讀，fixtures 供不同核心實作驗證，HTML 提供規則 review examples |
| `@pttzzz/core` | TypeScript 5.6 | 實作 contracts、parser、aggregation、editing 與 `PttzzzClient`；發布套件沒有 runtime dependency，也不使用 DOM |
| `@pttzzz/browser` | TypeScript 5.6、`ptt-client` 0.9 | 實作 browser gateway、PTT terminal workflow、ANSI／Big5 畫面處理與 WebSocket 連線 |
| `apps/web` | React 18.3、Zustand 5、Vite 6、Tailwind CSS 4 | 官方參考 UI；React 負責 component，Zustand 橋接 client state，Vite 負責開發與 production bundle |
| 測試 | Vitest 4、Testing Library 16、jsdom 29、Node test runner | 分別驗證 core、browser、React UI、helper scripts 與 package consumer 行為 |
| 品質與發布 | TypeScript compiler、ESLint 10、npm pack smoke | 驗證型別、lint、package exports、tarball 安裝與最小替代 UI |

幾個容易混淆的選型邊界：

- `ws` 只用於 Vite 開發伺服器的 `/ptt-ws` proxy 與相關測試，不是 `@pttzzz/core` 的 dependency。
- `vite-plugin-node-polyfills` 為 browser bundle 提供 `ptt-client` 所需的 `Buffer` 等 Node 相容能力，不代表 core 可以依賴 Node API。
- 專案目前沒有 router library；`apps/web/src/App.tsx` 以記憶體內的 discriminated union 管理頁面狀態。
- 專案目前沒有應用程式 backend 或資料庫。瀏覽器經 host 提供的 WebSocket proxy 連接 PTT；Vite production build 本身只輸出靜態資產。
- Tailwind CSS 與 component inline styles 同時存在於參考 UI；這是介面層選擇，不是核心套件要求。

## 3. 從哪裡開始讀

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

產品規則先查 [core whitepaper](../docs/whitepaper/pttzzz-core.md)，公開 API 查 [contracts](../packages/core/docs/contracts.md)。HTML 是 review example，不是另一份規範。

## 4. Read path

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

## 5. Write path

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

## 6. Reply identity

一般 `replyId` 以第一個 immutable source event為 anchor。它不是 card array index，也不是完整 aggregation membership。Core 私下保存 target floors；reload 造成 anchor 消失時舊 ID 必須回 `REPLY_NOT_FOUND`，不能錯綁別張卡。

原始樓號只允許存在 core private reply target map／`PttCommand`、gateway transport，以及明確 opt-in debug metadata。只有 browser terminal driver 理解 terminal screen、按鍵和 workflow；一般 UI 不接觸上述任何 transport 細節。

## 7. Connection 與 store

`usePttSocket` 持有 public `PttzzzClient` singleton，訂閱 connection/session events，再映射到 Zustand。Effect cleanup 必須取消訂閱並用 generation guard 忽略晚到 connect/login。`@pttzzz/browser/testing` 支援 Fake PTT runtime mode 與 tests；fake 與 real runtime 分開，切換 mode 不可沿用錯誤 singleton。

作者本人對文章的 PTT 原生推／噓限制是 gateway/session語意；pttzzz 對某則回覆的應用層操作仍由 public reply methods 表達，不要在 component 重新推導 terminal 規則。

## 8. 測試位置

- Core rules/client：`packages/core/src/**/*.test.ts`
- Browser gateway/terminal/fake：`packages/browser/src/**/*.test.ts`
- React hooks/components：`apps/web/src/**/*.test.ts(x)`
- Rule fixtures：`docs/fixtures/thread-events`
- Publish/consumer smoke：`scripts/smoke-packages.mjs`
- Minimal alternate UI：`apps/web/docs/examples/minimal-browser`

修改規則時先更新或新增白皮書對應 fixture/test；修改 gateway 要同時檢查 real、fake contract；修改 UI 不應重測 parser，而應測 public DTO/Result wiring。

## 9. Commands 與 host

```bash
npm run dev
npm test
npm run build
npm run lint
npm run verify
```

`npm run verify` 包含三個 workspaces tests、helper tests、build、lint 與實際 pack/install/example smoke。

`apps/web/vite.config.ts` 提供開發用 `/ptt-ws` proxy。任何 production host 也必須代理到 `wss://ws.ptt.cc/bbs` 並設定 `Origin: https://term.ptt.cc`；browser bundler 還需 Buffer polyfill。參考 [`apps/web/docs/examples/minimal-browser/vite.config.ts`](../apps/web/docs/examples/minimal-browser/vite.config.ts)。

## 10. 常見陷阱

1. 不要從 app deep import package `src`、`internal` 或 terminal driver。
2. 不要用卡片順序或 debug `sourceFloors` 當 write identity。
3. 不要讓較舊 Promise result 覆寫較新 event/cache。
4. 不要把 `uncertain` 網路錯誤改成可 retry。
5. 不要在 UI 再解析 `推x樓`、`回x樓` 或隱藏控制 pattern。
6. 不要並行操作同一 terminal；driver write ranges 必須在同一 serial workflow。
7. 不要只驗 workspace source import；發布變更必須跑 tarball consumer smoke。
