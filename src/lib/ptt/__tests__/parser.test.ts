import { describe, expect, it } from "vitest";
import {
  extractCurrentArticlePage,
  extractFirstArticlePage,
  getLastPageInfo,
  mergeArticlePage,
  parsePushBuffer,
  parseArticleBuffer,
  parseArticleLine,
  splitArticleBody,
} from "../parser";

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

describe("parseArticleBuffer", () => {
  it("extracts article rows from screen buffers that lost line breaks", () => {
    const parsed = parseArticleBuffer(
      "看板《Gossiping》\r\n[←]離開 [→]閱讀 [Ctrl-P]發表文章\r\n   編號    日 期 作  者       文  章  標  題                        人氣:4317  781854 + 6 4/09 todao        R: [問卦] 為什麼長照服務員薪水那麼低?781855 + 7 4/09 sss1234      □ [問卦] 全台灣單挑上海會贏嗎？781856 + 1 4/09 A6           R: [問卦] 台灣基建落後日本幾年\r\n 文章選讀",
    );

    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toMatchObject({
      index: 781854,
      author: "todao",
    });
    expect(parsed[2]).toMatchObject({
      index: 781856,
      author: "A6",
    });
  });

  it("parses selected article rows that start with a cursor dot", () => {
    const parsed = parseArticleBuffer(
      "781953 + 1 4/09 trapt        □ [問卦] 一直納悶 為啥中共閉口不談64？\r\n●781954 + 3 4/09 kent         □ [新聞] 右腳濕濕的！職軍船上偷女球鞋「磨槍噴發\r\n 文章選讀",
    );

    expect(parsed.at(-1)).toMatchObject({
      index: 781954,
      mark: "+",
      pushCount: "3",
      author: "kent",
    });
  });

  it("keeps the full index when the selected row uses the tilde mark", () => {
    const parsed = parseArticleBuffer(
      "781952 + 3 4/09 encoreb00124 □ [問卦] 不是停火了嗎？台股怎麼又綠了？\r\n●781953 ~ 3 4/09 trapt        □ [問卦] 一直納悶 為啥中共閉口不談64？\r\n 文章選讀",
    );

    expect(parsed.at(-1)).toMatchObject({
      index: 781953,
      mark: "~",
      pushCount: "3",
      author: "trapt",
    });
  });
});

describe("article page extraction", () => {
  it("extracts the first article page from a mixed transition buffer", () => {
    const page = extractFirstArticlePage(
      "●\r  \r\n\n\n\n\n\n 作者  h2030625 (雙重人格)                                    看板  Gossiping \r\n 標題  [問卦] 台灣AV是刺青還是女優素質本身就不好                              \r\n 時間  Thu Apr  9 09:38:55 2026                                               \r\n───────────────────────────────────────\r\n\n\n最近看台灣AV產業鏈倒了\r\n\n很多人出來說都是女優刺青太多\r\n\n所以觀感不佳 很出戲\r\n\n但是我們李珠垠也有刺青啊\r\n\n也是啦啦隊No1 所以單純不正吧\r\n\n刺不刺是其次？\r\n\n--\r\n※ 發信站: 批踢踢實業坊(ptt.cc), 來自: 223.138.237.155 (臺灣)\r\n※ 文章網址: https://www.ptt.cc/bbs/Gossiping/M.1775698737.A.31E.html\r\n→ a3221715: 面積太大 跟+9一樣 難看                     61.70.2.37 04/09 09:39\r\n→ dknymaster: 氣質差太多吧                           114.44.64.19 04/09 09:39\r\n  瀏覽 第 1/2 頁 ( 22%)  目前顯示: 第 01~22 行  (y)回應(X%)推文(h)說明(←)離開 \"",
    );

    expect(page).toContain("作者  h2030625");
    expect(page).toContain("標題  [問卦] 台灣AV是刺青還是女優素質本身就不好");
    expect(page).toContain("最近看台灣AV產業鏈倒了");
    expect(page).not.toContain("瀏覽 第 1/2 頁");
  });

  it("tracks the last page info and extracts only the newest page", () => {
    const raw =
      "作者  h2030625 (雙重人格)\r\n標題  [問卦] 台灣AV是刺青還是女優素質本身就不好\r\n時間  Thu Apr  9 09:38:55 2026\r\n───────────────────────────────────────\r\n第一頁內容\r\n  瀏覽 第 1/2 頁 ( 22%)\r\n第二頁第一行\r\n第二頁第二行\r\n  瀏覽 第 2/2 頁 (100%)";

    expect(getLastPageInfo(raw)).toEqual({ currentPage: 2, totalPages: 2 });
    expect(extractCurrentArticlePage(raw)).toContain("第二頁第一行");
    expect(extractCurrentArticlePage(raw)).not.toContain("第一頁內容");
  });

  it("merges overlapping article pages without duplicating body text", () => {
    const merged = mergeArticlePage(
      "第一段\n第二段\n第三段\n第四段",
      "第三段\n第四段\n第五段\n第六段",
    );

    expect(merged).toBe("第一段\n第二段\n第三段\n第四段\n第五段\n第六段");
  });

  it("replaces the repeated body segment when the next page redraw starts from earlier content", () => {
    const merged = mergeArticlePage(
      "作者 test\n標題 測試\n時間 now\n────────────────\n正文第一段\n正文第二段\n推 user1: 第一則",
      "正文第一段\n正文第二段\n推 user1: 第一則\n推 user2: 第二則",
    );

    expect(merged).toBe(
      "作者 test\n標題 測試\n時間 now\n────────────────\n正文第一段\n正文第二段\n推 user1: 第一則\n推 user2: 第二則",
    );
  });
});

describe("splitArticleBody", () => {
  it("splits pushes even when the article has only the header separator", () => {
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
