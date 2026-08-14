import Ptt from "ptt-client";
import sleep from "sleep-promise";
import type PttConfig from "ptt-client/dist/config";
import {
  aggregatePushes,
  calcArticleScore,
  type AggregatedPush,
} from "./pushAggregator";
import {
  extractArticleThreadEvents,
  formatPttzzzEditSummary,
  parsePushBuffer,
  splitArticleBody,
  splitArticleEditableContent,
  stripAnsi,
  type ArticleEditRecord,
  type ArticleRevision,
  type OpEditedReplySegment,
  type ArticleSummary,
  type RawPush,
} from "./parser";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "error"
  | "closed";

export type LoginFailureReason =
  | "guest_overload"
  | "login_rate_limited"
  | "invalid_credentials"
  | "unknown";

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: LoginFailureReason };

export type PushType = "push" | "neutral" | "boo";

export interface PttClientArticleRow {
  id: number;
  push?: string;
  date?: string;
  author?: string;
  status?: string;
  title?: string;
}

export interface HotBoardSummary {
  name: string;
  title: string;
  users: string;
}

interface PttBoardRow {
  id?: number;
  name: string;
  title: string;
  users: string;
}

export interface AdapterArticleData {
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
  debug?: ArticleDebugDump;
}

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
}

export interface ArticleFirstScreenSnapshot {
  partial: PartialArticleData;
  screenLines: string[];
}

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

export interface ArticleOpenTraceEvent {
  name: string;
  atMs: number;
  detail?: string;
}

export interface ArticleOpenTraceCandidate {
  source: "wait_first_screen" | "progressive";
  atMs: number;
  title: string;
  author: string;
  board: string;
  fingerprint: string;
  accepted: boolean;
  reason?: string;
  firstLines: string[];
}

export interface ArticleOpenTrace {
  boardName: string;
  articleIndex: number;
  startedAtIso: string;
  events: ArticleOpenTraceEvent[];
  partialCandidates: ArticleOpenTraceCandidate[];
  previousFingerprint: string | null;
  finalTitle?: string;
  finalAuthor?: string;
  finalBoard?: string;
}

export interface ActionResult {
  ok: boolean;
  reason?: string;
}

export interface EditArticleRequest {
  boardName: string;
  articleIndex: number;
  expectedAuthor: string;
  expectedTitle: string;
  body: string;
  editSummary: string;
}

export interface DeleteArticleRequest {
  boardName: string;
  articleIndex: number;
  articleAid?: string;
  expectedAuthor: string;
  expectedTitle: string;
}

export interface PttAdapter {
  send: (data: string) => Promise<boolean>;
  login: (
    username: string,
    password: string,
    kickOthers?: boolean,
  ) => Promise<LoginResult>;
  listArticles: (
    boardName: string,
    beforeIndex?: number,
  ) => Promise<ArticleSummary[]>;
  getArticle: (
    boardName: string,
    articleIndex: number,
    onPartial?: (partial: PartialArticleData) => void,
  ) => Promise<AdapterArticleData | null>;
  getArticleByAid: (
    boardName: string,
    aid: string,
    onPartial?: (partial: PartialArticleData) => void,
  ) => Promise<AdapterArticleData | null>;
  searchArticles: (
    boardName: string,
    keyword: string,
    beforeIndex?: number,
  ) => Promise<ArticleSummary[]>;
  searchArticlesByKeywords: (
    boardName: string,
    keywords: string[],
    beforeIndex?: number,
  ) => Promise<ArticleSummary[]>;
  filterArticlesByPush: (
    boardName: string,
    threshold: number,
    beforeIndex?: number,
  ) => Promise<ArticleSummary[]>;
  filterArticlesByTitleAndPush: (
    boardName: string,
    keywords: string[],
    threshold: number,
    beforeIndex?: number,
  ) => Promise<ArticleSummary[]>;
  listHotBoards: () => Promise<HotBoardSummary[]>;
  getFavoriteBoards: () => Promise<string[]>;
  getPostCategoryOptions: (boardName: string) => Promise<string[]>;
  replyToArticle: (
    content: string,
    pushType: PushType,
    boardName?: string,
  ) => Promise<{ ok: boolean }>;
  replyToPush: (
    floor: number,
    content: string,
    pushType: PushType,
    boardName?: string,
  ) => Promise<{ ok: boolean }>;
  voteArticle: (
    floor: number,
    kind: "push" | "boo",
    boardName?: string,
  ) => Promise<{ ok: boolean }>;
  votePush: (
    floor: number,
    kind: "push" | "boo",
    boardName?: string,
  ) => Promise<{ ok: boolean }>;
  postArticle: (
    board: string,
    category: string,
    title: string,
    body: string,
  ) => Promise<{ ok: boolean; reason?: string }>;
  editArticle: (request: EditArticleRequest) => Promise<ActionResult>;
  deleteArticle?: (request: DeleteArticleRequest) => Promise<ActionResult>;
  disconnect: () => Promise<void>;
  isLoggedIn: () => boolean;
  getStatus: () => ConnectionStatus;
  getLastScreen: () => string;
  subscribeStatus: (listener: (status: ConnectionStatus) => void) => () => void;
  subscribeScreen: (listener: (screen: string) => void) => () => void;
}

type BotLike = {
  state: { connect?: boolean; login?: boolean };
  _state?: {
    connect?: boolean;
    login?: boolean;
    position?: { boardname?: string };
  };
  searchCondition?: {
    conditions: unknown[] | null;
    init?: () => void;
    add?: (type: "push" | "author" | "title", criteria: string) => void;
  };
  socket?: { disconnect?: () => void };
  on: (event: string, listener: (...args: unknown[]) => void) => BotLike;
  send: (msg: string) => Promise<boolean>;
  getLines?: () => Promise<string[]>;
  enterBoardByName?: (boardName: string) => Promise<boolean>;
  enterBoardByOffset?: (offsets?: number[]) => Promise<boolean>;
  enterFavorite?: (offsets?: number[]) => Promise<boolean>;
  enterIndex?: () => Promise<boolean>;
  getArticles: (
    boardName: string,
    offset?: number,
  ) => Promise<PttClientArticleRow[]>;
  getArticle: (
    boardName: string,
    articleIndex: number,
  ) => Promise<{
    author?: string;
    title?: string;
    timestamp?: string;
    boardname?: string;
    lines?: string[];
  }>;
  getFavorite?: (offsets?: number | number[]) => Promise<PttBoardRow[]>;
  getLine?: (n: number) => { str?: string };
};

type ArticleFetchBot = Partial<
  Pick<
    BotLike,
    | "enterBoardByName"
    | "send"
    | "getLines"
    | "getLine"
    | "getArticle"
    | "enterIndex"
  >
>;

type BoardFetchBot = Partial<
  Pick<
    BotLike,
    "send" | "getLine" | "enterBoardByName" | "enterBoardByOffset" | "enterIndex"
  >
>;

type WriteBot = BoardFetchBot & Pick<ArticleFetchBot, "getLines">;

type LoginTerminalBot = Pick<BotLike, "send">;

interface LoginTerminalTimeouts {
  promptMs: number;
  passwordPromptMs: number;
  loginMs: number;
  pollMs: number;
  postSendMs: number;
}

interface LoginTerminalOptions {
  username: string;
  password: string;
  kickOthers: boolean;
  readSnapshot: () => string;
  markLoggedIn: () => void;
  timeouts?: Partial<LoginTerminalTimeouts>;
}

const PTT_KEY_PGDOWN = "\x1b[6~";
const PTT_KEY_HOME = "\x1b[1~";
const PTT_KEY_END = "\x1b[4~";
const PTT_KEY_CTRL_C = "\x03";
const PTT_KEY_CTRL_P = "\x10";
const PTT_KEY_CTRL_X = "\x18";
const PTT_KEY_CTRL_Y = "\x19";
const PTT_KEY_EDITOR_TOP = "\x1b,";
const MAX_ARTICLE_EDIT_LINES = 2000;
const MAX_BOARD_SCREEN_INDEX_GAP = 50000;

type AdapterDebugGlobal = typeof globalThis & {
  __pttzzzLastArticleOpenTrace?: ArticleOpenTrace | null;
};

