import { describe, expect, it } from "vitest";

import * as core from "./index.js";
import * as internal from "./internal.js";

describe("@pttzzz/core entry boundaries", () => {
  it("keeps rule helpers off the public root", () => {
    expect(core).not.toHaveProperty("stripAnsi");
    expect(core).not.toHaveProperty("aggregatePushes");
    expect(core).not.toHaveProperty("formatReplyVote");
  });

  it("provides extracted pure APIs to the reserved internal entry", () => {
    expect(internal.stripAnsi("\u001b[31m推\u001b[0m")).toBe("推");
    expect(typeof internal.aggregatePushes).toBe("function");
    expect(internal.formatReplyVote(12, "push")).toBe("推12樓");
    expect(typeof internal.formatEditPush).toBe("function");
  });
});
