import type {
  AdapterArticleData,
  ArticleKey,
  Board,
  PartialArticleData,
  PttCommand,
  PushType,
  RawArticleSource,
  GatewayReplyDraftInput,
  ReplyDelivery,
} from "@pttzzz/core";
import { encodedReplyBytes, ReplyDraftQueue } from "./multipartReply.js";
import type { BrowserGatewayDriver } from "../gateway.js";
import { formatEditorBody } from "./articleFormatting.js";
import type {
  ActionResult,
  ConnectionStatus,
  DeleteArticleRequest,
  EditArticleRequest,
  HotBoardSummary,
  LoginResult,
  ReplyArticleToBoardRequest,
} from "./terminalDriver.js";
import {
  aggregatePushes,
  pushContentCapacity,
  formatBoardReplyTitle,
  formatEditPush,
  splitArticleBody,
  splitArticleEditableContent,
  type ArticleSummary,
  type RawPush,
} from "@pttzzz/core/internal";

export const FAKE_PTT_STORE_KEY = "pttzzz_fake_ptt_store_v1";
const FAKE_USER_KEY = "pttzzz_fake_ptt_user";
const DEFAULT_USER = "mockUser";

type FakeArticleRecord = {
  index: number;
  aid: string;
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
            aid: "FAKE1001",
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
              createRawPush("neutral", "charlie", "推1樓", 3),
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
            aid: "FAKEGOSSIP",
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
            aid: "FAKEBASEBALL",
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

function normalizeAid(aid: string): string {
  return aid.trim().replace(/^#+/u, "");
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).toUpperCase();
}

function uniqueAid(articles: readonly Pick<FakeArticleRecord, "aid">[], seed: string): string {
  const used = new Set(articles.map(({ aid }) => normalizeAid(aid)).filter(Boolean));
  const base = `FAKE${stableHash(seed)}`;
  let aid = base;
  for (let suffix = 2; used.has(aid); suffix += 1) aid = `${base}-${suffix}`;
  return aid;
}

function migrateStore(store: FakePttStore): boolean {
  let changed = false;
  for (const [boardName, board] of Object.entries(store.boards)) {
    const used = new Set<string>();
    for (const article of board.articles) {
      const stored = normalizeAid((article as FakeArticleRecord & { aid?: string }).aid ?? "");
      let aid = stored;
      if (!aid || used.has(aid)) {
        aid = uniqueAid(
          [...used].map((value) => ({ aid: value })),
          [boardName, article.author, article.title, article.date, article.body].join("\0"),
        );
      }
      if (article.aid !== aid) {
        article.aid = aid;
        changed = true;
      }
      used.add(aid);
    }
  }
  return changed;
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
    const store = JSON.parse(raw) as FakePttStore;
    if (migrateStore(store)) writeStore(store);
    return store;
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

function articleForKey(store: FakePttStore, key: ArticleKey): FakeArticleRecord | null {
  if ("index" in key && key.index !== undefined) {
    return getArticleRecord(store, key.board, key.index);
  }
  const aid = normalizeAid(key.aid);
  return getBoard(store, key.board)?.articles.find((article) =>
    normalizeAid(article.aid) === aid) ?? null;
}

function rawArticleText(article: FakeArticleRecord): string {
  const pushType: Record<RawPush["type"], string> = { push: "推", boo: "噓", neutral: "→", edit: "→" };
  return [
    `作者  ${article.author}`,
    `標題  ${article.title}`,
    `時間  ${article.date}`,
    "",
    article.body,
    ...article.rawPushes.map((push) => (
      `${pushType[push.type]} ${push.author}: ${push.content} ${push.time}`
    )),
  ].join("\n");
}

function pushCountLabel(article: FakeArticleRecord): string {
  const thread = aggregatePushes(article.rawPushes, article.author);
  const score = thread.nativeArticleScore;
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
    score: thread.nativeArticleScore,
    nativePushCount: thread.nativePushCount,
    nativeBooCount: thread.nativeBooCount,
    nativeNeutralCount: thread.nativeNeutralCount,
    articlePushVoters: thread.articlePushVoters,
    articleBooVoters: thread.articleBooVoters,
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

export function createLegacyFakePttAdapterForUi() {
  return new FakePttAdapter();
}

export class FakePttAdapter {
  private readonly replyDrafts = new ReplyDraftQueue();
  private status: ConnectionStatus = "connected";
  private currentUser: string | null = getFakePttCurrentUser();
  private currentArticle: { boardName: string; articleIndex: number } | null = null;
  private statusListeners = new Set<Listener<ConnectionStatus>>();
  private screenListeners = new Set<Listener<string>>();

  send = async () => true;

  async connect(): Promise<void> {
    this.emitStatus("connected");
  }

  async login(username: string): Promise<LoginResult> {
    this.replyDrafts.invalidate();
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
    const article = articleForKey(readStore(), { board: boardName, aid });
    if (!article) return null;
    this.currentArticle = { boardName: normalizeBoardName(boardName), articleIndex: article.index };
    const data = toArticleData(article);
    onPartial?.(data);
    return data;
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

  async replyToArticle(content: string, pushType: PushType, boardName?: string): Promise<ActionResult> {
    return this.appendPush(boardName, content, pushType);
  }

  async replyToPush(
    floor: number,
    content: string,
    pushType: PushType,
    boardName?: string,
  ): Promise<ActionResult> {
    const body = content.trim().match(/^回.+樓/u)
      ? content
      : `回${floor}樓：${content}`;
    return this.appendPush(boardName, body, pushType);
  }

  async voteArticle(floor: number, kind: "push" | "boo", boardName?: string): Promise<ActionResult> {
    return this.appendPush(boardName, `${kind === "push" ? "推" : "噓"}${floor}樓`, "neutral");
  }

  async votePush(floor: number, kind: "push" | "boo", boardName?: string): Promise<ActionResult> {
    return this.voteArticle(floor, kind, boardName);
  }

  async withdrawPushVote(floor: number, kind: "push" | "boo", boardName?: string): Promise<ActionResult> {
    return this.appendPush(
      boardName,
      `撤回我對${floor}樓的${kind === "push" ? "推" : "噓"}`,
      "neutral",
    );
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
        aid: uniqueAid(board.articles, [normalizedBoardName, this.currentUser, title, currentDateString()].join("\0")),
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

  async replyArticleToBoard(
    request: ReplyArticleToBoardRequest,
  ): Promise<ActionResult> {
    if (!this.currentUser) {
      return { ok: false, reason: "尚未登入 fake PTT" };
    }

    const store = readStore();
    const source = getArticleRecord(
      store,
      request.boardName,
      request.articleIndex,
    );
    if (!source) {
      return { ok: false, reason: "找不到要回應的文章" };
    }
    if (
      source.author.toLowerCase() !== request.expectedAuthor.toLowerCase() ||
      source.title !== request.expectedTitle
    ) {
      return { ok: false, reason: "文章身分已變更，請重新載入" };
    }

    const body = request.body.trimEnd();
    if (!body.trim()) {
      return { ok: false, reason: "回應正文不可為空" };
    }

    const board = store.boards[normalizeBoardName(request.boardName)];
    const nextIndex = Math.max(0, ...board.articles.map((article) => article.index)) + 1;
    board.articles.push({
      index: nextIndex,
      aid: uniqueAid(board.articles, [request.boardName, this.currentUser, source.title, currentDateString()].join("\0")),
      mark: "",
      board: normalizeBoardName(request.boardName),
      category: "",
      title: formatBoardReplyTitle(source.title),
      author: this.currentUser,
      date: currentDateString(),
      body,
      rawPushes: [],
    });
    writeStore(store);
    this.emitScreen("[Fake PTT] board reply created");
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

    const { preservedFooter } = splitArticleEditableContent(article.body);
    article.body = [
      request.body.trimEnd(),
      preservedFooter,
    ]
      .filter(Boolean)
      .join("\n");
    writeStore(store);
    this.emitScreen("[Fake PTT] article edited");
    return { ok: true };
  }

  async deleteArticle(request: DeleteArticleRequest): Promise<ActionResult> {
    if (!this.currentUser) {
      return { ok: false, reason: "尚未登入 fake PTT" };
    }

    const store = readStore();
    const board = store.boards[normalizeBoardName(request.boardName)];
    const articlePosition = board?.articles.findIndex(
      (article) => article.index === request.articleIndex,
    ) ?? -1;
    if (!board || articlePosition < 0) {
      return { ok: false, reason: "找不到要刪除的文章" };
    }

    const article = board.articles[articlePosition];
    if (article.author.toLowerCase() !== this.currentUser.toLowerCase()) {
      return { ok: false, reason: "只有文章作者可以刪除文章" };
    }
    if (
      article.author.toLowerCase() !== request.expectedAuthor.toLowerCase() ||
      article.title !== request.expectedTitle
    ) {
      return { ok: false, reason: "文章身分已變更，請重新載入" };
    }

    board.articles.splice(articlePosition, 1);
    writeStore(store);
    this.currentArticle = null;
    this.emitScreen("[Fake PTT] article deleted");
    return { ok: true };
  }

  async disconnect(): Promise<void> {
    this.replyDrafts.invalidate();
    this.status = "closed";
    this.emitStatus("closed");
  }

  async readArticleSource(
    key: ArticleKey,
    emit: (source: Omit<RawArticleSource, "articleKey">) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const article = articleForKey(readStore(), key);
    if (!article) throw new Error("找不到文章");
    const index = article.index;
    this.currentArticle = { boardName: article.board, articleIndex: index };
    if (signal?.aborted) return;
    const rawText = rawArticleText(article);
    emit({ completeness: "incomplete", rawText, revision: 1 });
    if (!signal?.aborted) emit({ completeness: "final", rawText, revision: 2 });
  }

  async listBoardEntries(source: {
    kind: "hot" | "favorite" | "category";
    route?: readonly number[];
  }): Promise<readonly (
    | { kind: "board"; board: Board }
    | { kind: "category"; title: string; route: readonly number[] }
  )[]> {
    const store = readStore();
    const board = (name: string): Board => ({
      name,
      title: store.boards[name]?.title ?? name,
      category: store.boards[name]?.category,
      favorite: store.favorites.some((favorite) => favorite.toLowerCase() === name.toLowerCase()),
    });
    if (source.kind === "favorite") {
      return store.favorites.filter((name) => store.boards[name]).map((name) => ({ kind: "board", board: board(name) }));
    }
    if (source.kind === "hot") {
      return Object.keys(store.boards).map((name) => ({ kind: "board", board: board(name) }));
    }
    const categories = [...new Set(Object.values(store.boards).map(({ category }) => category))].sort();
    if (!source.route?.length) {
      return categories.map((title, index) => ({ kind: "category", title, route: [index + 1] }));
    }
    const category = categories[source.route[0] - 1];
    return category
      ? Object.keys(store.boards)
          .filter((name) => store.boards[name].category === category)
          .map((name) => ({ kind: "board" as const, board: board(name) }))
      : [];
  }

  async searchBoardsByPrefix(prefix: string): Promise<readonly Board[]> {
    const entries = await this.listBoardEntries({ kind: "hot" });
    return entries.flatMap((entry) => entry.kind === "board" &&
      entry.board.name.toLowerCase().startsWith(prefix.toLowerCase()) ? [entry.board] : []);
  }

  async sendReplyDraft(input: GatewayReplyDraftInput, onProgress?: (progress: ReplyDelivery) => void): Promise<ReplyDelivery> {
    input = { ...input, article: { ...input.article } };
    return this.replyDrafts.run(input, async () => {
      if (!this.currentUser) throw new Error("尚未登入");
      if (!articleForKey(readStore(), input.article)) throw new Error("找不到文章");
      // The simulator renders non-aligned accounts without IP fields.
      return { author: this.currentUser, capacity: pushContentCapacity(encodedReplyBytes(this.currentUser)) };
    }, async (content, index) => {
      const result = await this.executeArticleCommand({ type: "reply-article", article: input.article,
        content, pushType: input.floor !== undefined || index > 0 ? "neutral" : input.pushType });
      return result.ok ? { ok: true, outcome: "sent" } : { ok: false,
        code: "FAKE_REPLY_FAILED", message: result.reason ?? "回文未送出", outcome: "not-sent", retryable: true };
    }, onProgress);
  }

  async executeArticleCommand(command: Exclude<PttCommand, { type: "create-article" }>): Promise<ActionResult> {
    const article = articleForKey(readStore(), command.article);
    if (!article) return { ok: false, outcome: "not-sent", reason: "找不到文章" };
    this.currentArticle = { boardName: article.board, articleIndex: article.index };
    switch (command.type) {
      case "edit-article":
        return this.editArticle({
          boardName: article.board, articleIndex: article.index,
          expectedAuthor: article.author, expectedTitle: article.title,
          body: command.content,
        });
      case "delete-article":
        return this.deleteArticle({
          boardName: article.board, articleIndex: article.index,
          expectedAuthor: article.author, expectedTitle: article.title,
        });
      case "reply-article":
        return this.replyToArticle(command.content, command.pushType, article.board);
      case "reply-article-to-board":
        return this.replyArticleToBoard({
          boardName: article.board, articleIndex: article.index,
          expectedAuthor: article.author, expectedTitle: article.title, body: command.content,
        });
      case "reply-floor":
        return this.replyToPush(command.floor, command.content, command.pushType, article.board);
      case "edit-floor":
        return this.appendPush(article.board,
          command.mode === "section"
            ? `更正我在${command.floor}樓發言：${command.changes.map((change) => `^${change.start}:${change.end}=${change.replacement}`).join(";")}`
            : `${command.mode === "append" ? "補充" : "更正"}我在${command.floor}樓發言：${command.content}`,
          "neutral");
      case "withdraw-floor":
        for (const range of command.ranges) {
          const result = await this.appendPush(article.board,
            formatEditPush("撤回", range.start, range.end === range.start ? null : range.end, ""), "neutral");
          if (!result.ok) return result;
        }
        return { ok: true };
      case "vote-article":
        return this.appendPush(article.board, command.direction === "push" ? "推" : "噓", command.direction);
      case "withdraw-article-vote":
        return this.appendPush(article.board, command.direction === "push" ? "噓" : "推",
          command.direction === "push" ? "boo" : "push");
      case "vote-floor":
        return this.votePush(command.floor, command.direction, article.board);
      case "withdraw-floor-vote":
        return this.withdrawPushVote(command.floor, command.direction, article.board);
    }
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

export function createFakeTerminalDriver(): BrowserGatewayDriver {
  const adapter = new FakePttAdapter();
  return fakeGatewayDriver(adapter);
}

function fakeGatewayDriver(adapter: FakePttAdapter): BrowserGatewayDriver {
  return {
    connect: () => adapter.connect(),
    login: (username) => adapter.login(username),
    disconnect: () => adapter.disconnect(),
    subscribeStatus: (listener) => adapter.subscribeStatus(listener),
    readArticleSource: (key, emit, signal) => adapter.readArticleSource(key, emit, signal),
    sendReplyDraft: (input, onProgress) => adapter.sendReplyDraft(input, onProgress),
    listBoards: (source) => adapter.listBoardEntries(source),
    searchBoards: (prefix) => adapter.searchBoardsByPrefix(prefix),
    listArticles: async ({ board, beforeIndex, author, keyword }) => {
      const rows = await adapter.listArticles(board, beforeIndex);
      return rows.filter((row) =>
        (!author || row.author.toLowerCase() === author.toLowerCase()) &&
        (!keyword || row.title.toLowerCase().includes(keyword.toLowerCase())));
    },
    execute: async (command) => {
      if ((command.type === "create-article" || command.type === "edit-article" || command.type === "reply-article-to-board") && command.formatting?.length) {
        if (command.type !== "create-article" && !command.content.trim()) {
          return { ok: false, code: "INVALID_INPUT", reason: "正文不可為空", outcome: "not-sent", retryable: false };
        }
        // Simulate the editor's Ctrl+U conversion; validation rejects caller-supplied controls.
        command = { ...command, content: formatEditorBody(command.content, command.formatting).replace(/\x15/g, "\x1b") };
      }
      const result: ActionResult = command.type === "create-article"
        ? await adapter.postArticle(command.board, command.category ?? "", command.title, command.content)
        : await adapter.executeArticleCommand(command);
      return result.ok
        ? { ok: true }
        : {
            ok: false,
            code: result.code ?? "ACTION_FAILED",
            reason: result.reason ?? "Fake PTT 操作失敗",
            outcome: result.outcome ?? "not-sent",
            retryable: result.retryable ?? false,
          };
    },
  };
}
