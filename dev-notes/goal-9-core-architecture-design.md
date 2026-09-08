# Goal 9：PTTzzz 核心架構設計

狀態：已實作。最終結果與偏離見 `goal-9-implementation-notes.md`。

## 1. 目標

Goal 9 已把原本集中在單一 React 專案裡的知識分成三層：

1. **設計層**：白皮書定義 PTTzzz 的領域規則，例如推文聚合、巢狀回覆、投票、撤回與編輯重解析。
2. **核心實作層**：白皮書已實作成不依賴 React 的 JavaScript／TypeScript 套件，並以 `ptt-client` 為 browser gateway 的低階 PTT 連線引擎。
3. **介面層**：不同 UI 可消費核心 API；目前的 React UI 是官方參考實作之一，不是核心本身。

核心實作層已可獨立打包，並提供適合人類與 AI 閱讀的公開介面文件，使其他人能在不理解 terminal 細節與內部 parser 的前提下建立不同 UI。

## 2. 設計原則

- **規則只有一個權威來源**：產品語意由白皮書定義，程式碼、fixture 與 UI 都必須對應白皮書的規則編號。
- **核心不依賴 UI framework**：核心不得 import React、Zustand、Vue 或 DOM component。
- **PTT 傳輸與 PTTzzz 語意分離**：terminal 操作不是討論串聚合規則；兩者可獨立測試與替換。
- **公開介面使用領域語言**：UI 操作 `replyId`、文章、回覆與投票，不直接操作 terminal 按鍵、ANSI 或原始樓號。
- **漸進式遷移**：先建立規格與套件邊界，再搬純函式、連線層與 UI；每一階段都保持現有應用可執行。
- **不假裝 PTT 是交易式 API**：寫入可能處於「是否送出無法確認」的狀態，錯誤模型必須明確表達。

## 3. 選定架構

採用兩個可發布套件加一個參考應用：

```text
ptt-client（第三方低階 terminal 引擎）
        │
        ▼
@pttzzz/browser（瀏覽器連線與 PTT workflow adapter）
        │ implements gateway contract
        ▼
@pttzzz/core（規則、領域模型、高階 client）
        │
        ▼
apps/web（現有 React UI；官方介面層範例）
```

實際 repository 形狀：

```text
packages/
  core/
    src/
    package.json
  browser/
    src/
    package.json
apps/
  web/
    src/
    package.json
docs/
  whitepaper/
    pttzzz-core.md
  api/
    contracts.md
    AI-INTERFACE.md
  examples/
    minimal-browser/
```

Repository 先使用 npm workspaces，不引入 Turborepo 或額外 monorepo framework。只有在實際 build graph 或發布流程需要時再評估工具。

## 4. 套件與層級責任

### 4.1 `ptt-client`

`ptt-client` 是第三方低階依賴，負責 WebSocket terminal、Bot 與畫面互動能力。它不知道 PTTzzz 的聚合、巢狀回覆、應用層投票或 UI DTO。

它不會成為 PTTzzz 對 UI 公開的主要 API。UI 不應直接依賴它。

### 4.2 `@pttzzz/browser`

`@pttzzz/browser` 是瀏覽器環境的 PTT gateway 實作，內部以 package-private terminal driver 包裝 `ptt-client`。

責任包括：

- 建立與關閉瀏覽器 WebSocket 連線。
- 處理登入、重複登入與 terminal 畫面狀態。
- 序列化 Bot 指令，避免不同 workflow 互相競爭畫面。
- 將看板、文章、推文與操作結果轉成 gateway contract。
- 回報 partial data、連線狀態與無法確認的寫入結果。
- 提供方便使用的 browser entry，組合 browser gateway 與 `@pttzzz/core`。

這個套件第一版只保證瀏覽器執行。它不是另一個 terminal parser，也不應複製核心的討論串規則。

Fake PTT gateway 位於 `@pttzzz/browser/testing` export，供 `apps/web` 的 Fake PTT runtime mode 與 tests 使用，而不是核心正式 runtime。

