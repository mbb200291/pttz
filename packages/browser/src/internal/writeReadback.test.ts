import { describe, expect, it } from "vitest";
import { verifyPushWriteDelta } from "./writeReadback.js";

const original = [
  "作者  alice 看板 Test",
  "標題  測試文章",
  "→ MBB200291: 相同內容                                      09/12 10:00",
].join("\n");

describe("verifyPushWriteDelta", () => {
  it("confirms an exact new raw push from the signed-in author", () => {
    const updated = `${original}\n→ MBB200291: 推1樓                                         09/12 10:01`;

    expect(verifyPushWriteDelta(original, updated, {
      author: "mbb200291",
      content: "推1樓",
      pushType: "neutral",
    })).toBe(true);
  });

  it("requires a count delta instead of accepting an older identical push", () => {
    expect(verifyPushWriteDelta(original, original, {
      author: "MBB200291",
      content: "相同內容",
      pushType: "neutral",
    })).toBe(false);
  });

  it("does not accept a matching write from another author or native category", () => {
    const updated = `${original}\n推 OTHER: 推1樓                                            09/12 10:01`;

    expect(verifyPushWriteDelta(original, updated, {
      author: "MBB200291",
      content: "推1樓",
      pushType: "neutral",
    })).toBe(false);
  });
});
