import type {
  AdapterArticleData,
  ActionResult,
  ConnectionStatus,
  HotBoardSummary,
  EditArticleRequest,
  LoginResult,
  PartialArticleData,
  PttAdapter,
  PushType,
} from "./adapter";
import {
  formatPttzzzEditSummary,
  splitArticleBody,
  splitArticleEditableContent,
  type ArticleSummary,
  type RawPush,
} from "./parser";
import { aggregatePushes, calcArticleScore } from "./pushAggregator";

export const FAKE_PTT_STORE_KEY = "pttzzz_fake_ptt_store_v1";
const FAKE_USER_KEY = "pttzzz_fake_ptt_user";
const DEFAULT_USER = "mockUser";

type FakeArticleRecord = {
  index: number;
  mark: string;
  board: string;
  category: string;
  title: string;
  author: string;
  date: string;
  body: string;
  rawPushes: RawPush[];
};

type FakeBoardRecord = {
  title: string;
  category: string;
  articles: FakeArticleRecord[];
};

type FakePttStore = {
  boards: Record<string, FakeBoardRecord>;
  favorites: string[];
};

type Listener<T> = (value: T) => void;

export function isFakePttMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("mockPtt") === "1";
}

export function getFakePttCurrentUser(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  const requestedUser = getRequestedFakePttUser();
  if (requestedUser) {
    sessionStorage.setItem(FAKE_USER_KEY, requestedUser);
    return requestedUser;
  }
  return sessionStorage.getItem(FAKE_USER_KEY);
}

function getRequestedFakePttUser(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("mockUser");
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function createDefaultStore(): FakePttStore {
  return {
    favorites: ["test", "Gossiping", "Baseball"],
    boards: {
      test: {
        title: "測試板",
        category: "測試",
        articles: [
          {
            index: 1001,
            mark: "",
            board: "test",
            category: "測試",
            title: "[測試] Fake PTT 多帳號互動測試",
            author: "opUser",
            date: "Mon Jun 01 12:00:00 2026",
            body:
              "這是 Fake PTT 模式的測試文章。\n\n請開多個分頁使用不同帳號登入，測試回文、回覆某樓、推與噓。",
            rawPushes: [
              createRawPush("push", "alice", "第一則回覆，歡迎測試", 1),
              createRawPush("neutral", "bob", "回1樓：我用 bob 回覆 alice", 2),
              createRawPush("push", "charlie", "推1樓", 3),
            ],
          },
        ],
      },
      Gossiping: {
        title: "八卦",
        category: "綜合",
        articles: [
          {
            index: 30215,
            mark: "",
            board: "Gossiping",
            category: "問卦",
            title: "[問卦] Fake 模式也能測八卦版嗎",
            author: "mockUser",
            date: "Mon Jun 01 12:10:00 2026",
            body: "可以。這篇文章只存在本機 fake store，不會連到真實 PTT。",
            rawPushes: [createRawPush("push", "alice", "可以安全測試", 1)],
          },
        ],
      },
      Baseball: {
        title: "棒球",
        category: "運動",
        articles: [
          {
            index: 16250,
            mark: "",
            board: "Baseball",
            category: "分享",
            title: "[分享] 今日 Fake PTT 測試名單",
            author: "opUser",
            date: "Mon Jun 01 12:20:00 2026",
            body: "這裡可以測搜尋與推噓門檻，但資料同樣只在 localStorage。",
            rawPushes: [createRawPush("push", "bob", "今日測試", 1)],
          },
        ],
      },
    },
  };
}

function createRawPush(
  type: PushType,
  author: string,
  content: string,
  floor: number,
): RawPush {
  return {
    type: type === "boo" ? "boo" : type === "push" ? "push" : "neutral",
    author,
    content,
    ipAddress: `203.0.113.${floor}`,
    time: formatPushTime(new Date()),
  };
}

function readStore(): FakePttStore {
  if (typeof localStorage === "undefined") return createDefaultStore();
  const raw = localStorage.getItem(FAKE_PTT_STORE_KEY);
  if (!raw) {
    const initial = createDefaultStore();
    writeStore(initial);
    return initial;
  }

  try {
    return JSON.parse(raw) as FakePttStore;
  } catch {
    const initial = createDefaultStore();
    writeStore(initial);
    return initial;
  }
}

function writeStore(store: FakePttStore): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(FAKE_PTT_STORE_KEY, JSON.stringify(store));
}

