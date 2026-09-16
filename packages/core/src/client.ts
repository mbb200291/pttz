import { articleTextRuns } from "./articleFormatting.js";
import {
  GatewayError,
  articleKeyId,
  fail,
  ok,
  type Article,
  type ArticleKey,
  type ArticlePage,
  type ActionReceipt,
  type BoardListPage,
  type BoardPage,
  type ConnectionStatus,
  type CoreError,
  type CoreEvent,
  type CreateArticleInput,
  type DeleteArticleInput,
  type EditArticleInput,
  type EditReplyInput,
  type FilterArticlesInput,
  type FilterBoardsInput,
  type GetArticleInput,
  type ListArticlesInput,
  type ListBoardsInput,
  type LoginInput,
  type PartialArticle,
  type PttCommand,
  type PttGateway,
  type PushType,
  type RawArticleSource,
  type Reply,
  type Result,
  type ReplyArticleToBoardInput,
  type ReplyToArticleInput,
  type ReplyToReplyInput,
  type SearchArticlesInput,
  type SearchBoardsInput,
  type Session,
  type Unsubscribe,
  type VoteArticleInput,
  type VoteDirection,
  type VoteReplyInput,
  type WithdrawArticleVoteInput,
  type WithdrawReplyInput,
  type WithdrawReplyVoteInput,
} from "./contracts.js";
import {
  approximatePttBytes,
  formatEditPushCommand,
  formatSectionEditCommand,
  formatReplyPush,
  MAX_PTT_PUSH_BYTES,
  validateSectionChanges,
} from "./pushWire.js";
import { extractArticleThreadEvents, parsePushBuffer, splitArticleBody, stripAnsi } from "./parser.js";
import {
  aggregatePushes,
  normalizePttId,
  type AggregatedPush,
  type PushEditHistoryRecord,
} from "./pushAggregator.js";

function invalidPushContent(content: string): Result<void> | null {
  return approximatePttBytes(content) <= MAX_PTT_PUSH_BYTES
    ? null
    : fail({
        code: "INVALID_INPUT",
        message: "PTT 單行推文不可超過 80 bytes",
        retryable: false,
        outcome: "not-sent",
      });
}

function coreError(error: unknown): CoreError {
  if (error instanceof GatewayError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.cause === undefined ? {} : { cause: error.cause }),
    };
  }
  return {
    code: "GATEWAY_FAILURE",
    message: "PTT gateway 操作失敗",
    retryable: false,
    cause: error,
  };
}

function parseHeader(raw: string) {
  const plain = stripAnsi(raw).replace(/\r\n?/gu, "\n");
  const lines = plain.split("\n");
  const separator = lines.findIndex((line) => /^─{10,}/u.test(line.trim()));
  const header = lines.slice(0, separator < 0 ? 8 : separator).join(" ").replace(/\s+/gu, " ");
  const field = (name: string, next?: string) => header.match(new RegExp(
    `${name}\\s+(.+?)${next ? `(?=\\s+(?:${next})\\s+|$)` : "$"}`,
    "u",
  ))?.[1]?.trim() ?? "";
  return {
    author: field("作者", "看板|標題|時間"),
    title: field("標題", "時間"),
    publishedAt: field("時間"),
  };
}

function pushType(type: AggregatedPush["type"]): PushType {
  return type === "edit" ? "neutral" : type;
}

function viewerDirection(
  viewerId: string | undefined,
  pushVoters: readonly string[],
  booVoters: readonly string[],
) {
  if (!viewerId) return undefined;
  const normalized = normalizePttId(viewerId);
  if (pushVoters.some((author) => normalizePttId(author) === normalized)) return "push" as const;
  if (booVoters.some((author) => normalizePttId(author) === normalized)) return "boo" as const;
  return undefined;
}

function viewerVote(
  viewerId: string | undefined,
  pushVoters: readonly string[],
  booVoters: readonly string[],
) {
  const direction = viewerDirection(viewerId, pushVoters, booVoters);
  return direction ? { viewerVote: direction } : {};
}

function isOperationEdit(
  edit: PushEditHistoryRecord,
): edit is PushEditHistoryRecord & { kind: "append" | "replace" | "withdraw" } {
  return edit.kind !== "original";
}

