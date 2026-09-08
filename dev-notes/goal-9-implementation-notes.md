# Goal 9 Core Architecture Implementation Notes

## 結果

Goal 9 已將單一 React 專案拆成兩個可發布套件與一個官方參考應用：

```text
apps/web (React + Zustand reference UI)
  ├─→ @pttzzz/core
  └─→ @pttzzz/browser → ptt-client → /ptt-ws → PTT
          └─ implements PttGateway from core
```

- `packages/core`：白皮書規則、parser／aggregator、公開 DTO、`PttzzzClient`、事件、`Result` 與 write outcome。沒有 React、Zustand、DOM、WebSocket、storage 或 `ptt-client` dependency。
- `packages/browser`：真實 terminal driver、`BrowserPttGateway`、browser factory，以及 `@pttzzz/browser/testing` fake gateway。只有這層理解 terminal screen、按鍵與 workflow。
- `apps/web`：既有 UI 的官方範例，只從 `@pttzzz/core`、`@pttzzz/browser` 與 Fake PTT runtime／測試所需的 `@pttzzz/browser/testing` 使用公開入口。
- `docs/whitepaper`、`docs/fixtures`、`docs/api`：分別固定規則、可執行案例與人類／AI 介面契約。

## 公開與內部邊界

一般 UI 的正式入口是 `@pttzzz/core` 與 `@pttzzz/browser`。`PttzzzClient` 接受領域 command，回傳 `Result`，並發出 connection、session、article partial／updated events。UI 不拼接 `推x樓`、`回x樓` 或編輯控制文字，也不使用 raw floor。Raw floor 僅存在 core private reply-target map／`PttCommand`、gateway transport，以及明確 opt-in debug metadata。

`@pttzzz/core/internal` 是特意保留給官方 browser adapter 的整合 subpath，包含純 parser、aggregator 與 final wire formatter。它會被打包，但不提供第三方 UI 相容性承諾；browser package 的 terminal driver 本身不由 package root export。舊 `src/lib/ptt` compatibility re-export 與 legacy runtime seam 已在 app 搬移後刪除。

## 身分、revision 與 lifecycle

- 一般回覆的 `replyId` anchor 到 immutable raw event：`reply:<first source floor>`。續接令 aggregation membership 增加時 ID 不變；anchor 被撤回而重新聚合時產生新 ID，舊 ID 失效。
- Synthetic edit 使用穩定 raw event ordinal，不使用 article body byte offset，避免前文長度改變令 ID 漂移。
- Core 內部保存 `replyId → source floors`，write command 才將 target 轉成 exact terminal floor/ranges。完整撤回聚合回覆會依原 group 逐個不連續 range 序列化送出，不擴張中間樓層。
- 每個 exact `ArticleKey` 分別管理 request generation 與 monotonic public revision。較舊 partial、final Promise 或不同 generation 不得覆寫較新的 article。
- Final source 會 emit `article.updated` 後結束 async iterator；session identity 改變或 disconnect 會清除 UI revision state。Gateway subscription 在 disconnect 解除，重連只重新掛一份 listener。

## 寫入語意

所有公開 write 都回傳 `Result<void>`。失敗的 `CoreError.outcome` 為：

- `not-sent`：只有 `retryable: true` 才可直接重試。
- `sent`：內容已送出但後續確認失敗，UI 應重新載入確認。
- `uncertain`：不確定是否送出，禁止自動重試。

Reference UI 以 exact dispatched DTO fingerprint 鎖住 `sent`／`uncertain`／non-retryable 操作；換草稿可送出新 DTO，但關閉 modal 不會讓相同危險操作解鎖。只有 authoritative reload、article identity lifecycle 或成功導航能清除相應狀態。

PTT 單行限制在 core/browser 共用 final formatter，以 ASCII 1 byte、非 ASCII 2 bytes 的 Big5 近似計算完整 wire command。Core 驗證與 terminal 實際送出的 prefix／內容相同，避免 UI 自行估算。

## Fake、發布與替代 UI