公開的 `PttGateway` 必須依 PTT 真實能力建模：看板清單區分熱門、我的最愛與分類目錄，分類結果可包含下一層分類；看板搜尋是名稱 prefix search，不宣稱全文搜尋。分類位置與分頁只以 session-scoped opaque cursor 暴露，terminal offset 留在 `packages/browser/src/internal/`。真實 terminal driver 可以保留 positional args、raw floor、screen helpers 與 raw `send()`，但不是第二套公開 API，也不從 browser package exports 匯出。

### 4.3 `@pttzzz/core`

`@pttzzz/core` 是 UI framework 無關的核心套件，目標是在瀏覽器與 Node-like JavaScript 環境均可載入及執行純規則；是否能連上 PTT 由注入的 gateway 決定。

責任包括：

- 低階文字正規化中與 PTTzzz 領域相關的純解析規則。
- 推文 intent、聚合、巢狀回覆、編輯、撤回與投票狀態。
- 穩定的文章、回覆、投票與事件 DTO。
- `replyId` 與內部原始 PTT 樓號之間的追蹤。
- 高階 `PttzzzClient` 操作介面。
- `Result`、結構化錯誤與寫入 outcome。
- framework-agnostic event subscription。
- 可重現白皮書案例的 conformance fixtures 與測試。

核心不負責：React state、畫面 layout、CSS、modal、toast、路由或 browser storage。

### 4.4 `apps/web`

現有 UI 已移入 `apps/web`，作為官方參考介面層：

- 透過公開套件入口使用核心，不 import 套件內部檔案。
- 將 Promise 與事件訂閱橋接到 React／Zustand。
- 決定 loading、partial、error 與 optimistic UI 的呈現。
- 可作為 AI 或其他開發者建立新 UI 時的完整範例，但不是唯一允許的 UI。

## 5. Runtime 與依賴方向

核心使用 dependency injection，不直接 new browser WebSocket client：

```text
UI
 └─ PttzzzClient                 高階領域操作
     ├─ core rules              純解析與聚合
     └─ PttGateway              adapter contract
         └─ BrowserPttGateway   @pttzzz/browser
             └─ ptt-client
```

這個方向讓核心純規則可在 Node 測試、CLI 或未來 gateway 中重用，但第一版不承諾 Node 可以直接連線 PTT。

## 6. 公開 API 邊界

### 6.1 對一般 UI 公開

- `PttzzzClient`
- article／board／reply 等穩定 DTO
- 操作 input DTO
- `Result<T, CoreError>`
- `CoreError` 與 write outcome
- `CoreEvent` 與訂閱方法
- 必要的 enum、type guard 與 formatter

公開 client 提供 lifecycle、看板與文章的 list／search／filter/read、文章與回文寫入，以及事件訂閱能力。完整且已由型別與 packed consumer 驗證的介面，以 [`docs/api/contracts.md`](../docs/api/contracts.md) 為唯一 public contract；本設計文件不重複維護 TypeScript 宣告。

查詢與寫入方法回傳 Promise，適合表示單次操作的最終結果；連線狀態、逐步載入與資料更新使用事件，避免 framework polling，也避免核心綁定任何 store。

看板契約固定如下：`listBoards()` 預設熱門看板，也可選 favorite 或 category source，回傳的 `BoardListPage` 以 `kind` 區分普通看板頁與 board/category 目錄頁，即使空頁也不含糊；`searchBoards()`／`filterBoards()` 嚴格只回傳 `BoardPage`。搜尋只接受名稱 `prefix`；filter 至少提供 `favorite: true` 或 `categoryCursor`，同時提供時取交集。所有 board/article cursor 都是不透明、由 gateway instance 的隨機 session namespace 發行；成功登入或 disconnect 使舊 cursor 失效，登入失敗保留既有 cursor，UI 不得反解或持久化。