function originalReplyVersion(push: AggregatedPush): Pick<Reply, "originalVersion"> {
  const original = push.editHistory?.find((edit) => edit.kind === "original");
  return original ? { originalVersion: { content: original.resultContent, ...(original.time ? { createdAt: original.time } : {}) } } : {};
}

function replyTree(pushes: readonly AggregatedPush[], debug: boolean, viewerId?: string): Reply[] {
  const children = new Map<string, Reply[]>();
  const pushById = new Map(pushes.map((push) => [push.id, push]));
  const depthOf = (push: AggregatedPush): number => {
    let depth = 1;
    let current = push;
    const seen = new Set<string>();
    while (current.replyTo && !seen.has(current.id)) {
      seen.add(current.id);
      const parent = pushById.get(current.replyTo);
      if (!parent) break;
      depth += 1;
      current = parent;
    }
    return depth;
  };
  const replies = [...pushes].sort((a, b) => a.anchorOrder - b.anchorOrder).map((push): Reply => ({
    replyId: push.id,
    author: push.author,
    content: push.content,
    pushType: pushType(push.type),
    ...(push.time ? { createdAt: push.time } : {}),
    ...(push.replyTo ? { replyTo: push.replyTo } : {}),
    depth: depthOf(push),
    votes: {
      pushCount: push.pushVoters.length,
      booCount: push.booVoters.length,
      score: push.score,
      ...viewerVote(viewerId, push.pushVoters, push.booVoters),
    },
    score: push.score,
    ...viewerVote(viewerId, push.pushVoters, push.booVoters),
    isOp: push.isOP,
    visible: push.visible ?? true,
    ...originalReplyVersion(push),
    edits: (push.editHistory ?? []).filter(isOperationEdit).map((edit) => ({
      kind: edit.kind,
      author: push.author,
      content: edit.content,
      resultContent: edit.resultContent,
      ...(edit.time ? { createdAt: edit.time } : {}),
    })),
    children: [],
    ...(debug ? { metadata: { sourceFloors: push.sourceFloors } } : {}),
  }));
  const byId = new Map(replies.map((reply) => [reply.replyId, reply]));
  for (const reply of replies) {
    if (reply.replyTo && byId.has(reply.replyTo)) {
      const list = children.get(reply.replyTo) ?? [];
      list.push(reply);
      children.set(reply.replyTo, list);
    }
  }
  return replies
    .filter((reply) => !reply.replyTo || !byId.has(reply.replyTo))
    .map(function attach(reply): Reply {
      return { ...reply, children: (children.get(reply.replyId) ?? []).map(attach) };
    });
}

function projectSource(
  source: RawArticleSource,
  key: ArticleKey,
  revision: number,
  debug: boolean,
  viewerId?: string,
): {
  article: PartialArticle | Article;
  replyFloors: Map<string, readonly number[]>;
  replyViewerVotes: Map<string, VoteDirection>;
} {
  const header = parseHeader(source.rawText);
  const split = splitArticleBody(source.rawText);
  const events = extractArticleThreadEvents(source.rawText);
  const thread = aggregatePushes(parsePushBuffer(source.rawText), header.author, events.opReplySegments, events.editRecords);
  const common = {
    key,
    revision,
    body: separatorBody(split.body),
    replies: replyTree([...thread.pushes, ...thread.withdrawnPushes], debug, viewerId),
    articleEdits: thread.articleNotes.map((edit, sequence) => ({
      marker: edit.marker,
      content: edit.content,
      sequence,
    })),
    revisions: split.revisions.map((revision, sequence) => ({
      summary: revision.summary,
      sequence,
    })),
    nativePushCount: thread.nativePushCount,
    nativeBooCount: thread.nativeBooCount,
    nativeNeutralCount: thread.nativeNeutralCount,
    nativeVotes: {
      pushCount: thread.nativePushCount,
      booCount: thread.nativeBooCount,
      score: thread.nativeArticleScore,
    },
    articleVotes: {
      pushCount: thread.articlePushCount,
      booCount: thread.articleBooCount,
      score: thread.articleScore,
      ...viewerVote(viewerId, thread.articlePushVoters, thread.articleBooVoters),
    },
  };
  const replyFloors = new Map(thread.pushes.flatMap((push) => {
    const floors = [...new Set(push.sourceFloors)]
      .filter((floor) => Number.isInteger(floor) && floor > 0)
      .sort((left, right) => left - right);
    return floors.length ? [[push.id, floors] as const] : [];
  }));
  const replyViewerVotes = new Map(thread.pushes.flatMap((push) => {
    const direction = viewerDirection(viewerId, push.pushVoters, push.booVoters);
    return direction ? [[push.id, direction] as const] : [];
  }));
  if (source.completeness === "incomplete") {
    return { article: {
      ...common,
      completeness: "incomplete",
      ...(header.title ? { title: header.title } : {}),
      ...(header.author ? { author: header.author } : {}),
    }, replyFloors, replyViewerVotes };
  }
  return { article: {
    ...common,
    completeness: "final",
    title: header.title,
    author: header.author,
    ...(header.publishedAt ? { publishedAt: header.publishedAt } : {}),
    nativeScore: thread.nativeArticleScore,
    ...viewerVote(viewerId, thread.articlePushVoters, thread.articleBooVoters),
    ...(debug ? { metadata: { raw: source.rawText } } : {}),
  }, replyFloors, replyViewerVotes };
}

