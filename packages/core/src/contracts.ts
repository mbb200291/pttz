import type { ArticleEditRecord, ArticleRevision } from "./parser.js";
import type { AggregatedPush } from "./pushAggregator.js";

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

/** Expected failure reported by a transport gateway read or lifecycle method. */
export class GatewayError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export type Unsubscribe = () => void;

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function fail<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export type ArticleKey =
  | { board: string; index: number; aid?: never }
  | { board: string; aid: string; index?: never };

export function articleKeyId(key: ArticleKey): string {
  return "index" in key
    ? JSON.stringify([key.board, "index", key.index])
    : JSON.stringify([key.board, "aid", key.aid]);
}

export type ReplyId = string;
export type VoteDirection = "push" | "boo";
export type PushType = "push" | "boo" | "neutral";
export type ArticleCompleteness = "incomplete" | "final";

export interface VoteSummary {
  pushCount: number;
  booCount: number;
  score: number;
  viewerVote?: VoteDirection;
}

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
  /** Source-provided date text. Board listings may contain only month/day. */
  publishedAt?: string;
  nativeScore?: number;
  nativeScoreLabel?: string;
  pinned?: boolean;
  mark?: string;
}

export interface ArticlePage {
  items: readonly ArticleSummary[];
  nextCursor?: string;
}

export interface EditRecord {
  kind: "append" | "replace" | "withdraw";
  author: string;
  content: string;
  resultContent: string;
  createdAt?: string;
}

export interface ArticleEdit {
  marker: string;
  content: string;
  sequence: number;
}

export interface ArticleRevisionRecord {
  summary: string;
  sequence: number;
}

export interface ReplyMetadata {
  sourceFloors?: readonly number[];
  raw?: unknown;
}

export interface Reply {
  replyId: ReplyId;
  author: string;
  content: string;
  pushType: PushType;
  createdAt?: string;
  replyTo?: ReplyId;
  depth: number;
  votes: VoteSummary;
  /** @deprecated Use votes.score. */
  score: number;
  /** @deprecated Use votes.viewerVote. */
  viewerVote?: VoteDirection;
  isOp: boolean;
  visible: boolean;
  /** Initial snapshot before edits, when retained by the source. Not an edit operation. */
  originalVersion?: { content: string; createdAt?: string };
  edits: readonly EditRecord[];
  children: readonly Reply[];
  metadata?: ReplyMetadata;
}

