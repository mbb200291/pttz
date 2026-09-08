# Goal 9：PTTzzz 核心架構設計

狀態：設計已確認，尚未進入 implementation plan 與程式碼遷移。

## 1. 目標

Goal 9 要把目前集中在單一 React 專案裡的知識分成三層：

1. **設計層**：以白皮書定義 PTTzzz 的領域規則，例如推文聚合、巢狀回覆、投票、撤回與編輯重解析。
2. **核心實作層**：將白皮書實作成不依賴 React 的 JavaScript／TypeScript 套件，並以 `ptt-client` 為低階 PTT 連線引擎。
3. **介面層**：由不同 UI 消費核心 API；目前的 React UI 是官方參考實作之一，不是核心本身。

核心實作層必須能獨立發布，並提供足夠明確、適合人類與 AI 閱讀的公開介面文件，使其他人能在不理解 terminal 細節與內部 parser 的前提下建立不同 UI。

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

預計 repository 形狀：

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
    react-store/
    vue-composable/
    rendering/
    error-handling/
```

Repository 先使用 npm workspaces，不引入 Turborepo 或額外 monorepo framework。只有在實際 build graph 或發布流程需要時再評估工具。

## 4. 套件與層級責任

### 4.1 `ptt-client`

`ptt-client` 是第三方低階依賴，負責 WebSocket terminal、Bot 與畫面互動能力。它不知道 PTTzzz 的聚合、巢狀回覆、應用層投票或 UI DTO。

它不會成為 PTTzzz 對 UI 公開的主要 API。UI 不應直接依賴它。

### 4.2 `@pttzzz/browser`

`@pttzzz/browser` 是瀏覽器環境的 PTT gateway 實作，內部包裝 `ptt-client`。目前 `src/lib/ptt/adapter.ts` 是這一層的雛形。

責任包括：

- 建立與關閉瀏覽器 WebSocket 連線。
- 處理登入、重複登入與 terminal 畫面狀態。
- 序列化 Bot 指令，避免不同 workflow 互相競爭畫面。
- 將看板、文章、推文與操作結果轉成 gateway contract。
- 回報 partial data、連線狀態與無法確認的寫入結果。
- 提供方便使用的 browser entry，組合 browser gateway 與 `@pttzzz/core`。

這個套件第一版只保證瀏覽器執行。它不是另一個 terminal parser，也不應複製核心的討論串規則。

Fake PTT adapter 因使用 browser storage，預計放在 `@pttzzz/browser` 的 testing export，而不是核心正式 runtime。

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

現有 UI 最終移入 `apps/web`，作為官方參考介面層：

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

概念介面如下；實際名稱可在 implementation plan 中依 TypeScript 驗證微調：

```ts
type Result<T, E = CoreError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

type WriteOutcome = "not-sent" | "sent" | "uncertain";

interface CoreError {
  code: string;
  message: string;
  retryable: boolean;
  outcome?: WriteOutcome;
  cause?: unknown;
}

class GatewayError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly cause?: unknown,
  );
}

interface PttzzzClient {
  connect(): Promise<Result<void>>;
  login(input: LoginInput): Promise<Result<Session>>;
  disconnect(): Promise<void>;

  listBoards(input?: ListBoardsInput): Promise<Result<BoardListPage>>;
  listArticles(input: ListArticlesInput): Promise<Result<ArticlePage>>;
  getArticle(input: GetArticleInput): Promise<Result<Article>>;

  createArticle(input: CreateArticleInput): Promise<Result<void>>;
  editArticle(input: EditArticleInput): Promise<Result<void>>;
  deleteArticle(input: DeleteArticleInput): Promise<Result<void>>;
  replyToArticle(input: ReplyToArticleInput): Promise<Result<void>>;
  replyArticleToBoard(input: ReplyArticleToBoardInput): Promise<Result<void>>;

  replyToReply(input: ReplyToReplyInput): Promise<Result<void>>;
  editReply(input: EditReplyInput): Promise<Result<void>>;
  withdrawReply(input: WithdrawReplyInput): Promise<Result<void>>;
  voteArticle(input: VoteArticleInput): Promise<Result<void>>;
  voteReply(input: VoteReplyInput): Promise<Result<void>>;
  withdrawArticleVote(input: WithdrawArticleVoteInput): Promise<Result<void>>;
  withdrawReplyVote(input: WithdrawReplyVoteInput): Promise<Result<void>>;

