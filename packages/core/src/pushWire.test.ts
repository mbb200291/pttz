import { describe, expect, it } from "vitest";
import {
  approximatePttBytes,
  formatEditPushCommand,
  formatReplyVoteCommand,
  formatReplyVoteWithdrawalCommand,
  formatReplyPush,
  formatSectionEditCommand,
  validateSectionChanges,
} from "./pushWire.js";

describe("final PTT push wire format", () => {
  it("serializes reply vote controls in one shared formatter", () => {
    expect(formatReplyVoteCommand(12, "push")).toBe("推12樓");
    expect(formatReplyVoteCommand(12, "boo")).toBe("噓12樓");
    expect(formatReplyVoteWithdrawalCommand(12, "push")).toBe("撤回我對12樓的推");
    expect(formatReplyVoteWithdrawalCommand(12, "boo")).toBe("撤回我對12樓的噓");
  });

  it("normalizes once and measures the exact emitted Big5 approximation", () => {
    const reply = formatReplyPush(12, "  同意  ");
    const edit = formatEditPushCommand(12, "append", "  補充  ");

    expect(reply).toBe("回12樓：同意");
    expect(edit).toBe("補充我在12樓發言：補充");
    expect(approximatePttBytes(`回1樓：${"中".repeat(36)}`)).toBe(79);
    expect(approximatePttBytes(`回1樓：${"中".repeat(37)}`)).toBe(81);
  });

  it("serializes structured zero-based half-open section changes", () => {
    expect(formatSectionEditCommand(12, [
      { start: 2, end: 2, replacement: "新增" },
      { start: 8, end: 10, replacement: "新的文字" },
    ])).toBe("更正我在12樓發言：^2:2=新增;^8:10=新的文字");
    expect(validateSectionChanges([
      { start: 1, end: 3, replacement: "x" },
      { start: 2, end: 4, replacement: "y" },
    ])).toContain("不可互相重疊");
    expect(validateSectionChanges([])).toContain("至少需要");
  });
});
