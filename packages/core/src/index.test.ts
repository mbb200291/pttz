import { describe, expect, it } from "vitest";
import * as core from "./index.js";

describe("@pttzzz/core public entry", () => {
  it("loads without browser globals", () => expect(core).toBeDefined());

  it("exports contracts without exposing internal rule helpers", () => {
    expect(core.ok(42)).toEqual({ ok: true, value: 42 });
    expect(core).not.toHaveProperty("stripAnsi");
    expect(core).not.toHaveProperty("aggregatePushes");
    expect(core).not.toHaveProperty("formatReplyVote");
  });
});
