import type {
  CreateArticleInput,
  DeleteArticleInput,
  EditArticleInput,
  EditReplyInput,
  PttzzzClient,
  ReplyArticleToBoardInput,
  ReplyToArticleInput,
  ReplyToReplyInput,
  Result,
  ReplyDelivery,
  ReplyDraftInput,
  VoteArticleInput,
  VoteReplyInput,
  WithdrawArticleVoteInput,
  WithdrawReplyInput,
  WithdrawReplyVoteInput,
} from "@pttzzz/core";
import { usePttSocketStore } from "./usePttSocket";

const unavailable = async (): Promise<Result<void>> => ({
  ok: false,
  error: {
    code: "CLIENT_UNAVAILABLE",
    message: "尚未連線 PTT",
    retryable: true,
    outcome: "not-sent",
  },
});

export interface PttActionsResult {
  isLoggedIn: boolean;
  sendReplyDraft?(input: ReplyDraftInput, onProgress?: (progress: ReplyDelivery) => void): Promise<Result<ReplyDelivery>>;
  createArticle(input: CreateArticleInput): Promise<Result<void>>;
  editArticle(input: EditArticleInput): Promise<Result<void>>;
  deleteArticle(input: DeleteArticleInput): Promise<Result<void>>;
  replyToArticle(input: ReplyToArticleInput): Promise<Result<void>>;
  replyArticleToBoard(input: ReplyArticleToBoardInput): Promise<Result<void>>;
  voteArticle(input: VoteArticleInput): Promise<Result<void>>;
  withdrawArticleVote(input: WithdrawArticleVoteInput): Promise<Result<void>>;
  replyToReply(input: ReplyToReplyInput): Promise<Result<void>>;
  editReply(input: EditReplyInput): Promise<Result<void>>;
  withdrawReply(input: WithdrawReplyInput): Promise<Result<void>>;
  voteReply(input: VoteReplyInput): Promise<Result<void>>;
  withdrawReplyVote(input: WithdrawReplyVoteInput): Promise<Result<void>>;
}

export function usePttActions(): PttActionsResult {
  const client = usePttSocketStore((state) => state.client);
  const isLoggedIn = usePttSocketStore((state) =>
    state.pttState === "ready" && Boolean(state.credentials?.username)
  );
  const call = <T extends object>(
    method: (current: PttzzzClient, input: T) => Promise<Result<void>>,
    input: T,
  ) => client ? method(client, input) : unavailable();

  return {
    isLoggedIn,
    sendReplyDraft: async (input, onProgress) => client
      ? client.sendReplyDraft(input, onProgress)
      : { ok: false, error: { code: "CLIENT_UNAVAILABLE", message: "尚未連線 PTT", retryable: true, outcome: "not-sent" } },
    createArticle: (input) => call((current, value) => current.createArticle(value), input),
    editArticle: (input) => call((current, value) => current.editArticle(value), input),
    deleteArticle: (input) => call((current, value) => current.deleteArticle(value), input),
    replyToArticle: (input) => call((current, value) => current.replyToArticle(value), input),
    replyArticleToBoard: (input) => call((current, value) => current.replyArticleToBoard(value), input),
    voteArticle: (input) => call((current, value) => current.voteArticle(value), input),
    withdrawArticleVote: (input) => call((current, value) => current.withdrawArticleVote(value), input),
    replyToReply: (input) => call((current, value) => current.replyToReply(value), input),
    editReply: (input) => call((current, value) => current.editReply(value), input),
    withdrawReply: (input) => call((current, value) => current.withdrawReply(value), input),
    voteReply: (input) => call((current, value) => current.voteReply(value), input),
    withdrawReplyVote: (input) => call((current, value) => current.withdrawReplyVote(value), input),
  };
}
