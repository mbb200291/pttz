import { describe, expect, expectTypeOf, it } from "vitest";

import {
  articleKeyId,
  fail,
  ok,
  type ActionReceipt,
  type Article,
  type ArticleData,
  type ArticleKey,
  type Board,
  type BoardDirectoryPage,
  type BoardListEntry,
  type BoardListPage,
  type BoardListSource,
  type BoardPage,
  type CoreEvent,
  type FilterBoardsInput,
  GatewayError,
  type ListBoardsInput,
  type PttCommand,
  type PttGateway,
  type CreateArticleInput,
  type EditArticleInput,
  type EditReplyInput,
  type PttzzzClient,
  type ReplyArticleToBoardInput,
  type ReplyToReplyInput,
  type Result,
  type SearchBoardsInput,
  type VoteSummary,
} from "./contracts.js";

describe("core contracts", () => {
  it("creates successful results", () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  it("creates failed results", () => {
    const error = { code: "NOT_FOUND", message: "missing", retryable: false };

    expect(fail(error)).toEqual({ ok: false, error });
  });

  it("creates stable routing ids without conflating key representations", () => {
    expect(articleKeyId({ board: "Test", index: 12 })).toBe(
      articleKeyId({ board: "Test", index: 12 }),
    );
    expect(articleKeyId({ board: "Test", index: 12 })).not.toBe(
      articleKeyId({ board: "Test", aid: "#1AbCd" }),
    );
  });

  it("keeps public reply inputs floor-free while gateway commands carry floors", () => {
    expectTypeOf<ReplyToReplyInput>().toMatchTypeOf<{
      article: ArticleKey;
      replyId: string;
      content: string;
    }>();
    expectTypeOf<ReplyToReplyInput>().not.toHaveProperty("floor");
    expectTypeOf<Extract<PttCommand, { type: "reply-floor" }>>().toHaveProperty(
      "floor",
    );
  });

  it("keeps board replies distinct without inventing article edit metadata", () => {
    const edit: EditArticleInput = {
      article: { board: "Test", index: 1 },
      content: "body",
    };
    const boardReply: Extract<PttCommand, { type: "reply-article-to-board" }> = {
      type: "reply-article-to-board",
      article: { board: "Test", aid: "#aid" },
      content: "response",
    };
    expectTypeOf<ReplyArticleToBoardInput>().toMatchTypeOf<{
      article: ArticleKey;
      content: string;
    }>();
    expectTypeOf<PttzzzClient>().toHaveProperty("replyArticleToBoard");
    expectTypeOf<EditArticleInput>().not.toHaveProperty("editSummary");
    expectTypeOf<Extract<PttCommand, { type: "edit-article" }>>()
      .not.toHaveProperty("editSummary");
    expectTypeOf<Extract<PttCommand, { type: "reply-article-to-board" }>>()
      .toHaveProperty("content");
    expect(edit.content).toBe("body");
    expect(boardReply.type).toBe("reply-article-to-board");
  });

  it("accepts structured section edits without exposing control strings", () => {
    const edit: EditReplyInput = {
      article: { board: "Test", index: 1 },
      replyId: "reply:12",
      mode: "section",
      changes: [{ start: 2, end: 2, replacement: "新增" }],
    };
    expect(edit).toMatchObject({ mode: "section", changes: [{ start: 2, end: 2 }] });
    expectTypeOf(edit).not.toHaveProperty("floor");
  });

  it("passes an optional PTT post category through the public and gateway contracts", () => {
    const create: CreateArticleInput = {
      board: "Test", category: "問卦", title: "title", content: "body",
    };
    expectTypeOf<CreateArticleInput>().toHaveProperty("category");
    expectTypeOf<Extract<PttCommand, { type: "create-article" }>>()
      .toHaveProperty("category");
    expect(create.category).toBe("問卦");
  });

  it("exposes gateway operations without an arbitrary send method", () => {
    expectTypeOf<PttGateway>().not.toHaveProperty("send");
    expectTypeOf<PttGateway["readArticle"]>().returns.toEqualTypeOf<
      AsyncIterable<import("./contracts.js").RawArticleSource>
    >();
  });

  it("keeps operation article keys represented on results and events", () => {
    expectTypeOf<Article["key"]>().toEqualTypeOf<ArticleKey>();
    expectTypeOf<Extract<CoreEvent, { type: "article.updated" }>[
      "articleKey"
    ]>().toEqualTypeOf<ArticleKey>();
    expectTypeOf<Result<Article>>().toMatchTypeOf<
      | { ok: true; value: { key: ArticleKey } }
      | { ok: false; error: unknown }
    >();
  });

  it("exposes complete vote summaries without requiring voter identities", () => {
    expectTypeOf<VoteSummary>().toMatchTypeOf<{
      pushCount: number;
      booCount: number;
      score: number;
      viewerVote?: "push" | "boo";
    }>();
    expectTypeOf<Article["nativeVotes"]>().toEqualTypeOf<VoteSummary>();
    expectTypeOf<Article["articleVotes"]>().toEqualTypeOf<VoteSummary>();
    expectTypeOf<Article["replies"][number]["votes"]>().toEqualTypeOf<VoteSummary>();
  });

  it("keeps action receipts discriminated and adapter article data core-owned", () => {
    expectTypeOf<Extract<ActionReceipt, { ok: true }>[
      "outcome"
    ]>().toEqualTypeOf<"sent">();
    expectTypeOf<ArticleData>().toHaveProperty("pushes");
  });

  it("only permits safe retryability for failed receipts", () => {
    expectTypeOf<Extract<ActionReceipt, { ok: false; outcome: "not-sent" }>[
      "retryable"
    ]>().toEqualTypeOf<boolean>();
    expectTypeOf<
      (Extract<ActionReceipt, { ok: false }> & { outcome: "sent" })["retryable"]
    >().toEqualTypeOf<false>();
    expectTypeOf<
      (Extract<ActionReceipt, { ok: false }> & { outcome: "uncertain" })["retryable"]
    >().toEqualTypeOf<false>();
  });

  it("models PTT board lists as boards or navigable categories", () => {
    expectTypeOf<BoardListEntry>().toEqualTypeOf<
      | { kind: "board"; board: import("./contracts.js").Board }
      | { kind: "category"; title: string; categoryCursor: string }
    >();
    expectTypeOf<BoardListSource>().toEqualTypeOf<
      | { kind: "hot" }
      | { kind: "favorite" }
      | { kind: "category"; categoryCursor?: string }
    >();

    const categoryList: ListBoardsInput = {
      source: { kind: "category", categoryCursor: "opaque-session-token" },
    };
    expect(categoryList.source?.kind).toBe("category");

    expectTypeOf<BoardPage>().toEqualTypeOf<{
      kind: "boards";
      items: readonly Board[];
      nextCursor?: string;
    }>();
    expectTypeOf<BoardDirectoryPage>().toEqualTypeOf<{
      kind: "directory";
      items: readonly BoardListEntry[];
      nextCursor?: string;
    }>();
    expectTypeOf<PttGateway["listBoards"]>().returns.toEqualTypeOf<
      Promise<BoardListPage>
    >();
    expectTypeOf<PttGateway["searchBoards"]>().returns.toEqualTypeOf<
      Promise<BoardPage>
    >();
    expectTypeOf<PttGateway["filterBoards"]>().returns.toEqualTypeOf<
      Promise<BoardPage>
    >();

    const categorySearchPage: BoardPage = {
      kind: "boards",
      // @ts-expect-error search/filter board pages never contain category entries
      items: [{ kind: "category", title: "生活", categoryCursor: "opaque" }],
    };
    expect(categorySearchPage.items).toHaveLength(1);
  });

  it("uses prefix board search and requires at least one board filter", () => {
    const search: SearchBoardsInput = { prefix: "Gossip" };
    const favorites: FilterBoardsInput = { favorite: true };
    const category: FilterBoardsInput = {
      categoryCursor: "opaque-session-token",
    };
    const intersection: FilterBoardsInput = {
      favorite: true,
      categoryCursor: "opaque-session-token",
    };

    expect(search.prefix).toBe("Gossip");
    expect(favorites.favorite).toBe(true);
    expect(category.categoryCursor).toBe("opaque-session-token");
    expect(intersection.favorite).toBe(true);

    // @ts-expect-error board search is prefix-only; query is not public input
    const querySearch: SearchBoardsInput = { query: "Gossip" };
    // @ts-expect-error categories are routed by opaque cursor, never free text
    const textCategory: FilterBoardsInput = { category: "生活" };
    // @ts-expect-error filtering requires favorite or categoryCursor
    const emptyFilter: FilterBoardsInput = {};
    // @ts-expect-error favorite is an active filter, never a false no-op
    const disabledFavorite: FilterBoardsInput = { favorite: false };
    // @ts-expect-error terminal offsets are not public routing inputs
    const terminalOffset: ListBoardsInput = { offset: 12 };
    expect([
      querySearch,
      textCategory,
      emptyFilter,
      disabledFavorite,
      terminalOffset,
    ]).toHaveLength(5);
  });

  it("carries expected read and lifecycle failures as gateway errors", () => {
    const cause = new Error("socket closed");
    const error = new GatewayError(
      "CONNECTION_LOST",
      "PTT connection was lost",
      true,
      cause,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: "GatewayError",
      code: "CONNECTION_LOST",
      message: "PTT connection was lost",
      retryable: true,
      cause,
    });
  });
});
