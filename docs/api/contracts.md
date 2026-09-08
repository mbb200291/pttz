# PTTzzz 0.1 proposed public contracts

本文件描述 Goal 9 設計階段的公開契約，尚不代表套件已發布或介面已實作。後續 Task 會以 TypeScript、gateway contract tests 與現有 PTT workflow 驗證並微調名稱；語意規則以[核心規則白皮書](../whitepaper/pttzzz-core.md)為準，分層決策見[核心架構設計](../../dev-notes/goal-9-core-architecture-design.md)。

## Export 層級

### UI public exports

一般 UI 只從 `@pttzzz/core` package root 使用：

- `PttzzzClient`
- `Board`、`BoardListEntry`、`BoardListSource`、`BoardPage`、`ArticleKey`、`ArticleRef`、`ArticleSummary`、`ArticlePage`、`Article`、`PartialArticle`、`Reply` 等 DTO，以及 `articleKeyId`
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

UI-facing client 的預期 PTT 失敗以 `Result` 表示。Gateway 的 read／lifecycle method 以 `GatewayError` 傳遞可預期失敗；client 保留其 `code`、`message`、`retryable` 與 `cause` 並轉成 `CoreError`。未知 throw 才正規化成 `GATEWAY_FAILURE`。寫入仍只回傳 `ActionReceipt`，不可用 throw 取代已知的送出結果。寫入錯誤的 `outcome`：

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
}

export type BoardListEntry =
  | { kind: "board"; board: Board }
  | { kind: "category"; title: string; categoryCursor: string };

export interface BoardPage {
  items: readonly BoardListEntry[];
  nextCursor?: string;
}

export interface ArticleRef {
  key: ArticleKey;
}

export interface ArticleSummary extends ArticleRef {
  title: string;
  author: string;
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
  | { favorite: boolean; categoryCursor?: string }
  | { favorite?: boolean; categoryCursor: string }
);
export interface ListArticlesInput { board: string; cursor?: string; limit?: number }
export interface SearchArticlesInput { board: string; query: string; cursor?: string; limit?: number }
export interface FilterArticlesInput { board: string; author?: string; keyword?: string; cursor?: string; limit?: number }
export interface GetArticleInput { article: ArticleKey; includeDebugMetadata?: boolean }

export interface CreateArticleInput { board: string; title: string; content: string }
export interface EditArticleInput { article: ArticleKey; content: string }
export interface DeleteArticleInput { article: ArticleKey }
export interface ReplyToArticleInput { article: ArticleKey; content: string; pushType: PushType }
export interface ReplyToReplyInput { article: ArticleKey; replyId: ReplyId; content: string; pushType: PushType }
export interface EditReplyInput { article: ArticleKey; replyId: ReplyId; mode: "append" | "replace"; content: string }
export interface WithdrawReplyInput { article: ArticleKey; replyId: ReplyId }
export interface VoteArticleInput { article: ArticleKey; direction: VoteDirection }
export interface WithdrawArticleVoteInput { article: ArticleKey; direction: VoteDirection }
export interface VoteReplyInput { article: ArticleKey; replyId: ReplyId; direction: VoteDirection }
export interface WithdrawReplyVoteInput { article: ArticleKey; replyId: ReplyId; direction: VoteDirection }
```

input DTO 不接受 raw floor，也不接受預先格式化的 PTT 控制文字。`listBoards()` 未指定 source 時列熱門看板；favorite 與 category 是不同的 PTT 清單來源，分類頁可同時包含 board 與下一層 category entry。`searchBoards()` 只做看板名稱 prefix search，不是全文 query。`filterBoards()` 至少要有 `favorite` 或 `categoryCursor`，兩者同時存在時取交集。

`cursor` 與 `categoryCursor` 都是 gateway 發出的 opaque、session-scoped routing token。UI 只能原樣傳回同一 session，不可解析成 terminal offset、跨登入持久化或自行組合。

## `PttzzzClient`

```ts
export interface PttzzzClient {
  connect(): Promise<Result<void>>;
  login(input: LoginInput): Promise<Result<Session>>;
  disconnect(): Promise<void>;

