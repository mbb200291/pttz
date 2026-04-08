import { describe, expect, it } from "vitest";
import { parseArticleLine } from "../parser";

describe("parseArticleLine", () => {
  it("parses 6-digit article rows without shifting columns", () => {
    const parsed = parseArticleLine(
      " 781748 +   4/08 Marle        □ [問卦] 有沒有Stripe的八卦？",
    );

    expect(parsed).toMatchObject({
      index: 781748,
      mark: "+",
      pushCount: "",
      date: "4/08",
      author: "Marle",
      title: "□ [問卦] 有沒有Stripe的八卦？",
    });
  });

  it("parses 5-digit article rows without swallowing the last digit into mark", () => {
    const parsed = parseArticleLine(
      "  81750 + 3 4/08 horse5566lee □ [問卦] 辜仲諒真的有比板橋超哥有錢嗎?",
    );

    expect(parsed).toMatchObject({
      index: 81750,
      mark: "+",
      pushCount: "3",
      date: "4/08",
      author: "horse5566lee",
    });
  });

  it("removes backspace cursor artifacts from titles", () => {
    const parsed = parseArticleLine(
      " 781748 +   4/08 Marle        □ [問卦] 有沒有Stripe的八卦  \b\b𨭐  \b\b𨭐？",
    );

    expect(parsed?.title).toBe("□ [問卦] 有沒有Stripe的八卦𨭐𨭐？");
  });

  it("rejects non-article terminal art lines", () => {
    expect(
      parseArticleLine(
        "           ▌    ∥    ▎�� ≡ ▊▍ ▎ ▍▌ ▊ ▏▉▋��▊    ▌▌ ▏ ▌   你  ",
      ),
    ).toBeNull();
  });
});