公開 `Article` 必須保留結構化的 `articleEdits`、`revisions` 與 PTT 原生推／噓／中立計數；UI 不需重新解析 raw text。Append／Replace 的 `Reply.edits.content` 是該次 command payload，`resultContent` 是套用後內容，兩者不可互相冒充；Withdraw 的兩個欄位則都是正規化後的單一空格 snapshot。陣列順序就是原始 command chronology。完整撤回一個聚合回文時，只以撤回前的 aggregation group 產生一個 `visible: false` reply，保留完整 `sourceFloors` 與單份 edit history；部分撤回則由未撤回的 raw events 重新聚合並取得新的 anchor identity，不另產生可能重疊的 hidden reply。Hidden reply 不得留在可寫入的 reply target map，也不計入可見回覆數。`ReplyMetadata.sourceFloors` 只屬明確 opt-in 的 debug／短期相容資料，不是 UI identity。

文章推文 `replyToArticle` 與 PTT 原生回應到看板 `replyArticleToBoard` 是不同操作。後者建立另一篇文章，必須保留 index/AID identity 完成來源驗證。文章編輯必須攜帶非空 `editSummary`，發文可選擇性攜帶 PTT category。每個 terminal write workflow 必須標出 confirmation boundary；未標註失敗安全視為 `uncertain`，不得推測未送出。

Gateway connect／login／read 的可預期失敗使用 core-owned `GatewayError`；高階 client 保留其欄位正規化成 `CoreError`，只有未知 throw 轉為 `GATEWAY_FAILURE`。`disconnect()` 保持 `Promise<void>`：client 對預期的 cleanup `GatewayError` 仍清除本地狀態並 resolve，未知程式錯誤可 throw。寫入仍只用 `ActionReceipt` 表達是否送出與不確定性。

### 6.2 僅供 gateway 實作者公開

- `PttGateway`
- `GatewayError`
- `RawArticleSource`
- `GatewayEvent`
- `PttCommand`
- `ActionReceipt`

這些介面是 adapter extension point，不是一般 UI 應直接使用的 API。文件要把 UI API 與 gateway author API 分開。

### 6.3 保持內部

- `ptt-client` Bot instance
- terminal 按鍵序列與 prompt regex
- ANSI screen buffer 與 terminal snapshot 判讀細節
- 聚合中間狀態
- 原始樓號索引與 `replyId` 對照表
- 未承諾穩定的 parser helper

內部模組不由 package root export。官方 `@pttzzz/browser` 可透過保留且不承諾相容性的 `@pttzzz/core/internal` subpath 使用已抽出的純規則；一般 UI 與第三方 client 不得使用，UI 文件也不得示範 deep import。

## 7. 身分、樓號與資料模型

公開 UI 以穩定的 `replyId` 操作回覆，不使用畫面顯示順序，也不要求使用者看到原始 PTT 樓號。

核心在背後維護：

```text
replyId ──> 一個或多個 source floor ──> 寫入指令使用的目標樓號
```

原因是聚合卡片可能包含多個原始樓號，而排序、隱藏控制事件或重新聚合都會改變畫面順序。UI 若自行以「第幾張卡片」生成指令，容易投錯或回錯對象。

高階 DTO 可選擇性提供 debug metadata：

```ts
interface ReplyMetadata {
  sourceFloors?: number[];
  // 其他僅供診斷的原始資訊
}
```

一般 UI 預設不顯示 `sourceFloors`。debug／原始模式可明確 opt in；此資料不是 UI identity，也不能拿來重新計算核心語意。

## 8. 高階資料與 raw/debug 資料

核心預設回傳已解析、已聚合的高階 DTO，例如可見討論串、文章投票狀態、回文評分與編輯歷史。UI 不應再次解析 `推x樓`、`回x樓` 或撤回指令。

需要除錯或原始 PTT 顯示時，可透過明確選項取得 raw/debug metadata。規則如下：

- raw 資料是診斷資訊，不是另一套權威狀態。
- 核心計算出的可見性、分數與 reply target 優先。
- 是否請求 raw data 不應改變聚合結果。
- raw shape 若需穩定，必須另行版本化；不能因為放在 metadata 就默認永久相容。