const PTT_WS_URL = import.meta.env.DEV
  ? typeof location !== "undefined"
    ? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ptt-ws`
    : "ws://127.0.0.1:4173/ptt-ws"
  : "wss://ws.ptt.cc/bbs";

const DEFAULT_LOGIN_TIMEOUTS: LoginTerminalTimeouts = {
  promptMs: 5000,
  passwordPromptMs: 5000,
  loginMs: 15000,
  pollMs: 200,
  postSendMs: 300,
};

function isLoginPromptScreen(plain: string): boolean {
  return (
    plain.includes("請輸入代號") ||
    plain.includes("請輸入帳號") ||
    plain.toLowerCase().includes("login:")
  );
}

function isPasswordPromptScreen(plain: string): boolean {
  return (
    plain.includes("請輸入密碼") ||
    plain.includes("輸入密碼") ||
    /輸入.*密碼/u.test(plain) ||
    plain.toLowerCase().includes("password:")
  );
}

function isPressAnyKeyScreen(plain: string): boolean {
  return (
    plain.includes("按任意鍵繼續") ||
    plain.includes("請按任意鍵繼續") ||
    plain.includes("觀看最新文章")
  );
}

function isLoginSuccessScreen(plain: string): boolean {
  if (isLoginPromptScreen(plain) || isPasswordPromptScreen(plain)) {
    return false;
  }

  return (
    plain.includes("我是") ||
    plain.includes("主功能表") ||
    plain.includes("【主功能表】") ||
    plain.includes("【分類看板】") ||
    plain.includes("分類看板") ||
    plain.includes("批踢踢實業坊")
  );
}

function detectLoginFailureReasonFromScreen(plain: string): LoginFailureReason {
  if (
    plain.includes("請稍後再試") ||
    plain.includes("請勿頻繁登入以免造成系統過度負荷")
  ) {
    return "login_rate_limited";
  }

  if (
    (plain.includes("guest") && plain.includes("在站上")) ||
    plain.includes("目前 guest 在站人數過多")
  ) {
    return "guest_overload";
  }

  if (plain.includes("密碼不對或無此帳號")) {
    return "invalid_credentials";
  }

  return "unknown";
}

export async function loginThroughTerminal(
  bot: LoginTerminalBot,
  options: LoginTerminalOptions,
): Promise<LoginResult> {
  const timeouts = { ...DEFAULT_LOGIN_TIMEOUTS, ...options.timeouts };
  const readPlainSnapshot = () => stripAnsi(options.readSnapshot());

  const promptStartedAt = Date.now();
  while (Date.now() - promptStartedAt < timeouts.promptMs) {
    const plain = readPlainSnapshot();
    const failureReason = detectLoginFailureReasonFromScreen(plain);
    if (failureReason !== "unknown") return { ok: false, reason: failureReason };
    if (isLoginPromptScreen(plain) || isPasswordPromptScreen(plain)) break;
    if (isPressAnyKeyScreen(plain)) {
      await bot.send("\r");
      await sleep(timeouts.postSendMs);
      continue;
    }
    await sleep(timeouts.pollMs);
  }

  let plain = readPlainSnapshot();
  if (!isLoginPromptScreen(plain) && !isPasswordPromptScreen(plain)) {
    return { ok: false, reason: detectLoginFailureReasonFromScreen(readPlainSnapshot()) };
  }

  if (isLoginPromptScreen(plain) && !isPasswordPromptScreen(plain)) {
    await bot.send(`${options.username}\r`);
    await sleep(timeouts.postSendMs);

    const passwordPromptStartedAt = Date.now();
    while (Date.now() - passwordPromptStartedAt < timeouts.passwordPromptMs) {
      plain = readPlainSnapshot();
      const failureReason = detectLoginFailureReasonFromScreen(plain);
      if (failureReason !== "unknown") return { ok: false, reason: failureReason };
      if (isLoginSuccessScreen(plain)) {
        options.markLoggedIn();
        return { ok: true };
      }
      if (isPasswordPromptScreen(plain)) break;
      if (isPressAnyKeyScreen(plain)) {
        await bot.send("\r");
        await sleep(timeouts.postSendMs);
        continue;
      }
      await sleep(timeouts.pollMs);
    }
  }

  if (!isPasswordPromptScreen(readPlainSnapshot())) {
    return { ok: false, reason: detectLoginFailureReasonFromScreen(readPlainSnapshot()) };
  }

  await bot.send(`${options.password}\r`);
  await sleep(timeouts.postSendMs);

  const loginStartedAt = Date.now();
  while (Date.now() - loginStartedAt < timeouts.loginMs) {
    const plain = readPlainSnapshot();
    const failureReason = detectLoginFailureReasonFromScreen(plain);
    if (failureReason !== "unknown") return { ok: false, reason: failureReason };

    if (plain.includes("您想刪除其他重複登入的連線嗎")) {
      await bot.send(`${options.kickOthers ? "y" : "n"}\r`);
      await sleep(timeouts.postSendMs);
      continue;
    }
    if (isPressAnyKeyScreen(plain)) {
      await bot.send("\r");
      await sleep(timeouts.postSendMs);
      continue;
    }
    if (plain.includes("您要刪除以上錯誤嘗試的記錄嗎")) {
      await bot.send("y\r");
      await sleep(timeouts.postSendMs);
      continue;
    }
    if (plain.toLowerCase().includes("y/n") && !isLoginPromptScreen(plain)) {
      await bot.send("y\r");
      await sleep(timeouts.postSendMs);
      continue;
    }
    if (isLoginSuccessScreen(plain)) {
      options.markLoggedIn();
      return { ok: true };
    }

    await sleep(timeouts.pollMs);
  }

  return { ok: false, reason: detectLoginFailureReasonFromScreen(readPlainSnapshot()) };
}

class PttClientAdapter implements PttAdapter {
  private bot: BotLike;
  private status: ConnectionStatus = "connecting";
  private lastScreen = "";
  private readonly statusListeners = new Set<
    (status: ConnectionStatus) => void
  >();
  private readonly screenListeners = new Set<(screen: string) => void>();
  private readonly runSerial = createSerialTaskRunner();
  private lastFilterBoardName: string | null = null;
  private lastFilterConditions: Array<{
    type: "push" | "title";
    criteria: string;
  }> | null = null;

  constructor() {
    this.bot = this.createBot();
  }

  private createBot(): BotLike {
    const config: PttConfig = {
      name: "PTT",
      url: PTT_WS_URL,
      charset: "big5",
      origin: "app://pcman",
      protocol: "websocket",
      timeout: 40,
      blobSize: 1024,
      preventIdleTimeout: 30,
      terminal: {
        columns: 80,
        rows: 24,
      },
    };
    const bot = new Ptt(config) as unknown as BotLike;

    bot
      .on("connect", () => {
        this.setStatus("connected");
      })
      .on("disconnect", () => {
        this.setStatus("closed");
      })
      .on("error", () => {
        this.setStatus("error");
      })
      .on("redraw", (screen) => {
        if (typeof screen !== "string") return;
        this.lastScreen = screen;
        for (const listener of this.screenListeners) {
          listener(screen);
        }
      });

    this.setStatus("connecting");
    return bot;
  }

  async send(data: string): Promise<boolean> {
    return this.runSerial(async () => {
      await this.waitUntilConnected();
      return this.bot.send(data);
    });
  }

  async login(
    username: string,
    password: string,
    kickOthers = false,
  ): Promise<LoginResult> {
    return this.runSerial(async () => {
      await this.waitUntilConnected();

      try {
        return await loginThroughTerminal(this.bot, {
          username,
          password,
          kickOthers,
          readSnapshot: () => this.readTerminalSnapshot(),
          markLoggedIn: () => this.markLoggedIn(),
        });
      } catch {
        return { ok: false, reason: "unknown" };
      }
    });
  }

  async listArticles(
    boardName: string,
    beforeIndex?: number,
  ): Promise<ArticleSummary[]> {
    const wasFiltered = this.lastFilterBoardName !== null;
    this.lastFilterBoardName = null;
    this.lastFilterConditions = null;
    return this.runSerial(async () => {
      return fetchBoardArticlesFromBotManually(
        this.bot,
        boardName,
        beforeIndex ?? 0,
        wasFiltered,
      );
    });
  }

  async getArticle(
    boardName: string,
    articleIndex: number,
    onPartial?: (partial: PartialArticleData) => void,
  ): Promise<AdapterArticleData | null> {
    return this.runSerial(() => {
      if (onPartial) {
        return fetchArticleFromBotManually(this.bot, boardName, articleIndex, onPartial);
      }
      return fetchArticleFromBot(this.bot, boardName, articleIndex);
    });
  }

  async getArticleByAid(
    boardName: string,
    aid: string,
    onPartial?: (partial: PartialArticleData) => void,
  ): Promise<AdapterArticleData | null> {
    return this.runSerial(() => {
      const doFetch = async (): Promise<AdapterArticleData | null> =>
        fetchArticleByAidFromBotManually(this.bot, boardName, aid, onPartial);

      if (!onPartial) return doFetch();

      const screenHandler = (screen: string) => {
        const partial = parsePartialScreen(screen);
        if (partial) onPartial(partial);
      };
      this.screenListeners.add(screenHandler);
      return doFetch().finally(() => {
        this.screenListeners.delete(screenHandler);
      });
    });
  }

  private async listArticlesWithConditions(
    boardName: string,
    conditions: Array<{ type: "push" | "title"; criteria: string }>,
    beforeIndex?: number,
  ): Promise<ArticleSummary[]> {
    if (!this.bot.send || !this.bot.getLine) {
      throw new Error("Bot does not expose board navigation methods");
    }

    const conditionsKey = JSON.stringify(conditions);
    const currentScreen = readVisibleScreen(this.bot);
    const sameFilterActive =
      this.lastFilterBoardName === boardName &&
      JSON.stringify(this.lastFilterConditions) === conditionsKey &&
      isFilterModeScreen(currentScreen) &&
      extractCurrentBoardName(currentScreen)?.toLowerCase() ===
        boardName.toLowerCase();

    if (!sameFilterActive) {
      // Enter normal board mode first (exits filter mode or article view)
      const entered = await ensureNormalBoardView(this.bot, boardName, true);
      if (!entered) throw new Error(`無法進入看板 ${boardName}`);

      // Go to most recent articles
      await this.bot.send(`${PTT_KEY_END}${PTT_KEY_END}`);
      await sleep(150);

      // Apply filter conditions — stay in filter mode, do NOT call enterIndex
      for (const { type, criteria } of conditions) {
        const prefix = type === "push" ? "Z" : "/";
        await this.bot.send(`${prefix}${criteria}\r`);
        await sleep(350);
      }

      this.lastFilterBoardName = boardName;
      this.lastFilterConditions = conditions.map((c) => ({ ...c }));
    }

    // Navigate to beforeIndex within filter results if specified
    if (beforeIndex && beforeIndex > 0) {
      const offset = Math.max(beforeIndex - 9, 1);
      await this.bot.send(`${PTT_KEY_END}${PTT_KEY_END}${offset}\r`);
      await sleep(150);
    }

    const screen = readVisibleScreen(this.bot);
    return parsePartialBoardScreen(screen)
      .filter((a) => a.index > 0 && a.title.trim().length > 0)
      .sort((a, b) => b.index - a.index);
  }

  async searchArticles(
    boardName: string,
    keyword: string,
    beforeIndex?: number,
  ): Promise<ArticleSummary[]> {
    return this.runSerial(() =>
      this.listArticlesWithConditions(
        boardName,
        [{ type: "title", criteria: keyword }],
        beforeIndex,
      ),
    );
  }

  async searchArticlesByKeywords(
    boardName: string,
    keywords: string[],
    beforeIndex?: number,
  ): Promise<ArticleSummary[]> {
    return this.runSerial(() =>
      this.listArticlesWithConditions(
        boardName,
        keywords.map((keyword) => ({ type: "title", criteria: keyword })),
        beforeIndex,
      ),
    );
  }

  async filterArticlesByPush(
    boardName: string,
    threshold: number,
    beforeIndex?: number,
  ): Promise<ArticleSummary[]> {
    return this.runSerial(() =>
      this.listArticlesWithConditions(
        boardName,
        [{ type: "push", criteria: String(threshold) }],
        beforeIndex,
      ),
    );
  }

  async filterArticlesByTitleAndPush(
    boardName: string,
    keywords: string[],
    threshold: number,
    beforeIndex?: number,
  ): Promise<ArticleSummary[]> {
    return this.runSerial(() =>
      this.listArticlesWithConditions(
        boardName,
        [
          { type: "push", criteria: String(threshold) },
          ...keywords.map((keyword) => ({ type: "title" as const, criteria: keyword })),
        ],
        beforeIndex,
      ),
    );
  }

  async listHotBoards(): Promise<HotBoardSummary[]> {
    return this.runSerial(async () => {
      await this.waitUntilLoggedIn();
      await leaveArticleReaderIfNeeded(this.bot);
      return fetchHotBoardsFromBotManually(this.bot);
    });
  }

  async getFavoriteBoards(): Promise<string[]> {
    return this.runSerial(async () => {
      await this.waitUntilLoggedIn();
      try {
        const names = await fetchFavoriteBoardNamesFromBot(this.bot);
        if (import.meta.env.DEV) console.log("[getFavoriteBoards] Got", names.length, "favorites:", names);
        return names;
      } catch (err) {
        if (import.meta.env.DEV) console.log("[getFavoriteBoards] Error:", err);
        return [];
      }
    });
  }

  async getPostCategoryOptions(boardName: string): Promise<string[]> {
    return this.runSerial(async () => {
      await this.waitUntilLoggedIn();
      return fetchPostCategoryOptionsFromBot(this.bot, boardName);
    });
  }

  async replyToArticle(
    content: string,
    pushType: PushType,
    boardName?: string,
  ): Promise<{ ok: boolean }> {
    return this.runSerial(async () => {
      await this.waitUntilLoggedIn();
      return submitPushFromCurrentArticle(this.bot, content, pushType, boardName);
    });
  }

  async replyToPush(
    floor: number,
    content: string,
    pushType: PushType,
    boardName?: string,
  ): Promise<{ ok: boolean }> {
    return this.replyToArticle(formatReplyToFloor(floor, content), pushType, boardName);
  }

  async voteArticle(
    floor: number,
    kind: "push" | "boo",
    boardName?: string,
  ): Promise<{ ok: boolean }> {
    return this.replyToArticle(formatVoteForFloor(floor, kind), kind, boardName);
  }

  async votePush(
    floor: number,
    kind: "push" | "boo",
    boardName?: string,
  ): Promise<{ ok: boolean }> {
    return this.replyToArticle(formatVoteForFloor(floor, kind), kind, boardName);
  }

  async postArticle(
    board: string,
    category: string,
    title: string,
    body: string,
  ): Promise<{ ok: boolean; reason?: string }> {
    return this.runSerial(async () => {
      await this.waitUntilLoggedIn();
      return submitPostFromBot(this.bot, board, category, title, body);
    });
  }

  async editArticle(
    request: EditArticleRequest,
  ): Promise<ActionResult> {
    return this.runSerial(async () => {
      await this.waitUntilLoggedIn();
      return submitArticleEditFromBot(this.bot, request);
    });
  }

  async disconnect(): Promise<void> {
    return this.runSerial(async () => {
      this.bot.socket?.disconnect?.();
      this.setStatus("closed");
    });
  }

  isLoggedIn(): boolean {
    return Boolean(this.bot.state.login);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getLastScreen(): string {
    return this.lastScreen;
  }

  subscribeStatus(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  subscribeScreen(listener: (screen: string) => void): () => void {
    this.screenListeners.add(listener);
    if (this.lastScreen) listener(this.lastScreen);
    return () => {
      this.screenListeners.delete(listener);
    };
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  private async waitUntilConnected(): Promise<void> {
    if (
      (this.status === "closed" || this.status === "error") &&
      !this.bot.state.login
    ) {
      this.bot = this.createBot();
    }

    if (this.bot.state.connect) return;

    await new Promise<void>((resolve, reject) => {
      const startedAt = Date.now();
      const timer = setInterval(() => {
        if (this.bot.state.connect) {
          clearInterval(timer);
          resolve();
          return;
        }
        if (this.status === "error" || this.status === "closed") {
          clearInterval(timer);
          reject(new Error("PTT socket failed to connect"));
          return;
        }
        if (Date.now() - startedAt > 10000) {
          clearInterval(timer);
          reject(new Error("Timed out waiting for PTT socket connection"));
        }
      }, 100);
    });
  }

  private async waitUntilLoggedIn(): Promise<void> {
    await this.waitUntilConnected();
    if (!this.bot.state.login) {
      throw new Error("PTT login is required");
    }
  }

  private readTerminalSnapshot(): string {
    if (typeof this.bot.getLine === "function") {
      const lines: string[] = [];
      for (let index = 0; index < 24; index += 1) {
        lines.push(this.bot.getLine(index)?.str ?? "");
      }
      const joined = lines.join("\n").trim();
      if (joined) return joined;
    }

    return this.lastScreen;
  }

  private markLoggedIn(): void {
    if (this.bot._state) {
      this.bot._state.login = true;
      this.bot._state.position = { boardname: "" };
    }
    this.bot.searchCondition?.init?.();
  }
}

let singletonAdapter: PttAdapter | null = null;

export const pttClientModuleLoaded = typeof Ptt === "function";

export function createSerialTaskRunner() {
  let pending = Promise.resolve();

  return function runSerial<T>(task: () => Promise<T>): Promise<T> {
    const next = pending.then(task, task);
    pending = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
}

export function mapArticleRow(row: PttClientArticleRow): ArticleSummary {
  const rawStatus = row.status?.trim() || "";
  const title =
    rawStatus === "R:" && row.title?.trim()
      ? `Re: ${row.title.trim()}`
      : row.title?.trim() || "";

  const fixed = Boolean(
    (row as PttClientArticleRow & { fixed?: boolean }).fixed,
  );
  return {
    index: row.id,
    mark: rawStatus === "R:" ? " " : rawStatus || " ",
    pushCount: row.push?.trim() || "",
    date: row.date?.trim() || "",
    author: row.author?.trim() || "",
    title,
    ...(fixed ? { fixed: true } : {}),
  };
}

function sortArticleSummaries(articles: ArticleSummary[]): ArticleSummary[] {
  return [...articles].sort((a, b) => {
    if (Boolean(a.fixed) !== Boolean(b.fixed)) {
      return a.fixed ? -1 : 1;
    }
    return b.index - a.index;
  });
}

function dropDisconnectedBoardTail(rows: ArticleSummary[]): ArticleSummary[] {
  const kept: ArticleSummary[] = [];
  let lastNormalIndex: number | null = null;

  for (const row of rows) {
    if (row.fixed) {
      kept.push(row);
      continue;
    }

    if (
      lastNormalIndex !== null &&
      Math.abs(row.index - lastNormalIndex) > MAX_BOARD_SCREEN_INDEX_GAP
    ) {
      continue;
    }

    kept.push(row);
    lastNormalIndex = row.index;
  }

  return kept;
}

export function mapHotBoardRow(
  board: Pick<PttBoardRow, "name" | "title" | "users">,
): HotBoardSummary {
  const name = board.name.trim();
  if (!isLikelyBoardName(name)) {
    return {
      name: "",
      title: "",
      users: "",
    };
  }

  return {
    name,
    title: board.title.trim(),
    users: board.users.trim(),
  };
}

function isLikelyBoardName(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_.+-]{1,31}$/.test(name);
}

function dbcsWidth(str: string): number {
  return str.split("").reduce((sum, char) => {
    return sum + (char.charCodeAt(0) > 255 ? 2 : 1);
  }, 0);
}

function indexOfDbcsWidth(str: string, width: number): number {
  for (let i = 0; i <= str.length; i += 1) {
    if (dbcsWidth(str.substring(0, i)) > width) return i - 1;
  }

  return str.length;
}

function substrDbcsWidth(str: string, startWidth: number, width?: number): string {
  const ignoreWidth = typeof width === "undefined";
  let length = width;
  let start = indexOfDbcsWidth(str, startWidth);
  let prefixSpace = 0;
  let suffixSpace = 0;

  if (dbcsWidth(str.substring(0, start)) < startWidth) {
    start += 1;
    prefixSpace = Math.max(dbcsWidth(str.substring(0, start)) - startWidth, 0);
  }

  if (!ignoreWidth) {
    length = indexOfDbcsWidth(str.substring(start), width - prefixSpace);
    suffixSpace =
      Math.min(width, dbcsWidth(str.substring(start))) -
      (prefixSpace + dbcsWidth(str.substring(start, start + length)));
  }

  const substr = ignoreWidth
    ? str.substring(start)
    : str.substring(start, start + (length ?? 0));

  return `${" ".repeat(prefixSpace)}${substr}${" ".repeat(suffixSpace)}`;
}

export function parseBoardRowFromScreenLine(line: string): PttBoardRow | null {
  const id = Number(substrDbcsWidth(line, 3, 4).trim());
  const name = substrDbcsWidth(line, 10, 12).trim();
  const flag = substrDbcsWidth(line, 28, 2).trim();

  if (!Number.isFinite(id) || !isLikelyBoardName(name)) return null;
  if (flag !== "◎" && flag !== "Σ") return null;

  return {
    id,
    name,
    title: substrDbcsWidth(line, 30, 31).replace(/\s+$/, ""),
    users: substrDbcsWidth(line, 62, 5).trim(),
  };
}

export async function fetchHotBoardsFromBotManually(
  bot: BoardFetchBot,
): Promise<HotBoardSummary[]> {
  if (!bot.enterBoardByOffset || !bot.getLine) return [];

  const found = await bot.enterBoardByOffset([-1]);
  if (!found) return [];

  const boards: HotBoardSummary[] = [];
  const seen = new Set<string>();
  let expectedId = 1;

  try {
    for (let page = 0; page < 20; page += 1) {
      let stopLoop = false;
      let pageRows = 0;

      for (let rowIndex = 3; rowIndex < 23; rowIndex += 1) {
        const line = bot.getLine(rowIndex)?.str ?? "";
        if (line.trim() === "") {
          stopLoop = true;
          break;
        }

        const row = parseBoardRowFromScreenLine(line);
        if (!row || row.id !== expectedId) {
          stopLoop = true;
          break;
        }

        const board = mapHotBoardRow(row);
        if (board.name && !seen.has(board.name.toLowerCase())) {
          boards.push(board);
          seen.add(board.name.toLowerCase());
        }
        expectedId += 1;
        pageRows += 1;
      }

      if (stopLoop || pageRows === 0 || !bot.send) break;
      await bot.send("\x1b[6~");
      await sleep(80);
    }
  } finally {
    await bot.enterIndex?.();
  }

  return boards;
}

export function parseFavoriteBoardNamesFromScreen(screen: string): string[] {
  const plain = stripAnsi(screen).replace(/\r/g, "");
  const names: string[] = [];
  const seen = new Set<string>();

  for (const line of plain.split("\n")) {
    const match = line.match(
      /^\s*[●> ]?\s*\d+\s+[ˇ+*=!~ ]*\s*([A-Za-z][A-Za-z0-9_.+-]{1,31})\b/u,
    );
    const name = match?.[1]?.trim();
    if (!name) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    names.push(name);
  }

  return names;
}

export async function fetchFavoriteBoardNamesFromBot(
  bot: Partial<
    Pick<BotLike, "getFavorite" | "enterFavorite" | "enterIndex" | "getLine" | "send">
  >,
): Promise<string[]> {
  await leaveArticleReaderIfNeeded(bot);
  await bot.enterIndex?.();

  if (!bot.enterFavorite || !bot.getLine) return [];

  const entered = await bot.enterFavorite([]);
  if (!entered) return [];

  try {
    const names: string[] = [];
    const seen = new Set<string>();
    let screen = readVisibleScreen(bot);

    for (let pageIndex = 0; pageIndex < 20; pageIndex += 1) {
      const pageNames = parseFavoriteBoardNamesFromScreen(screen);
      for (const name of pageNames) {
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        names.push(name);
      }

      if (pageNames.length < 20) break;
      if (!bot.send) break;

      await bot.send(PTT_KEY_PGDOWN);
      await sleep(80);

      const nextScreen = readVisibleScreen(bot);
      if (stripAnsi(nextScreen).replace(/\r/g, "") === stripAnsi(screen).replace(/\r/g, "")) {
        break;
      }
      screen = nextScreen;
    }

    return names;
  } finally {
    await bot.enterIndex?.();
  }
}

async function leaveArticleReaderIfNeeded(
  bot: Partial<Pick<BotLike, "getLine" | "send">>,
): Promise<void> {
  if (!bot.getLine || !bot.send) return;

  const plain = stripAnsi(readVisibleScreen(bot)).replace(/\r/g, "");
  if (!/瀏覽 第\s*\d+\/\d+\s*頁/u.test(plain)) return;

  await bot.send("q");
  await sleep(150);
}

export function parsePostCategoryOptions(screen: string): string[] {
  const plain = stripAnsi(screen).replace(/\r/g, "");
  const lines = plain.split("\n");

  // 優先找包含分類相關關鍵字的行（排除「標題：」這類標題提示）
  let promptLines = lines.filter((line) => {
    // 排除純粹的「標題：」「標題:」這類行
    if (/^標題[:：]\s*$/.test(line.trim())) return false;
    return /分類|類別|種類/u.test(line);
  });

  // 若無關鍵字匹配，改找有序號格式（如 "1. 測試"）的行
  if (promptLines.length === 0) {
    promptLines = lines.filter((line) => /^\s*\d{1,2}\s*[\.\)）]\s*/u.test(line));
  }

  const source = promptLines.length > 0 ? promptLines.join("\n") : plain;
  const seen = new Set<string>();
  const categories: string[] = [];

  const add = (value: string) => {
    const category = value
      .replace(/^[\s:：.)、\]-]+/u, "")
      .replace(/[\s:：.)、\]-]+$/u, "")
      .trim();
    if (!category || seen.has(category)) return;
    seen.add(category);
    categories.push(category);
  };

  const bracketMatches = source.matchAll(/\[([^\]\n]{1,12})\]/gu);
  for (const match of bracketMatches) {
    if (match[1]) add(match[1]);
  }
  if (categories.length > 0) return categories;

  for (const line of promptLines) {
    // 嘗試匹配"1. 分類"或"1) 分類"這樣的格式（在行首）
    let tokenMatches = line.matchAll(
      /^\s*\d{1,2}\s*[\.\)）]\s*([^\s()[\]（）:：，,。；;]{1,12})/gu,
    );
    let found = false;
    for (const match of tokenMatches) {
      if (match[1] && !/請|按|選擇|取消|標題|分類|類別|種類/u.test(match[1])) {
        add(match[1]);
        found = true;
      }
    }

    // 若行首未找到，嘗試原始正則（更寬鬆的匹配）
    // 加入冒號 : ：作為前驱分隔符（PTT 格式如 "種類：1.測試" 中第一項前是冒號）
    if (!found) {
      tokenMatches = line.matchAll(
        /(?:^|[\s(（:：])(?:\d{1,2}|[A-Za-z])[\s.)、:：）]+([^\s()[\]（）:：，,。；;]{1,12})/gu,
      );
      for (const match of tokenMatches) {
        if (match[1] && !/請|按|選擇|取消|標題|分類|類別|種類/u.test(match[1])) {
          add(match[1]);
        }
      }
    }
  }

  return categories;
}

export function parsePartialBoardScreen(screen: string): ArticleSummary[] {
  const plain = stripAnsi(screen).replace(/\r/g, "");
  const rows: ArticleSummary[] = [];
  const boardDateRe = /^\d{1,2}\/\d{1,2}$/;

  for (const line of plain.split("\n")) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("看板《") ||
      trimmed.startsWith("系列《")
    ) {
      continue;
    }
    if (line.length < 32) continue;
    const indexRaw = substrDbcsWidth(line, 1, 7).trim();
    const pushCount = substrDbcsWidth(line, 9, 2).trim();
    const date = substrDbcsWidth(line, 11, 5).trim();
    const author = substrDbcsWidth(line, 17, 12).trim();
    const rawStatus = substrDbcsWidth(line, 30, 2).trim();
    const titleCell = substrDbcsWidth(line, 32).trim();
    const title =
      rawStatus === "R:" && titleCell ? `Re: ${titleCell}` : titleCell;
    const index = Number(indexRaw.replace(/[^\d]/g, ""));
    const fixed = /[^\d\s]/u.test(indexRaw);

    if (!title || !boardDateRe.test(date) || author.length === 0) continue;

    rows.push({
      index: Number.isNaN(index) ? 0 : index,
      mark: rawStatus === "R:" ? " " : rawStatus || " ",
      pushCount,
      date,
      author,
      title,
      ...(fixed ? { fixed: true } : {}),
    });
  }

  if (rows.length >= 2 && rows[0].index === 0) {
    for (let index = 1; index < rows.length; index += 1) {
      if (rows[index].index <= 0) continue;
      rows[0].index = rows[index].index - index;
      break;
    }
  }

  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].index > 0 || rows[index - 1].index <= 0) continue;
    rows[index].index = rows[index - 1].index + 1;
  }

  return dropDisconnectedBoardTail(
    rows.filter((row) => row.index > 0),
  ).reverse();
}

export function createPartialArticleFingerprint(
  partial: PartialArticleData,
): string {
  return [
    partial.board.trim(),
    partial.title.trim(),
    partial.author.trim(),
    partial.date.trim(),
  ].join("|");
}

function createArticleOpenTrace(
  boardName: string,
  articleIndex: number,
  previousFingerprint: string | null,
): ArticleOpenTrace {
  const trace: ArticleOpenTrace = {
    boardName,
    articleIndex,
    startedAtIso: new Date().toISOString(),
    events: [],
    partialCandidates: [],
    previousFingerprint,
  };
  (globalThis as AdapterDebugGlobal).__pttzzzLastArticleOpenTrace = trace;
  return trace;
}

function recordArticleOpenTraceEvent(
  trace: ArticleOpenTrace | null | undefined,
  name: string,
  startedAt: number,
  detail?: string,
): void {
  if (!trace) return;
  trace.events.push({
    name,
    atMs: Math.round((Date.now() - startedAt) * 10) / 10,
    detail,
  });
}

function recordArticleOpenTraceCandidate(
  trace: ArticleOpenTrace | null | undefined,
  partial: PartialArticleData,
  source: ArticleOpenTraceCandidate["source"],
  startedAt: number,
  accepted: boolean,
  firstLines: string[],
  reason?: string,
): void {
  if (!trace) return;
  trace.partialCandidates.push({
    source,
    atMs: Math.round((Date.now() - startedAt) * 10) / 10,
    title: partial.title,
    author: partial.author,
    board: partial.board,
    fingerprint: createPartialArticleFingerprint(partial),
    accepted,
    reason,
    firstLines,
  });
}

export function getLastArticleOpenTrace(): ArticleOpenTrace | null {
  return (
    (globalThis as AdapterDebugGlobal).__pttzzzLastArticleOpenTrace ?? null
  );
}

export function clearLastArticleOpenTrace(): void {
  (globalThis as AdapterDebugGlobal).__pttzzzLastArticleOpenTrace = null;
}

function readVisibleScreen(bot: Pick<BoardFetchBot, "getLine">): string {
  const lines: string[] = [];
  for (let index = 0; index < 24; index += 1) {
    lines.push(bot.getLine?.(index)?.str ?? "");
  }
  return lines.join("\n");
}

function isBoardListScreen(screen: string): boolean {
  return parsePartialBoardScreen(screen).length > 0;
}

function isFilterModeScreen(screen: string): boolean {
  return stripAnsi(screen)
    .replace(/\r/g, "")
    .split("\n")
    .some((line) => line.trim().startsWith("系列《"));
}

function isBoardDirectoryScreen(screen: string): boolean {
  const plain = stripAnsi(screen).replace(/\r/g, "");
  return /【看板列表】/u.test(plain) && /\[\/\]搜尋/u.test(plain);
}

export function extractCurrentBoardName(screen: string): string | null {
  const plain = stripAnsi(screen).replace(/\r/g, "");
  const articleMatch = plain.match(/^.*看板\s+([A-Za-z0-9_+\-]+).*$/mu);
  if (articleMatch?.[1]) return articleMatch[1].trim();

  const boardMatch = plain.match(/《([^》]+)》/u);
  if (boardMatch?.[1]) return boardMatch[1].trim();

  return null;
}

async function waitForBoardListScreen(
  bot: Pick<BoardFetchBot, "getLine">,
  boardName: string,
  timeoutMs = 600,
): Promise<string | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const screen = readVisibleScreen(bot);
    if (
      extractCurrentBoardName(screen)?.toLowerCase() === boardName.toLowerCase() &&
      isBoardListScreen(screen)
    ) {
      return screen;
    }
    await sleep(20);
  }
  return null;
}

async function ensureBoardView(
  bot: BoardFetchBot,
  boardName: string,
  requireListView = false,
): Promise<boolean> {
  const visibleScreen = readVisibleScreen(bot);
  const currentBoard = extractCurrentBoardName(visibleScreen);
  const alreadyOnBoard =
    currentBoard?.toLowerCase() === boardName.toLowerCase();
  if (
    alreadyOnBoard &&
    (!requireListView || isBoardListScreen(visibleScreen))
  ) {
    return true;
  }

  // If we're on the right board but not in list view (e.g., article body),
  // press q to return to board list — this preserves filter mode if applicable.
  if (alreadyOnBoard && requireListView && !isBoardListScreen(visibleScreen)) {
    await bot.send?.("q");
    const afterQ = bot.getLine
      ? await waitForBoardListScreen(bot, boardName, 600)
      : null;
    if (afterQ !== null) return true;
  }

  if (bot.enterBoardByName) {
    try {
      const entered = await bot.enterBoardByName(boardName);
      if (entered) return true;
    } catch {
      // Fall back to a manual enter sequence below.
    }
  }

  if (!bot.send) return false;

  await bot.send(`s${boardName}\r`);
  await sleep(120);

  return (
    extractCurrentBoardName(readVisibleScreen(bot))?.toLowerCase() ===
    boardName.toLowerCase()
  );
}

// Enters board in normal (non-filter) mode, exiting any current view including filter.
async function ensureNormalBoardView(
  bot: BoardFetchBot,
  boardName: string,
  forceReenter = false,
): Promise<boolean> {
  const debug = import.meta.env.DEV;
  const log = (msg: string) => {
    if (debug) console.log(`[ensureBoard] ${msg}`);
  };

  let screen = readVisibleScreen(bot);
  const plainScreen = stripAnsi(screen).replace(/\r/g, "");
  const currentBoard = extractCurrentBoardName(screen);
  
  log(`Initial screen board: ${currentBoard || "null"}, target: ${boardName}`);
  if (debug) console.log(`[ensureBoard] Screen sample:\n${plainScreen.split('\n').slice(0, 5).join('\n')}`);

  const onBoard =
    currentBoard?.toLowerCase() === boardName.toLowerCase();

  if (onBoard) {
    log(`Already on board ${boardName}`);
    if (!isBoardListScreen(screen)) {
      log(`Not in board list view, pressing q to exit`);
      // Article view: q exits to board list — poll for it rather than a fixed sleep.
      await bot.send?.("q");
      const afterQ = bot.getLine
        ? await waitForBoardListScreen(bot, boardName, 600)
        : null;
      screen = afterQ ?? (await sleep(200), readVisibleScreen(bot));
    }
    if (isFilterModeScreen(screen)) {
      log(`In filter mode, exiting to normal mode`);
      // Title-search filter list: exit to board category level, re-enter normally
      await bot.enterIndex?.();
      await sleep(200);
      // Fall through to enterBoardByName to re-enter in normal mode
    } else if (isBoardListScreen(screen) && !forceReenter) {
      // Already in normal board list — nothing to do (unless caller forces re-entry
      // to escape push-filter mode, which looks identical to normal mode)
      log(`Already in normal board list view, returning true`);
      return true;
    }
  }

  log(`Attempting to enter board using bot.enterBoardByName`);
  if (bot.enterBoardByName) {
    try {
      const entered = await bot.enterBoardByName(boardName);
      if (entered) {
        log(`bot.enterBoardByName succeeded`);
        return true;
      }
      log(`bot.enterBoardByName returned false`);
    } catch (e) {
      log(`bot.enterBoardByName threw: ${e}`);
      // fall back
    }
  }

  if (!bot.send) {
    log(`bot.send not available, cannot enter board`);
    return false;
  }

  if (isBoardDirectoryScreen(screen)) {
    log(`In board directory, searching board with /${boardName}`);
    await bot.send("/");
    await sleep(150);
    await bot.send(`${boardName}\r`);
    await sleep(350);
    await bot.send("r");
    await sleep(350);

    screen = readVisibleScreen(bot);
    const directorySearchBoard = extractCurrentBoardName(screen);
    const directorySearchSuccess =
      directorySearchBoard?.toLowerCase() === boardName.toLowerCase() &&
      isBoardListScreen(screen);
    log(`Board directory search result: ${directorySearchSuccess}`);
    if (directorySearchSuccess) return true;

    if (bot.enterIndex) {
      log(`Board directory search failed, returning to index before manual entry`);
      await bot.enterIndex();
      await sleep(250);
    }
  }

  log(`Sending manual board entry command: s${boardName}\\r`);
  await bot.send(`s${boardName}\r \x1b[1~\x1b[4~`);
  await sleep(350);

  screen = readVisibleScreen(bot);
  const newPlainScreen = stripAnsi(screen).replace(/\r/g, "");
  const newCurrentBoard = extractCurrentBoardName(screen);
  
  log(`After entry command, board: ${newCurrentBoard || "null"}`);
  if (debug) console.log(`[ensureBoard] Screen after entry:\n${newPlainScreen.split('\n').slice(0, 8).join('\n')}`);

  const success =
    newCurrentBoard?.toLowerCase() === boardName.toLowerCase();
  
  log(`Board entry result: ${success}`);
  return success;
}

async function cancelPostComposeFlow(
  bot: BoardFetchBot,
  boardName: string,
): Promise<boolean> {
  if (!bot.send || !bot.getLine) return false;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const screen = readVisibleScreen(bot);
    const plain = stripAnsi(screen).replace(/\r/g, "");
    const currentBoard = extractCurrentBoardName(screen);

    if (
      currentBoard?.toLowerCase() === boardName.toLowerCase() &&
      isBoardListScreen(screen)
    ) {
      return true;
    }

    if (/標題[:：]/u.test(plain)) {
      await bot.send(PTT_KEY_CTRL_C);
      await sleep(150);
      continue;
    }

    if (parsePostCategoryOptions(screen).length > 0 || /分類|類別|種類/u.test(plain)) {
      await bot.send(PTT_KEY_CTRL_C);
      await sleep(150);
      continue;
    }

    if (isPostGuidelineScreen(plain)) {
      await bot.send(PTT_KEY_CTRL_C);
      await sleep(150);
      continue;
    }

    if (/放棄|取消編輯|是否離開/u.test(plain)) {
      await bot.send("y\r");
      await sleep(150);
      continue;
    }

    if (/\[Y\/n\]/iu.test(plain) || /要儲存|是否儲存|存檔/u.test(plain)) {
      await bot.send("n\r");
      await sleep(150);
      continue;
    }

    if (isPostEditorScreen(plain)) {
      await bot.send(PTT_KEY_CTRL_X);
      await sleep(250);
      continue;
    }

    if (/任意鍵/u.test(plain)) {
      await bot.send("\r");
      await sleep(150);
      continue;
    }

    if (currentBoard?.toLowerCase() === boardName.toLowerCase()) {
      await bot.send("q");
      await sleep(150);
      continue;
    }

    await bot.send(PTT_KEY_CTRL_C);
    await sleep(150);
  }

  const finalScreen = readVisibleScreen(bot);
  return (
    extractCurrentBoardName(finalScreen)?.toLowerCase() === boardName.toLowerCase() &&
    isBoardListScreen(finalScreen)
  );
}

export async function fetchPostCategoryOptionsFromBot(
  bot: BoardFetchBot,
  boardName: string,
): Promise<string[]> {
  if (!bot.send || !bot.getLine) {
    throw new Error("Bot does not expose board navigation methods");
  }

  const entered = await ensureNormalBoardView(bot, boardName);
  if (!entered) {
    throw new Error(`無法進入看板 ${boardName}`);
  }

  await bot.send(PTT_KEY_CTRL_P);

  // 輪詢直到出現分類選單或標題輸入區（無分類看板會直接到標題）
  const startedAt = Date.now();
  let options: string[] = [];
  while (Date.now() - startedAt < 1500) {
    const screen = readVisibleScreen(bot);
    options = parsePostCategoryOptions(screen);
    if (options.length > 0) break;
    if (/標題[:：]/u.test(stripAnsi(screen))) break;
    await sleep(60);
  }

  await cancelPostComposeFlow(bot, boardName);

  return options;
}

function formatReplyToFloor(floor: number, content: string): string {
  return `回${floor}樓：${content.trim()}`;
}

function formatVoteForFloor(floor: number, kind: "push" | "boo"): string {
  return `${kind === "push" ? "推" : "噓"}${floor}樓`;
}

function getPushTypeKey(pushType: PushType): string {
  switch (pushType) {
    case "push":
      return "1";
    case "boo":
      return "2";
    default:
      return "3";
  }
}

export function isArticleEditorScreen(screen: string): boolean {
  const plain = stripAnsi(screen).replace(/\r/g, "");
  if (isPostGuidelineScreen(plain)) return false;
  return /文章編輯/u.test(plain) && /Ctrl-X|插入模式|取代模式/u.test(plain);
}

export function isArticleEditSavePrompt(screen: string): boolean {
  const plain = stripAnsi(screen).replace(/\r/g, "");
  return /(?:確定|是否).*(?:儲存|存檔)|(?:儲存|存檔).*(?:\[Y\/n\]|確定|是否)/iu.test(
    plain,
  );
}

export function isArticleEditSuccessScreen(
  screen: string,
  boardName: string,
  expectedAuthor: string,
  expectedTitle: string,
): boolean {
  const plain = stripAnsi(screen).replace(/\r/g, "");
  const normalized = normalizeArticleIdentity(plain);
  const hasExpectedIdentity =
    normalized.includes(normalizeArticleIdentity(expectedAuthor)) &&
    normalized.includes(normalizeArticleIdentity(expectedTitle));
  if (!hasExpectedIdentity) return false;
  return (
    /文章已更新|修改完成|已儲存/u.test(plain) ||
    (/瀏覽 第|目前顯示/u.test(plain) && /作者\s+|標題\s+/u.test(plain)) ||
    extractCurrentBoardName(plain)?.toLowerCase() === boardName.toLowerCase()
  );
}

function normalizeArticleIdentity(value: string): string {
  return value.replace(/[\s\u3000]+/gu, " ").trim();
}

async function cancelArticleEdit(bot: WriteBot): Promise<void> {
  const screen = readVisibleScreen(bot);
  if (isArticleEditorScreen(screen)) {
    await bot.send?.(PTT_KEY_CTRL_X);
    await sleep(80);
  }
  if (isArticleEditSavePrompt(readVisibleScreen(bot))) {
    await bot.send?.("n\r");
  } else {
    await bot.send?.(PTT_KEY_CTRL_C);
  }
}

export async function submitArticleEditFromBot(
  bot: WriteBot,
  request: EditArticleRequest,
): Promise<ActionResult> {
  if (!bot.send || !bot.getLine || !bot.getLines) {
    return { ok: false, reason: "PTT client 不支援文章編輯" };
  }

  const cleanBody = sanitizePostBody(request.body).trimEnd();
  const summaryMarker = formatPttzzzEditSummary(request.editSummary);
  if (!cleanBody) return { ok: false, reason: "文章正文不可為空" };
  if (!summaryMarker) return { ok: false, reason: "編輯摘要不可為空" };

  let article: AdapterArticleData | null;
  try {
    article = await fetchArticleFromBotManually(
      bot,
      request.boardName,
      request.articleIndex,
    );
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "無法載入待編輯文章",
    };
  }

  if (!article) return { ok: false, reason: "找不到要編輯的文章" };
  if (
    normalizeArticleIdentity(article.author) !==
      normalizeArticleIdentity(request.expectedAuthor) ||
    normalizeArticleIdentity(article.title) !==
      normalizeArticleIdentity(request.expectedTitle)
  ) {
    return { ok: false, reason: "文章身分已變更，請重新載入" };
  }

  const revisionSourceBody = article.revisionSourceBody ?? [
    article.body,
    ...(article.revisions ?? []).map((revision) => revision.rawBlock),
  ].filter(Boolean).join("\n");
  const { preservedFooter } = splitArticleEditableContent(revisionSourceBody);
  const replacement = [
    cleanBody,
    preservedFooter,
    summaryMarker,
  ]
    .filter(Boolean)
    .join("\n");
  const originalEditable = revisionSourceBody;
  const originalLineCount = Math.max(1, originalEditable.split("\n").length);
  const replacementLineCount = replacement.split("\n").length;
  if (
    originalLineCount > MAX_ARTICLE_EDIT_LINES ||
    replacementLineCount > MAX_ARTICLE_EDIT_LINES
  ) {
    return { ok: false, reason: "文章行數超過安全編輯上限" };
  }

  const entered = await ensureNormalBoardView(bot, request.boardName);
  if (!entered) {
    return { ok: false, reason: `無法進入看板 ${request.boardName}` };
  }

  await bot.send(`${request.articleIndex}\r\r`);
  const openedAt = Date.now();
  let openedExpectedArticle = false;
  while (Date.now() - openedAt < 1500) {
    const partial = parsePartialScreen(readVisibleScreen(bot));
    if (
      partial &&
      normalizeArticleIdentity(partial.author) ===
        normalizeArticleIdentity(request.expectedAuthor) &&
      normalizeArticleIdentity(partial.title) ===
        normalizeArticleIdentity(request.expectedTitle)
    ) {
      openedExpectedArticle = true;
      break;
    }
    await sleep(50);
  }
  if (!openedExpectedArticle) {
    await bot.send("q");
    return { ok: false, reason: "無法重新確認待編輯文章" };
  }

  await bot.send("E");
  const editorReady = await waitForPattern(
    bot,
    /文章編輯[\s\S]*(?:Ctrl-X|插入模式|取代模式)/u,
    1500,
    50,
  );
  if (!editorReady || !isArticleEditorScreen(readVisibleScreen(bot))) {
    await cancelArticleEdit(bot);
    return { ok: false, reason: "無法進入文章編輯器（可能沒有編輯權限）" };
  }

  await bot.send(PTT_KEY_EDITOR_TOP);
  await bot.send(PTT_KEY_CTRL_Y.repeat(originalLineCount));
  for (const line of replacement.split("\n")) {
    await bot.send(`${line}\r`);
    await sleep(20);
  }

  await bot.send(PTT_KEY_CTRL_X);
  const savePrompt = await waitForPattern(
    bot,
    /(?:確定|是否).*(?:儲存|存檔)|(?:儲存|存檔).*\[Y\/n\]/iu,
    2000,
    50,
  );
  if (!savePrompt || !isArticleEditSavePrompt(readVisibleScreen(bot))) {
    await cancelArticleEdit(bot);
    return { ok: false, reason: "PTT 未顯示文章儲存確認" };
  }

  await bot.send("y\r");
  const savedAt = Date.now();
  while (Date.now() - savedAt < 2500) {
    if (isArticleEditSuccessScreen(
      readVisibleScreen(bot),
      request.boardName,
      request.expectedAuthor,
      request.expectedTitle,
    )) {
      return { ok: true };
    }
    await sleep(50);
  }

  return { ok: false, reason: "無法確認文章是否儲存成功，請重新載入檢查" };
}

export interface SubmitPushTimeouts {
  typePromptMs: number;
  confirmMs: number;
  pollMs: number;
  afterTypeMs: number;
  afterConfirmMs: number;
  afterContinueMs: number;
}

const DEFAULT_SUBMIT_PUSH_TIMEOUTS: SubmitPushTimeouts = {
  typePromptMs: 2000,
  confirmMs: 3500,
  pollMs: 80,
  afterTypeMs: 140,
  afterConfirmMs: 500,
  afterContinueMs: 300,
};

const PUSH_TYPE_MENU_RE =
  /1\..*(2\.|噓)|值得推薦|給它噓聲|只加註解|推文方式|推文種類/u;
const PUSH_CONTENT_PROMPT_RE = /請輸入推文內容|輸入推文內容|推文內容[:：]/u;

async function waitForPushEntry(
  bot: WriteBot,
  timeoutMs: number,
  pollMs: number,
): Promise<"menu" | "content" | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const screen = stripAnsi(readVisibleScreen(bot)).replace(/\r/g, "");
    if (PUSH_TYPE_MENU_RE.test(screen)) return "menu";
    if (PUSH_CONTENT_PROMPT_RE.test(screen)) return "content";
    await sleep(pollMs);
  }
  return null;
}

export async function submitPushFromCurrentArticle(
  bot: WriteBot,
  content: string,
  pushType: PushType,
  returnBoardName?: string,
  timeoutOverrides: Partial<SubmitPushTimeouts> = {},
): Promise<{ ok: boolean }> {
  const trimmed = content.trim();
  if (!trimmed) return { ok: false };
  if (!bot.send || !bot.getLine) {
    throw new Error("Bot does not expose article write methods");
  }
  const timeouts = {
    ...DEFAULT_SUBMIT_PUSH_TIMEOUTS,
    ...timeoutOverrides,
  };

  await bot.send("X");
  const entry = await waitForPushEntry(
    bot,
    timeouts.typePromptMs,
    timeouts.pollMs,
  );

  if (entry === "menu") {
    await bot.send(getPushTypeKey(pushType));
    await sleep(timeouts.afterTypeMs);
    const contentReady = await waitForPattern(
      bot,
      PUSH_CONTENT_PROMPT_RE,
      timeouts.typePromptMs,
      timeouts.pollMs,
    );
    if (!contentReady) {
      await bot.send(PTT_KEY_CTRL_C);
      return { ok: false };
    }
  } else if (entry !== "content" || pushType !== "neutral") {
    await bot.send(PTT_KEY_CTRL_C);
    return { ok: false };
  }

  await bot.send(`${trimmed}\r`);
  const confirmed = await waitForPattern(
    bot,
    /確定|是否|送出|儲存/u,
    timeouts.confirmMs,
    timeouts.pollMs,
  );

  if (confirmed) {
    await bot.send("y\r");
    await sleep(timeouts.afterConfirmMs);
    const afterConfirm = stripAnsi(readVisibleScreen(bot));
    if (/請按任意鍵繼續|按任意鍵繼續/u.test(afterConfirm)) {
      await bot.send("\r");
      await sleep(timeouts.afterContinueMs);
    }
    if (returnBoardName) {
      await ensureNormalBoardView(bot, returnBoardName);
    }
    return { ok: true };
  }

  return { ok: false };
}

function sanitizePostBody(body: string): string {
  return body
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // 保留 \n (\x0A) 與 \t (\x09)，移除其他 control char
    .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "")
    .slice(0, 50000);
}

async function waitForPattern(
  bot: WriteBot,
  pattern: RegExp,
  timeoutMs: number,
  pollMs = 80,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const screen = stripAnsi(readVisibleScreen(bot)).replace(/\r/g, "");
    if (pattern.test(screen)) return true;
    await sleep(pollMs);
  }
  return false;
}

export function isPostGuidelineScreen(screen: string): boolean {
  const plain = stripAnsi(screen).replace(/\r/g, "");
  return /文章\s*發\s*表\s*綱\s*領|四不政策|避免謾罵/u.test(plain);
}

export function isPostEditorScreen(screen: string): boolean {
  const plain = stripAnsi(screen).replace(/\r/g, "");
  if (isPostGuidelineScreen(plain)) return false;
  return /^~/m.test(plain) || /編輯文章|Ctrl-X|插入/u.test(plain);
}

export function isPostSuccessScreen(screen: string): boolean {
  const plain = stripAnsi(screen).replace(/\r/g, "");
  if (isPostGuidelineScreen(plain)) return false;
  return /已送出|發表成功|文章已發表/u.test(plain);
}

export async function waitForPostTitlePrompt(
  bot: WriteBot,
  readScreen: () => string,
  timeoutMs: number,
  pollMs = 80,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const screen = readScreen();
    const plain = stripAnsi(screen).replace(/\r/g, "");
    if (/標題[:：]/u.test(plain)) return true;
    if (isPostGuidelineScreen(plain)) {
      await bot.send?.("\r");
      await sleep(pollMs);
      continue;
    }
    await sleep(pollMs);
  }
  return /標題[:：]/u.test(stripAnsi(readScreen()).replace(/\r/g, ""));
}

async function submitPostFromBot(
  bot: WriteBot,
  boardName: string,
  category: string,
  title: string,
  body: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!bot.send || !bot.getLine) {
    throw new Error("Bot does not expose article write methods");
  }

  const debug = import.meta.env.DEV;
  const log = (msg: string) => {
    if (debug) console.log(`[submitPost] ${msg}`);
  };

  // Phase 1: 強制歸位到主功能表/看板列表
  // 策略：根據畫面特徵採取對應動作；偵測到狀態未變化就跳出循環
  log(`Resetting to main menu / board list`);
  let lastSignature = "";
  let stuckCount = 0;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const screen = readVisibleScreen(bot);
    const plain = stripAnsi(screen).replace(/\r/g, "");

    // 偵測狀態是否卡住（連續 2 次相同畫面 = 上一個動作沒效果）
    const signature = plain.slice(0, 200);
    if (signature === lastSignature) {
      stuckCount += 1;
      if (stuckCount >= 2) {
        log(`State stuck after ${attempt} attempts, breaking loop`);
        break;
      }
    } else {
      stuckCount = 0;
    }
    lastSignature = signature;

    // 已是看板列表或主功能表，停止
    if (
      isBoardListScreen(screen) ||
      /主功能表|【主功能表】|【分類看板】/u.test(plain)
    ) {
      log(`Reached clean state at attempt ${attempt}`);
      break;
    }

    if (isPostGuidelineScreen(plain)) {
      log(`Post guideline detected, cancelling compose flow`);
      await bot.send(PTT_KEY_CTRL_C);
      await sleep(250);
      continue;
    }

    // 確認框 [Y/n] - 按 N 不儲存/不確認
    if (/\[Y\/n\]/iu.test(plain) || /是否要儲存|是否儲存|存檔|放棄|是否離開|取消編輯/u.test(plain)) {
      log(`Confirmation prompt detected, sending 'n'`);
      await bot.send("n\r");
      await sleep(300);
      continue;
    }

    // pmore 編輯器（有 ~ 標記空白行 + 沒有看板/主功能表特徵）
    // 用 Ctrl+X → n（不儲存）退出，比 Ctrl+C 可靠
    if (isPostEditorScreen(plain)) {
      log(`In editor (pmore), sending Ctrl+X to trigger save dialog`);
      await bot.send(PTT_KEY_CTRL_X);
      await sleep(400);
      // 接下來的循環會偵測 [Y/n] 提示並送 n
      continue;
    }

    // 「按任意鍵繼續」
    if (/任意鍵/u.test(plain)) {
      log(`'Press any key' prompt, sending Enter`);
      await bot.send("\r");
      await sleep(200);
      continue;
    }

    // 未知狀態：嘗試 Ctrl+C 取消輸入，再按 q 退出
    log(`Unknown state, trying Ctrl+C + q`);
    await bot.send(PTT_KEY_CTRL_C);
    await sleep(150);
    await bot.send("q");
    await sleep(200);
  }

  // Phase 2: 確保進入看板
  log(`Entering board: ${boardName}`);
  const entered = await ensureNormalBoardView(bot, boardName);
  if (!entered) {
    return { ok: false, reason: `無法進入看板 ${boardName}` };
  }

  // Phase 3: 開啟發文提示，輪詢直到分類選單或標題輸入區出現
  log(`Pressing Ctrl+P to compose new article`);
  await bot.send(PTT_KEY_CTRL_P);
  const composeOpened = await waitForPattern(
    bot,
    /分類|類別|種類|標題[:：]/u,
    1500,
  );
  if (!composeOpened) {
    await bot.send(PTT_KEY_CTRL_C);
    await sleep(200);
    return { ok: false, reason: "無法開啟發文視窗（可能無發文權限）" };
  }

  // Phase 4: 解析並選擇分類
  const screen = readVisibleScreen(bot);
  const options = parsePostCategoryOptions(screen);
  log(`Available categories: ${options.join(", ")}`);

  const selectedIndex = category
    ? options.findIndex((option) => option === category)
    : -1;

  if (selectedIndex >= 0) {
    log(`Selected category index: ${selectedIndex + 1} (${category})`);
    await bot.send(String(selectedIndex + 1));
  } else if (category && options.length > 0) {
    // 呼叫端指定了分類但不在清單中
    await bot.send(PTT_KEY_CTRL_C);
    await sleep(200);
    return {
      ok: false,
      reason: `分類 "${category}" 不在可用清單：[${options.join(", ")}]`,
    };
  } else {
    // 沒指定分類或無分類選單 → 按 Enter
    log(`No category selection, sending Enter`);
    await bot.send("\r");
  }

  // 等待標題輸入區出現
  const titlePromptShown = await waitForPostTitlePrompt(
    bot,
    () => readVisibleScreen(bot),
    2000,
  );
  if (!titlePromptShown) {
    const probe = stripAnsi(readVisibleScreen(bot)).replace(/\r/g, "");
    await bot.send(PTT_KEY_CTRL_C);
    await sleep(200);
    return {
      ok: false,
      reason: `分類選擇失敗（可能此看板強制分類）：${probe.slice(0, 80)}`,
    };
  }

  // Phase 5: 輸入標題（純本體；PTT 已預填 [分類] 前綴）
  const cleanTitle = title
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, "")
    .slice(0, 60);
  if (!cleanTitle) {
    await bot.send(PTT_KEY_CTRL_C);
    await sleep(200);
    return { ok: false, reason: "標題不可為空" };
  }
  log(`Entering title body: ${cleanTitle}`);
  await bot.send(`${cleanTitle}\r`);

  // 等待進入內文編輯器（pmore 風格畫面）
  const editorReady = await waitForPattern(
    bot,
    /離開|Ctrl-X|插入|文章編輯|請按.+鍵/u,
    2500,
  );
  if (!editorReady) {
    log(`Warning: editor screen not detected within timeout, proceeding anyway`);
  }

  // Phase 6: 逐行送內文（避免長文截斷）
  const cleanBody = sanitizePostBody(body);
  const lines = cleanBody.split("\n");
  log(`Entering body: ${lines.length} lines, ${cleanBody.length} chars total`);
  for (const line of lines) {
    await bot.send(`${line}\r`);
    await sleep(30);
  }
  await sleep(150);

  // Phase 7: Ctrl+X 進入儲存對話流程
  log(`Pressing Ctrl+X to save`);
  await bot.send(PTT_KEY_CTRL_X);

  // Phase 8: 多階段儲存對話（儲存確認 → 分類規定 → 簽名檔）
  const dialogTimeout = 8000;
  const dialogStart = Date.now();
  let answeredSave = false;
  let answeredRule = false;
  let answeredSignature = false;
  let postSuccessful = false;

  while (Date.now() - dialogStart < dialogTimeout) {
    const plain = stripAnsi(readVisibleScreen(bot)).replace(/\r/g, "");

    // 已抵達成功畫面
    if (isPostSuccessScreen(plain)) {
      log(`Post successful detected`);
      postSuccessful = true;
      break;
    }

    // 簽名檔提示（要在儲存確認後才會出現）
    if (!answeredSignature && /簽名檔|signature/iu.test(plain)) {
      log(`Signature prompt detected, sending '0' to skip`);
      await bot.send("0\r");
      answeredSignature = true;
      await sleep(150);
      continue;
    }

    // 分類規定確認（部分看板才有）
    if (
      !answeredRule &&
      answeredSave &&
      /符合分類|分類規定/u.test(plain)
    ) {
      log(`Category-rule prompt detected, sending 'y'`);
      await bot.send("y\r");
      answeredRule = true;
      await sleep(150);
      continue;
    }

    // 儲存確認（[Y/n]）— 要排除已被分類規定 / 簽名檔覆蓋的情況
    if (
      !answeredSave &&
      /要儲存|是否儲存|存檔|\[Y\/n\]/iu.test(plain) &&
      !/簽名檔|分類規定/u.test(plain)
    ) {
      log(`Save prompt detected, sending 'y'`);
      await bot.send("y\r");
      answeredSave = true;
      await sleep(150);
      continue;
    }

    await sleep(80);
  }

  // Phase 9: 等待「按任意鍵繼續」並按 Enter 返回看板
  if (!postSuccessful) {
    postSuccessful = await waitForPattern(
      bot,
      /已送出|發表成功|按任意鍵|請按任意鍵/u,
      3000,
    );
  }

  if (postSuccessful) {
    const finalPlain = stripAnsi(readVisibleScreen(bot)).replace(/\r/g, "");
    if (/按任意鍵|請按任意鍵/u.test(finalPlain)) {
      await bot.send("\r");
      await sleep(300);
    }
    // Phase 10: 確保返回正常看板
    await ensureNormalBoardView(bot, boardName);
    return { ok: true };
  }

  const finalScreen = stripAnsi(readVisibleScreen(bot)).replace(/\r/g, "");
  log(`Warning: post not confirmed. answeredSave=${answeredSave} answeredSignature=${answeredSignature}`);
  if (debug) console.log(`[submitPost] Final screen:`, finalScreen);
  return {
    ok: false,
    reason: `發文未確認成功（畫面：${finalScreen.slice(0, 100)}）`,
  };
}
export async function fetchBoardArticlesFromBotManually(
  bot: BoardFetchBot,
  boardName: string,
  beforeIndex = 0,
  forceReenter = false,
): Promise<ArticleSummary[]> {
  if (!bot.send || !bot.getLine) {
    throw new Error("Bot does not expose board navigation methods");
  }

  const entered = await ensureNormalBoardView(bot, boardName, forceReenter);
  if (!entered) {
    throw new Error(`無法進入看板 ${boardName}`);
  }

  if (beforeIndex > 0) {
    const offset = Math.max(beforeIndex - 9, 1);
    await bot.send(`${PTT_KEY_END}${PTT_KEY_END}${offset}\r`);
    await sleep(120);
  }

  return sortArticleSummaries(
    parsePartialBoardScreen(readVisibleScreen(bot)).filter(
      (article) => article.index > 0 && article.title.trim().length > 0,
    ),
  );
}

function normalizeText(raw: string): string {
  return stripAnsi(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

type AnchoredRawPush = RawPush & {
  anchorOffset: number;
  rawFloor: number;
};

type RawLineWithOffset = {
  line: string;
  start: number;
  end: number;
  lineEnd: number;
};

function splitRawLinesWithOffsets(raw: string): RawLineWithOffset[] {
  const lines: RawLineWithOffset[] = [];

  if (raw.length === 0) {
    return [{ line: "", start: 0, end: 0, lineEnd: 0 }];
  }

  let start = 0;
  while (start < raw.length) {
    let end = start;
    while (end < raw.length && raw[end] !== "\n" && raw[end] !== "\r") {
      end += 1;
    }

    let lineEnd = end;
    if (end < raw.length) {
      if (raw[end] === "\r" && raw[end + 1] === "\n") {
        lineEnd = end + 2;
      } else {
        lineEnd = end + 1;
      }
    }

    lines.push({ line: raw.slice(start, end), start, end, lineEnd });

    if (end >= raw.length) break;
    if (raw[end] === "\r" && raw[end + 1] === "\n") {
      start = end + 2;
    } else {
      start = end + 1;
    }
  }

  return lines;
}

function isPushLine(line: string): boolean {
  return /^[推噓→]\s+\S{2,12}\s*:/u.test(stripAnsi(line).trimStart());
}

function isEditNoteLine(line: string): boolean {
  return /^※\s*編輯:/u.test(stripAnsi(line).trimStart());
}

function findPushMarkerRawOffsets(raw: string): number[] {
  const visibleChars: Array<{ char: string; rawIndex: number }> = [];

  for (let rawIndex = 0; rawIndex < raw.length; ) {
    if (raw[rawIndex] === "\x1b" && raw[rawIndex + 1] === "[") {
      rawIndex += 2;
      while (rawIndex < raw.length) {
        const code = raw.charCodeAt(rawIndex);
        rawIndex += 1;
        if (code >= 0x40 && code <= 0x7e) break;
      }
      continue;
    }

    const char = raw[rawIndex];
    if (char === "\b") {
      while (
        visibleChars.length > 0 &&
        visibleChars[visibleChars.length - 1].char === " "
      ) {
        visibleChars.pop();
      }
      rawIndex += 1;
      continue;
    }

    visibleChars.push({ char, rawIndex });
    rawIndex += 1;
  }

  const visible = visibleChars.map((entry) => entry.char).join("");
  const markerRe = /[推噓→]\s+\S{2,12}\s*:/gu;
  const offsets: number[] = [];

  for (const match of visible.matchAll(markerRe)) {
    if (match.index === undefined) continue;
    offsets.push(visibleChars[match.index]?.rawIndex ?? 0);
  }

  return offsets;
}

function collectAnchoredPushes(raw: string): AnchoredRawPush[] {
  const lines = splitRawLinesWithOffsets(raw);
  const pushes: AnchoredRawPush[] = [];
  let rawFloor = 1;

  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index];
    if (!isPushLine(current.line)) continue;

    let end = current.lineEnd;
    let cursor = index + 1;

    while (cursor < lines.length) {
      const next = lines[cursor];
      if (isPushLine(next.line) || isEditNoteLine(next.line)) break;
      end = next.lineEnd;
      cursor += 1;
    }

    const parsedPushes = parsePushBuffer(raw.slice(current.start, end));
    const anchorOffsets = findPushMarkerRawOffsets(
      raw.slice(current.start, end),
    );

    for (let pushIndex = 0; pushIndex < parsedPushes.length; pushIndex += 1) {
      const parsed = parsedPushes[pushIndex];
      pushes.push({
        ...parsed,
        anchorOffset: current.start + (anchorOffsets[pushIndex] ?? 0),
        rawFloor,
      });
      rawFloor += 1;
    }

    index = cursor - 1;
  }

  return pushes;
}

function stripOpEditedReplyContentFromPushParsing(
  raw: string,
  opReplySegments: OpEditedReplySegment[],
): string {
  if (opReplySegments.length === 0) return raw;

  const chars = raw.split("");

  for (const segment of opReplySegments) {
    const start = segment.contentAnchorOffset;
    const end = start + segment.rawBlock.length;
    for (let index = start; index < end; index += 1) {
      if (chars[index] !== "\n" && chars[index] !== "\r") {
        chars[index] = " ";
      }
    }
  }

  return chars.join("");
}

function buildArticleThread(rawFull: string, author: string) {
  const { editRecords, opReplySegments } = extractArticleThreadEvents(rawFull);
  const pushParsingRaw = stripOpEditedReplyContentFromPushParsing(
    rawFull,
    opReplySegments,
  );
  const thread = aggregatePushes(
    collectAnchoredPushes(pushParsingRaw),
    author,
    opReplySegments,
    editRecords,
  );

  return {
    pushes: thread.pushes,
    articleNotes: thread.articleNotes,
    score: calcArticleScore(thread.pushes),
  };
}

function buildPartialArticleFromRawLines(
  rawLines: string[],
  fallbackBoardName: string,
): PartialArticleData | null {
  if (rawLines.length === 0) return null;

  const rawFull = rawLines.join("\n");
  const parsedHeader = parseArticleHeaderBlock(rawFull);
  if (!parsedHeader.author && !parsedHeader.title) return null;
  const { body, revisions } = splitArticleBody(rawFull);
  const parsedBody = parseArticleHeaderBlock(body);
  const hasPushOrEditLines = rawLines.some(
    (line) => isPushLine(line) || isEditNoteLine(line),
  );
  const thread = hasPushOrEditLines
    ? buildArticleThread(rawFull, parsedHeader.author)
    : null;

  return {
    title: parsedHeader.title,
    author: parsedHeader.author,
    date: parsedHeader.date,
    board: parsedHeader.board || fallbackBoardName,
    body: parsedBody.content,
    pushes: thread?.pushes ?? [],
    articleNotes: thread?.articleNotes ?? [],
    revisions,
    score: thread?.score ?? 0,
  };
}

function appendUniqueArticleScreenLines(
  lines: string[],
  screen: string[],
): number {
  let contentLines = screen.slice(0, 23);
  if (
    lines.length > 0 &&
    contentLines[0]?.trimStart().startsWith("作者") &&
    contentLines[1]?.trimStart().startsWith("標題") &&
    contentLines[2]?.trimStart().startsWith("時間")
  ) {
    const separatorIndex = contentLines.findIndex(
      (line, index) => index >= 3 && /^─{5,}/u.test(stripAnsi(line).trim()),
    );
    if (separatorIndex >= 0) {
      contentLines = contentLines.slice(separatorIndex + 1);
    }
  }

  // Trim trailing blank lines from the screen content so that blank fill-lines
  // at the bottom of a PTT terminal page don't count as "new" content and
  // prevent the end-of-article early break.
  while (contentLines.length > 0 && contentLines[contentLines.length - 1].trim() === "") {
    contentLines.pop();
  }

  if (lines.length === 0) {
    lines.push(...contentLines);
    return contentLines.length;
  }

  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }

  const maxOverlap = Math.min(lines.length, contentLines.length);
  let overlap = 0;
  for (let size = maxOverlap; size > 0; size -= 1) {
    if (
      lines.slice(lines.length - size).join("\n") ===
      contentLines.slice(0, size).join("\n")
    ) {
      overlap = size;
      break;
    }
  }

  const toAppend = contentLines.slice(overlap);
  lines.push(...toAppend);
  return toAppend.length;
}

async function readArticleLinesProgressively(
  bot: Pick<ArticleFetchBot, "send" | "getLine">,
  boardName: string,
  onPartial: (partial: PartialArticleData) => void,
  trace?: ArticleOpenTrace | null,
  traceStartedAt = Date.now(),
  initialScreen?: string[] | null,
  initialPartialAlreadyEmitted = false,
): Promise<string[]> {
  if (!bot.send || !bot.getLine) {
    throw new Error("Progressive article reading requires send/getLine");
  }

  const readScreen = () => {
    const screenLines: string[] = [];
    for (let index = 0; index < 24; index += 1) {
      screenLines.push(bot.getLine?.(index)?.str ?? "");
    }
    return screenLines;
  };

  const lines: string[] = [];
  let screen = initialScreen ?? readScreen();
  const maxPages = 300;

  for (let page = 0; page < maxPages; page += 1) {
    const appended = appendUniqueArticleScreenLines(lines, screen);
    const partial = buildPartialArticleFromRawLines(lines, boardName);
    if (partial && !(page === 0 && initialPartialAlreadyEmitted)) {
      recordArticleOpenTraceCandidate(
        trace,
        partial,
        "progressive",
        traceStartedAt,
        true,
        screen.slice(0, 6),
      );
      onPartial(partial);
      await sleep(16);
    }

    if ((screen[23] ?? "").includes("此文章無內容")) break;

    // End-of-article: page added nothing new — no need to navigate further.
    if (page >= 1 && appended === 0) break;

    // Stop at 100% after the first page: pressing PgDown at 100% would either
    // do nothing (causing a 1200ms waitForScreenChange timeout) or exit the article.
    // At page=0 we allow one PgDown in case PTT opened at the last page and more
    // content is visible after navigating. Mirrors ptt-client getLines() semantics.
    if (page >= 1 && stripAnsi(screen[23] ?? "").includes("100%")) break;

    await bot.send(PTT_KEY_PGDOWN);
    const nextScreen = await waitForScreenChange(bot, screen);
    if (nextScreen.join("\n") === screen.join("\n")) {
      break;
    }
    // If PTT exited the article back to the board list, stop reading.
    if (isBoardListScreen(nextScreen.join("\n"))) {
      break;
    }
    screen = nextScreen;
  }

  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  await bot.send(PTT_KEY_HOME);
  return lines;
}

function readScreenLines(bot: Pick<ArticleFetchBot, "getLine">): string[] {
  const screenLines: string[] = [];
  for (let index = 0; index < 24; index += 1) {
    screenLines.push(bot.getLine?.(index)?.str ?? "");
  }
  return screenLines;
}

async function waitForScreenChange(
  bot: Pick<ArticleFetchBot, "getLine">,
  previousScreen: string[],
  timeoutMs = 400,
): Promise<string[]> {
  const startedAt = Date.now();
  const previousKey = previousScreen.join("\n");

  while (Date.now() - startedAt <= timeoutMs) {
    const nextScreen = readScreenLines(bot);
    if (nextScreen.join("\n") !== previousKey) {
      return nextScreen;
    }
    await sleep(20);
  }

  return readScreenLines(bot);
}

export async function waitForArticleFirstScreen(
  bot: Pick<ArticleFetchBot, "getLine">,
  boardName: string,
  options:
    | number
    | {
        timeoutMs?: number;
        previousFingerprint?: string | null;
        trace?: ArticleOpenTrace | null;
        traceStartedAt?: number;
      } = 1800,
): Promise<ArticleFirstScreenSnapshot | null> {
  if (!bot.getLine) return null;

  const timeoutMs =
    typeof options === "number" ? options : (options.timeoutMs ?? 1800);
  const trace = typeof options === "number" ? null : (options.trace ?? null);
  const traceStartedAt =
    typeof options === "number"
      ? Date.now()
      : (options.traceStartedAt ?? Date.now());

  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const screenLines = readScreenLines(bot);
    const partial =
      parsePartialScreen(screenLines.join("\n")) ??
      buildPartialArticleFromRawLines(screenLines, boardName);
    if (partial) {
      recordArticleOpenTraceCandidate(
        trace,
        partial,
        "wait_first_screen",
        traceStartedAt,
        true,
        screenLines.slice(0, 6),
      );
      return {
        partial,
        screenLines,
      };
    }
    await sleep(50);
  }

  return null;
}

function buildArticleDebugDump(params: {
  boardName: string;
  articleIndex: number;
  title: string;
  author: string;
  rawLines: string[];
  pushes: AggregatedPush[];
  articleNotes: ArticleEditRecord[];
}): ArticleDebugDump | undefined {
  if (!import.meta.env.DEV) return undefined;

  const {
    boardName,
    articleIndex,
    title,
    author,
    rawLines,
    pushes,
    articleNotes,
  } = params;
  const parsedLastPushes = pushes.slice(-12).map((push) => ({
    id: push.id,
    type: push.type,
    author: push.author,
    content: push.content,
    time: push.time,
    replyTo: push.replyTo,
    sourceFloors: push.sourceFloors,
  }));

  return {
    boardName,
    articleIndex,
    title,
    author,
    rawLineCount: rawLines.length,
    firstLines: rawLines.slice(0, 12),
    lastLines: rawLines.slice(-24),
    parsedPushCount: pushes.length,
    parsedLastPushes,
    articleNoteCount: articleNotes.length,
    articleNotes,
    bottomStatusLine: rawLines[rawLines.length - 1] ?? "",
  };
}

export function parsePartialScreen(
  rawScreen: string,
): PartialArticleData | null {
  const plain = stripAnsi(rawScreen).replace(/\r/g, "");
  const lines = plain.split("\n");

  const authorLine = lines[0] ?? "";
  const titleLine = lines[1] ?? "";
  const timeLine = lines[2] ?? "";

  if (
    !authorLine.trim().startsWith("作者") ||
    !titleLine.trim().startsWith("標題") ||
    !timeLine.trim().startsWith("時間")
  ) {
    return null;
  }

  const author =
    authorLine
      .replace(/^.*?作者\s+/, "")
      .replace(/\s+看板.*$/, "")
      .trim() || "";

  const board = authorLine.replace(/^.*?看板\s+/, "").trim() || "";

  const title = titleLine.replace(/^.*?標題\s+/, "").trim() || "";

  const date = timeLine.replace(/^.*?時間\s+/, "").trim() || "";

  if (!title && !author) return null;

  const rawArticle = lines.slice(0, -1).join("\n");
  const { body: rawBody, revisions } = splitArticleBody(rawArticle);
  const parsedBody = parseArticleHeaderBlock(rawBody);
  const hasPushOrEditLines = lines.some(
    (line) => isPushLine(line) || isEditNoteLine(line),
  );
  const thread = hasPushOrEditLines
    ? buildArticleThread(rawArticle, author)
    : null;

  return {
    author,
    board,
    title,
    date,
    body: parsedBody.content,
    pushes: thread?.pushes ?? [],
    articleNotes: thread?.articleNotes ?? [],
    revisions,
    score: thread?.score ?? 0,
  };
}

export function parseArticleHeaderBlock(body: string): {
  author: string;
  title: string;
  date: string;
  board: string;
  content: string;
} {
  const lines = normalizeText(body).split("\n");
  const firstSeparator = lines.findIndex((line) => /^─{10,}/.test(line.trim()));
  const contentStart = firstSeparator >= 0 ? firstSeparator + 1 : 0;
  const headerLines =
    firstSeparator >= 0 ? lines.slice(0, firstSeparator) : lines.slice(0, 8);
  const headerBlock = headerLines.join(" ").replace(/\s+/g, " ").trim();
  const findField = (label: string) =>
    headerLines
      .find((line) => line.trimStart().startsWith(label))
      ?.replace(new RegExp(`^\\s*${label}\\s+`, "u"), "")
      .trim() ?? "";

  return {
    author:
      headerBlock
        .match(/作者\s+(.+?)(?=\s+看板\s+|\s+標題\s+|\s+時間\s+|$)/u)?.[1]
        ?.trim() ?? findField("作者"),
    board:
      headerBlock
        .match(/看板\s+(.+?)(?=\s+標題\s+|\s+時間\s+|$)/u)?.[1]
        ?.trim() ?? findField("看板"),
    title:
      headerBlock.match(/標題\s+(.+?)(?=\s+時間\s+|$)/u)?.[1]?.trim() ??
      findField("標題"),
    date: headerBlock.match(/時間\s+(.+)$/u)?.[1]?.trim() ?? findField("時間"),
    content: lines.slice(contentStart).join("\n").trim(),
  };
}

export function createPttAdapter(): PttAdapter {
  if (!singletonAdapter) {
    singletonAdapter = new PttClientAdapter();
  }
  return singletonAdapter;
}

export async function fetchArticleFromBot(
  bot: ArticleFetchBot,
  boardName: string,
  articleIndex: number,
  onPartial?: (partial: PartialArticleData) => void,
): Promise<AdapterArticleData | null> {
  if (typeof bot.getArticle === "function") {
    const botWithGetArticle = bot as Pick<BotLike, "getArticle" | "enterIndex">;
    const originalEnterIndex = botWithGetArticle.enterIndex;

    if (originalEnterIndex) {
      botWithGetArticle.enterIndex = async () => true;
    }

    try {
      const article = await botWithGetArticle.getArticle(
        boardName,
        articleIndex,
      );
      const rawLines = article?.lines;

      if (!Array.isArray(rawLines) || rawLines.length === 0) return null;

      if (onPartial) {
        await emitProgressivePartialsFromRawLines(
          rawLines,
          boardName,
          {
            title: article.title,
            author: article.author,
            date: article.timestamp,
            board: article.boardname,
          },
          onPartial,
        );
      }

      const rawFull = rawLines.join("\n");
      const { body, sourceBody, revisions } = splitArticleBody(rawFull);
      const parsed = parseArticleHeaderBlock(body);
      const parsedSource = parseArticleHeaderBlock(sourceBody);
      const author = parsed.author || article.author?.trim() || "";
      const title = parsed.title || article.title?.trim() || "";
      const date = parsed.date || article.timestamp?.trim() || "";
      const thread = buildArticleThread(rawFull, author);
      const debug = buildArticleDebugDump({
        boardName,
        articleIndex,
        title,
        author,
        rawLines,
        pushes: thread.pushes,
        articleNotes: thread.articleNotes,
      });

      return {
        title,
        author,
        date,
        board: parsed.board || article.boardname?.trim() || boardName,
        body: parsed.content,
        pushes: thread.pushes,
        articleNotes: thread.articleNotes,
        revisions,
        revisionSourceBody: parsedSource.content,
        score: thread.score,
        debug,
      };
    } finally {
      if (originalEnterIndex) {
        botWithGetArticle.enterIndex = originalEnterIndex;
      }
    }
  }

  return fetchArticleFromBotManually(bot, boardName, articleIndex, onPartial);
}


async function emitProgressivePartialsFromRawLines(
  rawLines: string[],
  boardName: string,
  fallbackMeta: {
    title?: string;
    author?: string;
    date?: string;
    board?: string;
  },
  onPartial: (partial: PartialArticleData) => void,
): Promise<void> {
  const pageSize = 22;
  const accumulated: string[] = [];
  let lastFingerprint: string | null = null;

  for (let index = 0; index < rawLines.length; index += pageSize) {
    accumulated.push(...rawLines.slice(index, index + pageSize));
    const partial =
      buildPartialArticleFromRawLines(accumulated, boardName) ??
      buildFallbackPartialArticleFromRawLines(accumulated, boardName, fallbackMeta);
    if (!partial) continue;

    const fingerprint = [
      createPartialArticleFingerprint(partial),
      partial.body.length,
      partial.pushes?.length ?? 0,
      partial.articleNotes?.length ?? 0,
    ].join("|");
    if (fingerprint === lastFingerprint) continue;
    lastFingerprint = fingerprint;
    onPartial(partial);
    await sleep(8);
  }
}

function buildFallbackPartialArticleFromRawLines(
  rawLines: string[],
  fallbackBoardName: string,
  fallbackMeta: {
    title?: string;
    author?: string;
    date?: string;
    board?: string;
  },
): PartialArticleData | null {
  if (rawLines.length === 0) return null;
  const rawFull = rawLines.join("\n");
  const { body, revisions } = splitArticleBody(rawFull);
  const parsedBody = parseArticleHeaderBlock(body);
  const author = fallbackMeta.author?.trim() ?? "";
  const hasPushOrEditLines = rawLines.some(
    (line) => isPushLine(line) || isEditNoteLine(line),
  );
  const thread = hasPushOrEditLines ? buildArticleThread(rawFull, author) : null;
  const content = parsedBody.content.trim() || normalizeText(body).trim();

  if (!content && (thread?.pushes.length ?? 0) === 0) return null;

  return {
    title: fallbackMeta.title?.trim() ?? "",
    author,
    date: fallbackMeta.date?.trim() ?? "",
    board: fallbackMeta.board?.trim() || fallbackBoardName,
    body: content,
    pushes: thread?.pushes ?? [],
    articleNotes: thread?.articleNotes ?? [],
    revisions,
    score: thread?.score ?? 0,
  };
}

export async function fetchArticleFromBotManually(
  bot: ArticleFetchBot,
  boardName: string,
  articleIndex: number,
  onPartial?: (partial: PartialArticleData) => void,
): Promise<AdapterArticleData | null> {
  return fetchArticleFromBotManuallyWithOpen(
    bot,
    boardName,
    articleIndex,
    () => bot.send?.(`${articleIndex}\r\r`) ?? Promise.resolve(false),
    onPartial,
  );
}

export async function fetchArticleByAidFromBotManually(
  bot: ArticleFetchBot,
  boardName: string,
  aid: string,
  onPartial?: (partial: PartialArticleData) => void,
): Promise<AdapterArticleData | null> {
  return fetchArticleFromBotManuallyWithOpen(
    bot,
    boardName,
    0,
    () => bot.send?.(`#${aid}\r`) ?? Promise.resolve(false),
    onPartial,
  );
}

