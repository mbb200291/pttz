import { describe, expect, it } from "vitest";
import { formatWriteError } from "./writeResult";

describe("formatWriteError", () => {
  it("keeps unresolved write copy concise and hides transport details", () => {
    expect(formatWriteError({
      code: "CONFIRM_FAILED", message: "確認失敗", retryable: false, outcome: "sent",
    }, "失敗")).toBe("尚未同步");
    expect(formatWriteError({
      code: "UNKNOWN", message: "連線中斷", retryable: false, outcome: "uncertain",
    }, "失敗")).toBe("尚未同步");
  });
});
