import {
  GatewayError,
  type ActionReceipt,
  type ArticleKey,
  type ArticlePage,
  type Board,
  type BoardListEntry,
  type BoardListPage,
  type BoardPage,
  type FilterArticlesInput,
  type FilterBoardsInput,
  type GatewayEvent,
  type GetArticleInput,
  type ListArticlesInput,
  type ListBoardsInput,
  type LoginInput,
  type PttCommand,
  type PttGateway,
  type RawArticleSource,
  type SearchArticlesInput,
  type SearchBoardsInput,
  type Session,
  type Unsubscribe,
} from "@pttzzz/core";
import {
  createTerminalDriver,
  type ActionResult,
  type TerminalDriver,
} from "./internal/terminalDriver.js";

export type GatewayTerminalDriver = TerminalDriver & {
  executeArticleCommand(
    command: Exclude<PttCommand, { type: "create-article" }>,
  ): Promise<ActionResult>;
  searchArticlesByAuthor(
    boardName: string,
    author: string,
    beforeIndex?: number,
  ): Promise<readonly import("@pttzzz/core/internal").ArticleSummary[]>;
  searchArticlesByAuthorAndKeywords(
    boardName: string,
    author: string,
    keywords: string[],
    beforeIndex?: number,
  ): Promise<readonly import("@pttzzz/core/internal").ArticleSummary[]>;
  readArticleSource(
    key: ArticleKey,
    emit: (source: Omit<RawArticleSource, "articleKey">) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  listBoardEntries(source: {
    kind: "hot" | "favorite" | "category";
    route?: readonly number[];
  }): Promise<readonly DriverBoardEntry[]>;
  searchBoardsByPrefix(prefix: string): Promise<readonly Board[]>;
};

type DriverStatus = "idle" | "connecting" | "connected" | "error" | "closed";
type DriverBoardEntry =
  | { kind: "board"; board: Board }
  | { kind: "category"; title: string; route: readonly number[] };
type DriverWriteResult =
  | { ok: true }
  | {
      ok: false;
      code: string;
      reason: string;
      outcome: "not-sent" | "sent" | "uncertain";
      retryable?: boolean;
    };
type DriverArticleQuery = {
  board: string;
  beforeIndex?: number;
  author?: string;
  keyword?: string;
  limit?: number;
};

/** Package-private transport seam. Exported from this module only for tests. */
export interface BrowserGatewayDriver {
  connect(): Promise<void>;
  login(username: string, password: string, disconnectExisting: boolean): Promise<{ ok: true } | { ok: false; reason: string }>;
  disconnect(): Promise<void>;
  subscribeStatus(listener: (status: DriverStatus) => void): Unsubscribe;
  readArticleSource(
    key: ArticleKey,
    emit: (source: Omit<RawArticleSource, "articleKey">) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  listBoards(source: { kind: "hot" | "favorite" | "category"; route?: readonly number[] }): Promise<readonly DriverBoardEntry[]>;
  searchBoards(prefix: string): Promise<readonly Board[]>;
  listArticles?(input: DriverArticleQuery): Promise<readonly {
    index: number;
    title: string;
    author: string;
    date: string;
  }[]>;
  execute(command: PttCommand): Promise<DriverWriteResult>;
}

type CursorValue =
  | { kind: "page"; signature: string; remaining: readonly unknown[]; layout?: "directory" }
  | { kind: "article-page"; signature: string; beforeIndex: number }
  | { kind: "category"; route: readonly number[] };

const positiveLimit = (limit?: number): number => {
  if (limit === undefined) return Number.POSITIVE_INFINITY;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new GatewayError("INVALID_INPUT", "limit 必須是正整數", false);
  }
  return limit;
};

function gatewayFailure(error: unknown): GatewayError {
  return error instanceof GatewayError
    ? error
    : new GatewayError("GATEWAY_FAILURE", "PTT gateway 操作失敗", true, error);
}

async function gatewayCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw gatewayFailure(error);
  }
}

