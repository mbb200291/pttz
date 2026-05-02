/**
 * usePttActions
 *
 * Format helpers and stub actions for PTT interactions.
 * Pure format functions generate the text strings sent to PTT.
 * The hook provides stubbed action methods (all resolve with ok: true after delay).
 */

import { usePttSocketStore } from "./usePttSocket";

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
export function formatEditPush(
  mode: "補充" | "更正" | "撤回",
  startFloor: number,
  endFloor: number | null,
  content: string,
): string {
  if (mode === "撤回") {
    if (endFloor !== null) {
      return `撤回我在${startFloor}~${endFloor}樓的發言`;
    } else {
      return `撤回我在${startFloor}樓的發言`;
    }
  }

  // mode === "補充" or "更正"
  const trimmedContent = content.trim();
  return `${mode}我在${startFloor}樓發言：${trimmedContent}`;
}

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
  ): Promise<{ ok: boolean }>;
  replyToPush(
    floor: number,
    content: string,
    pushType: PushType,
  ): Promise<{ ok: boolean }>;
  voteArticle(floor: number, kind: "push" | "boo"): Promise<{ ok: boolean }>;
  votePush(floor: number, kind: "push" | "boo"): Promise<{ ok: boolean }>;
  postArticle(
    board: string,
    category: string,
    title: string,
    body: string,
  ): Promise<{ ok: boolean }>;
  editArticle(
    body: string,
    editSummary: string,
  ): Promise<{ ok: boolean }>;
  editPush(
    mode: "補充" | "更正" | "撤回",
    startFloor: number,
    endFloor: number | null,
    content: string,
    pushType: PushType,
  ): Promise<{ ok: boolean }>;
}

/**
 * Hook that provides PTT action methods (currently stubbed)
 * All action methods are stubs that resolve with { ok: true } after ~300ms
 * The isLoggedIn field comes from the Zustand store
 */
export function usePttActions(): PttActionsResult {
  const client = usePttSocketStore((s) => s.client);
  const isLoggedIn = client?.isLoggedIn() ?? false;

  // Stub implementations - all resolve with ok: true after delay
  const delay = () =>
    new Promise<void>((resolve) => setTimeout(resolve, 300));

  return {
    isLoggedIn,
    async replyToArticle(_content: string, _pushType: PushType) {
      await delay();
      return { ok: true };
    },
    async replyToPush(_floor: number, _content: string, _pushType: PushType) {
      await delay();
      return { ok: true };
    },
    async voteArticle(_floor: number, _kind: "push" | "boo") {
      await delay();
      return { ok: true };
    },
    async votePush(_floor: number, _kind: "push" | "boo") {
      await delay();
      return { ok: true };
    },
    async postArticle(
      _board: string,
      _category: string,
      _title: string,
      _body: string,
    ) {
      await delay();
      return { ok: true };
    },
    async editArticle(_body: string, _editSummary: string) {
      await delay();
      return { ok: true };
    },
    async editPush(
      _mode: "補充" | "更正" | "撤回",
      _startFloor: number,
      _endFloor: number | null,
      _content: string,
      _pushType: PushType,
    ) {
      await delay();
      return { ok: true };
    },
  };
}
