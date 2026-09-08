export type VoteDirection = "push" | "boo";

export { formatReplyPush as formatReplyToReply } from "./pushWire.js";

export const formatReplyVote = (
  floor: number,
  direction: VoteDirection,
): string => `${direction === "push" ? "推" : "噓"}${floor}樓`;

export const formatReplyVoteWithdrawal = (
  floor: number,
  direction: VoteDirection,
): string => `撤回我對${floor}樓的${direction === "push" ? "推" : "噓"}`;

export const formatBoardReplyTitle = (title: string): string =>
  `Re: ${title.replace(/^(?:Re:\s*)+/giu, "").trim()}`;

export const canVote = (
  current: -1 | 0 | 1,
  direction: VoteDirection,
): boolean =>
  !(
    (current === 1 && direction === "push") ||
    (current === -1 && direction === "boo")
  );