export class BrowserPttGateway implements PttGateway {
  private readonly listeners = new Set<(event: GatewayEvent) => void>();
  private stopStatus?: Unsubscribe;
  private readonly cursors = new Map<string, CursorValue>();
  private cursorNamespace = crypto.randomUUID();
  private nextCursor = 1;

  constructor(private readonly driver: BrowserGatewayDriver) {}

  async connect(): Promise<void> {
    try {
      await this.driver.connect();
    } catch (error) {
      throw gatewayFailure(error);
    }
  }

  async login(input: LoginInput): Promise<Session> {
    const result = await gatewayCall(() => this.driver.login(
      input.username,
      input.password,
      input.disconnectExistingSession ?? false,
    ));
    if (!result.ok) {
      throw new GatewayError("LOGIN_FAILED", result.reason, false);
    }
    this.resetCursors(true);
    const session = { userId: input.username };
    this.emit({ type: "session.changed", session });
    return session;
  }

  async disconnect(): Promise<void> {
    try {
      await gatewayCall(() => this.driver.disconnect());
    } finally {
      this.resetCursors(true);
      this.emit({ type: "session.changed", session: null });
    }
  }

  async listBoards(input: ListBoardsInput = {}): Promise<BoardListPage> {
    const source = input.source ?? { kind: "hot" as const };
    const route = source.kind === "category" && source.categoryCursor
      ? this.categoryRoute(source.categoryCursor)
      : undefined;
    const limit = positiveLimit(input.limit);
    const signature = JSON.stringify(["list", source.kind, route ?? null, limit]);
    const cursorPage = input.cursor ? this.pageCursor(input.cursor, signature) : undefined;
    const entries = cursorPage
      ? cursorPage.remaining as readonly DriverBoardEntry[]
      : await gatewayCall(() => this.driver.listBoards({ kind: source.kind, route }));
    const isDirectory = cursorPage?.layout === "directory" || entries.some((entry) => entry.kind === "category");
    const page = this.page(entries, limit, signature, isDirectory ? "directory" : undefined);
    if (isDirectory) {
      return {
        kind: "directory",
        items: page.items.map((entry): BoardListEntry => entry.kind === "board"
          ? entry
          : {
              kind: "category",
              title: entry.title,
              categoryCursor: this.issue({ kind: "category", route: entry.route }),
            }),
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      };
    }
    return {
      kind: "boards",
      items: page.items.flatMap((entry) => entry.kind === "board" ? [entry.board] : []),
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  }

  async searchBoards(input: SearchBoardsInput): Promise<BoardPage> {
    const prefix = input.prefix.trim();
    if (!prefix) throw new GatewayError("INVALID_INPUT", "prefix 不可為空", false);
    const limit = positiveLimit(input.limit);
    const signature = JSON.stringify(["search", prefix.toLowerCase(), limit]);
    const items = input.cursor
      ? this.remaining<Board>(input.cursor, signature)
      : await gatewayCall(() => this.driver.searchBoards(prefix));
    return this.boardPage(
      items,
      limit,
      signature,
    );
  }

  async filterBoards(input: FilterBoardsInput): Promise<BoardPage> {
    if (!input.favorite && !input.categoryCursor) {
      throw new GatewayError(
        "INVALID_INPUT",
        "filterBoards 至少需要 favorite 或 categoryCursor",
        false,
      );
    }
    const route = input.categoryCursor ? this.categoryRoute(input.categoryCursor) : undefined;
    const limit = positiveLimit(input.limit);
    const signature = JSON.stringify(["filter", input.favorite ?? false, route ?? null, limit]);
    if (input.cursor) {
      return this.boardPage(this.remaining<Board>(input.cursor, signature), limit, signature);
    }
    const category = route
      ? (await gatewayCall(() => this.driver.listBoards({ kind: "category", route })))
          .flatMap((entry) => entry.kind === "board" ? [entry.board] : [])
      : undefined;
    const favorite = input.favorite
      ? (await gatewayCall(() => this.driver.listBoards({ kind: "favorite" })))
          .flatMap((entry) => entry.kind === "board" ? [entry.board] : [])
      : undefined;
    const boards = category && favorite
      ? favorite.filter((board) => category.some((candidate) => candidate.name.toLowerCase() === board.name.toLowerCase()))
      : category ?? favorite ?? [];
    return this.boardPage(boards, limit, signature);
  }

  listArticles(input: ListArticlesInput): Promise<ArticlePage> {
    return this.articlePage(input, "list");
  }
  searchArticles(input: SearchArticlesInput): Promise<ArticlePage> {
    return this.articlePage(input, "search");
  }
  filterArticles(input: FilterArticlesInput): Promise<ArticlePage> {
    return this.articlePage(input, "filter");
  }

  async *readArticle(input: GetArticleInput): AsyncIterable<RawArticleSource> {
    let pendingPartial: RawArticleSource | undefined;
    let pendingFinal: RawArticleSource | undefined;
    let wake: (() => void) | undefined;
    let done = false;
    let failure: unknown;
    const controller = new AbortController();
    const driverTask = this.driver.readArticleSource(input.article, (source) => {
      if (controller.signal.aborted) return;
      const next = { ...source, articleKey: input.article };
      if (source.completeness === "final") pendingFinal = next;
      else pendingPartial = next;
      wake?.();
      wake = undefined;
    }, controller.signal).then(() => {
      done = true;
      wake?.();
    }, (error: unknown) => {
      failure = error;
      done = true;
      wake?.();
    });

    try {
      while (!done || pendingPartial || pendingFinal) {
        if (!pendingPartial && !pendingFinal) {
          await new Promise<void>((resolve) => { wake = resolve; });
        }
        const source = pendingPartial ?? pendingFinal;
        if (source === pendingPartial) pendingPartial = undefined;
        else pendingFinal = undefined;
        if (source) {
          this.emit({ type: "article.source", source });
          yield source;
        }
      }
      if (failure) throw gatewayFailure(failure);
    } finally {
      controller.abort();
      try {
        await driverTask;
      } catch {
        // Cancellation/failure is surfaced by the iteration path; cleanup must finish first.
      }
      wake?.();
      wake = undefined;
    }
  }

  async execute(command: PttCommand): Promise<ActionReceipt> {
    if (command.type === "edit-floor" && (!Number.isInteger(command.floor) || command.floor <= 0)) {
      return {
        ok: false,
        code: "INVALID_INPUT",
        message: "編輯樓號必須是正整數",
        outcome: "not-sent",
        retryable: false,
      };
    }
    let result: DriverWriteResult;
    try {
      result = await this.driver.execute(command);
    } catch (cause) {
      return {
        ok: false,
        code: "GATEWAY_FAILURE",
        message: "無法確認操作是否已送出",
        outcome: "uncertain",
        retryable: false,
        cause,
      };
    }
    if (result.ok) return { ok: true, outcome: "sent" };
    if (result.outcome === "not-sent") {
      return {
        ok: false,
        code: result.code,
        message: result.reason,
        outcome: "not-sent",
        retryable: result.retryable ?? false,
      };
    }
    return {
      ok: false,
      code: result.code,
      message: result.reason,
      outcome: result.outcome,
      retryable: false,
    };
  }

  subscribe(listener: (event: GatewayEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    if (!this.stopStatus) {
      this.stopStatus = this.driver.subscribeStatus((status) => {
        const mapped = status === "closed" || status === "idle" || status === "error"
          ? "disconnected"
          : status;
        this.emit({ type: "connection.changed", status: mapped });
      });
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stopStatus?.();
        this.stopStatus = undefined;
      }
    };
  }

  private emit(event: GatewayEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A consumer callback must not break transport progress or other consumers.
      }
    }
  }

  private resetCursors(rotate = false): void {
    this.cursors.clear();
    if (rotate) {
      this.cursorNamespace = crypto.randomUUID();
      this.nextCursor = 1;
    }
  }

  private issue(value: CursorValue): string {
    const cursor = `pttzzz:${this.cursorNamespace}:${this.nextCursor++}`;
    this.cursors.set(cursor, value);
    return cursor;
  }

  private cursor(cursor: string): CursorValue {
    const value = this.cursors.get(cursor);
    if (!value) throw new GatewayError("INVALID_CURSOR", "cursor 已失效或不屬於目前 session", false);
    return value;
  }

  private categoryRoute(cursor: string): readonly number[] {
    const value = this.cursor(cursor);
    if (value.kind !== "category") throw new GatewayError("INVALID_CURSOR", "cursor 不是分類位置", false);
    return value.route;
  }

  private remaining<T>(cursor: string, signature: string): readonly T[] {
    return this.pageCursor(cursor, signature).remaining as readonly T[];
  }

  private pageCursor(cursor: string, signature: string): Extract<CursorValue, { kind: "page" }> {
    const value = this.cursor(cursor);
    if (value.kind !== "page" || value.signature !== signature) {
      throw new GatewayError("INVALID_CURSOR", "cursor 與此次查詢不相容", false);
    }
    return value;
  }

  private page<T>(items: readonly T[], limit: number, signature: string, layout?: "directory") {
    const selected = items.slice(0, limit);
    const remaining = items.slice(selected.length);
    return {
      items: selected,
      nextCursor: remaining.length
        ? this.issue({ kind: "page", signature, remaining, ...(layout ? { layout } : {}) })
        : undefined,
    };
  }

  private boardPage(items: readonly Board[], limit: number, signature: string): BoardPage {
    const page = this.page(items, limit, signature);
    return {
      kind: "boards",
      items: page.items,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  }

  private async articlePage(
    input: ListArticlesInput | SearchArticlesInput | FilterArticlesInput,
    mode: "list" | "search" | "filter",
  ): Promise<ArticlePage> {
    if (!this.driver.listArticles) throw new GatewayError("NOT_SUPPORTED", "文章清單尚未支援", false);
    const keyword = ("query" in input
      ? input.query
      : "keyword" in input
        ? input.keyword
        : undefined)?.trim();
    const author = ("author" in input ? input.author : undefined)?.trim();
    if (mode === "search" && !keyword) {
      throw new GatewayError("INVALID_INPUT", "文章搜尋 query 不可為空", false);
    }
    if (mode === "filter" && !author && !keyword) {
      throw new GatewayError("INVALID_INPUT", "文章篩選至少需要 author 或 keyword", false);
    }
    const limit = positiveLimit(input.limit ?? 20);
    const signature = JSON.stringify([
      "articles", mode, input.board, author ?? null, keyword ?? null, limit,
    ]);
    let beforeIndex: number | undefined;
    if (input.cursor) {
      const value = this.cursor(input.cursor);
      if (value.kind !== "article-page" || value.signature !== signature) {
        throw new GatewayError("INVALID_CURSOR", "cursor 與此次文章查詢不相容", false);
      }
      beforeIndex = value.beforeIndex;
    }
    const rows = await gatewayCall(() => this.driver.listArticles!({
      board: input.board,
      ...(beforeIndex ? { beforeIndex } : {}),
      ...(author ? { author } : {}),
      ...(keyword ? { keyword } : {}),
      limit: limit + 1,
    }));
    const selected = rows.slice(0, limit);
    const last = selected[selected.length - 1];
    return {
      items: selected.map((row) => ({
        key: { board: input.board, index: row.index },
        title: row.title,
        author: row.author,
        publishedAt: row.date,
      })),
      ...(last && rows.length > selected.length
        ? { nextCursor: this.issue({ kind: "article-page", signature, beforeIndex: last.index }) }
        : {}),
    };
  }
}

