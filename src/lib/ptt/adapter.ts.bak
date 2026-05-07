import Ptt from "ptt-client";
import { Board } from "ptt-client/dist/sites/ptt/model";
import sleep from "sleep-promise";
import type PttConfig from "ptt-client/dist/config";
import { substrWidth } from "ptt-client/dist/utils/char";
import {
  aggregatePushes,
  calcArticleScore,
  type AggregatedPush,
} from "./pushAggregator";
import {
  extractArticleThreadEvents,
  parsePushBuffer,
  splitArticleBody,
  stripAnsi,
  type ArticleEditRecord,
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

export interface AdapterArticleData {
  title: string;
  author: string;
  date: string;
  board: string;
  body: string;
  pushes: AggregatedPush[];
  articleNotes: ArticleEditRecord[];
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
  filterArticlesByPush: (
    boardName: string,
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
  ) => Promise<{ ok: boolean }>;
  editArticle: (body: string, editSummary: string) => Promise<{ ok: boolean }>;
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
  getFavorite?: (offsets?: number | number[]) => Promise<Board[]>;
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
  Pick<BotLike, "send" | "getLine" | "enterBoardByName" | "enterIndex">
>;

type WriteBot = BoardFetchBot;

const PTT_KEY_PGDOWN = "\x1b[6~";
const PTT_KEY_HOME = "\x1b[1~";
const PTT_KEY_END = "\x1b[4~";
const PTT_KEY_CTRL_C = "\x03";
const PTT_KEY_CTRL_P = "\x10";
const PTT_KEY_CTRL_X = "\x18";
const MAX_BOARD_SCREEN_INDEX_GAP = 50000;

type AdapterDebugGlobal = typeof globalThis & {
  __pttzzzLastArticleOpenTrace?: ArticleOpenTrace | null;
};

const PTT_WS_URL = import.meta.env.DEV
  ? typeof location !== "undefined"
    ? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ptt-ws`
    : "ws://127.0.0.1:4173/ptt-ws"
  : "wss://ws.ptt.cc/bbs";

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
        await this.bot.send(`${username}\r${password}\r`);

        const startedAt = Date.now();
        while (Date.now() - startedAt < 15000) {
          const plain = stripAnsi(this.readTerminalSnapshot());

          if (
            plain.includes("抱歉，目前已有太多 guest 在站上") ||
            (plain.includes("guest") && plain.includes("在站上"))
          ) {
            return { ok: false, reason: "guest_overload" };
          }

          if (
            plain.includes("請稍後再試") ||
            plain.includes("請勿頻繁登入以免造成系統過度負荷")
          ) {
            return { ok: false, reason: "login_rate_limited" };
          }

          if (plain.includes("密碼不對或無此帳號")) {
            return { ok: false, reason: "invalid_credentials" };
          }

          if (plain.includes("您想刪除其他重複登入的連線嗎")) {
            await this.bot.send(`${kickOthers ? "y" : "n"}\r`);
          } else if (
            plain.includes("按任意鍵繼續") ||
            plain.includes("請按任意鍵繼續")
          ) {
            await this.bot.send("\r");
          } else if (plain.includes("您要刪除以上錯誤嘗試的記錄嗎")) {
            await this.bot.send("y\r");
          } else if (
            plain.toLowerCase().includes("y/n") &&
            !plain.includes("請輸入代號")
          ) {
            await this.bot.send("y\r");
          } else if (
            plain.includes("我是") ||
            plain.includes("主功能表") ||
            plain.includes("【主功能表】") ||
            plain.includes("【分類看板】") ||
            plain.includes("分類看板") ||
            plain.includes("批踢踢實業坊")
          ) {
            this.markLoggedIn();
            return { ok: true };
          }

          await sleep(250);
        }

        return { ok: false, reason: this.detectLoginFailureReason() };
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
      const entered = await ensureNormalBoardView(this.bot, boardName);
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

  async listHotBoards(): Promise<HotBoardSummary[]> {
    return this.runSerial(async () => {
      await this.waitUntilLoggedIn();
      const boards = await Board.select(this.bot).where("entry", "hot").get();
      return boards.map(mapHotBoardRow).filter((board) => board.name !== "");
    });
  }

  async getFavoriteBoards(): Promise<string[]> {
    return this.runSerial(async () => {
      await this.waitUntilLoggedIn();
      if (!this.bot.getFavorite) {
        if (import.meta.env.DEV) console.log("[getFavoriteBoards] bot.getFavorite not available");
        return [];
      }
      try {
        const boards = await this.bot.getFavorite();
        const names = boards.map((b: Board) => b.name);
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
  ): Promise<{ ok: boolean }> {
    return this.runSerial(async () => {
      await this.waitUntilLoggedIn();
      return submitPostFromBot(this.bot, board, category, title, body);
    });
  }

  async editArticle(
    _body: string,
    _editSummary: string,
  ): Promise<{ ok: boolean }> {
    throw new Error("Article editing is not implemented yet");
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

  private detectLoginFailureReason(): LoginFailureReason {
    const plain = stripAnsi(this.readTerminalSnapshot());

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
  board: Pick<Board, "name" | "title" | "users">,
): HotBoardSummary {
  return {
    name: board.name.trim(),
    title: board.title.trim(),
    users: board.users.trim(),
  };
}

export function parsePostCategoryOptions(screen: string): string[] {
  const plain = stripAnsi(screen).replace(/\r/g, "");
  const promptLines = plain
    .split("\n")
    .filter((line) => /分類|類別|種類|標題/u.test(line));
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
    const tokenMatches = line.matchAll(
      /(?:^|[\s(（])(?:\d{1,2}|[A-Za-z])[\s.)、:：）]+([^\s()[\]（）:：，,。；;]{1,12})/gu,
    );
    for (const match of tokenMatches) {
      if (match[1] && !/請|按|選擇|取消|標題|分類|類別|種類/u.test(match[1])) {
        add(match[1]);
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
    const indexRaw = substrWidth("dbcs", line, 1, 7).trim();
    const pushCount = substrWidth("dbcs", line, 9, 2).trim();
    const date = substrWidth("dbcs", line, 11, 5).trim();
    const author = substrWidth("dbcs", line, 17, 12).trim();
    const rawStatus = substrWidth("dbcs", line, 30, 2).trim();
    const titleCell = substrWidth("dbcs", line, 32).trim();
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

  await bot.send(`s${boardName}\r ${PTT_KEY_HOME}${PTT_KEY_END}`);
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
  let screen = readVisibleScreen(bot);
  const onBoard =
    extractCurrentBoardName(screen)?.toLowerCase() === boardName.toLowerCase();

  if (onBoard) {
    if (!isBoardListScreen(screen)) {
      // Article view: q exits to board list — poll for it rather than a fixed sleep.
      await bot.send?.("q");
      const afterQ = bot.getLine
        ? await waitForBoardListScreen(bot, boardName, 600)
        : null;
      screen = afterQ ?? (await sleep(200), readVisibleScreen(bot));
    }
    if (isFilterModeScreen(screen)) {
      // Title-search filter list: exit to board category level, re-enter normally
      await bot.enterIndex?.();
      await sleep(200);
      // Fall through to enterBoardByName to re-enter in normal mode
    } else if (isBoardListScreen(screen) && !forceReenter) {
      // Already in normal board list — nothing to do (unless caller forces re-entry
      // to escape push-filter mode, which looks identical to normal mode)
      return true;
    }
  }

  if (bot.enterBoardByName) {
    try {
      const entered = await bot.enterBoardByName(boardName);
      if (entered) return true;
    } catch {
      // fall back
    }
  }

  if (!bot.send) return false;
  await bot.send(`s${boardName}\r ${PTT_KEY_HOME}${PTT_KEY_END}`);
  await sleep(150);

  return (
    extractCurrentBoardName(readVisibleScreen(bot))?.toLowerCase() ===
    boardName.toLowerCase()
  );
}

async function fetchPostCategoryOptionsFromBot(
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

  const startedAt = Date.now();
  let options: string[] = [];
  while (Date.now() - startedAt < 1200) {
    options = parsePostCategoryOptions(readVisibleScreen(bot));
    if (options.length > 0) break;
    await sleep(50);
  }

  await bot.send(PTT_KEY_CTRL_C);
  await sleep(80);

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

async function submitPushFromCurrentArticle(
  bot: WriteBot,
  content: string,
  pushType: PushType,
  returnBoardName?: string,
): Promise<{ ok: boolean }> {
  const trimmed = content.trim();
  if (!trimmed) return { ok: false };
  if (!bot.send || !bot.getLine) {
    throw new Error("Bot does not expose article write methods");
  }

  await bot.send("X");
  await sleep(180);

  const afterCommand = stripAnsi(readVisibleScreen(bot));
  if (
    /1\..*(2\.|噓)|值得推薦|給它噓聲|只加註解|推文方式|推文種類/u.test(
      afterCommand,
    )
  ) {
    await bot.send(getPushTypeKey(pushType));
    await sleep(140);
  }

  await bot.send(`${trimmed}\r`);

  let afterContent = "";
  const confirmStartedAt = Date.now();
  while (Date.now() - confirmStartedAt < 3500) {
    afterContent = stripAnsi(readVisibleScreen(bot));
    if (/確定|是否|送出|儲存/u.test(afterContent)) break;
    await sleep(80);
  }

  if (/確定|是否|送出|儲存/u.test(afterContent)) {
    await bot.send("y\r");
    await sleep(500);
    const afterConfirm = stripAnsi(readVisibleScreen(bot));
    if (/請按任意鍵繼續|按任意鍵繼續/u.test(afterConfirm)) {
      await bot.send("\r");
      await sleep(300);
    }
    if (returnBoardName) {
      await ensureNormalBoardView(bot, returnBoardName);
    }
    return { ok: true };
  }

  return { ok: false };
}

async function submitPostFromBot(
  bot: WriteBot,
  boardName: string,
  category: string,
  title: string,
  body: string,
): Promise<{ ok: boolean }> {
  if (!bot.send || !bot.getLine) {
    throw new Error("Bot does not expose article write methods");
  }

  const entered = await ensureNormalBoardView(bot, boardName);
  if (!entered) {
    throw new Error(`無法進入看板 ${boardName}`);
  }

  await bot.send(PTT_KEY_CTRL_P);
  await sleep(250);

  const options = parsePostCategoryOptions(readVisibleScreen(bot));
  const selectedIndex = options.findIndex((option) => option === category);
  if (selectedIndex >= 0) {
    await bot.send(String(selectedIndex + 1));
    await sleep(150);
  } else {
    await bot.send("\r");
    await sleep(150);
  }

  const fullTitle = category ? `[${category}] ${title.trim()}` : title.trim();
  await bot.send(`${fullTitle}\r`);
  await sleep(250);
  await bot.send(`${body.trim()}\r`);
  await sleep(100);
  await bot.send(`${PTT_KEY_CTRL_X}s`);
  await sleep(350);

  return { ok: true };
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
  const { body } = splitArticleBody(rawFull);
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
  const { body: rawBody } = splitArticleBody(rawArticle);
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
      const { body } = splitArticleBody(rawFull);
      const parsed = parseArticleHeaderBlock(body);
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
  const { body } = splitArticleBody(rawFull);
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
  const { body } = splitArticleBody(rawFull);
  const parsed = parseArticleHeaderBlock(body);
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
    score: thread.score,
    debug,
  };
}
