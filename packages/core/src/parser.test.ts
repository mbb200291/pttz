import { describe, expect, it } from "vitest";
import {
  extractArticleThreadEvents,
  parsePushBuffer,
  parsePushLine,
  splitArticleBody,
  splitArticleEditableContent,
  stripAnsi,
} from "./parser.js";

describe("stripAnsi", () => {
  it("removes ANSI escape sequences and backspace cursor artifacts", () => {
    expect(stripAnsi("\u001b[31mHello\u001b[0m  \b\b世界")).toBe("Hello世界");
  });
});

describe("parsePushLine", () => {
  it.each(["", " "])("preserves full-width content spacing with separator %j", separator => {
    const row = `→ alice:${separator}\u3000\u3000正文\u3000\u3000   04/09 10:01`;
    expect(parsePushLine(row)?.content).toBe("　　正文　　");
    expect(parsePushBuffer(row)[0]?.content).toBe("　　正文　　");
  });
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

  it("extracts PTTzzz edit summaries from the article body", () => {
    const parsed = splitArticleBody(
      "原始正文\n※ PTTzzz 編輯摘要：修正來源\n※ 編輯: alice (1.2.3.4), 07/16/2026 10:30:00",
    );

    expect(parsed.body).toBe("原始正文\n※ 編輯: alice (1.2.3.4), 07/16/2026 10:30:00");
    expect(parsed.revisions).toEqual([
      expect.objectContaining({
        summary: "修正來源",
        rawBlock: "※ PTTzzz 編輯摘要：修正來源",
      }),
    ]);
  });

  it("only treats a line-leading PTTzzz marker as an edit summary", () => {
    const parsed = splitArticleBody(
      "正文提到 ※ PTTzzz 編輯摘要：但這仍是正文\n※ PTTzzz 編輯摘要：真正摘要",
    );

    expect(parsed.body).toBe("正文提到 ※ PTTzzz 編輯摘要：但這仍是正文");
    expect(parsed.revisions.map((revision) => revision.summary)).toEqual([
      "真正摘要",
    ]);
  });
});

describe("splitArticleEditableContent", () => {
  it("keeps the signature and native edit records outside the editable body", () => {
    expect(
      splitArticleEditableContent(
        "第一段\n第二段\n--\n簽名檔\n※ 編輯: alice (1.2.3.4), 07/16/2026 10:30:00",
      ),
    ).toEqual({
      editableBody: "第一段\n第二段",
      preservedFooter:
        "--\n簽名檔\n※ 編輯: alice (1.2.3.4), 07/16/2026 10:30:00",
    });
  });

  it("preserves native edit records even when no signature exists", () => {
    expect(
      splitArticleEditableContent(
        "正文\n※ 編輯: alice (1.2.3.4), 07/16/2026 10:30:00",
      ),
    ).toEqual({
      editableBody: "正文",
      preservedFooter: "※ 編輯: alice (1.2.3.4), 07/16/2026 10:30:00",
    });
  });
});