function mutateStore(mutator: (store: FakePttStore) => void): FakePttStore {
  const store = readStore();
  mutator(store);
  writeStore(store);
  return store;
}

function normalizeBoardName(boardName: string): string {
  const trimmed = boardName.trim();
  const store = readStore();
  return Object.keys(store.boards).find((name) => name.toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
}

function getBoard(store: FakePttStore, boardName: string): FakeBoardRecord | null {
  return store.boards[normalizeBoardName(boardName)] ?? null;
}

function getArticleRecord(
  store: FakePttStore,
  boardName: string,
  articleIndex: number,
): FakeArticleRecord | null {
  return getBoard(store, boardName)?.articles.find((article) => article.index === articleIndex) ?? null;
}

function pushCountLabel(article: FakeArticleRecord): string {
  const thread = aggregatePushes(article.rawPushes, article.author);
  const score = calcArticleScore(thread.pushes);
  if (score >= 100) return "爆";
  if (score <= -10) return `X${Math.min(9, Math.abs(score) / 10)}`;
  return score > 0 ? String(score) : "";
}

function toSummary(article: FakeArticleRecord): ArticleSummary {
  return {
    index: article.index,
    mark: article.mark,
    pushCount: pushCountLabel(article),
    date: formatArticleListDate(article.date),
    author: article.author,
    title: `${article.category ? `[${article.category}] ` : ""}${article.title.replace(/^\[[^\]]+\]\s*/u, "")}`,
  };
}

function toArticleData(article: FakeArticleRecord): AdapterArticleData {
  const thread = aggregatePushes(article.rawPushes, article.author);
  const score = calcArticleScore(thread.pushes);
  const parsedBody = splitArticleBody(article.body);
  return {
    title: article.title,
    author: article.author,
    date: article.date,
    board: article.board,
    body: parsedBody.body,
    pushes: thread.pushes,
    articleNotes: thread.articleNotes,
    revisions: parsedBody.revisions,
    score,
  };
}

function formatArticleListDate(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${String(parsed.getMonth() + 1).padStart(2, "0")}/${String(parsed.getDate()).padStart(2, "0")}`;
}

function formatPushTime(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function currentDateString(): string {
  return new Date().toString().replace(/\sGMT.*$/u, "");
}

function matchesKeywords(article: FakeArticleRecord, keywords: string[]): boolean {
  const title = article.title.toLowerCase();
  return keywords.every((keyword) => title.includes(keyword.toLowerCase()));
}

function matchesPushThreshold(article: FakeArticleRecord, threshold: number): boolean {
  const label = pushCountLabel(article);
  if (label === "爆") return true;
  const numeric = Number.parseInt(label, 10);
  return Number.isFinite(numeric) && numeric >= threshold;
}

export function createFakePttAdapter(): PttAdapter {
  return new FakePttAdapter();
}

class FakePttAdapter implements PttAdapter {
  private status: ConnectionStatus = "connected";
  private currentUser: string | null = getFakePttCurrentUser();
  private currentArticle: { boardName: string; articleIndex: number } | null = null;
  private statusListeners = new Set<Listener<ConnectionStatus>>();
  private screenListeners = new Set<Listener<string>>();

  send = async () => true;

  async login(username: string): Promise<LoginResult> {
    const nextUser = username.trim() || DEFAULT_USER;
    this.currentUser = nextUser;
    sessionStorage.setItem(FAKE_USER_KEY, nextUser);
    this.emitScreen(`[Fake PTT] logged in as ${nextUser}`);
    this.emitStatus("connected");
    return { ok: true };
  }

  async listArticles(boardName: string, beforeIndex?: number): Promise<ArticleSummary[]> {
    const board = getBoard(readStore(), boardName);
    if (!board) return [];
    return board.articles
      .filter((article) => beforeIndex === undefined || article.index < beforeIndex)
      .sort((a, b) => b.index - a.index)
      .map(toSummary);
  }

  async getArticle(
    boardName: string,
    articleIndex: number,
    onPartial?: (partial: PartialArticleData) => void,
  ): Promise<AdapterArticleData | null> {
    const article = getArticleRecord(readStore(), boardName, articleIndex);
    if (!article) return null;
    this.currentArticle = { boardName: normalizeBoardName(boardName), articleIndex };
    const data = toArticleData(article);
    onPartial?.(data);
    return data;
  }

  async getArticleByAid(
    boardName: string,
    aid: string,
    onPartial?: (partial: PartialArticleData) => void,
  ): Promise<AdapterArticleData | null> {
    const numeric = Number.parseInt(aid.replace(/^#/u, ""), 10);
    if (!Number.isFinite(numeric)) return null;
    return this.getArticle(boardName, numeric, onPartial);
  }

  async searchArticles(boardName: string, keyword: string, beforeIndex?: number): Promise<ArticleSummary[]> {
    return this.searchArticlesByKeywords(boardName, [keyword], beforeIndex);
  }

  async searchArticlesByKeywords(
    boardName: string,
    keywords: string[],
    beforeIndex?: number,
  ): Promise<ArticleSummary[]> {
    return (await this.listArticles(boardName, beforeIndex)).filter((summary) =>
      keywords.every((keyword) => summary.title.toLowerCase().includes(keyword.toLowerCase())),
    );
  }

  async filterArticlesByPush(
    boardName: string,
    threshold: number,
    beforeIndex?: number,
  ): Promise<ArticleSummary[]> {
    const board = getBoard(readStore(), boardName);
    if (!board) return [];
    return board.articles
      .filter((article) => beforeIndex === undefined || article.index < beforeIndex)
      .filter((article) => matchesPushThreshold(article, threshold))
      .sort((a, b) => b.index - a.index)
      .map(toSummary);
  }

  async filterArticlesByTitleAndPush(
    boardName: string,
    keywords: string[],
    threshold: number,
    beforeIndex?: number,
  ): Promise<ArticleSummary[]> {
    const board = getBoard(readStore(), boardName);
    if (!board) return [];
    return board.articles
      .filter((article) => beforeIndex === undefined || article.index < beforeIndex)
      .filter((article) => matchesKeywords(article, keywords))
      .filter((article) => matchesPushThreshold(article, threshold))
      .sort((a, b) => b.index - a.index)
      .map(toSummary);
  }

  async listHotBoards(): Promise<HotBoardSummary[]> {
    const store = readStore();
    return Object.entries(store.boards).map(([name, board], index) => ({
      name,
      title: board.title,
      users: String(100 - index * 10),
    }));
  }

  async getFavoriteBoards(): Promise<string[]> {
    return readStore().favorites;
  }

  async getPostCategoryOptions(boardName: string): Promise<string[]> {
    const board = getBoard(readStore(), boardName);
    return board ? [board.category, "測試", "閒聊", "分享"] : ["測試"];
  }

  async replyToArticle(content: string, pushType: PushType, boardName?: string): Promise<{ ok: boolean }> {
    return this.appendPush(boardName, content, pushType);
  }

  async replyToPush(
    floor: number,
    content: string,
    pushType: PushType,
    boardName?: string,
  ): Promise<{ ok: boolean }> {
    const body = content.trim().match(/^回.+樓/u)
      ? content
      : `回${floor}樓：${content}`;
    return this.appendPush(boardName, body, pushType);
  }

  async voteArticle(floor: number, kind: "push" | "boo", boardName?: string): Promise<{ ok: boolean }> {
    return this.appendPush(boardName, `${kind === "push" ? "推" : "噓"}${floor}樓`, kind);
  }

  async votePush(floor: number, kind: "push" | "boo", boardName?: string): Promise<{ ok: boolean }> {
    return this.voteArticle(floor, kind, boardName);
  }

  async postArticle(
    boardName: string,
    category: string,
    title: string,
    body: string,
  ): Promise<{ ok: boolean; reason?: string }> {
    if (!this.currentUser) return { ok: false, reason: "尚未登入 fake PTT" };
    mutateStore((store) => {
      const normalizedBoardName = normalizeBoardName(boardName);
      store.boards[normalizedBoardName] = store.boards[normalizedBoardName] ?? {
        title: normalizedBoardName,
        category: "測試",
        articles: [],
      };
      const board = store.boards[normalizedBoardName];
      const nextIndex = Math.max(0, ...board.articles.map((article) => article.index)) + 1;
      board.articles.push({
        index: nextIndex,
        mark: "",
        board: normalizedBoardName,
        category,
        title: category ? `[${category}] ${title}` : title,
        author: this.currentUser!,
        date: currentDateString(),
        body,
        rawPushes: [],
      });
    });
    this.emitScreen("[Fake PTT] post created");
    return { ok: true };
  }

  async editArticle(request: EditArticleRequest): Promise<ActionResult> {
    if (!this.currentUser) {
      return { ok: false, reason: "尚未登入 fake PTT" };
    }

    const store = readStore();
    const article = getArticleRecord(
      store,
      request.boardName,
      request.articleIndex,
    );
    if (!article) {
      return { ok: false, reason: "找不到要編輯的文章" };
    }
    if (article.author !== this.currentUser) {
      return { ok: false, reason: "只有文章作者可以編輯文章" };
    }
    if (
      article.author !== request.expectedAuthor ||
      article.title !== request.expectedTitle
    ) {
      return { ok: false, reason: "文章身分已變更，請重新載入" };
    }

    const marker = formatPttzzzEditSummary(request.editSummary);
    if (!marker) {
      return { ok: false, reason: "編輯摘要不可為空" };
    }

    const { preservedFooter } = splitArticleEditableContent(article.body);
    article.body = [
      request.body.trimEnd(),
      preservedFooter,
      marker,
    ]
      .filter(Boolean)
      .join("\n");
    writeStore(store);
    this.emitScreen("[Fake PTT] article edited");
    return { ok: true };
  }

  async disconnect(): Promise<void> {
    this.status = "closed";
    this.emitStatus("closed");
  }

  isLoggedIn(): boolean {
    return Boolean(this.currentUser);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getLastScreen(): string {
    return this.currentUser
      ? `[Fake PTT] ${this.currentUser}`
      : "[Fake PTT] need login";
  }

  subscribeStatus(listener: Listener<ConnectionStatus>): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  subscribeScreen(listener: Listener<string>): () => void {
    this.screenListeners.add(listener);
    return () => this.screenListeners.delete(listener);
  }

  private appendPush(
    boardName: string | undefined,
    content: string,
    pushType: PushType,
  ): ActionResult {
    if (!this.currentUser) return { ok: false, reason: "尚未登入 fake PTT" };
    const targetBoardName = boardName
      ? normalizeBoardName(boardName)
      : this.currentArticle?.boardName;
    if (!targetBoardName || this.currentArticle?.boardName !== targetBoardName) {
      return { ok: false, reason: "尚未開啟要回覆的文章" };
    }

    const store = readStore();
    const article = getArticleRecord(
      store,
      targetBoardName,
      this.currentArticle.articleIndex,
    );
    if (!article) return { ok: false, reason: "找不到要回覆的文章" };
    article.rawPushes.push(
      createRawPush(pushType, this.currentUser, content.trim(), article.rawPushes.length + 1),
    );
    writeStore(store);

    this.emitScreen(`[Fake PTT] ${this.currentUser}: ${content}`);
    return { ok: true };
  }

  private emitStatus(status: ConnectionStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }

  private emitScreen(screen: string): void {
    for (const listener of this.screenListeners) listener(screen);
  }
}
