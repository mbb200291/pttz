import { describe, expect, it } from "vitest";

import {
  canVote,
  formatBoardReplyTitle,
  formatReplyToReply,
  formatReplyVote,
  formatReplyVoteWithdrawal,
} from "./actions.js";

describe("actions", () => {
  it("formats reply actions", () => {
    expect(formatReplyToReply(12, " 同意 ")).toBe("回12樓：同意");
    expect(formatReplyVote(12, "push")).toBe("推12樓");
    expect(formatReplyVoteWithdrawal(12, "boo")).toBe("撤回我對12樓的噓");
  });

  it("formats a board reply title", () => {
    expect(formatBoardReplyTitle("Re: Re: 標題")).toBe("Re: 標題");
  });

  it("prevents duplicate votes in the same direction", () => {
    expect(canVote(1, "push")).toBe(false);
    expect(canVote(1, "boo")).toBe(true);
  });
});
