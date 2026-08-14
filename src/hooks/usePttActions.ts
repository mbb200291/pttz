/**
 * usePttActions
 *
 * Format helpers and stub actions for PTT interactions.
 * Pure format functions generate the text strings sent to PTT.
 * The hook delegates write actions to the PTT adapter when available.
 */

import { usePttSocketStore } from "./usePttSocket";
import type {
  ActionResult,
  DeleteArticleRequest,
  EditArticleRequest,
} from "../lib/ptt/adapter";
import { formatEditPush as buildEditPush } from "../lib/ptt/pushEditing";
export { formatEditPush } from "../lib/ptt/pushEditing";

export type PushType = "push" | "neutral" | "boo";

/**
 * Format a reply to a specific floor
 * @param floor - The floor number to reply to
 * @param content - The reply content
 * @returns Formatted reply string: "回{floor}樓：{content}"
 */
export function formatReplyToPush(floor: number, content: string): string {
  return `回${floor}樓：${content.trim()}`;
}

/**
 * Format an edit push based on mode
 * @param mode - "補充" (supplement), "更正" (correction), or "撤回" (retract)
 * @param startFloor - The starting floor number
 * @param endFloor - The ending floor (only used for 撤回 with range)
 * @param content - The content (only used for 補充 and 更正)
 * @returns Formatted edit string
 */
/**
 * Format a vote on an article
 * @param floor - The floor number to vote on
 * @param kind - "push" (推) or "boo" (噓)
 * @returns Formatted vote string
 */
export function formatArticleVote(
  floor: number,
  kind: "push" | "boo",
): string {
  const voteChar = kind === "push" ? "推" : "噓";
  return `${voteChar}${floor}樓`;
}

/**
 * Format a vote on a push (same mechanism as article vote)
 * @param floor - The floor number to vote on
 * @param kind - "push" (推) or "boo" (噓)
 * @returns Formatted vote string
 */
export function formatPushVote(floor: number, kind: "push" | "boo"): string {
  return formatArticleVote(floor, kind);
}

/**
 * Returns whether a vote in the given direction is allowed given the user's current vote.
 * Blocks re-voting in the same direction (dedup rule).
 */
export function canVote(myVote: -1 | 0 | 1, direction: "push" | "boo"): boolean {
  if (myVote === 1 && direction === "push") return false;
  if (myVote === -1 && direction === "boo") return false;
  return true;
}

export interface PttActionsResult {
  isLoggedIn: boolean;
  replyToArticle(
    content: string,
    pushType: PushType,
    boardName?: string,
  ): Promise<{ ok: boolean }>;
  replyToPush(
    floor: number,
    content: string,
    pushType: PushType,
    boardName?: string,
  ): Promise<{ ok: boolean }>;
  voteArticle(
    floor: number,
    kind: "push" | "boo",
    boardName?: string,
  ): Promise<{ ok: boolean }>;
  votePush(
    floor: number,
    kind: "push" | "boo",
    boardName?: string,
  ): Promise<{ ok: boolean }>;
  postArticle(
    board: string,
    category: string,
    title: string,
    body: string,
  ): Promise<{ ok: boolean; reason?: string }>;
  editArticle(
    request: EditArticleRequest,
  ): Promise<ActionResult>;
  deleteArticle(request: DeleteArticleRequest): Promise<ActionResult>;
  editPush(
    mode: "補充" | "更正" | "撤回",
    startFloor: number,
    endFloor: number | null,
    content: string,
    pushType: PushType,
    boardName?: string,
  ): Promise<ActionResult>;
}

/**
 * Hook that provides PTT action methods (currently stubbed)
 * All action methods are stubs that resolve with { ok: true } after ~300ms
 * The isLoggedIn field comes from the Zustand store
 */
export function usePttActions(): PttActionsResult {
  const client = usePttSocketStore((s) => s.client);
  const isLoggedIn = client?.isLoggedIn() ?? false;

  const unavailable = async () => ({ ok: false });

  return {
    isLoggedIn,
    async replyToArticle(content: string, pushType: PushType, boardName?: string) {
      return client?.replyToArticle(content, pushType, boardName) ?? unavailable();
    },
    async replyToPush(
      floor: number,
      content: string,
      pushType: PushType,
      boardName?: string,
    ) {
      return client?.replyToPush(floor, content, pushType, boardName) ?? unavailable();
    },
    async voteArticle(floor: number, kind: "push" | "boo", boardName?: string) {
      return client?.voteArticle(floor, kind, boardName) ?? unavailable();
    },
    async votePush(floor: number, kind: "push" | "boo", boardName?: string) {
      return client?.votePush(floor, kind, boardName) ?? unavailable();
    },
    async postArticle(
      board: string,
      category: string,
      title: string,
      body: string,
    ) {
      return client?.postArticle(board, category, title, body) ?? unavailable();
    },
    async editArticle(request: EditArticleRequest) {
      return client?.editArticle(request) ?? unavailable();
    },
    async deleteArticle(request: DeleteArticleRequest) {
      return client?.deleteArticle?.(request) ?? unavailable();
    },
    async editPush(
      mode: "補充" | "更正" | "撤回",
      startFloor: number,
      endFloor: number | null,
      content: string,
      _pushType: PushType,
      boardName?: string,
    ) {
      const formatted = buildEditPush(mode, startFloor, endFloor, content);
      return client?.replyToArticle(formatted, "neutral", boardName) ?? unavailable();
    },
  };
}