- `@pttzzz/browser/testing` 建立 Fake PTT runtime，供 `apps/web` 的 `?mockPtt=1` 多帳號模式及自動測試使用；real 與 fake gateway 共用 contract suite，並覆蓋 late login、讀寫與 session lifecycle。
- `scripts/smoke-packages.mjs` 實際 `npm pack` core/browser，離線安裝 tarballs，驗證 ESM、types、exports、dependency closure、LICENSE、secret/path allowlist 與 deep import failure。
- `docs/examples/minimal-browser` 只使用 packed public roots，實際 typecheck、Vite bundle並在 jsdom 執行。它示範 Result、events、revision gate、nested rendering、`replyId` write、unsubscribe 與 disconnect。
- Browser host 必須提供 `Buffer` polyfill，並把同源 `/ptt-ws` WebSocket 代理到 `wss://ws.ptt.cc/bbs`，注入 `Origin: https://term.ptt.cc`。這同樣是 production host 的責任，不只是 dev 設定。

## 實作中遇到的重點

1. 原 3,700 行 adapter 是 positional legacy API，不能只用 `implements PttGateway` 假裝完成遷移。最終保留 package-private terminal driver，再以 object command/event gateway 包裝。
2. Promise final result 與 article events 必須共用 generation/revision gate；只保護 event 仍會讓較舊 Promise 回退 cache。
3. Reply identity 不能使用 UI array index，也不能把完整 aggregation membership 放入 ID；前者會錯綁後方卡，後者會讓正常續接改 ID。
4. Write confirmation boundary 必須由 terminal workflow 判定。Gateway throw 不能預設成 `not-sent`，否則 UI 可能安全地重送一筆其實已送出的內容。
5. Package smoke 需要安裝 production dependency closure，而不只是兩個本地 tarball；Windows CLI 也必須以 Node 執行 npm／TypeScript 的 JavaScript entry，不能 `execFile` `.cmd`。
6. Package import 文件檢查最後使用 TypeScript AST，只掃 example code 與 API 文件 code fences，避免把一般文字誤判成 deep import。

## 已接受限制與偏離

- `@pttzzz/core/internal` 仍為官方 browser adapter 的 reserved export；它不是一般 UI API，也沒有 semver 相容承諾。
- `createArticle()` 回傳 `Result<void>`，因 terminal workflow 無法可靠取得新文章 identity；成功後由 UI 導航／重新讀取。
- 舊 compatibility paths 已移除，沒有發布 legacy subpath。Reference app 內仍有少量 UI-only legacy-shaped presentation helper 命名，但不連到 terminal adapter。
- `PttzzzClient` 的 per-article revision、generation 與 reply-target maps 目前沒有 bounded eviction；disconnect 會全部清除。長時間單一 session 瀏覽大量文章時可能增長，第一版接受此取捨。
- `editableBody`／footer splitting 仍在 reference UI 做編輯畫面 projection；核心公開 Article 已提供 structured edits/revisions，但沒有把整個 composer presentation policy 納入 package API。
- Debug `sourceFloors` 只在明確 opt-in metadata 出現，不可作 UI identity。正式 UI write 已不依賴它。
- `ptt-client` 仍要求 browser Buffer polyfill 與具正確 Origin 的 WebSocket proxy；browser package尚不是零設定連線。
- Vite production build 仍有單一約 1.15 MB chunk 的 size warning；功能與發布驗證通過，第一版未做 code splitting。
- Lint 有 3 個既有 `react-refresh/only-export-components` warnings，無 errors。
- 沒有 live PTT 帳號 write smoke 作為自動驗證；terminal transcripts、fake gateway、contract 與 UI tests 取代 CI 對真站的依賴。

## 驗證基準

2026-08-23 的 final verification 基準：

- Core：9 files，206 tests。
- Browser：6 files，153 tests。
- Web reference app：25 files，191 tests。
- Pack helper：11 tests。
- 合計 561 tests；`npm run build`、lint（0 errors）、pack／isolated consumer／minimal UI smoke 均通過。

主要命令：

```bash
npm run verify
npm run dev
npm run build
npm run lint
```