function normalizeWrite(result: ActionResult): DriverWriteResult {
  if (result.ok) return { ok: true };
  return {
    ok: false,
    code: result.code ?? "ACTION_FAILED",
    reason: result.reason ?? "PTT 操作失敗",
    outcome: result.outcome ?? "uncertain",
    ...(result.retryable !== undefined ? { retryable: result.retryable } : {}),
  };
}

function terminalGatewayDriver(driver: GatewayTerminalDriver): BrowserGatewayDriver {
  return {
    connect: async () => {
      const current = driver.getStatus();
      if (current === "connected") return;
      if (current === "error" || current === "closed") {
        throw new GatewayError("CONNECTION_FAILED", "無法連線 PTT", true);
      }
      await new Promise<void>((resolve, reject) => {
        let stop: Unsubscribe = () => undefined;
        const timeout = setTimeout(() => {
          stop();
          reject(new GatewayError("CONNECT_TIMEOUT", "連線 PTT 逾時", true));
        }, 15_000);
        stop = driver.subscribeStatus((status) => {
          if (status === "connected") {
            clearTimeout(timeout);
            stop();
            resolve();
          } else if (status === "error" || status === "closed") {
            clearTimeout(timeout);
            stop();
            reject(new GatewayError("CONNECTION_FAILED", "無法連線 PTT", true));
          }
        });
      });
    },
    login: (username, password, disconnectExisting) => driver.login(username, password, disconnectExisting),
    disconnect: () => driver.disconnect(),
    subscribeStatus: (listener) => driver.subscribeStatus(listener),
    readArticleSource: async (key, emit, signal) => driver.readArticleSource(key, emit, signal),
    listBoards: (source) => driver.listBoardEntries(source),
    searchBoards: (prefix) => driver.searchBoardsByPrefix(prefix),
    listArticles: async (input) => {
      const rows: Awaited<ReturnType<TerminalDriver["listArticles"]>> = [];
      let beforeIndex = input.beforeIndex;
      const target = input.limit ?? 20;
      while (rows.length < target) {
        const batch = input.author && input.keyword
          ? await driver.searchArticlesByAuthorAndKeywords(
              input.board, input.author, [input.keyword], beforeIndex,
            )
          : input.author
            ? await driver.searchArticlesByAuthor(input.board, input.author, beforeIndex)
            : input.keyword
              ? await driver.searchArticles(input.board, input.keyword, beforeIndex)
              : await driver.listArticles(input.board, beforeIndex);
        const fresh = batch.filter((row) => !rows.some((seen) => seen.index === row.index));
        rows.push(...fresh);
        const last = batch[batch.length - 1];
        if (!last || fresh.length === 0) break;
        beforeIndex = last.index;
      }
      return rows;
    },
    execute: async (command) => {
      let result: ActionResult;
      switch (command.type) {
        case "create-article":
          return normalizeWrite(await driver.postArticle(
            command.board,
            command.category ?? "",
            command.title,
            command.content,
          ));
        case "withdraw-floor": {
          if (!command.ranges.length || command.ranges.some(({ start, end }) =>
            !Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end < start)) {
            return { ok: false, code: "INVALID_INPUT", reason: "撤回範圍無效", outcome: "not-sent" };
          }
          result = await driver.executeArticleCommand(command);
          break;
        }
        default:
          result = await driver.executeArticleCommand(command); break;
      }
      return normalizeWrite(result);
    },
  };
}

/** @internal Test seam; not exported from the package root. */
export const createTerminalGatewayDriverForTesting = terminalGatewayDriver;

export function createBrowserGateway(): PttGateway {
  return new BrowserPttGateway(
    terminalGatewayDriver(createTerminalDriver() as GatewayTerminalDriver),
  );
}
