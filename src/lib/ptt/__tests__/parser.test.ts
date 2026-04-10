import { describe, expect, it } from "vitest";
import {
  extractArticleThreadEvents,
  parsePushBuffer,
  parsePushLine,
  splitArticleBody,
  stripAnsi,
} from "../parser";

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
  it("removes IPv4 addresses from push content and keeps them as metadata", () => {
    const pushes = parsePushBuffer(
      "推 user1: 第一則推文                         111.22.33.44 04/09 10:01",
    );

    expect(pushes).toEqual([
      {
        type: "push",
        author: "user1",
        content: "第一則推文",
        ipAddress: "111.22.33.44",
        time: "04/09 10:01",
      },
    ]);
  });

  it("keeps multiline continuation content attached to the same push", () => {
    const pushes = parsePushBuffer(
      "推 user1: 第一行                         111.22.33.44 04/09 10:01\nuser1第二行補充",
    );

    expect(pushes[0]?.content).toContain("第二行補充");
  });

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

describe("extractArticleThreadEvents", () => {
  it("anchors raw edit-note data to the original raw input", () => {
    const raw =
      "正文\r\n推 user1: 第一則                         1.1.1.1 04/09 10:01\r\n※ 編輯: author (1.2.3.4), 04/09/2026 10:02:03\r\n補充內容\r\n推 a: boundary 1.1.1.2 04/09 10:03";

    const result = extractArticleThreadEvents(raw);
    const note = result.editNotes[0];
    const start = raw.indexOf("※ 編輯: author (1.2.3.4)");
    const end = raw.indexOf("推 a: boundary");

    expect(note?.contentAnchorOffset).toBe(raw.indexOf("補充內容"));
    expect(note?.rawBlock).toBe(raw.slice(start, end));
  });

  it("keeps edit-note parsing aligned with real push boundaries", () => {
    const raw =
      "正文\n※ 編輯: author (1.2.3.4), 04/09/2026 10:02:03\n編輯補充\n推 a: boundary 1.1.1.2 04/09 10:03";

    const result = extractArticleThreadEvents(raw);

    expect(result.editNotes[0]?.content).toBe("編輯補充");
    expect(result.editNotes[0]?.content).not.toContain("推 a:");
  });

  it("preserves multi-paragraph edit-note content", () => {
    const raw =
      "正文\n※ 編輯: author (1.2.3.4), 04/09/2026 10:02:03\n第一段\n\n第二段\n推 a: boundary 1.1.1.2 04/09 10:03";

    const result = extractArticleThreadEvents(raw);

    expect(result.editNotes[0]?.content).toContain("第一段\n\n第二段");
    expect(result.editNotes[0]?.content).not.toContain("推 a:");
  });

  it("stops an edit note when a push marker is concatenated onto the same line", () => {
    const raw =
      "正文\n※ 編輯: author (1.2.3.4), 04/09/2026 10:02:03\n補充內容推 user1: boundary 1.1.1.2 04/09 10:03";

    const result = extractArticleThreadEvents(raw);
    const note = result.editNotes[0];
    const start = raw.indexOf("※ 編輯: author (1.2.3.4)");
    const pushStart = raw.indexOf("推 user1: boundary");

    expect(note?.content).toBe("補充內容");
    expect(note?.rawBlock).toBe(raw.slice(start, pushStart));
    expect(note?.rawBlock).not.toContain("推 user1:");
  });

  it("keeps ANSI bytes aligned when a push marker is concatenated onto the same line", () => {
    const raw =
      "正文\n※ 編輯: author (1.2.3.4), 04/09/2026 10:02:03\n補充內容\u001b[31m推 user1: boundary 1.1.1.2 04/09 10:03";

    const result = extractArticleThreadEvents(raw);
    const note = result.editNotes[0];
    const start = raw.indexOf("※ 編輯: author (1.2.3.4)");
    const pushStart = raw.indexOf("推 user1: boundary");

    expect(note?.content).toBe("補充內容");
    expect(note?.rawBlock).toBe(raw.slice(start, pushStart));
    expect(note?.rawBlock).toContain("\u001b[31m");
  });

  it("keeps backspace artifacts aligned when a push marker is concatenated onto the same line", () => {
    const raw =
      "正文\n※ 編輯: author (1.2.3.4), 04/09/2026 10:02:03\n補充內容\b推 user1: boundary 1.1.1.2 04/09 10:03";

    const result = extractArticleThreadEvents(raw);
    const note = result.editNotes[0];
    const start = raw.indexOf("※ 編輯: author (1.2.3.4)");
    const pushStart = raw.indexOf("推 user1: boundary");

    expect(note?.content).toBe("補充內容");
    expect(note?.rawBlock).toBe(raw.slice(start, pushStart));
    expect(note?.rawBlock).toContain("\b");
  });

  it("extracts article edit notes as separate raw events", () => {
    const result = extractArticleThreadEvents(`
正文
推 user1: 第一則                         1.1.1.1 04/09 10:01
※ 編輯: author (1.2.3.4), 04/09/2026 10:02:03
補充內容
`);

    expect(result.editNotes).toHaveLength(1);
    expect(result.editNotes[0]).toMatchObject({
      marker: "※ 編輯:",
      content: "補充內容",
    });
    expect(result.editNotes[0]?.rawBlock).toContain("※ 編輯: author (1.2.3.4)");
  });

  it("anchors edit notes to the start of the follow-up content instead of the marker line", () => {
    const raw =
      "正文\n推 user1: 第一則                         1.1.1.1 04/09 10:01\n※ 編輯: author (1.2.3.4), 04/09/2026 10:02:03\n補充內容";

    const result = extractArticleThreadEvents(raw);

    expect(result.editNotes[0]?.contentAnchorOffset).toBe(raw.indexOf("補充內容"));
    expect(result.editNotes[0]?.contentAnchorOffset).not.toBe(
      raw.indexOf("※ 編輯:"),
    );
  });

  it("falls back to the immediately preceding body paragraph when the edit marker has no trailing content", () => {
    const raw = [
      "正文",
      "推 user1: 最後怎麼破的，忘了 04/09 10:01",
      "靠鋼珠把圓盤全部塞滿 硬擠進去",
      "※ 編輯: author (1.2.3.4), 04/09/2026 10:02:03",
    ].join("\n");

    const result = extractArticleThreadEvents(raw);

    expect(result.editNotes[0]?.content).toBe("靠鋼珠把圓盤全部塞滿 硬擠進去");
    expect(result.editNotes[0]?.contentAnchorOffset).toBe(
      raw.indexOf("靠鋼珠把圓盤全部塞滿 硬擠進去"),
    );
  });
});