## 9. 錯誤與寫入不確定性

### 9.1 Result 與 throw 的分工

預期會在正常 PTT 操作中發生的失敗回傳 `Result`，例如：

- 登入失敗或重複登入。
- 看板不存在或權限不足。
- PTT 禁止作者推噓自己的文章。
- 推噓限制、發文冷卻或文章已刪除。
- 連線中斷、畫面逾時或伺服器拒絕指令。

程式設計錯誤才 throw，例如不可能的 internal state、違反 internal invariant 或 gateway 實作不符合 contract。

### 9.2 Write outcome

每個寫入錯誤在可判定時附帶：

- `not-sent`：可以確認沒有送出；若 `retryable` 為 true，UI 可讓使用者安全重試。
- `sent`：可以確認已送出，但後續流程或回讀失敗；通常應重新載入確認。
- `uncertain`：無法知道 PTT 是否已接受；UI 不得自動重試，以免重複發文、回文或投票。

只有 `outcome` 是 `not-sent` 時，`retryable` 才可能為 true；`sent` 與 `uncertain` 在型別上固定不可重試。即使網路錯誤看似可重試，只要可能已送出，仍應先重新讀取狀態或由使用者決定。

## 10. 事件與 partial data

事件用於長生命週期與漸進資料，包括 connection、session，以及帶有 exact `ArticleKey` 與 monotonic revision 的 article partial／updated events。事件的完整 discriminated union 同樣以 [`docs/api/contracts.md`](../docs/api/contracts.md) 為準。

必要約束：

- `subscribe()` 回傳 unsubscribe function。
- event payload 是 framework-agnostic immutable data。
- partial event 必須可辨認尚未完整，不能讓 UI 把 partial 誤當 final。
- 同一 article 的事件需要可排序或可去除過期資料的 revision／sequence 設計。
- Promise 結果與事件不得產生兩套互相矛盾的狀態來源；事件是進度與共享更新，Promise 是該操作的完成結果。

## 11. 設計層與文件系統

長期穩定文件放在 `docs/`；`dev-notes/` 保留決策過程、implementation plan 與 implementation notes。

### 11.1 白皮書

`docs/whitepaper/pttzzz-core.md` 是語言與 UI 無關的規範來源，應涵蓋：

- 原始事件與可見回覆的定義。
- 聚合邊界、時間窗口、終止符與 `||`。
- 巢狀回覆辨識、最大深度與跨樓號聚合。
- 文章投票與回文投票的雙重效果。
- 同帳號投票覆蓋、撤回與控制事件隱藏。
- 編輯 outer command 與 opaque payload。
- 原始樓號、穩定 reply identity 與重新解析。
- partial input 下哪些結果可暫定、哪些必須等待完成。

每條可測規則具穩定編號，例如：

```text
THREAD-001
THREAD-002
VOTE-001
EDIT-001
```

`dev-notes/reply-handling-rule.md` 與 `dev-notes/goal-7-vote-model-review.html` 是白皮書的起始材料；白皮書現為規範來源，HTML 保留為視覺案例而非另一份相互競爭的規格。

### 11.2 API 文件

`docs/api/contracts.md` 記錄：

- package exports。
- lifecycle 與 method contracts。
- DTO、Result、error code、event 與 gateway contract。
- stability 標記與 breaking-change 規則。

`docs/api/AI-INTERFACE.md` 是建立 UI 的最短正確路徑，至少包含：

- 安裝 `@pttzzz/core` 與 `@pttzzz/browser`。
- 建立 client、登入、讀取看板與文章的最小流程。
- 訂閱事件與清理 subscription。
- partial、loading 與 error/outcome 的 UI 行為。
- 常用 rendering model 與操作範例。
- AI 產生介面時的禁止事項。

禁止事項要明列：

- 不 deep import internal module。
- 不自行拼接 `推x樓`、`回x樓`、編輯或撤回控制文字。
- 不以畫面排序後的位置當原始 PTT 樓號。
- 不對 `uncertain` 寫入自動重試。
- 不從 raw pushes 自行重算 score、可見性或巢狀關係。
- 不在一般 UI 顯示 source floors。
- 不把 partial article 當成 complete article。

