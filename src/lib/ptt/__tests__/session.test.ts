import { describe, expect, it } from "vitest";
import { detectState } from "../session";

describe("detectState", () => {
  it("recognizes main menu when buffer contains 主功能表 without brackets", () => {
    const result = detectState("歡迎登入 PTT\r\n主功能表\r\n[SU] 訂閱看板");

    expect(result.state).toBe("main_menu");
  });

  it("recognizes article list from board header", () => {
    const result = detectState(
      "看板《Gossiping》[←]離開 [→]閱讀 [Ctrl-P]發表文章\r\n 12345 爆 04/08 user1234 [新聞] 測試標題",
    );

    expect(result.state).toBe("article_list");
  });

  it("recognizes board list from board-directory rows", () => {
    const result = detectState(
      "AskBoard     新手 ◎【問與板有關的問題，非ask板】        akaume\r\nNewhand   新手 ◎批踢踢新手客服中心…〃非test板       HWBA",
    );

    expect(result.state).toBe("board_list");
  });

  it("treats article rows plus 文章選讀 footer as article list, not board list", () => {
    const result = detectState(
      " 781749 + 3 4/08 jma306       □ [新聞] 《爸爸4》阿拉蕾長大了！13歲驚人美貌撞\r\n 781750 + 7 4/08 horse5566lee □ [問卦] 辜仲諒真的有比板橋超哥有錢嗎?\r\n 文章選讀 (y)回應(X)推文(^X)轉錄",
    );

    expect(result.state).toBe("article_list");
  });
});
