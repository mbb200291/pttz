import { describe, expect, it } from "vitest";
import { approximatePttBytes, formatEditPushCommand, formatReplyPush } from "./pushWire.js";

describe("final PTT push wire format", () => {
  it("normalizes once and measures the exact emitted Big5 approximation", () => {
    const reply = formatReplyPush(12, "  同意  ");
    const edit = formatEditPushCommand(12, "append", "  補充  ");

    expect(reply).toBe("回12樓：同意");
    expect(edit).toBe("補充我在12樓發言：補充");
    expect(approximatePttBytes(`回1樓：${"中".repeat(36)}`)).toBe(79);
    expect(approximatePttBytes(`回1樓：${"中".repeat(37)}`)).toBe(81);
  });
});