  listBoards(input?: ListBoardsInput): Promise<Result<BoardPage>>;
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
| `disconnect` | none | `void` | best-effort cleanup; programming failures may throw | no | no |
| `listBoards` | hot（default）、favorite 或 category source + paging | `BoardPage` | `INVALID_INPUT`, `NOT_CONNECTED`, `PERMISSION_DENIED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | no | no |
| `searchBoards` | name prefix + paging | `BoardPage` | `INVALID_INPUT`, `NOT_CONNECTED`, `PERMISSION_DENIED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | no | no |
| `filterBoards` | favorite/category cursor + paging；兩者並存取交集 | `BoardPage` | `INVALID_INPUT`, `NOT_CONNECTED`, `PERMISSION_DENIED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | no | no |
| `listArticles` | board + paging | `ArticlePage` | `INVALID_INPUT`, `BOARD_NOT_FOUND`, `PERMISSION_DENIED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | no | no |
| `searchArticles` | board + query + paging | `ArticlePage` | `INVALID_INPUT`, `BOARD_NOT_FOUND`, `PERMISSION_DENIED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | no | no |
| `filterArticles` | board + filters + paging | `ArticlePage` | `INVALID_INPUT`, `BOARD_NOT_FOUND`, `PERMISSION_DENIED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | no | no |
| `getArticle` | `ArticleKey`, debug opt-in | final `Article`; `value.key` preserves the input representation | `INVALID_INPUT`, `ARTICLE_NOT_FOUND`, `PERMISSION_DENIED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | no | yes; partial/updated keys preserve the same input representation |
| `createArticle` | board, title, content | `void`；目前 gateway 無法可靠取得新文章 identity | `INVALID_INPUT`, `BOARD_NOT_FOUND`, `PERMISSION_DENIED`, `RATE_LIMITED`, `REJECTED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | yes | no |
| `editArticle` | article, content | `void` | `INVALID_INPUT`, `ARTICLE_NOT_FOUND`, `PERMISSION_DENIED`, `REJECTED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | yes | updated event may follow reload |
| `deleteArticle` | article | `void` | `INVALID_INPUT`, `ARTICLE_NOT_FOUND`, `PERMISSION_DENIED`, `REJECTED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | yes | no |
| `replyToArticle` | article, content, push type | `void` | `INVALID_INPUT`, `ARTICLE_NOT_FOUND`, `PERMISSION_DENIED`, `RATE_LIMITED`, `REJECTED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | yes | updated event may follow reload |
| `replyToReply` | article, `replyId`, content, push type | `void` | `INVALID_INPUT`, `ARTICLE_NOT_FOUND`, `REPLY_NOT_FOUND`, `PERMISSION_DENIED`, `RATE_LIMITED`, `REJECTED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | yes | updated event may follow reload |
| `editReply` | article, `replyId`, mode, content | `void` | `INVALID_INPUT`, `ARTICLE_NOT_FOUND`, `REPLY_NOT_FOUND`, `PERMISSION_DENIED`, `REJECTED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | yes | updated event may follow reload |
| `withdrawReply` | article, `replyId` | `void` | `INVALID_INPUT`, `ARTICLE_NOT_FOUND`, `REPLY_NOT_FOUND`, `PERMISSION_DENIED`, `REJECTED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | yes | updated event may follow reload |
| `voteArticle` | article, direction | `void` | `INVALID_INPUT`, `ARTICLE_NOT_FOUND`, `PERMISSION_DENIED`, `AUTHOR_VOTE_FORBIDDEN`, `RATE_LIMITED`, `REJECTED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | yes | updated event may follow reload |
| `withdrawArticleVote` | article, previous direction | `void` | `INVALID_INPUT`, `ARTICLE_NOT_FOUND`, `PERMISSION_DENIED`, `REJECTED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | yes | updated event may follow reload |
| `voteReply` | article, `replyId`, direction | `void` | `INVALID_INPUT`, `ARTICLE_NOT_FOUND`, `REPLY_NOT_FOUND`, `PERMISSION_DENIED`, `RATE_LIMITED`, `REJECTED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | yes | updated event may follow reload |
| `withdrawReplyVote` | article, `replyId`, previous direction | `void` | `INVALID_INPUT`, `ARTICLE_NOT_FOUND`, `REPLY_NOT_FOUND`, `PERMISSION_DENIED`, `REJECTED`, `NOT_CONNECTED`, `CONNECTION_LOST`, `TIMEOUT`, `GATEWAY_FAILURE` | yes | updated event may follow reload |
| `subscribe` | `CoreEvent` listener | `Unsubscribe` | listener exceptions are isolated | no | receives partial/update events |

表中的 expected errors 已逐 row 完整列出。`updated event may follow reload` 不保證寫入本身產生 partial；UI 若需確認應重新讀取。

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
  | { type: "create-article"; board: string; title: string; content: string }
  | { type: "edit-article"; article: ArticleKey; content: string }
  | { type: "delete-article"; article: ArticleKey }
  | { type: "reply-article"; article: ArticleKey; content: string; pushType: PushType }
  | { type: "reply-floor"; article: ArticleKey; floor: number; content: string; pushType: PushType }
  | { type: "edit-floor"; article: ArticleKey; floors: readonly number[]; mode: "append" | "replace"; content: string }
  | { type: "withdraw-floor"; article: ArticleKey; floors: readonly number[] }
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

  listBoards(input?: ListBoardsInput): Promise<BoardPage>;
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

`PttGateway` 是真實 browser 與 fake 實作共同遵守的唯一公開 gateway contract。真實 terminal driver 可在 `packages/browser/src/internal/` 使用 positional args、raw floor 與 screen helpers，但不由 package exports 公開。`@pttzzz/browser` root 最終只提供 `createBrowserGateway()`、`createBrowserClient()` 與穩定 browser types；一般 UI 無法取得任意 `send()`。

Gateway 可在 `PttCommand` 使用 raw floor，因為它負責 terminal transport；`PttzzzClient` 必須先用內部 map 將 `replyId` 解析成樓號，一般 UI 永遠不能直接提供 raw floor。Gateway 不把 terminal keys 或 prompt 判讀洩漏給 core/UI。

### Gateway method behavior matrix

Gateway 的 read／lifecycle method 對可預期失敗 throw `GatewayError`；client 將其正規化為同 code 的 `CoreError`，未知 throw 才成為 `GATEWAY_FAILURE`。可預期的寫入 transport／PTT 拒絕則回傳 `ok: false` 的 `ActionReceipt`；required `code`、`message`、`outcome`、`retryable` 足以讓 core 正規化為 `CoreError`。`ok: true` 只允許 `outcome: "sent"`；失敗結果只有 `outcome: "not-sent"` 可將 `retryable` 設為 `true`，`sent` 與 `uncertain` 在型別上固定為 `false`。下表中的「否」表示該 method 不會產生該性質，「不適用」表示不是寫入。

| Method | Input | Success | Expected errors / failures | `uncertain` | Partial |
| --- | --- | --- | --- | --- | --- |
| `connect` | none | connection established (`void`) | socket unavailable, handshake rejected, connection loss, timeout, gateway failure | 不適用 | 否 |
| `login` | `LoginInput` | `Session` | invalid input, not connected, invalid credentials, duplicate login, permission prompt, connection loss, timeout, gateway failure | 不適用 | 否 |
| `disconnect` | none | resources released (`void`) | cleanup failure；仍須盡力釋放資源 | 不適用 | 否 |
| `listBoards` | hot（default）、favorite 或 category source + paging | `BoardPage` | invalid source/cursor, not connected, permission denied, connection loss, timeout, terminal state mismatch/gateway failure | 不適用 | 否 |
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

0.1 implementation 前，型別名稱可因 TypeScript 驗證或現有 adapter 能力而小幅調整，但三層 export 邊界、stable `replyId`、partial revision、structured `Result`、write uncertainty 與 browser-only real connection 是設計約束。實作後 package root 的公開型別遵循 semantic versioning；`@pttzzz/core/internal`、debug raw shape 與 gateway transport 細節不在一般 UI 相容性承諾內。
