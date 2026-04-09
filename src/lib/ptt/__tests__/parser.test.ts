import { describe, expect, it } from "vitest";
import { parsePushBuffer, parsePushLine, splitArticleBody, stripAnsi } from "../parser";

describe("stripAnsi", () => {
  it("removes ANSI escape sequences and backspace cursor artifacts", () => {
    expect(stripAnsi("\u001b[31mHello\u001b[0m  \b\b世界")).toBe("Hello世界");
  });
});

describe("parsePushLine", () => {
  it("parses a standard push row", () => {
    expect(
      parsePushLine("推 user1: 第一則推文                         04/09 10:01"),
    ).toEqual({
      type: "push",
      author: "user1",
      content: "第一則推文",
      time: "04/09 10:01",
    });
  });
});

describe("splitArticleBody", () => {
  it("splits body and pushes when pushes follow the article footer", () => {
    const raw =
      "作者 test (測試)\n看板 Gossiping\n標題 [問卦] 測試\n時間 Thu Apr  9 10:00:00 2026\n───────────────────────────────────────\n\n正文第一行\n正文第二行\n--\n※ 發信站: 批踢踢實業坊(ptt.cc)\n推 user1: 第一則推文                         1.1.1.1 04/09 10:01\n→ user2: 第二則留言                         2.2.2.2 04/09 10:02";

    const { body, pushLines } = splitArticleBody(raw);

    expect(body).toContain("正文第一行");
    expect(body).not.toContain("第一則推文");
    expect(pushLines).toHaveLength(2);
    expect(pushLines[0]).toContain("推 user1:");
  });
});

describe("parsePushBuffer", () => {
  it("extracts consecutive pushes from a compressed multi-line buffer", () => {
    const pushes = parsePushBuffer(
      "→ jma306: 官方說法青鳥又不信                         114.26.79.13 04/09 09:51\n推 rLks02: 「中國人不打中國人」的反證                  1.173.76.91 04/09 09:52\n→ jma306: 看看那些民運領袖 哪個死掉了                114.26.79.13 04/09 09:52\n→ rLks02: 把八九六四消失是阿共領導層 （中南海）的     1.173.76.91 04/09 09:53\n→ jma306:  共匪若是殺上癮  帶頭的就必死              114.26.79.13 04/09 09:53",
    );

    expect(pushes).toHaveLength(5);
    expect(pushes[0]).toMatchObject({
      type: "neutral",
      author: "jma306",
      time: "04/09 09:51",
    });
    expect(pushes[1]).toMatchObject({
      type: "push",
      author: "rLks02",
      time: "04/09 09:52",
    });
  });

  it("keeps split author continuations out of the previous push content", () => {
    const pushes = parsePushBuffer(
      "→ S2aqua: 因為支共執政 風調雨順 國泰民安 不會有     49.216.253.51 04/09 09:54S2aqua人造反 不會淹水 不會搶劫 也不用上訪       49.216.253.54\n推 archon: 不需要特別宣傳，有狀況再直接處理就好     125.227.30.252 04/09 09:55",
    );

    expect(pushes).toHaveLength(2);
    expect(pushes[0]?.author).toBe("S2aqua");
    expect(pushes[0]?.time).toBe("04/09 09:54");
    expect(pushes[0]?.content).not.toContain("archon");
    expect(pushes[1]).toMatchObject({
      type: "push",
      author: "archon",
      time: "04/09 09:55",
    });
  });
});
