import { articleKeyId, type Article, type PartialArticle, type ArticleKey, type ArticleSummary, type Board, type CoreEvent, type PttzzzClient, type Result } from "@pttzzz/core";

export interface ReaderState {
  view: "login" | "home" | "board" | "article";
  user: string | null;
  board: string;
  boards: readonly Board[];
  articles: readonly ArticleSummary[];
  boardCursor?: string;
  articleCursor?: string;
  article: Article | PartialArticle | null;
  requestedArticle?: ArticleKey;
  busy: boolean;
  authenticating: boolean;
  duplicate: boolean;
  ended: boolean;
  message: string;
  error: boolean;
}

const initial = (): ReaderState => ({
  view: "login", user: null, board: "", boards: [], articles: [], article: null,
  busy: false, authenticating: false, duplicate: false, ended: false, message: "尚未登入", error: false,
});

// The UI owns only reads and lifecycle, never wire commands or write operations.
type ReadClient = Pick<PttzzzClient, "connect" | "login" | "disconnect" | "subscribe" | "listBoards" | "listArticles" | "getArticle">;

export class Reader {
  state = initial();
  private generation = 0;
  private authGeneration = 0;
  private acceptSession = false;
  private activeKey: string | null = null;
  private unsubscribe = () => {};
  private activeClient?: ReadClient;
  private stopArticle?: () => void;

  constructor(private readonly source: ReadClient | (() => ReadClient), private readonly changed: () => void) {
    if (typeof source !== "function") {
      this.activeClient = source;
      this.unsubscribe = source.subscribe((event) => this.onEvent(event));
    }
  }

  private get client(): ReadClient {
    if (!this.activeClient) {
      this.activeClient = typeof this.source === "function" ? this.source() : this.source;
      this.unsubscribe = this.activeClient.subscribe((event) => this.onEvent(event));
    }
    return this.activeClient;
  }

  private onEvent(event: CoreEvent): void {
    if (event.type === "session.changed") {
      if (event.session && !this.acceptSession) return;
      if (!event.session) this.invalidateAuth();
      this.clear();
      this.state.user = event.session?.userId ?? null;
      this.state.view = event.session ? "home" : "login";
      this.state.message = event.session ? `已登入 ${event.session.userId}` : "連線已結束，請重新登入";
      this.changed();
    } else if (event.type === "connection.changed" && event.status === "disconnected") {
      this.invalidateAuth();
      this.clear();
      this.state.user = null;
      this.state.view = "login";
      this.state.message = "連線已中斷，請重新登入";
      this.changed();
    }
  }

  private invalidateAuth(): void {
    ++this.authGeneration;
    this.acceptSession = false;
    this.state.authenticating = false;
    this.state.duplicate = false;
    this.state.ended = true;
  }

  private clear(): void {
    ++this.generation;
    this.stopArticle?.();
    this.stopArticle = undefined;
    this.activeKey = null;
    Object.assign(this.state, { board: "", boards: [], articles: [], article: null, requestedArticle: undefined, boardCursor: undefined, articleCursor: undefined, busy: false });
  }

  private begin(view: ReaderState["view"], message: string, busy = true, article: ReaderState["article"] = null): number {
    ++this.generation;
    this.stopArticle?.();
    this.stopArticle = undefined;
    this.activeKey = null;
    Object.assign(this.state, { view, busy, message, error: false, article, requestedArticle: view === "article" ? this.state.requestedArticle : undefined });
    this.changed();
    return this.generation;
  }

  private finish<T>(generation: number, result: Result<T>, apply: (value: T) => void): void {
    if (generation !== this.generation) return;
    this.state.busy = false;
    if (result.ok) {
      apply(result.value);
      this.state.message = "讀取完成";
    } else {
      this.state.error = true;
      this.state.message = `${result.error.code}：${result.error.message}`;
    }
    this.changed();
  }

  async login(username: string, password: string, disconnectExistingSession = false): Promise<void> {
    if (this.state.authenticating || this.state.ended) return;
    const resumeDuplicate = this.state.duplicate;
    this.state.duplicate = false;
    const auth = ++this.authGeneration;
    this.clear();
    this.acceptSession = true;
    Object.assign(this.state, { user: null, view: "login", authenticating: true, error: false, message: "連線並登入中…" });
    this.changed();
    try {
      if (!resumeDuplicate) {
        const connected = await this.client.connect();
        if (auth !== this.authGeneration) return;
        if (!connected.ok) {
          this.state.ended = true;
          this.finish(this.generation, connected, () => undefined);
          return;
        }
      }
      const session = await this.client.login({ username: username.trim(), password, disconnectExistingSession });
      if (auth !== this.authGeneration) return;
      this.finish(this.generation, session, (value) => {
        this.clear();
        this.state.user = value.userId;
        this.state.view = "home";
      });
      if (!session.ok && session.error.message === "duplicate_login") {
        this.state.duplicate = true;
        this.state.message = "PTT 偵測到其他連線。請選擇保留或中斷；尚未自動處理。";
      } else if (!session.ok) {
        this.state.ended = true;
      }
    } catch (error) {
      if (auth === this.authGeneration) this.state.ended = true;
      throw error;
    } finally {
      if (auth === this.authGeneration) {
        this.state.authenticating = false;
        this.changed();
      }
    }
  }