function withdrawalRanges(floors: readonly number[]): readonly { start: number; end: number }[] {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const floor of [...new Set(floors)].sort((left, right) => left - right)) {
    const previous = ranges[ranges.length - 1];
    if (previous && floor === previous.end + 1) previous.end = floor;
    else ranges.push({ start: floor, end: floor });
  }
  return ranges;
}

function separatorBody(body: string): string {
  const lines = body.replace(/\r\n?/gu, "\n").split("\n");
  // Strip styling only to recognize the header boundary; preserve the original body runs.
  const separator = lines.findIndex((line) => /^─{10,}/u.test(stripAnsi(line).trim()));
  return (separator < 0 ? body : lines.slice(separator + 1).join("\n")).trim();
}

export class PttzzzClient {
  private readonly listeners = new Set<(event: CoreEvent) => void>();
  private readonly revisions = new Map<string, number>();
  private readonly generations = new Map<string, number>();
  private readonly replyTargets = new Map<string, Map<string, readonly number[]>>();
  private readonly replyViewerVotes = new Map<string, Map<string, VoteDirection>>();
  private connection: ConnectionStatus = "disconnected";
  private session: Session | null = null;
  private gatewayUnsubscribe?: Unsubscribe;
  private gatewaySubscriptionGeneration = 0;

  constructor(private readonly gateway: PttGateway) {
    this.attachGateway();
  }

  private attachGateway(): void {
    if (this.gatewayUnsubscribe) return;
    const generation = ++this.gatewaySubscriptionGeneration;
    this.gatewayUnsubscribe = this.gateway.subscribe((event) => {
      if (generation !== this.gatewaySubscriptionGeneration) return;
      if (event.type === "connection.changed") {
        this.connection = event.status;
        this.emit(event);
      } else if (event.type === "session.changed") {
        this.setSession(event.session);
      }
    });
  }

  private detachGateway(): void {
    ++this.gatewaySubscriptionGeneration;
    this.gatewayUnsubscribe?.();
    this.gatewayUnsubscribe = undefined;
  }