### 11.3 範例與 fixture

`docs/examples/` 目前只有 `minimal-browser` 是完整、可 typecheck／bundle／執行的 host 範例，涵蓋 lifecycle、thread rendering 與 uncertain-write handling。完整 React reference app 位於 `apps/web`。其他目錄只保留 React store、Vue composable、rendering 與 error handling 的概念性 README snippets；沒有提供可執行的獨立 integration 或 framework package，兩者屬第一版 non-goal。

白皮書案例另有 machine-readable fixtures。每個 fixture 參照規則編號，至少包含 raw events、options 與預期 normalized／aggregated output。Conformance tests 直接讀取 fixtures，避免文件範例與程式實作漂移。

## 12. 已執行的漸進遷移順序

### Phase 1：固定規則與 contracts（完成）

- 已建立白皮書、rule IDs、API contracts 與 AI interface guide。
- 已將既有 HTML 案例連結到 machine-readable fixtures。
- 此階段未搬 runtime code。

### Phase 2：抽出 pure core（完成）

- 已將 parser、aggregator、push editing 與 action formatter 中的純邏輯移入 `packages/core`。
- Core 已移除 React、DOM、storage 與真實連線相依。
- 遷移期間使用的暫時 re-export 已在 app 搬移後刪除。

### Phase 3：抽出 browser gateway（完成）

- Legacy adapter 已搬成 package-private terminal driver，再由公開 gateway 包裝；大型 terminal workflow 未重寫。
- `@pttzzz/browser` 已包裝 `ptt-client` 並實作 `PttGateway`。
- Fake PTT runtime 已移到 browser testing entry，並與 real gateway 共用 contract suite。

### Phase 4：建立高階 client（完成）

- 已實作 `PttzzzClient`、events、Result/error/outcome 與 reply identity map。
- Hooks 已改成只使用公開 client API。
- 一般 UI 已不接觸 terminal 或 raw floor；raw floor 僅存在 core private target map／`PttCommand`、gateway transport與 opt-in debug metadata。

### Phase 5：移動參考 UI（完成）

- React 應用已移至 `apps/web`。
- Preview、Fake PTT 與正式 browser gateway 三種模式均保留。
- 舊 re-export 已刪除，app boundary tests 禁止 internal deep import。

### Phase 6：發布準備（完成）

- 已定義 package `exports`、types 與 browser compatibility。
- Pack smoke 已驗證 artifacts 與 production dependency closure不包含意外 UI dependency。
- Verify 已對兩個套件實際 `npm pack`、離線安裝並執行 consumer smoke。
- Minimal browser 範例只依照 public roots 建立，並實際 typecheck、bundle、jsdom execution。

每一 phase 均以獨立 task、測試與 review 完成，沒有一次性大搬家。

## 13. 測試策略

### Core conformance tests

- fixtures 對應白皮書 rule IDs。
- parser、aggregation、nested reply、vote、withdraw、edit 與 partial/final 行為。
- 同一 fixture 可供其他未來實作驗證，不綁 React snapshot。

### Browser terminal tests

- 以記錄的 terminal transcript 驗證 prompt 辨識與 workflow。
- 測試 timeout、斷線、重複登入與 ambiguous acknowledgement。
- 不以 live PTT 作為一般 CI 的必要條件。

### Gateway contract tests

- browser gateway 與 fake gateway 共用 contract suite。
- 驗證事件順序、action receipt、取消訂閱與 error outcome。

### UI tests

- 驗證 UI 如何消費公開 DTO、events 與 Result。
- 不重複測試核心 parser 的每一條規則。
- 保留少量跨層流程測試，確認 reference app wiring。

## 14. 發布與版本

第一個對外版本：

- `@pttzzz/core@0.1.0`
- `@pttzzz/browser@0.1.0`

