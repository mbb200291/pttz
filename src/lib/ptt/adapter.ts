import Ptt from "ptt-client";
import sleep from "sleep-promise";
import {
  aggregatePushes,
  calcArticleScore,
  type AggregatedPush,
} from "./pushAggregator";
import {
  parsePushBuffer,
  splitArticleBody,
  stripAnsi,
  type ArticleSummary,
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

export interface PttClientArticleRow {
  id: number;
  push?: string;
  date?: string;
  author?: string;
  status?: string;
  title?: string;
}

export interface AdapterArticleData {
  title: string;
  author: string;
  date: string;
  board: string;
  body: string;
  pushes: AggregatedPush[];
  score: number;
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
  ) => Promise<AdapterArticleData | null>;
  disconnect: () => Promise<void>;
  isLoggedIn: () => boolean;
  getStatus: () => ConnectionStatus;
  getLastScreen: () => string;
  subscribeStatus: (listener: (status: ConnectionStatus) => void) => () => void;
  subscribeScreen: (listener: (screen: string) => void) => () => void;
}

type BotLike = {
  state: { connect?: boolean; login?: boolean };
  _state?: { connect?: boolean; login?: boolean; position?: { boardname?: string } };
  searchCondition?: { init?: () => void };
  socket?: { disconnect?: () => void };
  on: (event: string, listener: (...args: unknown[]) => void) => BotLike;
  send: (msg: string) => Promise<boolean>;
  getLines?: () => Promise<string[]>;
  enterBoardByName?: (boardName: string) => Promise<boolean>;
  enterIndex?: () => Promise<boolean>;
  getArticles: (boardName: string, offset?: number) => Promise<PttClientArticleRow[]>;
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
  getLine?: (n: number) => { str?: string };
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
  private readonly statusListeners = new Set<(status: ConnectionStatus) => void>();
  private readonly screenListeners = new Set<(screen: string) => void>();
  private readonly runSerial = createSerialTaskRunner();

  constructor() {
    this.bot = this.createBot();
  }

  private createBot(): BotLike {
    const bot = new Ptt({
      url: PTT_WS_URL,
      charset: "big5",
      protocol: "websocket",
    }) as unknown as BotLike;

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
    kickOthers = true,
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
    return this.runSerial(async () => {
      const rows = await this.bot.getArticles(boardName, beforeIndex ?? 0);
      return rows
        .map(mapArticleRow)
        .filter((article) => article.index > 0 && article.title.trim().length > 0)
        .sort((a, b) => b.index - a.index);
    });
  }

  async getArticle(
    boardName: string,
    articleIndex: number,
  ): Promise<AdapterArticleData | null> {
    return this.runSerial(() =>
      fetchArticleFromBot(this.bot, boardName, articleIndex),
    );
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

  return {
    index: row.id,
    mark: rawStatus === "R:" ? " " : rawStatus || " ",
    pushCount: row.push?.trim() || "",
    date: row.date?.trim() || "",
    author: row.author?.trim() || "",
    title,
  };
}

function normalizeText(raw: string): string {
  return stripAnsi(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
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
      headerBlock.match(/作者\s+(.+?)(?=\s+看板\s+|\s+標題\s+|\s+時間\s+|$)/u)?.[1]?.trim() ??
      findField("作者"),
    board:
      headerBlock.match(/看板\s+(.+?)(?=\s+標題\s+|\s+時間\s+|$)/u)?.[1]?.trim() ??
      findField("看板"),
    title:
      headerBlock.match(/標題\s+(.+?)(?=\s+時間\s+|$)/u)?.[1]?.trim() ??
      findField("標題"),
    date:
      headerBlock.match(/時間\s+(.+)$/u)?.[1]?.trim() ??
      findField("時間"),
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
  bot: Pick<
    BotLike,
    "enterBoardByName" | "send" | "getLines" | "getLine" | "getArticle"
  >,
  boardName: string,
  articleIndex: number,
): Promise<AdapterArticleData | null> {
  if (typeof bot.getArticle === "function") {
    const botWithGetArticle = bot as Pick<BotLike, "getArticle" | "enterIndex">;
    const originalEnterIndex = botWithGetArticle.enterIndex;

    if (originalEnterIndex) {
      botWithGetArticle.enterIndex = async () => true;
    }

    try {
      const article = await botWithGetArticle.getArticle(boardName, articleIndex);
      const rawLines = article?.lines;

      if (!Array.isArray(rawLines) || rawLines.length === 0) return null;

      const rawFull = rawLines.join("\n");
      const { body } = splitArticleBody(rawFull);
      const parsed = parseArticleHeaderBlock(body);
      const author = parsed.author || article.author?.trim() || "";
      const title = parsed.title || article.title?.trim() || "";
      const date = parsed.date || article.timestamp?.trim() || "";
      const pushes = aggregatePushes(parsePushBuffer(rawFull), author);

      return {
        title,
        author,
        date,
        board: parsed.board || article.boardname?.trim() || boardName,
        body: parsed.content,
        pushes,
        score: calcArticleScore(pushes),
      };
    } finally {
      if (originalEnterIndex) {
        botWithGetArticle.enterIndex = originalEnterIndex;
      }
    }
  }

  if (!bot.enterBoardByName || !bot.getLines) {
    throw new Error("Bot does not expose article navigation methods");
  }

  await bot.enterBoardByName(boardName);
  await bot.send(`${articleIndex}\r\r`);
  await sleep(180);

  const rawLines = await bot.getLines();

  if (!Array.isArray(rawLines) || rawLines.length === 0) return null;

  const rawFull = rawLines.join("\n");
  const { body } = splitArticleBody(rawFull);
  const parsed = parseArticleHeaderBlock(body);
  const author = parsed.author;
  const title = parsed.title;
  const date = parsed.date;
  const pushes = aggregatePushes(parsePushBuffer(rawFull), author);

  return {
    title,
    author,
    date,
    board: parsed.board || boardName,
    body: parsed.content,
    pushes,
    score: calcArticleScore(pushes),
  };
}