  subscribe(listener: (event: CoreEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async connect(): Promise<Result<void>> {
    this.attachGateway();
    return this.call(() => this.gateway.connect());
  }
  async login(input: LoginInput): Promise<Result<Session>> {
    this.attachGateway();
    const result = await this.call(() => this.gateway.login(input));
    if (result.ok) this.setSession(result.value);
    return result;
  }
  async listBoards(input?: ListBoardsInput): Promise<Result<BoardListPage>> { return this.call(() => this.gateway.listBoards(input)); }
  async searchBoards(input: SearchBoardsInput): Promise<Result<BoardPage>> { return this.call(() => this.gateway.searchBoards(input)); }
  async filterBoards(input: FilterBoardsInput): Promise<Result<BoardPage>> { return this.call(() => this.gateway.filterBoards(input)); }
  async listArticles(input: ListArticlesInput): Promise<Result<ArticlePage>> { return this.call(() => this.gateway.listArticles(input)); }
  async searchArticles(input: SearchArticlesInput): Promise<Result<ArticlePage>> { return this.call(() => this.gateway.searchArticles(input)); }
  async filterArticles(input: FilterArticlesInput): Promise<Result<ArticlePage>> { return this.call(() => this.gateway.filterArticles(input)); }

  async disconnect(): Promise<void> {
    let unexpected: unknown;
    let hasUnexpected = false;
    this.detachGateway();
    try {
      await this.gateway.disconnect();
    } catch (error) {
      if (!(error instanceof GatewayError)) {
        unexpected = error;
        hasUnexpected = true;
      }
    } finally {
      this.detachGateway();
      this.revisions.clear();
      this.generations.clear();
      this.replyTargets.clear();
      this.replyViewerVotes.clear();
      if (this.connection !== "disconnected") {
        this.connection = "disconnected";
        this.emit({ type: "connection.changed", status: "disconnected" });
      }
      if (this.session !== null) {
        this.session = null;
        this.emit({ type: "session.changed", session: null });
      }
    }
    if (hasUnexpected) throw unexpected;
  }

  async getArticle(input: GetArticleInput): Promise<Result<Article>> {
    const id = articleKeyId(input.article);
    const generation = (this.generations.get(id) ?? 0) + 1;
    this.generations.set(id, generation);
    this.replyTargets.delete(id);
    this.replyViewerVotes.delete(id);
    let sourceRevision = -Infinity;
    let final: Article | undefined;
    try {
      for await (const source of this.gateway.readArticle(input)) {
        if (source.revision <= sourceRevision) continue;
        if (final) continue;
        sourceRevision = source.revision;
        const revision = (this.revisions.get(id) ?? 0) + 1;
        this.revisions.set(id, revision);
        const projection = projectSource(
          source,
          input.article,
          revision,
          input.includeDebugMetadata ?? false,
          this.session?.userId,
        );
        const article = projection.article;
        const current = this.generations.get(id) === generation;
        if (article.completeness === "incomplete") {
          if (current) this.emit({ type: "article.partial", articleKey: input.article, revision, article });
        } else {
          final = article;
          if (current) {
            this.replyTargets.set(id, projection.replyFloors);
            this.replyViewerVotes.set(id, projection.replyViewerVotes);
          }
          if (current) this.emit({ type: "article.updated", articleKey: input.article, revision, article });
          break;
        }
      }
      return final
        ? ok(final)
        : fail({ code: "INCOMPLETE_ARTICLE", message: "文章讀取未完成", retryable: true });
    } catch (error) {
      return fail(coreError(error));
    }
  }

  createArticle(input: CreateArticleInput): Promise<Result<void>> {
    return this.write({ type: "create-article", ...input });
  }

  editArticle(input: EditArticleInput): Promise<Result<void>> {
    return this.write({ type: "edit-article", ...input });
  }

  deleteArticle(input: DeleteArticleInput): Promise<Result<void>> {
    return this.write({ type: "delete-article", ...input });
  }

  replyToArticle(input: ReplyToArticleInput): Promise<Result<void>> {
    const invalid = invalidPushContent(input.content);
    if (invalid) return Promise.resolve(invalid);
    return this.write({ type: "reply-article", ...input });
  }

  replyArticleToBoard(input: ReplyArticleToBoardInput): Promise<Result<void>> {
    return this.write({ type: "reply-article-to-board", ...input });
  }

  voteArticle(input: VoteArticleInput): Promise<Result<void>> {
    return this.write({ type: "vote-article", ...input });
  }

  withdrawArticleVote(input: WithdrawArticleVoteInput): Promise<Result<void>> {
    return this.write({ type: "withdraw-article-vote", ...input });
  }

  async replyToReply(input: ReplyToReplyInput): Promise<Result<void>> {
    const target = this.replyTarget(input.article, input.replyId);
    if (!target.ok) return target;
    const floor = target.value[0];
    const invalid = invalidPushContent(formatReplyPush(floor, input.content));
    if (invalid) return invalid;
    return this.write({
      type: "reply-floor",
      article: input.article,
      floor,
      content: input.content,
      pushType: input.pushType,
    });
  }

  async editReply(input: EditReplyInput): Promise<Result<void>> {
    const target = this.replyTarget(input.article, input.replyId);
    if (!target.ok) return target;
    const floor = target.value[0];
    if (input.mode === "section") {
      const message = validateSectionChanges(input.changes);
      if (message) return fail({ code: "INVALID_INPUT", message, retryable: false, outcome: "not-sent" });
      const invalid = invalidPushContent(formatSectionEditCommand(floor, input.changes));
      if (invalid) return invalid;
      return this.write({
        type: "edit-floor",
        article: input.article,
        floor,
        mode: "section",
        changes: input.changes,
      });
    }
    const invalid = invalidPushContent(formatEditPushCommand(floor, input.mode, input.content));
    if (invalid) return invalid;
    return this.write({
      type: "edit-floor",
      article: input.article,
      floor,
      mode: input.mode,
      content: input.content,
    });
  }

  async withdrawReply(input: WithdrawReplyInput): Promise<Result<void>> {
    const target = this.replyTarget(input.article, input.replyId);
    if (!target.ok) return target;
    return this.write({
      type: "withdraw-floor",
      article: input.article,
      ranges: withdrawalRanges(target.value),
    });
  }

  async voteReply(input: VoteReplyInput): Promise<Result<void>> {
    const target = this.replyTarget(input.article, input.replyId);
    if (!target.ok) return target;
    const articleId = articleKeyId(input.article);
    const votes = this.replyViewerVotes.get(articleId) ?? new Map<string, VoteDirection>();
    if (votes.get(input.replyId) === input.direction) return ok(undefined);
    const previous = votes.get(input.replyId);
    votes.set(input.replyId, input.direction);
    this.replyViewerVotes.set(articleId, votes);
    const result = await this.write({
      type: "vote-floor",
      article: input.article,
      floor: target.value[0],
      direction: input.direction,
    });
    if (!result.ok) {
      if (previous) votes.set(input.replyId, previous);
      else votes.delete(input.replyId);
    }
    return result;
  }

  async withdrawReplyVote(input: WithdrawReplyVoteInput): Promise<Result<void>> {
    const target = this.replyTarget(input.article, input.replyId);
    if (!target.ok) return target;
    const result = await this.write({
      type: "withdraw-floor-vote",
      article: input.article,
      floor: target.value[0],
      direction: input.direction,
    });
    if (result.ok) this.replyViewerVotes.get(articleKeyId(input.article))?.delete(input.replyId);
    return result;
  }

  private replyTarget(article: ArticleKey, replyId: string): Result<readonly number[]> {
    const floors = this.replyTargets.get(articleKeyId(article))?.get(replyId);
    return floors?.length
      ? ok(floors)
      : fail({
          code: "REPLY_NOT_FOUND",
          message: "找不到回文，請重新載入文章",
          retryable: false,
          outcome: "not-sent",
        });
  }

  private async write(command: PttCommand): Promise<Result<void>> {
    if (command.type === "create-article" || command.type === "edit-article" || command.type === "reply-article-to-board") {
      try { articleTextRuns(command.content, command.formatting); }
      catch (error) {
        return fail({ code: "INVALID_INPUT", message: error instanceof Error ? error.message : "文章格式無效", retryable: false, outcome: "not-sent" });
      }
    }
    let receipt: ActionReceipt;
    try {
      receipt = await this.gateway.execute(command);
    } catch (cause) {
      return fail({
        code: cause instanceof GatewayError ? cause.code : "GATEWAY_FAILURE",
        message: cause instanceof Error ? cause.message : "無法確認操作是否已送出",
        retryable: false,
        outcome: "uncertain",
        cause,
      });
    }
    if (receipt.ok) return ok(undefined);
    return fail({
      code: receipt.code,
      message: receipt.message,
      retryable: receipt.retryable,
      outcome: receipt.outcome,
      ...(receipt.cause === undefined ? {} : { cause: receipt.cause }),
    });
  }

  private async call<T>(operation: () => Promise<T>): Promise<Result<T>> {
    try { return ok(await operation()); }
    catch (error) { return fail(coreError(error)); }
  }

  private emit(event: CoreEvent): void {
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* Consumer errors must not break client operations. */ }
    }
  }

  private setSession(session: Session | null): void {
    if (this.session?.userId === session?.userId) return;
    this.session = session;
    this.replyViewerVotes.clear();
    this.emit({ type: "session.changed", session });
  }
}
