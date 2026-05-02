import { describe, expect, it } from "vitest";
import { resolveBoardCategoryOptions } from "../boardCategories";

describe("board category options", () => {
  it("does not invent categories from a hard-coded board map", () => {
    expect(resolveBoardCategoryOptions("Gossiping")).toEqual([]);
  });

  it("uses options supplied by the live board/post flow", () => {
    expect(resolveBoardCategoryOptions("UnknownBoard", ["問題", "情報"])).toEqual([
      "問題",
      "情報",
    ]);
  });
});