async function fetchArticleFromBotManuallyWithOpen(
  bot: ArticleFetchBot,
  boardName: string,
  articleIndex: number,
  openArticle: () => Promise<boolean>,
  onPartial?: (partial: PartialArticleData) => void,
): Promise<AdapterArticleData | null> {
  if (!bot.send) {
    throw new Error("Bot does not expose article navigation methods");
  }

  const previousScreen = bot.getLine ? readScreenLines(bot).join("\n") : "";
  const previousPartial = previousScreen
    ? buildPartialArticleFromRawLines(previousScreen.split("\n"), boardName)
    : null;
  const traceStartedAt = Date.now();
  const trace = createArticleOpenTrace(
    boardName,
    articleIndex,
    previousPartial ? createPartialArticleFingerprint(previousPartial) : null,
  );
  recordArticleOpenTraceEvent(
    trace,
    "open_started",
    traceStartedAt,
    previousPartial?.title ??
      extractCurrentBoardName(previousScreen) ??
      undefined,
  );

  const entered = await ensureBoardView(bot, boardName, true);
  if (!entered) {
    recordArticleOpenTraceEvent(trace, "ensure_board_failed", traceStartedAt);
    throw new Error(`無法進入看板 ${boardName}`);
  }
  recordArticleOpenTraceEvent(trace, "ensure_board_done", traceStartedAt);
  await openArticle();
  recordArticleOpenTraceEvent(trace, "send_open_done", traceStartedAt);

  let firstScreen: ArticleFirstScreenSnapshot | null = null;
  let initialScreenForProgressiveRead: string[] | null = null;
  if (onPartial && bot.getLine) {
    firstScreen = await waitForArticleFirstScreen(bot, boardName, {
      // Avoid blocking progressive paging for too long when terminal snapshots lag.
      timeoutMs: 350,
      previousFingerprint: trace.previousFingerprint,
      trace,
      traceStartedAt,
    });
    if (firstScreen) {
      recordArticleOpenTraceEvent(
        trace,
        "first_screen_detected",
        traceStartedAt,
        firstScreen.partial.title,
      );
      onPartial(firstScreen.partial);
      initialScreenForProgressiveRead = firstScreen.screenLines;
    } else {
      recordArticleOpenTraceEvent(
        trace,
        "first_screen_timeout",
        traceStartedAt,
      );
      initialScreenForProgressiveRead = readScreenLines(bot);
    }
  }

  const rawLines =
    onPartial && bot.getLine
      ? await readArticleLinesProgressively(
          bot,
          boardName,
          onPartial,
          trace,
          traceStartedAt,
          initialScreenForProgressiveRead,
          Boolean(firstScreen),
        )
      : await bot.getLines?.();
  recordArticleOpenTraceEvent(
    trace,
    "progressive_read_done",
    traceStartedAt,
    Array.isArray(rawLines) ? `${rawLines.length} lines` : "no lines",
  );

  // Exit article view so the bot is in board list when the next serial task starts.
  await bot.send?.("q");

  if (!Array.isArray(rawLines) || rawLines.length === 0) return null;

  const rawFull = rawLines.join("\n");
  const { body, sourceBody, revisions } = splitArticleBody(rawFull);
  const parsed = parseArticleHeaderBlock(body);
  const parsedSource = parseArticleHeaderBlock(sourceBody);
  const author = parsed.author;
  const title = parsed.title;
  const date = parsed.date;
  const thread = buildArticleThread(rawFull, author);
  recordArticleOpenTraceEvent(
    trace,
    "thread_build_done",
    traceStartedAt,
    `${thread.pushes.length} pushes`,
  );
  const debug = buildArticleDebugDump({
    boardName,
    articleIndex,
    title,
    author,
    rawLines,
    pushes: thread.pushes,
    articleNotes: thread.articleNotes,
  });
  trace.finalTitle = title;
  trace.finalAuthor = author;
  trace.finalBoard = parsed.board || boardName;
  recordArticleOpenTraceEvent(
    trace,
    "final_article_settled",
    traceStartedAt,
    title,
  );

  return {
    title,
    author,
    date,
    board: parsed.board || boardName,
    body: parsed.content,
    pushes: thread.pushes,
    articleNotes: thread.articleNotes,
    revisions,
    revisionSourceBody: parsedSource.content,
    score: thread.score,
    debug,
  };
}
