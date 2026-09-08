import { describe, expect, it } from "vitest";
import { formatWriteError } from "./writeResult";

describe("formatWriteError", () => {
  it("distinguishes a sent operation from an uncertain operation", () => {
    expect(formatWriteError({
      code: "CONFIRM_FAILED", message: "確認失敗", retryable: false, outcome: "sent",
    }, "失敗")).toContain("已送出但後續確認失敗");
    expect(formatWriteError({
      code: "UNKNOWN", message: "連線中斷", retryable: false, outcome: "uncertain",
    }, "失敗")).toContain("可能已送出");
  });
});
