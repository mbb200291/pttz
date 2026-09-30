import { describe, expect, it } from "vitest";
import { replyEditDifference } from "./replyEditDifference";

describe("reply edit difference", () => {
  it.each([
    ["原推文", "原新文", 1, 2, "新"],
    ["原文", "原補文", 1, 1, "補"],
    ["原推文", "原文", 1, 2, ""],
    ["😀原文", "😁原文", 0, 2, "😁"],
    ["原文", "", 0, 2, ""],
    ["abc", "axcy", 1, 3, "xcy"],
  ])("reconstructs %s → %s", (before, after, start, end, replacement) => {
    const change = replyEditDifference(before, after);
    expect(change).toEqual({ start, end, replacement });
    expect(before.slice(0, change.start) + change.replacement + before.slice(change.end)).toBe(after);
  });
});