  async hotBoards(more = false): Promise<void> {
    if (!this.state.user || (more && (!this.state.boardCursor || this.state.busy))) return;
    const cursor = more ? this.state.boardCursor : undefined;
    if (!more) { this.state.boards = []; this.state.boardCursor = undefined; }
    this.state.articles = [];
    this.state.articleCursor = undefined;
    this.state.board = "";
    const generation = this.begin("home", "讀取熱門看板…");
    const result = await this.client.listBoards({ source: { kind: "hot" }, cursor, limit: 30 });
    this.finish(generation, result, (page) => {
      const boards = page.kind === "boards" ? page.items : page.items.flatMap((entry) => entry.kind === "board" ? [entry.board] : []);
      this.state.boards = [...this.state.boards, ...boards];
      this.state.boardCursor = page.nextCursor;
    });
  }

  async openBoard(board: string): Promise<void> {
    if (!this.state.user) return;
    const name = board.trim();
    if (!/^[A-Za-z0-9_-]+$/.test(name)) {
      this.state.message = "請輸入有效的看板名稱（英文、數字、_ 或 -）";
      this.state.error = true;
      this.changed();
      return;
    }
    this.state.board = name;
    this.state.articles = [];
    this.state.articleCursor = undefined;
    await this.loadArticles();
  }

  async moreArticles(): Promise<void> {
    if (!this.state.user || !this.state.articleCursor || this.state.busy) return;
    await this.loadArticles(this.state.articleCursor);
  }

  returnToBoard(): void {
    if (!this.state.user || this.state.view !== "article") return;
    // Returning keeps this board's loaded pages and opaque cursor, but ends the article read.
    this.begin("board", "已返回文章列表", false);
  }

  private async loadArticles(cursor?: string): Promise<void> {
    const board = this.state.board;
    const generation = this.begin("board", "讀取文章列表…");
    const result = await this.client.listArticles({ board, cursor, limit: 30 });
    this.finish(generation, result, (page) => {
      const existing = new Set(this.state.articles.map((item) => articleKeyId(item.key)));
      this.state.articles = [...this.state.articles, ...page.items.filter((item) => !existing.has(articleKeyId(item.key)))];
      this.state.articleCursor = page.nextCursor;
    });
  }

  async openArticle(key: ArticleKey): Promise<void> {
    if (!this.state.user) return;
    const retained = this.state.article && articleKeyId(this.state.article.key) === articleKeyId(key) ? this.state.article : null;
    const summary = this.state.articles.find((item) => articleKeyId(item.key) === articleKeyId(key));
    this.state.requestedArticle = key;
    this.state.board = key.board;
    const generation = this.begin("article", "讀取文章…", true, retained);
    this.activeKey = articleKeyId(key);
    const expectedKey = this.activeKey;
    let revision = -1;
    let final = false;
    const accept = (article: Article | PartialArticle) => {
      if (generation !== this.generation || final || articleKeyId(article.key) !== expectedKey || article.revision <= revision) return;
      revision = article.revision;
      final = article.completeness === "final";
      const previous = this.state.article;
      this.state.article = { ...article,
        title: article.title || previous?.title || summary?.title || "",
        author: article.author || previous?.author || summary?.author || "",
      };
      this.state.message = final ? "讀取完成" : "內文已載入，繼續整理回覆…";
      this.changed();
    };
    const stop = this.client.subscribe((event) => {
      if (event.type === "article.partial" || event.type === "article.updated") accept(event.article);
    });
    this.stopArticle = stop;
    try {
      const result = await this.client.getArticle({ article: key });
      if (!result.ok && generation === this.generation) {
        if (import.meta.env.DEV) console.warn("[minimal] Article read failed", result.error);
        this.state.busy = false;
        this.state.error = true;
        this.state.message = "文章未完整載入，請重新載入。";
        this.changed();
      } else this.finish(generation, result, accept);
    } catch (error) {
      // A departed article must not overwrite the current view through the UI error handler.
      if (generation === this.generation) throw error;
    } finally {
      stop();
      if (this.stopArticle === stop) this.stopArticle = undefined;
    }
  }

  async logout(): Promise<void> {
    this.invalidateAuth();
    this.clear();
    Object.assign(this.state, { user: null, view: "login", authenticating: true, message: "中斷連線中…", error: false });
    this.changed();
    try { await this.activeClient?.disconnect(); }
    finally { this.state.authenticating = false; this.state.message = "已登出"; this.changed(); }
  }

  async dispose(): Promise<void> {
    this.unsubscribe();
    await this.logout();
  }
}