describe("parsePushBuffer", () => {
  it("measures local pushes without a space after the colon", () => {
    const pushes = parsePushBuffer(
      `→ pttzzz2:${"a".repeat(54)} 09/20 10:43\n→ pttzzz2:x 09/20 10:44`,
    );

    expect(pushes.map((push) => ({ content: push.content, remaining: push.remainingContentColumns }))).toEqual([
      { content: "a".repeat(54), remaining: 0 },
      { content: "x", remaining: 53 },
    ]);
  });

  it("removes IPv4 addresses from push content and keeps them as metadata", () => {
    const pushes = parsePushBuffer(
      "推 user1: 第一則推文                         111.22.33.44 04/09 10:01",
    );

    expect(pushes).toEqual([
      expect.objectContaining({
        type: "push",
        author: "user1",
        content: "第一則推文",
        ipAddress: "111.22.33.44",
        time: "04/09 10:01",
      }),
    ]);
  });

  it("does not mark a line full while one full-width character still fits", () => {
    const pushes = parsePushBuffer(
      "→ neoa01: 新聞：專家：「跑山獸的存在」讓7.5億消   223.136.103.248 04/11 23:01\n→ neoa01: 短句                                    223.136.103.248 04/11 23:02",
    );

    expect(pushes[0]).toMatchObject({
      author: "neoa01",
      content: "新聞：專家：「跑山獸的存在」讓7.5億消",
      remainingContentColumns: 2,
    });
    expect(pushes[1]).toMatchObject({
      author: "neoa01",
      content: "短句",
      remainingContentColumns: 35,
    });
  });

  it("uses the PTT input capacity instead of visible IP padding", () => {
    const pushes = parsePushBuffer(
      "推 CMCC: 函釋是在說明可以列入，懂嗎？ 而非限制必須    42.73.44.229 04/12 08:43\n→ CMCC: 列入，因為政治獻金有稅法上優勢，所以釋法     42.73.44.229 04/12 08:43",
    );

    expect(pushes[0]).toMatchObject({
      author: "CMCC",
      content: "函釋是在說明可以列入，懂嗎？ 而非限制必須",
      remainingContentColumns: 0,
    });
    expect(pushes[1]).toMatchObject({
      author: "CMCC",
      content: "列入，因為政治獻金有稅法上優勢，所以釋法",
      remainingContentColumns: 1,
    });
  });

  it("accounts for long author IDs in the PTT input capacity", () => {
    const pushes = parsePushBuffer(
      "推 alisabonsai: 候選人在選舉的時候只想要曝光換選       49.216.90.142 04/12 08:24\n→ alisabonsai: 票 會想要肖像權換鈔票的還是首見          49.216.90.142 04/12 08:24",
    );

    expect(pushes[0]).toMatchObject({
      author: "alisabonsai",
      content: "候選人在選舉的時候只想要曝光換選",
      remainingContentColumns: 2,
    });
  });

  it("uses the remaining gap before a time-only field to identify full lines", () => {
    const pushes = parsePushBuffer([
      "→ ayufly      : 3W9那是第一次有撐 會再下去第二次代表出大事一定破  08/29 16:55",
      "→ dsrte       : 但是美股利空 台股也看空時 就是開低走低 勝率高     08/29 16:55",
      "推 antiSOC     : 川：華許幹的好 我來找買點                         08/29 16:56",
    ].join("\n"));

    expect(pushes.map((push) => push.remainingContentColumns)).toEqual([0, 3, 23]);
  });

  it("distinguishes unaligned long IDs from aligned author padding", () => {
    const pushes = parsePushBuffer([
      "推 SouthEast62: 雖然會被拒租是有點誇張，但50歲還需要租房，的確     08/24 13:23",
      "→ frank111: 有碰過繼承房產的中年婦人來租，說賣房中很有錢，不租    08/24 13:22",
    ].join("\n"));

    expect(pushes.map((push) => ({
      author: push.author,
      remaining: push.remainingContentColumns,
    }))).toEqual([
      { author: "SouthEast62", remaining: 3 },
      { author: "frank111", remaining: 2 },
    ]);
  });

  it("treats one remaining column as full and two as not full", () => {
    const pushes = parsePushBuffer([
      `→ alice: ${"a".repeat(54)}   08/24 13:21`,
      `→ alice: ${"a".repeat(53)}    08/24 13:22`,
    ].join("\n"));

    expect(pushes.map((push) => push.remainingContentColumns)).toEqual([1, 2]);
    expect(pushes.every((push) => push.isFullWidthLine === undefined)).toBe(true);
  });

  it("normalizes the fixed-width IP field before measuring the remaining gap", () => {
    const pushes = parsePushBuffer([
      "推 MonkeyCL: 新竹人值得高虹安                      180.218.220.211 08/29 23:22",
      "→ dragon0: 包商不會沒事特別去外面找廢鐵去埋        36.234.196.218 08/29 23:23",
      "→ neverfly: 那一沱這麼完整的鋼條幹嘛不載去換錢      114.43.99.196 08/29 23:23",
      "推 WeasoN: 小草:你說這個我都懂 但為什麼垃圾這麼大   220.133.186.61 08/29 23:23",
      "→ Herbert2021: 老實說用攝影技巧放大還是覺得：這      111.252.3.43 08/29 23:24",
    ].join("\n"));

    expect(pushes.map((push) => push.remainingContentColumns)).toEqual([
      21,
      6,
      3,
      1,
      2,
    ]);
  });

  it("parses padded author columns before the colon", () => {
    const pushes = parsePushBuffer(
      "推 wheat1130   : https://i.meee.com.tw/hC3mVOL.jpg                 04/11 19:46\n→ bb10181128  : 伊朗外長平常都穿西裝啊                            04/11 20:25",
    );

    expect(pushes).toEqual([
      expect.objectContaining({
        type: "push",
        author: "wheat1130",
        content: "https://i.meee.com.tw/hC3mVOL.jpg",
        time: "04/11 19:46",
      }),
      expect.objectContaining({
        type: "neutral",
        author: "bb10181128",
        content: "伊朗外長平常都穿西裝啊",
        time: "04/11 20:25",
      }),
    ]);
  });

  it("keeps multiline continuation content attached to the same push", () => {
    const pushes = parsePushBuffer(
      "推 user1: 第一行                         111.22.33.44 04/09 10:01\nuser1第二行補充",
    );

    expect(pushes[0]?.content).toContain("第二行補充");
  });

  it("does not attach non-author continuation text to the previous push", () => {
    const pushes = parsePushBuffer(
      "推 darren2586: 哇靠老哥你是把推文全刪了喔        04/11 12:53\n真的抱歉 我按編輯不知道為什麼全不見了...\n→ zteboom46: 刪推文喔?                         04/11 12:53",
    );

    expect(pushes[0]?.content).toBe("哇靠老哥你是把推文全刪了喔");
    expect(pushes[0]?.content).not.toContain("真的抱歉");
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
  it("extracts edit marker lines as article-level edit records", () => {
    const raw =
      "正文\r\n推 user1: 第一則                         1.1.1.1 04/09 10:01\r\n※ 編輯: author (1.2.3.4), 04/09/2026 10:02:03\r\n補充內容\r\n推 a: boundary 1.1.1.2 04/09 10:03";

    const result = extractArticleThreadEvents(raw);
    const note = result.editRecords[0];
    const start = raw.indexOf("※ 編輯: author (1.2.3.4)");

    expect(note).toMatchObject({
      marker: "※ 編輯:",
      content: "author (1.2.3.4), 04/09/2026 10:02:03",
      markerOffset: start,
    });
    expect(note?.rawBlock).toBe("※ 編輯: author (1.2.3.4), 04/09/2026 10:02:03");
  });

  it("extracts non-push text in an edited interval as one OP reply segment", () => {
    const raw =
      "正文\n※ 編輯: author (1.2.3.4), 04/09/2026 10:02:03\n編輯補充\n推 a: boundary 1.1.1.2 04/09 10:03";

    const result = extractArticleThreadEvents(raw);

    expect(result.editRecords).toHaveLength(1);
    expect(result.opReplySegments).toHaveLength(0);
  });

  it("extracts non-push text between normal pushes as an OP edited reply segment even without a visible edit marker", () => {
    const raw =
      "正文\n推 darren2586: 哇靠老哥你是把推文全刪了喔        04/11 12:53\n真的抱歉 我按編輯不知道為什麼全不見了...\n→ zteboom46: 刪推文喔?                         04/11 12:53";

    const result = extractArticleThreadEvents(raw);

    expect(result.editRecords).toHaveLength(0);
    expect(result.opReplySegments).toEqual([
      expect.objectContaining({
        marker: "作者編輯",
        content: "真的抱歉 我按編輯不知道為什麼全不見了...",
        contentAnchorOffset: raw.indexOf("真的抱歉"),
      }),
    ]);
  });

  it("preserves multi-line OP edited reply content between two pushes", () => {
    const raw =
      "正文\n推 user1: 第一則                         1.1.1.1 04/09 10:01\n第一段\n\n第二段\n※ 編輯: author (1.2.3.4), 04/09/2026 10:02:03\n推 a: boundary 1.1.1.2 04/09 10:03";

    const result = extractArticleThreadEvents(raw);

    expect(result.opReplySegments[0]?.content).toBe("第一段\n第二段");
    expect(result.opReplySegments[0]?.content).not.toContain("推 a:");
  });

  it("stops an OP edited reply segment when a push marker is concatenated onto the same line", () => {
    const raw =
      "正文\n推 user0: 第一則 1.1.1.0 04/09 10:01\n※ 編輯: author (1.2.3.4), 04/09/2026 10:02:03\n補充內容推 user1: boundary 1.1.1.2 04/09 10:03";

    const result = extractArticleThreadEvents(raw);
    const note = result.opReplySegments[0];
    const start = raw.indexOf("補充內容");
    const pushStart = raw.indexOf("推 user1: boundary");

    expect(note?.content).toBe("補充內容");
    expect(note?.rawBlock).toBe(raw.slice(start, pushStart));
    expect(note?.rawBlock).not.toContain("推 user1:");
  });

  it("keeps ANSI bytes aligned when an OP edited reply ends before an embedded push marker", () => {
    const raw =
      "正文\n推 user0: 第一則 1.1.1.0 04/09 10:01\n※ 編輯: author (1.2.3.4), 04/09/2026 10:02:03\n補充內容\u001b[31m推 user1: boundary 1.1.1.2 04/09 10:03";

    const result = extractArticleThreadEvents(raw);
    const note = result.opReplySegments[0];
    const start = raw.indexOf("補充內容");
    const pushStart = raw.indexOf("推 user1: boundary");

    expect(note?.content).toBe("補充內容");
    expect(note?.rawBlock).toBe(raw.slice(start, pushStart));
    expect(note?.rawBlock).toContain("\u001b[31m");
  });

  it("keeps backspace artifacts aligned when an OP edited reply ends before an embedded push marker", () => {
    const raw =
      "正文\n推 user0: 第一則 1.1.1.0 04/09 10:01\n※ 編輯: author (1.2.3.4), 04/09/2026 10:02:03\n補充內容\b推 user1: boundary 1.1.1.2 04/09 10:03";

    const result = extractArticleThreadEvents(raw);
    const note = result.opReplySegments[0];
    const start = raw.indexOf("補充內容");
    const pushStart = raw.indexOf("推 user1: boundary");

    expect(note?.content).toBe("補充內容");
    expect(note?.rawBlock).toBe(raw.slice(start, pushStart));
    expect(note?.rawBlock).toContain("\b");
  });

  it("extracts article edit records separately from OP reply segments", () => {
    const result = extractArticleThreadEvents(`
正文
推 user1: 第一則                         1.1.1.1 04/09 10:01
※ 編輯: author (1.2.3.4), 04/09/2026 10:02:03
補充內容
`);

    expect(result.editRecords).toHaveLength(1);
    expect(result.editRecords[0]).toMatchObject({
      marker: "※ 編輯:",
      content: "author (1.2.3.4), 04/09/2026 10:02:03",
    });
    expect(result.opReplySegments).toEqual([
      expect.objectContaining({ content: "補充內容" }),
    ]);
  });

  it("anchors OP edited reply segments to the actual content instead of the edit marker line", () => {
    const raw =
      "正文\n推 user1: 第一則                         1.1.1.1 04/09 10:01\n※ 編輯: author (1.2.3.4), 04/09/2026 10:02:03\n補充內容";

    const result = extractArticleThreadEvents(raw);

    expect(result.opReplySegments[0]?.contentAnchorOffset).toBe(raw.indexOf("補充內容"));
    expect(result.opReplySegments[0]?.contentAnchorOffset).not.toBe(
      raw.indexOf("※ 編輯:"),
    );
  });

  it("uses the immediately preceding edited paragraph as an OP reply segment when the edit marker has no trailing content", () => {
    const raw = [
      "正文",
      "推 user1: 最後怎麼破的，忘了 04/09 10:01",
      "靠鋼珠把圓盤全部塞滿 硬擠進去",
      "※ 編輯: author (1.2.3.4), 04/09/2026 10:02:03",
    ].join("\n");

    const result = extractArticleThreadEvents(raw);

    expect(result.opReplySegments[0]?.content).toBe("靠鋼珠把圓盤全部塞滿 硬擠進去");
    expect(result.opReplySegments[0]?.contentAnchorOffset).toBe(
      raw.indexOf("靠鋼珠把圓盤全部塞滿 硬擠進去"),
    );
  });
});