export interface Article extends ArticleSummary {
  completeness: "final";
  revision: number;
  body: string;
  replies: readonly Reply[];
  articleEdits: readonly ArticleEdit[];
  revisions: readonly ArticleRevisionRecord[];
  nativePushCount: number;
  nativeBooCount: number;
  nativeNeutralCount: number;
  nativeVotes: VoteSummary;
  articleVotes: VoteSummary;
  /** @deprecated Use articleVotes.viewerVote. */
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
  articleEdits?: readonly ArticleEdit[];
  revisions?: readonly ArticleRevisionRecord[];
  nativePushCount?: number;
  nativeBooCount?: number;
  nativeNeutralCount?: number;
  nativeVotes?: VoteSummary;
  articleVotes?: VoteSummary;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

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
  | { type: "operation.progress"; operationId: string; phase: string };

export interface LoginInput {
  username: string;
  password: string;
  disconnectExistingSession?: boolean;
}

export type BoardListSource =
  | { kind: "hot" }
  | { kind: "favorite" }
  | { kind: "category"; categoryCursor?: string };

export interface ListBoardsInput {
  source?: BoardListSource;
  cursor?: string;
  limit?: number;
}

export interface SearchBoardsInput {
  prefix: string;
  cursor?: string;
  limit?: number;
}

type BoardFilterPage = { cursor?: string; limit?: number };

export type FilterBoardsInput = BoardFilterPage &
  (
    | { favorite: true; categoryCursor?: string }
    | { favorite?: true; categoryCursor: string }
  );
export interface ListArticlesInput { board: string; cursor?: string; limit?: number }
export interface SearchArticlesInput { board: string; query: string; cursor?: string; limit?: number }
export interface FilterArticlesInput { board: string; author?: string; keyword?: string; minimumNativeScore?: number; cursor?: string; limit?: number }
export interface GetArticleInput { article: ArticleKey; includeDebugMetadata?: boolean }
/** Presentation offsets are UTF-16, start-inclusive/end-exclusive, not reply-edit indices. */
export interface ArticleTextStyle { start: number; end: number; bold?: boolean; color?: 30 | 31 | 32 | 33 | 34 | 35 | 36 | 37; backgroundColor?: 40 | 41 | 42 | 43 | 44 | 45 | 46 | 47 }
export interface CreateArticleInput { board: string; category?: string; title: string; content: string; formatting?: readonly ArticleTextStyle[] }
export interface EditArticleInput { article: ArticleKey; content: string; formatting?: readonly ArticleTextStyle[] }
export interface DeleteArticleInput { article: ArticleKey }
export interface ReplyToArticleInput { article: ArticleKey; content: string; pushType: PushType }
export interface ReplyArticleToBoardInput { article: ArticleKey; content: string; formatting?: readonly ArticleTextStyle[] }
export interface ReplyToReplyInput { article: ArticleKey; replyId: ReplyId; content: string; pushType: PushType }
export interface SectionChange { start: number; end: number; replacement: string }
export type EditReplyInput =
  | { article: ArticleKey; replyId: ReplyId; mode: "append" | "replace"; content: string }
  | { article: ArticleKey; replyId: ReplyId; mode: "section"; changes: readonly SectionChange[] };
export interface WithdrawReplyInput { article: ArticleKey; replyId: ReplyId }
export interface VoteArticleInput { article: ArticleKey; direction: VoteDirection }
export interface WithdrawArticleVoteInput { article: ArticleKey; direction: VoteDirection }
export interface VoteReplyInput { article: ArticleKey; replyId: ReplyId; direction: VoteDirection }
export interface WithdrawReplyVoteInput { article: ArticleKey; replyId: ReplyId; direction: VoteDirection }

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
  | ({ type: "create-article" } & CreateArticleInput)
  | ({ type: "edit-article" } & EditArticleInput)
  | { type: "delete-article"; article: ArticleKey }
  | { type: "reply-article"; article: ArticleKey; content: string; pushType: PushType }
  | ({ type: "reply-article-to-board" } & ReplyArticleToBoardInput)
  | { type: "reply-floor"; article: ArticleKey; floor: number; content: string; pushType: PushType }
  | { type: "edit-floor"; article: ArticleKey; floor: number; mode: "append" | "replace"; content: string }
  | { type: "edit-floor"; article: ArticleKey; floor: number; mode: "section"; changes: readonly SectionChange[] }
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

// Compatibility DTOs retained while the current browser adapter moves packages.
export interface ArticleDebugDump {
  boardName: string;
  articleIndex: number;
  title: string;
  author: string;
  rawLineCount: number;
  firstLines: string[];
  lastLines: string[];
  parsedPushCount: number;
  parsedLastPushes: Array<{
    id: string;
    type: AggregatedPush["type"];
    author: string;
    content: string;
    time: string;
    replyTo: string | null;
    sourceFloors: number[];
  }>;
  articleNoteCount: number;
  articleNotes: ArticleEditRecord[];
  bottomStatusLine: string;
}

export interface ArticleData {
  title: string;
  author: string;
  date: string;
  board: string;
  body: string;
  pushes: AggregatedPush[];
  articleNotes: ArticleEditRecord[];
  revisions?: ArticleRevision[];
  revisionSourceBody?: string;
  score: number;
  nativePushCount: number;
  nativeBooCount: number;
  nativeNeutralCount: number;
  articlePushVoters: string[];
  articleBooVoters: string[];
  debug?: ArticleDebugDump;
}

export type AdapterArticleData = ArticleData;

export interface PartialArticleData {
  title: string;
  author: string;
  date: string;
  board: string;
  body: string;
  pushes?: AggregatedPush[];
  articleNotes?: ArticleEditRecord[];
  revisions?: ArticleRevision[];
  score?: number;
  nativePushCount?: number;
  nativeBooCount?: number;
  nativeNeutralCount?: number;
  articlePushVoters?: string[];
  articleBooVoters?: string[];
}
