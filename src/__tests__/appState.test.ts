import { describe, expect, it } from "vitest";
import { getSafeViewForPttState } from "../lib/ptt/viewState";

describe("getSafeViewForPttState", () => {
  it("keeps the current view when the session is ready", () => {
    expect(
      getSafeViewForPttState({ type: "article", board: "Gossiping", index: 1 }, "ready"),
    ).toEqual({ type: "article", board: "Gossiping", index: 1 });
  });

  it("returns to home when auth flow interrupts a board or article view", () => {
    expect(
      getSafeViewForPttState({ type: "board", name: "Gossiping" }, "duplicate_login"),
    ).toEqual({ type: "home" });

    expect(
      getSafeViewForPttState({ type: "article", board: "Gossiping", index: 1 }, "need_login"),
    ).toEqual({ type: "home" });
  });
});