兩者初期採同版本發布，降低相容性理解成本。進入穩定期後才評估獨立版本。`@pttzzz/browser` 最終以 `@pttzzz/core@0.1.0` 作為 direct dependency。

公開 package root exports 視為 API；internal path 不提供相容承諾。0.x 期間仍需 changelog 記錄 DTO、error code、event ordering 與 gateway contract 的破壞性變更。

## 15. 第一版明確不做

- Node 直連 PTT 的 gateway。
- 官方 Vue／Svelte framework package。
- plugin system。
- 自動產生完整 UI。
- backend service 或 server-side account storage。
- 多種 storage adapter package。
- 跨語言核心實作。
- 自動從程式碼生成整份白皮書。
- 額外發布名稱重複的 `ptt-client-browser` 套件。

本版本只有概念性 Vue composable snippet，未提供可執行 Vue app 或官方 Vue package。Node-like 環境只保證 pure core 可用，不代表 browser gateway 能在 Node 連線。

## 16. 主要風險與限制方式

### 規格與實作再次分岔

以 rule ID、machine-readable fixture 與 conformance test 串起白皮書和程式碼；HTML 只做案例展示。

### 套件切得過細

第一版只發布 core 與 browser。Fake、React bridge 與範例先使用 subpath 或留在 app，不預先拆新 package。

### raw data 洩漏成實際 API

raw/debug 必須 opt in 且放入明確 metadata；一般操作只接受穩定 ID 與領域 input。

### 事件與 Promise 競態

定義 operation ID、revision／sequence 與 final semantics；UI store 僅由公開 client bridge 更新。

### 不確定寫入造成重複內容

所有寫入錯誤保留 outcome；`uncertain` 禁止自動重試，優先重新讀取遠端狀態。

### 大規模移動破壞現有 UI

使用暫時 re-export、逐 phase 遷移與現有 385 項測試作回歸基準；最後才移動 app 目錄。

## 17. 設計完成的驗收條件

- 白皮書能獨立解釋核心規則，且每條可測規則有穩定 ID。
- UI 可只透過 `PttzzzClient` 與公開 DTO 完成目前主要讀寫功能。
- Core package 不依賴 React、Zustand、DOM 或 browser storage。
- Browser package 是唯一需要理解 `ptt-client` terminal workflow 的正式實作。
- UI 不需知道控制文字格式或以原始樓號識別回覆。
- partial state、expected error 與 uncertain write 有明確 contract。
- Core、browser gateway 與 reference UI 有分層測試。
- 兩個 package 能從 `npm pack` 產物安裝並通過最小使用範例。
- AI 只閱讀 `AI-INTERFACE.md` 與 examples，即可建立不依賴 internal imports 的替代 UI。

## 18. 實作後 decision log

- 兩個發布套件維持 `@pttzzz/core@0.1.0` 與 `@pttzzz/browser@0.1.0`；React app 已移至 `apps/web`，不另發布 framework package。
- Temporary compatibility re-export 已在 app 遷移後移除。唯一保留 subpath 是供官方 browser adapter 使用、無一般 UI 相容承諾的 `@pttzzz/core/internal`。
- `replyId` 最終 anchor 到 immutable raw event，而非 UI index 或完整 aggregation membership；完整 source floors 只存在 private target map/debug metadata。
- `createArticle()` 維持 `Result<void>`，因 PTT terminal 無法可靠回傳新文章 identity。
- Fake gateway 由 `@pttzzz/browser/testing` 提供；real/fake 共用 gateway contract suite。
- 發布驗證不只 build workspace，而是實際 pack、離線安裝 dependency closure、驗 ESM/types/exports，再 bundle 與執行 minimal alternate UI。
- Browser host 仍需 Buffer polyfill 與具正確 Origin 的 `/ptt-ws` proxy；第一版未新增 Node gateway。
- Core article maps 第一版沒有 bounded eviction；disconnect 清除。Reference UI 的 editable-body projection 仍是介面層政策。

完整實作紀錄、驗證數字與已接受限制見 [Goal 9 implementation notes](goal-9-implementation-notes.md)。