  subscribe(listener: (event: CoreEvent) => void): () => void;
}
```

查詢與寫入方法回傳 Promise，適合表示單次操作的最終結果；連線狀態、逐步載入與資料更新使用事件，避免 framework polling，也避免核心綁定任何 store。

看板契約固定如下：`listBoards()` 預設熱門看板，也可選 favorite 或 category source，回傳的 `BoardListPage` 以 `kind` 區分普通看板頁與 board/category 目錄頁，即使空頁也不含糊；`searchBoards()`／`filterBoards()` 嚴格只回傳 `BoardPage`。搜尋只接受名稱 `prefix`；filter 至少提供 `favorite: true` 或 `categoryCursor`，同時提供時取交集。所有 board/article cursor 都是不透明、由 gateway instance 的隨機 session namespace 發行；成功登入或 disconnect 使舊 cursor 失效，登入失敗保留既有 cursor，UI 不得反解或持久化。

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

事件用於長生命週期與漸進資料：

```ts
type CoreEvent =
  | { type: "connection.changed"; status: ConnectionStatus }
  | { type: "session.changed"; session: Session | null }
  | { type: "article.partial"; articleId: string; patch: ArticlePatch }
  | { type: "article.updated"; article: Article }
  | { type: "operation.progress"; operationId: string; phase: string };
```

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

目前 `dev-notes/reply-handling-rule.md` 與 `dev-notes/goal-7-vote-model-review.html` 是白皮書的起始材料；遷移完成後白皮書成為規範來源，HTML 保留為視覺案例而非另一份相互競爭的規格。

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

`docs/examples/` 提供小而完整的範例：

- minimal browser lifecycle
- React store bridge
- Vue composable（示範 framework independence，不發布官方 Vue package）
- thread rendering
- error and uncertain-write handling

白皮書案例另有 machine-readable fixtures。每個 fixture 參照規則編號，至少包含 raw events、options 與預期 normalized／aggregated output。Conformance tests 直接讀取 fixtures，避免文件範例與程式實作漂移。

## 12. 漸進遷移順序

### Phase 1：固定規則與 contracts

- 建立白皮書、rule IDs、API contracts 與 AI interface guide。
- 將既有 HTML 案例轉成或連結到 machine-readable fixtures。
- 此階段不搬現有 runtime code。

### Phase 2：抽出 pure core

- 將 parser、aggregator、push editing 與 action formatter 中的純邏輯移入 `packages/core`。
- 移除 React、DOM、storage 與真實連線相依。
- 在舊路徑提供暫時 re-export，使 UI 可繼續運作。

### Phase 3：抽出 browser gateway

- 先將目前 `adapter.ts` 原樣搬成不公開的 terminal driver，再在其上建立公開 gateway；不重寫大型 terminal workflow。
- `@pttzzz/browser` 包裝 `ptt-client` 並實作 `PttGateway`。
- Fake adapter 移到 browser testing entry，並以同一 contract 測試。

### Phase 4：建立高階 client

- 實作 `PttzzzClient`、events、Result/error/outcome 與 reply identity map。
- 將現有 hooks 改成只使用公開 client API。
- 在這一階段消除 UI 對 terminal 與 raw floor 的知識。

### Phase 5：移動參考 UI

- 公開 import 穩定後，才將現有 React 應用移至 `apps/web`。
- 保持 preview、fake PTT 與正式 browser gateway 三種模式。
- 刪除舊 re-export 前，確認 repository 沒有 internal deep import。

### Phase 6：發布準備

- 明確定義 package `exports`、types 與 browser compatibility。
- 驗證 build artifacts 不包含 React／Zustand 等意外依賴。
- 對兩個套件執行 `npm pack` 安裝 smoke test。
- 從乾淨範例只依照 `AI-INTERFACE.md` 建立最小 UI，驗證文件充分。

每一 phase 都需有可獨立 review 的 implementation plan；不進行一次性大搬家。

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

兩者初期採同版本發布，降低相容性理解成本。進入穩定期後才評估獨立版本。`@pttzzz/browser` 以 peer／direct dependency 的具體選擇，留待 implementation plan 依打包與單例需求驗證，但必須宣告可相容的 core 範圍。

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

Vue 範例只證明公開 API 沒有綁 React；Node-like 環境只保證 pure core 可用，不代表 browser gateway 能在 Node 連線。

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

## 18. 後續工作

本文件通過 review 後，下一步才建立 Goal 9 implementation plan。Implementation plan 應將上述 phase 拆成可驗證的小步驟，先從 Phase 1 的白皮書、contracts 與 fixtures 開始，不直接進行完整 monorepo 搬移。
