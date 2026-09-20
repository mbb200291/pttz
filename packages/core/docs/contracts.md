# pttzzz public contracts

本文件描述 repository 內已實作並由 TypeScript、gateway contract tests 與 packed consumer 驗證的公開契約；npm registry 發布狀態不在此保證。語意規則以[核心規則白皮書](../../../docs/whitepaper/pttzzz-core.md)為準，套件分層見[核心架構](./README.md)。

## 0.3 文章文字格式擴充

文章發表、本文編輯與回應至看板可附加 `ArticleTextStyle[]`；正文與格式分離，普通文字語意不變。範圍採 UTF-16 左含右不含，不得重疊或切開 surrogate pair；樣式僅高亮與前景色 30–37。Core 與 browser 都在送出前驗證。詳細介面、預覽及錯誤處理見 [UI 開發指南](./DEVELOPMENT_GUIDE.md#article-text-formatting-corebrowser-03)。

此為實作層公開 API 加法擴充，套件為 0.3.0。文字格式欄位本身不改變 body／回文語意及 Article DTO；其他 gateway 必須明確實作此欄位，不可承諾未知 gateway 會自動支援。目前規則相容性為 0.3.x，詳見白皮書。

## 漸進讀取狀態

| 規則編號 | 說明 |
| --- | --- |
| [PARTIAL-001](#漸進讀取狀態) | 文章讀取中的 `incomplete` 與完整後的 `final` 狀態 |

文章尚未讀完時，核心可輸出 `incomplete` 與目前結果；後續事件仍可能續接卡片、改票、編輯或撤回，消費端不可視為不可變結果。來源確認完整後輸出 `final`，以完整事件序列計算最終狀態；`final` 只代表目前來源已完整，不承諾其他產品行為。

## Export 層級

### UI public exports

一般 UI 只從 `@pttzzz/core` package root 使用：

- `PttzzzClient`
- `Board`、`BoardListEntry`、`BoardListSource`、`BoardPage`、`BoardDirectoryPage`、`BoardListPage`、`ArticleKey`、`ArticleRef`、`ArticleSummary`、`ArticlePage`、`Article`、`PartialArticle`、`Reply` 等 DTO，以及 `articleKeyId`
- 本文件列出的 input DTO
- `Result`、`CoreError`、`WriteOutcome`
- `CoreEvent`、`Unsubscribe`

瀏覽器應用從 `@pttzzz/browser` package root 使用 `createBrowserClient()`。純 core 可在 Node-like JavaScript 環境載入與執行；0.1 的真實 PTT 連線只保證瀏覽器環境，不承諾 Node gateway。

### Gateway author exports

adapter 作者可從 `@pttzzz/core` package root 使用 `PttGateway`、`GatewayError`、`RawArticleSource`、`GatewayEvent`、`PttCommand` 與 `ActionReceipt`。它們是 extension point，不是一般 UI API。

### Internal / reserved integration export

下列項目不由 package root export，也沒有相容性保證。官方 `@pttzzz/browser` 可使用保留的 `@pttzzz/core/internal` subpath 取得已抽出的純解析、聚合、編輯與 action formatter；一般 UI、第三方 client 與範例不得使用此 subpath：

- `ptt-client` 的 `Bot`
- terminal keys、prompt regular expressions 與控制字串 formatter
- ANSI screen buffer、snapshot 與畫面判讀
- mutable aggregation state
- raw-floor map（`replyId` 到來源樓號的內部映射）
- 未承諾穩定的 parser、aggregation、editing 與 action formatter helpers

## 共用結果與錯誤

```ts
export type Result<T, E = CoreError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export type WriteOutcome = "not-sent" | "sent" | "uncertain";

export interface CoreError {
  code: string;
  message: string;
  retryable: boolean;
  outcome?: WriteOutcome;
  cause?: unknown;
}

export class GatewayError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly cause?: unknown,
  );
}

export type Unsubscribe = () => void;
```

UI-facing client 的預期 PTT 失敗以 `Result` 表示。Gateway 的 connect／login／read method 以 `GatewayError` 傳遞可預期失敗；client 保留其 `code`、`message`、`retryable` 與 `cause` 並轉成 `CoreError`。未知 throw 才正規化成 `GATEWAY_FAILURE`。Disconnect 採下述 best-effort 特例。寫入仍只回傳 `ActionReceipt`，不可用 throw 取代已知的送出結果。寫入錯誤的 `outcome`：

- `not-sent`：確認未送出；只有 `retryable` 也為 `true` 時才適合提供安全重試。
- `sent`：確認已送出，但後續確認失敗；先重新讀取狀態。
- `uncertain`：無法確認是否送出；不得自動重試。

建議的穩定 error codes 為 `NOT_CONNECTED`、`AUTH_FAILED`、`DUPLICATE_LOGIN`、`PERMISSION_DENIED`、`BOARD_NOT_FOUND`、`ARTICLE_NOT_FOUND`、`REPLY_NOT_FOUND`、`INVALID_INPUT`、`RATE_LIMITED`、`AUTHOR_VOTE_FORBIDDEN`、`CONNECTION_LOST`、`TIMEOUT`、`REJECTED`、`UNSUPPORTED` 與 `GATEWAY_FAILURE`。錯誤顯示應保留未知 code 的 fallback。

## Identity 與 DTO

```ts
export type ArticleKey =
  | { board: string; index: number; aid?: never }
  | { board: string; aid: string; index?: never };

export function articleKeyId(key: ArticleKey): string;

export type ReplyId = string;
export type VoteDirection = "push" | "boo";
export type PushType = "push" | "boo" | "neutral";
export type ArticleCompleteness = "incomplete" | "final";

export interface Board {
  name: string;
  title: string;
  category?: string;
  description?: string;
  favorite?: boolean;
  onlineUsers?: number;
  popularityLabel?: string;
}

export type BoardListEntry =
  | { kind: "board"; board: Board }
  | { kind: "category"; title: string; categoryCursor: string };

export interface BoardPage {
  kind: "boards";
  items: readonly Board[];
  nextCursor?: string;
}

export interface BoardDirectoryPage {
  kind: "directory";
  items: readonly BoardListEntry[];
  nextCursor?: string;
}

export type BoardListPage = BoardPage | BoardDirectoryPage;

export interface ArticleRef {
  key: ArticleKey;
}

export interface ArticleSummary extends ArticleRef {
  title: string;
  author: string;
  /** Source-provided date text. A PTT board listing may contain only month/day. */
  publishedAt?: string;
  nativeScore?: number;
}

export interface ArticlePage {
  items: readonly ArticleSummary[];
  nextCursor?: string;
}

export interface EditRecord {
  kind: "append" | "replace" | "withdraw";
  author: string;
  content: string;
  createdAt?: string;
}

export interface ReplyMetadata {
  sourceFloors?: readonly number[]; // only when debug metadata is explicitly requested
  raw?: unknown;
}

export interface Reply {
  replyId: ReplyId;
  author: string;
  content: string;
  pushType: PushType;
  createdAt?: string;
  replyTo?: ReplyId;
  depth: 1 | 2 | 3;
  score: number;
  viewerVote?: VoteDirection;
  isOp: boolean;
  visible: boolean;
  edits: readonly EditRecord[];
  children: readonly Reply[];
  metadata?: ReplyMetadata;
}

export interface Article extends ArticleSummary {
  completeness: "final";
  revision: number;
  body: string;
  replies: readonly Reply[];
  viewerVote?: VoteDirection;
  metadata?: { raw?: unknown };
}

export interface PartialArticle {
  key: ArticleKey;
  completeness: "incomplete";
  revision: number;
  title?: string;
  author?: string;
  body?: string;
  replies: readonly Reply[];
}
```

`ArticleSummary.publishedAt` preserves the precision supplied by the source. PTT board-list rows expose month and day but no year, so consumers must not parse this field as a complete timestamp, invent a year, or sort pages by it. Keep the opaque pagination order, use the numeric article index as the stable order within an index-based PTT board, and use the complete timestamp from a loaded `Article` only when calendar chronology is required.

`ArticleKey` 必須同時帶 board 與 `index`／`aid` 其中之一。一次 `getArticle()` operation 必須逐欄保留 input `ArticleKey` representation：index request 不轉成 aid，aid request 也不轉成 index；該 operation 的 partial/final DTO 與 Result 都使用同一 representation。即使兩個 key 指向同一篇 PTT 文章，以不同 representation 發起的 operations 在 0.1 仍有各自的 routing key，不做 alias mapping。

`articleKeyId()` 是 UI/store 唯一的 routing helper，其回傳值是 opaque token，只供目前 process 內 equality、Map key 與 in-memory store routing。consumer 不得 decode、parse 或依賴字串格式；除非未來另有 versioned persistence contract，該值不保證能跨 incompatible major version 持久化。`ArticleRef` 的 identity 只由 `key` 表示，不重複提供可能矛盾的 top-level aid。`replyId` 是 UI 與寫入操作的穩定 identity；顯示順序、`depth` 或 debug metadata 都不能替代它。`PartialArticle` 是可被後續事件改寫的投影，不能轉型或假設為完整 `Article`。

## Events

```ts
export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected";

export interface Session {
  userId: string;
}

export type CoreEvent =
  | { type: "connection.changed"; status: ConnectionStatus }
  | { type: "session.changed"; session: Session | null }
  | {
      type: "article.partial";
      articleKey: ArticleKey;
      revision: number;
      article: PartialArticle;
    }
  | {
      type: "article.updated";
      articleKey: ArticleKey;
      revision: number;
      article: Article;
    }
  | {
      type: "operation.progress";
      operationId: string;
      phase: string;
    };
```

對一次 `getArticle({ article: inputKey })` operation，每個 `article.partial`／`article.updated` 的 `event.articleKey`、`event.article.key`，以及成功 `Result.value.key` 都必須逐欄等於 `inputKey`。同一 routing key 的 revision 必須單調遞增；consumer 應丟棄小於目前 revision 的事件。不同 key representation 不共享 revision sequence。事件是進度與共享資料更新；method 的 Promise `Result` 是該次呼叫的完成結果，兩者不是互相競爭的狀態來源。

## Input DTO

```ts
export interface LoginInput {
  username: string;
  password: string;
  disconnectExistingSession?: boolean;
}

export type BoardListSource =
  | { kind: "hot" }
  | { kind: "favorite" }
  | { kind: "category"; categoryCursor?: string };
export interface ListBoardsInput { source?: BoardListSource; cursor?: string; limit?: number }
export interface SearchBoardsInput { prefix: string; cursor?: string; limit?: number }
export type FilterBoardsInput = { cursor?: string; limit?: number } & (
  | { favorite: true; categoryCursor?: string }
  | { favorite?: true; categoryCursor: string }
);
export interface ListArticlesInput { board: string; cursor?: string; limit?: number }
export interface SearchArticlesInput { board: string; query: string; cursor?: string; limit?: number }
export interface FilterArticlesInput { board: string; author?: string; keyword?: string; cursor?: string; limit?: number }
export interface GetArticleInput { article: ArticleKey; includeDebugMetadata?: boolean }

export interface ArticleTextStyle { start: number; end: number; bold?: boolean; color?: 30 | 31 | 32 | 33 | 34 | 35 | 36 | 37 }
export interface CreateArticleInput { board: string; category?: string; title: string; content: string; formatting?: readonly ArticleTextStyle[] }
export interface EditArticleInput { article: ArticleKey; content: string; formatting?: readonly ArticleTextStyle[] }
export interface DeleteArticleInput { article: ArticleKey }
export interface ReplyToArticleInput { article: ArticleKey; content: string; pushType: PushType }
export interface ReplyArticleToBoardInput { article: ArticleKey; content: string; formatting?: readonly ArticleTextStyle[] }
export interface ReplyToReplyInput { article: ArticleKey; replyId: ReplyId; content: string; pushType: PushType }
export interface EditReplyInput { article: ArticleKey; replyId: ReplyId; mode: "append" | "replace"; content: string }
export interface WithdrawReplyInput { article: ArticleKey; replyId: ReplyId }
export interface VoteArticleInput { article: ArticleKey; direction: VoteDirection }
export interface WithdrawArticleVoteInput { article: ArticleKey; direction: VoteDirection }
export interface VoteReplyInput { article: ArticleKey; replyId: ReplyId; direction: VoteDirection }
export interface WithdrawReplyVoteInput { article: ArticleKey; replyId: ReplyId; direction: VoteDirection }
```

input DTO 不接受 raw floor，也不接受預先格式化的 PTT 控制文字。`listBoards()` 未指定 source 時列熱門看板；favorite 與 category 是不同的 PTT 清單來源。它回傳具 discriminant 的 `BoardListPage`，所以即使 items 為空，UI 仍能區分普通看板頁與可能包含下一層 category entry 的目錄頁。`searchBoards()` 與 `filterBoards()` 嚴格只回傳 `BoardPage`，不會混入 category entry。搜尋只做看板名稱 prefix search，不是全文 query。`filterBoards()` 至少要有 `favorite: true` 或 `categoryCursor`，兩者同時存在時取交集；`favorite: false` 不是有效 filter。

`searchArticles.query` 不可為空；`filterArticles()` 至少需要非空 `author` 或 `keyword`。author-only、keyword-only 與兩者交集都由真實 PTT terminal search 執行，不得在不支援時退回未過濾清單。文章頁預設最多 20 筆；指定較大 limit 時 gateway 會續讀 terminal page，公開 cursor 仍只是不透明的下一頁 token。

`cursor` 與 `categoryCursor` 都是 gateway 發出的 opaque、session-scoped routing token。每個 gateway instance/session 使用獨立隨機 namespace；只有成功登入或 disconnect 才輪替 namespace，登入失敗不會破壞原 session 的 cursor。UI 只能原樣傳回同一 session，不可解析成 terminal offset、跨登入持久化或自行組合。文章清單 cursor 同樣由 gateway 發行，內含的 terminal 定位資訊不會直接暴露。

## `PttzzzClient`

```ts
export interface PttzzzClient {
  connect(): Promise<Result<void>>;
  login(input: LoginInput): Promise<Result<Session>>;
  disconnect(): Promise<void>;

  listBoards(input?: ListBoardsInput): Promise<Result<BoardListPage>>;
  searchBoards(input: SearchBoardsInput): Promise<Result<BoardPage>>;
  filterBoards(input: FilterBoardsInput): Promise<Result<BoardPage>>;
  listArticles(input: ListArticlesInput): Promise<Result<ArticlePage>>;
  searchArticles(input: SearchArticlesInput): Promise<Result<ArticlePage>>;
  filterArticles(input: FilterArticlesInput): Promise<Result<ArticlePage>>;
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
  withdrawArticleVote(input: WithdrawArticleVoteInput): Promise<Result<void>>;
  voteReply(input: VoteReplyInput): Promise<Result<void>>;
  withdrawReplyVote(input: WithdrawReplyVoteInput): Promise<Result<void>>;

  subscribe(listener: (event: CoreEvent) => void): Unsubscribe;
}
```

### Method behavior matrix

| Method | Input | Success | Expected errors | `uncertain` | Partial |
| --- | --- | --- | --- | --- | --- |
| `connect` | none | `void` | `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | no | no |
| `login` | `LoginInput` | `Session` | `INVALID_INPUT`, `NOT_CONNECTED`, `AUTH_FAILED`, `DUPLICATE_LOGIN`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | no | no |
| `disconnect` | none | `void` | expected gateway cleanup failure is absorbed after local state is cleared; unknown programming failures may throw | no | no |
| `listBoards` | hot（default）、favorite 或 category source + paging | `BoardListPage` | `INVALID_INPUT`, `NOT_CONNECTED`, `PERMISSION_DENIED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | no | no |
| `searchBoards` | name prefix + paging | `BoardPage` | `INVALID_INPUT`, `NOT_CONNECTED`, `PERMISSION_DENIED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | no | no |
| `filterBoards` | favorite/category cursor + paging；兩者並存取交集 | `BoardPage` | `INVALID_INPUT`, `NOT_CONNECTED`, `PERMISSION_DENIED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | no | no |
| `listArticles` | board + paging | `ArticlePage` | `INVALID_INPUT`, `BOARD_NOT_FOUND`, `PERMISSION_DENIED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | no | no |
| `searchArticles` | board + query + paging | `ArticlePage` | `INVALID_INPUT`, `BOARD_NOT_FOUND`, `PERMISSION_DENIED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | no | no |
| `filterArticles` | board + filters + paging | `ArticlePage` | `INVALID_INPUT`, `BOARD_NOT_FOUND`, `PERMISSION_DENIED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | no | no |
| `getArticle` | `ArticleKey`, debug opt-in | final `Article`; `value.key` preserves the input representation | `INVALID_INPUT`, `ARTICLE_NOT_FOUND`, `PERMISSION_DENIED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | no | yes; partial/updated keys preserve the same input representation |
| `createArticle` | board, optional PTT category, title, content | `void`；目前 gateway 無法可靠取得新文章 identity | `INVALID_INPUT`, `BOARD_NOT_FOUND`, `PERMISSION_DENIED`, `RATE_LIMITED`, `REJECTED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | yes | no |
| `editArticle` | article, content（不要求編輯摘要） | `void` | `INVALID_INPUT`, `ARTICLE_NOT_FOUND`, `PERMISSION_DENIED`, `REJECTED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | yes | updated event may follow reload |
| `deleteArticle` | article | `void` | `INVALID_INPUT`, `ARTICLE_NOT_FOUND`, `PERMISSION_DENIED`, `REJECTED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | yes | no |
| `replyToArticle` | article, content, push type | `void` | `INVALID_INPUT`, `ARTICLE_NOT_FOUND`, `PERMISSION_DENIED`, `RATE_LIMITED`, `REJECTED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | yes | updated event may follow reload |
| `replyArticleToBoard` | article, board-post body | `void` | `INVALID_INPUT`, `ARTICLE_NOT_FOUND`, `PERMISSION_DENIED`, `REJECTED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | yes | no |
| `replyToReply` | article, `replyId`, content, push type | `void` | `INVALID_INPUT`, `ARTICLE_NOT_FOUND`, `REPLY_NOT_FOUND`, `PERMISSION_DENIED`, `RATE_LIMITED`, `REJECTED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | yes | updated event may follow reload |
| `editReply` | article, `replyId`, mode, content | `void` | `INVALID_INPUT`, `ARTICLE_NOT_FOUND`, `REPLY_NOT_FOUND`, `PERMISSION_DENIED`, `REJECTED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | yes | updated event may follow reload |
| `withdrawReply` | article, `replyId` | `void` | `INVALID_INPUT`, `ARTICLE_NOT_FOUND`, `REPLY_NOT_FOUND`, `PERMISSION_DENIED`, `REJECTED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | yes | updated event may follow reload |
| `voteArticle` | article, direction | `void` | `INVALID_INPUT`, `ARTICLE_NOT_FOUND`, `PERMISSION_DENIED`, `AUTHOR_VOTE_FORBIDDEN`, `RATE_LIMITED`, `REJECTED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | yes | updated event may follow reload |
| `withdrawArticleVote` | article, previous direction | `void` | `INVALID_INPUT`, `ARTICLE_NOT_FOUND`, `PERMISSION_DENIED`, `REJECTED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | yes | updated event may follow reload |
| `voteReply` | article, `replyId`, direction | `void` | `INVALID_INPUT`, `ARTICLE_NOT_FOUND`, `REPLY_NOT_FOUND`, `PERMISSION_DENIED`, `RATE_LIMITED`, `REJECTED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | yes | updated event may follow reload |
| `withdrawReplyVote` | article, `replyId`, previous direction | `void` | `INVALID_INPUT`, `ARTICLE_NOT_FOUND`, `REPLY_NOT_FOUND`, `PERMISSION_DENIED`, `REJECTED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | yes | updated event may follow reload |
| `subscribe` | `CoreEvent` listener | `Unsubscribe` | listener exceptions are isolated | no | receives partial/update events |

表中的 expected errors 已逐 row 完整列出。`updated event may follow reload` 不保證寫入本身產生 partial；UI 若需確認應重新讀取。

`PttzzzClient.disconnect()` 固定是 `Promise<void>`：它會要求 gateway 盡力釋放資源並清除 client 的 session／connection local state。Gateway 若以 `GatewayError` 回報可預期的 cleanup failure，client 吸收該錯誤；未知的程式錯誤仍可 throw，避免掩蓋 invariant 或實作 bug。

## Gateway author contract

```ts
export interface RawArticleSource {
  articleKey: ArticleKey;
  completeness: ArticleCompleteness;
  rawText: string;
  revision: number;
}

export type GatewayEvent =
  | { type: "connection.changed"; status: ConnectionStatus }
  | { type: "session.changed"; session: Session | null }
  | { type: "article.source"; source: RawArticleSource };

export type PttCommand =
  | { type: "create-article"; board: string; category?: string; title: string; content: string }
  | { type: "edit-article"; article: ArticleKey; content: string }
  | { type: "delete-article"; article: ArticleKey }
  | { type: "reply-article"; article: ArticleKey; content: string; pushType: PushType }
  | { type: "reply-article-to-board"; article: ArticleKey; content: string }
  | { type: "reply-floor"; article: ArticleKey; floor: number; content: string; pushType: PushType }
  | { type: "edit-floor"; article: ArticleKey; floor: number; mode: "append" | "replace"; content: string }
  | { type: "withdraw-floor"; article: ArticleKey; ranges: readonly { start: number; end: number }[] }
  | { type: "vote-article"; article: ArticleKey; direction: VoteDirection }
  | { type: "withdraw-article-vote"; article: ArticleKey; direction: VoteDirection }
  | { type: "vote-floor"; article: ArticleKey; floor: number; direction: VoteDirection }
  | { type: "withdraw-floor-vote"; article: ArticleKey; floor: number; direction: VoteDirection };

export type ActionReceipt =
  | { ok: true; outcome: "sent" }
  | {
      ok: false;
      code: string;
      message: string;
      outcome: "not-sent";
      retryable: boolean;
      cause?: unknown;
      serverDetail?: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
      outcome: "sent" | "uncertain";
      retryable: false;
      cause?: unknown;
      serverDetail?: string;
    };

export interface PttGateway {
  connect(): Promise<void>;
  login(input: LoginInput): Promise<Session>;
  disconnect(): Promise<void>;

  listBoards(input?: ListBoardsInput): Promise<BoardListPage>;
  searchBoards(input: SearchBoardsInput): Promise<BoardPage>;
  filterBoards(input: FilterBoardsInput): Promise<BoardPage>;
  listArticles(input: ListArticlesInput): Promise<ArticlePage>;
  searchArticles(input: SearchArticlesInput): Promise<ArticlePage>;
  filterArticles(input: FilterArticlesInput): Promise<ArticlePage>;
  readArticle(input: GetArticleInput): AsyncIterable<RawArticleSource>;

  execute(command: PttCommand): Promise<ActionReceipt>;
  subscribe(listener: (event: GatewayEvent) => void): Unsubscribe;
}
```

`PttGateway` 是真實 browser 與 fake 實作共同遵守的唯一公開 gateway contract。真實 terminal driver 可在 browser package 內部使用 positional args、raw floor 與 screen helpers，但不由 package exports 公開。`@pttzzz/browser` root 只提供 `createBrowserGateway()`、`createBrowserClient()` 與穩定 browser types；一般 UI 無法取得任意 `send()`。

Gateway 可在 `PttCommand` 使用 raw floor，因為它負責 terminal transport；`PttzzzClient` 必須先用內部 map 將 `replyId` 解析成樓號，一般 UI 永遠不能直接提供 raw floor。Gateway 不把 terminal keys 或 prompt 判讀洩漏給 core/UI。

`edit-floor.floor` 必須是單一正整數 anchor。`withdraw-floor.ranges` 必須是非空、正整數且各自連續的閉區間；不連續樓號必須拆成不同 range，例如 2 樓與 4 樓是 `[{ start: 2, end: 2 }, { start: 4, end: 4 }]`，不得格式化成 `2~4`。Gateway 逐 range 送出並保留部分成功的安全 outcome。

`reply-article` 是 PTT 推文／註解操作；`reply-article-to-board` 是 PTT 原生「回應至看板」並建立另一篇文章，兩者不得互相代替。`edit-article` 只攜帶更新後的正文；編輯紀錄沿用 PTT 原生機制。index 與 AID article key 都必須保持原表示完成定位。`create-article.category` 可省略，表示使用看板無分類／預設分類流程；若指定則必須原樣傳給 PTT 分類選擇。

每個 terminal write workflow 都必須標出不可逆邊界：確認鍵送出前的失敗為 `not-sent`；送出 save/delete/content confirmation 後但無法確認結果為 `uncertain`；未標註的 legacy/未知失敗一律安全降級為 `uncertain`，不得推測成 `not-sent` 或自動重送。`not-sent` 預設也不可重試，只有 driver 明確標示為安全、暫時性的 pre-send failure（例如尚未取得推文輸入 prompt）才可設 `retryable: true`；輸入錯誤、找不到文章、身分過期與權限拒絕一律為 false。事件 listener 的例外逐 listener 隔離，不得阻止後續 listener、terminal progress 或 gateway operation。

index 寫入必須先從實際看板分頁取得該 index 的作者／標題，再開文比對；不可只檢查目前 24 行。AID 寫入必須從 PTT `Q` 文章資訊畫面解析 canonical AID 與看板並在寫入前核對，返回文章頁後才可送 `X`／`E`／`d`／`y` 等寫入鍵。同一 locator 自行讀出再自行當作 expected identity，不構成獨立驗證。

### Gateway method behavior matrix

Gateway 的 connect／login／read method 對可預期失敗 throw `GatewayError`；client 將其正規化為同 code 的 `CoreError`，未知 throw 才成為 `GATEWAY_FAILURE`。Gateway disconnect 的預期 `GatewayError` 由 client 在清除 local state 後吸收，未知程式錯誤仍可 throw。可預期的寫入 transport／PTT 拒絕則回傳 `ok: false` 的 `ActionReceipt`；required `code`、`message`、`outcome`、`retryable` 足以讓 core 正規化為 `CoreError`。`ok: true` 只允許 `outcome: "sent"`；失敗結果只有 `outcome: "not-sent"` 可將 `retryable` 設為 `true`，`sent` 與 `uncertain` 在型別上固定為 `false`。下表中的「否」表示該 method 不會產生該性質，「不適用」表示不是寫入。

| Method | Input | Success | Expected errors / failures | `uncertain` | Partial |
| --- | --- | --- | --- | --- | --- |
| `connect` | none | connection established (`void`) | socket unavailable, handshake rejected, connection loss, timeout, gateway failure | 不適用 | 否 |
| `login` | `LoginInput` | `Session` | invalid input, not connected, invalid credentials, duplicate login, permission prompt, connection loss, timeout, gateway failure | 不適用 | 否 |
| `disconnect` | none | resources released (`void`) | expected cleanup failure uses `GatewayError`; unknown programming failure may throw | 不適用 | 否 |
| `listBoards` | hot（default）、favorite 或 category source + paging | `BoardListPage` | invalid source/cursor, not connected, permission denied, connection loss, timeout, terminal state mismatch/gateway failure | 不適用 | 否 |
| `searchBoards` | name prefix + paging | `BoardPage` | invalid prefix/cursor, not connected, permission denied, connection loss, timeout, terminal state mismatch/gateway failure | 不適用 | 否 |
| `filterBoards` | favorite/category cursor + paging | `BoardPage` | missing filters, invalid cursor, not connected, permission denied, connection loss, timeout, terminal state mismatch/gateway failure | 不適用 | 否 |
| `listArticles` | board + paging | `ArticlePage` | invalid input, board missing, permission denied, not connected, connection loss, timeout, terminal state mismatch/gateway failure | 不適用 | 否 |
| `searchArticles` | board + query + paging | `ArticlePage` | invalid input, board missing, permission denied, not connected, connection loss, timeout, gateway failure | 不適用 | 否 |
| `filterArticles` | board + filters + paging | `ArticlePage` | invalid input, board missing, permission denied, not connected, connection loss, timeout, gateway failure | 不適用 | 否 |
| `readArticle` | `GetArticleInput`; `includeDebugMetadata` is explicit debug opt-in | `AsyncIterable<RawArticleSource>` ending in `final` | invalid input, article missing, permission denied, not connected, connection loss, timeout, terminal state mismatch/gateway failure | 不適用 | 是；可 yield 多個 `incomplete` revision |
| `execute` — article writes | create/edit/delete/reply-article commands | discriminated `ActionReceipt` | invalid input, missing article/board, permission denied, rate limit, rejected, not connected, connection loss, timeout, gateway failure | 是，僅 `ok: false` | 否 |
| `execute` — reply writes | reply/edit/withdraw floor commands | discriminated `ActionReceipt` | invalid/raw floor missing, missing article, permission denied, rate limit, rejected, not connected, connection loss, timeout, gateway failure | 是，僅 `ok: false` | 否 |
| `execute` — vote writes | article/floor vote and withdrawal commands | discriminated `ActionReceipt` | invalid/raw floor missing, missing article, permission denied, author vote forbidden, rate limit, rejected, not connected, connection loss, timeout, gateway failure | 是，僅 `ok: false` | 否 |
| `subscribe` | `GatewayEvent` listener | `Unsubscribe` | 否；listener exception 必須隔離 | 不適用 | 是；可接收 `article.source` |

## Stability

Package root 的公開型別遵循 semantic versioning；三層 export 邊界、stable `replyId`、partial revision、structured `Result`、write uncertainty 與 browser-only real connection 是設計約束。`@pttzzz/core/internal`、debug raw shape 與 gateway transport 細節不在一般 UI 相容性承諾內。
