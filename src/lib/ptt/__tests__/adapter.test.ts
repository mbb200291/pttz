import { describe, expect, it } from "vitest";

function buildBoardLine(params: {
  index?: number | string;
  push?: string;
  date?: string;
  author?: string;
  status?: string;
  title: string;
}): string {
  const line = Array.from({ length: 80 }, () => " ");
  const writeAt = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      line[offset + index] = value[index];
    }
  };

  writeAt(1, String(params.index ?? "").padStart(7, " "));
  writeAt(9, (params.push ?? "").padStart(2, " ").slice(0, 2));
  writeAt(11, (params.date ?? "").padStart(5, " ").slice(0, 5));
  writeAt(17, (params.author ?? "").padEnd(12, " ").slice(0, 12));
  writeAt(30, (params.status ?? "").padEnd(2, " ").slice(0, 2));
  writeAt(32, params.title);
  return line.join("").replace(/\s+$/, "");
}

describe("ptt adapter module", () => {
  it("exports a factory for the ptt-client-backed adapter", async () => {
    const mod = await import("../adapter");
    const adapter = mod.createPttAdapter();

    expect(typeof mod.createPttAdapter).toBe("function");
    expect(typeof adapter.login).toBe("function");
    expect(typeof adapter.listArticles).toBe("function");
    expect(typeof adapter.getArticle).toBe("function");
    expect(typeof adapter.disconnect).toBe("function");
  });

  it("reports whether the external ptt-client module is available", async () => {
    const mod = await import("../adapter");
    expect(mod.pttClientModuleLoaded).toBe(true);
  });

  it("waits for the password prompt before sending the password during login", async () => {
    const mod = await import("../adapter");
    const sent: string[] = [];
    let screen = "請輸入代號，或以 guest 參觀";

    const result = await mod.loginThroughTerminal(
      {
        send: async (message: string) => {
          sent.push(message);
          if (message === "user\r") {
            screen = "請輸入密碼:";
          } else if (message === "password\r") {
            screen = "【主功能表】 批踢踢實業坊";
          }
          return true;
        },
      },
      {
        username: "user",
        password: "password",
        kickOthers: false,
        readSnapshot: () => screen,
        markLoggedIn: () => undefined,
        timeouts: {
          promptMs: 20,
          passwordPromptMs: 20,
          loginMs: 20,
          pollMs: 1,
          postSendMs: 0,
        },
      },
    );

    expect(result).toEqual({ ok: true });
    expect(sent).toEqual(["user\r", "password\r"]);
  });

  it("recognizes PTT's full password prompt wording during login", async () => {
    const mod = await import("../adapter");
    const sent: string[] = [];
    let screen = "請輸入代號，或以 guest 參觀";

    const result = await mod.loginThroughTerminal(
      {
        send: async (message: string) => {
          sent.push(message);
          if (message === "user\r") {
            screen = "請輸入您的密碼:";
          } else if (message === "password\r") {
            screen = "【主功能表】 批踢踢實業坊";
          }
          return true;
        },
      },
      {
        username: "user",
        password: "password",
        kickOthers: false,
        readSnapshot: () => screen,
        markLoggedIn: () => undefined,
        timeouts: {
          promptMs: 20,
          passwordPromptMs: 20,
          loginMs: 20,
          pollMs: 1,
          postSendMs: 0,
        },
      },
    );

    expect(result).toEqual({ ok: true });
    expect(sent).toEqual(["user\r", "password\r"]);
  });

  it("can recover when a retry starts while PTT is still waiting for password", async () => {
    const mod = await import("../adapter");
    const sent: string[] = [];
    let screen = "請輸入您的密碼:";

    const result = await mod.loginThroughTerminal(
      {
        send: async (message: string) => {
          sent.push(message);
          if (message === "password\r") {
            screen = "【主功能表】 批踢踢實業坊";
          }
          return true;
        },
      },
      {
        username: "user",
        password: "password",
        kickOthers: false,
        readSnapshot: () => screen,
        markLoggedIn: () => undefined,
        timeouts: {
          promptMs: 20,
          passwordPromptMs: 20,
          loginMs: 20,
          pollMs: 1,
          postSendMs: 0,
        },
      },
    );

    expect(result).toEqual({ ok: true });
    expect(sent).toEqual(["password\r"]);
  });

  it("does not treat the login banner as a successful login before password auth", async () => {
    const mod = await import("../adapter");
    const sent: string[] = [];
    let screen = "批踢踢實業坊\n請輸入代號，或以 guest 參觀";
    let markedLoggedIn = false;

    const result = await mod.loginThroughTerminal(
      {
        send: async (message: string) => {
          sent.push(message);
          if (message === "user\r") {
            screen = "批踢踢實業坊\n請輸入密碼:";
          } else if (message === "password\r") {
            screen = "【主功能表】 批踢踢實業坊";
          }
          return true;
        },
      },
      {
        username: "user",
        password: "password",
        kickOthers: false,
        readSnapshot: () => screen,
        markLoggedIn: () => {
          markedLoggedIn = true;
        },
        timeouts: {
          promptMs: 20,
          passwordPromptMs: 20,
          loginMs: 20,
          pollMs: 1,
          postSendMs: 0,
        },
      },
    );

    expect(result).toEqual({ ok: true });
    expect(markedLoggedIn).toBe(true);
    expect(sent).toEqual(["user\r", "password\r"]);
  });

  it("serializes bot operations to avoid overlapping terminal commands", async () => {
    const mod = await import("../adapter");
    const runSerial = mod.createSerialTaskRunner();
    const events: string[] = [];

    const slowTask = runSerial(async () => {
      events.push("slow:start");
      await new Promise((resolve) => setTimeout(resolve, 30));
      events.push("slow:end");
      return "slow";
    });

    const fastTask = runSerial(async () => {
      events.push("fast:start");
      events.push("fast:end");
      return "fast";
    });

    await expect(Promise.all([slowTask, fastTask])).resolves.toEqual([
      "slow",
      "fast",
    ]);
    expect(events).toEqual([
      "slow:start",
      "slow:end",
      "fast:start",
      "fast:end",
    ]);
  });

  it("applies combined board filters by push threshold before title keyword", async () => {
    const mod = await import("../adapter");
    const adapter = mod.createPttAdapter();
    const sent: string[] = [];
    const screen = [
      "看板《Baseball》",
      buildBoardLine({
        index: 16250,
        push: "23",
        date: "5/27",
        author: "ak852456",
        title: "[分享] 今日陳子豪",
      }),
    ];

    (adapter as unknown as { bot: unknown }).bot = {
      async send(command: string) {
        sent.push(command);
        return true;
      },
      async enterBoardByName(boardName: string) {
        sent.push(`enter:${boardName}`);
        return true;
      },
      getLine(index: number) {
        return { str: screen[index] ?? "" };
      },
    };

    await adapter.filterArticlesByTitleAndPush("Baseball", ["今日", "郭泓志"], 10);

    const pushCommandIndex = sent.indexOf("Z10\r");
    const titleCommandIndex = sent.indexOf("/今日\r");
    const secondTitleCommandIndex = sent.indexOf("/郭泓志\r");
    const enterCommandIndex = sent.indexOf("enter:Baseball");

    expect(enterCommandIndex).toBeGreaterThanOrEqual(0);
    expect(pushCommandIndex).toBeGreaterThanOrEqual(0);
    expect(titleCommandIndex).toBeGreaterThanOrEqual(0);
    expect(secondTitleCommandIndex).toBeGreaterThanOrEqual(0);
    expect(enterCommandIndex).toBeLessThan(pushCommandIndex);
    expect(pushCommandIndex).toBeLessThan(titleCommandIndex);
    expect(titleCommandIndex).toBeLessThan(secondTitleCommandIndex);
  });

  it("maps library article rows into the current ArticleSummary shape", async () => {
    const mod = await import("../adapter");

    expect(
      mod.mapArticleRow({
        id: 12345,
        push: "爆",
        date: "04/09",
        author: "tester",
        status: "M",
        title: "[公告] hello",
      }),
    ).toEqual({
      index: 12345,
      mark: "M",
      pushCount: "爆",
      date: "04/09",
      author: "tester",
      title: "[公告] hello",
    });
  });

  it("maps hot board rows into homepage popular board data", async () => {
    const mod = await import("../adapter");

    expect(
      mod.mapHotBoardRow({
        name: " Gossiping ",
        title: " 八卦 ",
        users: " 28420 ",
      }),
    ).toEqual({
      name: "Gossiping",
      title: "八卦",
      users: "28420",
    });
  });

  it("drops article-list rows that were misread as hot board rows", async () => {
    const mod = await import("../adapter");

    expect(
      mod.mapHotBoardRow({
        name: "6 2/11 Levi",
        title: "",
        users: "HOT",
      }),
    ).toEqual({
      name: "",
      title: "",
      users: "",
    });
  });

  it("parses category options from the real post prompt screen", async () => {
    const mod = await import("../adapter");

    expect(
      mod.parsePostCategoryOptions(
        [
          "發表文章於 UnknownBoard",
          "請選擇標題種類： 1.[問題] 2.[情報] 3.[心得] 4.[閒聊]",
          "請按 1-4 選擇，或 Ctrl-C 取消",
        ].join("\n"),
      ),
    ).toEqual(["問題", "情報", "心得", "閒聊"]);
  });

  it("parses numbered post categories without using board-title brackets", async () => {
    const mod = await import("../adapter");

    expect(
      mod.parsePostCategoryOptions(
        [
          "發表文章於【 Test 】 [測試] 每週定期清除本板文章 看板",
          "種類： 1.測試 2.色彩 3.控制 4.簽名 5.圖 6.動畫 7.互動 8.公告 (1-8或不選)",
        ].join("\n"),
      ),
    ).toEqual(["測試", "色彩", "控制", "簽名", "圖", "動畫", "互動", "公告"]);
  });

  it("recognizes PTT post guidelines without treating them as the editor or a success screen", async () => {
    const mod = await import("../adapter");
    const guidelineScreen = [
      "                ▕         ● 文 章 發 表 綱 領 ●",
      "                ▕     【 四不政策 】",
      "                ▕▕ (1) 避免謾罵、攻擊、灌水等文章。   ▏",
    ].join("\n");

    expect(mod.isPostGuidelineScreen(guidelineScreen)).toBe(true);
    expect(mod.isPostEditorScreen(guidelineScreen)).toBe(false);
    expect(mod.isPostSuccessScreen(guidelineScreen)).toBe(false);
  });

  it("advances through PTT post guidelines while waiting for the title prompt", async () => {
    const mod = await import("../adapter");
    const sent: string[] = [];
    let screen = "● 文 章 發 表 綱 領 ●\n【 四不政策 】";

    const shown = await mod.waitForPostTitlePrompt(
      {
        send: async (message: string) => {
          sent.push(message);
          screen = "標題: [測試] ";
          return true;
        },
        getLine: () => ({ str: screen }),
      },
      () => screen,
      20,
      1,
    );

    expect(shown).toBe(true);
    expect(sent).toEqual(["\r"]);
  });

  it("does not type the board search command into a dangling post title prompt after reading categories", async () => {
    const mod = await import("../adapter");
    const sent: string[] = [];
    let state: "board" | "category" | "title" = "board";

    const screens = {
      board: [
        "  看板《Test》[測試] 人氣:1",
        "",
        "",
        buildBoardLine({
          index: 461,
          push: "+",
          date: "5/07",
          author: "MBB200291",
          title: "[測試] 既有文章",
        }),
      ],
      category: [
        "發表文章於【 Test 】 [測試] 每週定期清除本板文章 看板",
        "種類： 1.測試 2.色彩 3.控制 4.簽名 5.圖 6.動畫 7.互動 8.公告 (1-8或不選)",
      ],
      title: ["標題: [測試] "],
    } satisfies Record<string, string[]>;

    const bot = {
      async send(command: string) {
        sent.push(command);
        if (command === "\x10") state = "category";
        if (command === "\x03" && state === "category") state = "title";
        else if (command === "\x03" && state === "title") state = "board";
        return true;
      },
      getLine(index: number) {
        return { str: screens[state][index] ?? "" };
      },
    };

    const options = await mod.fetchPostCategoryOptionsFromBot(bot, "Test");

    expect(options).toEqual(["測試", "色彩", "控制", "簽名", "圖", "動畫", "互動", "公告"]);
    expect(sent).not.toContain("sTest\r");
  });

  it("restores Re: prefix when ptt-client splits it into the status field", async () => {
    const mod = await import("../adapter");

    expect(
      mod.mapArticleRow({
        id: 782696,
        push: "5",
        date: "04/09",
        author: "poggssi",
        status: "R:",
        title: "[問卦] 生育率真的跟女權有關係嗎",
      }),
    ).toEqual({
      index: 782696,
      mark: " ",
      pushCount: "5",
      date: "04/09",
      author: "poggssi",
      title: "Re: [問卦] 生育率真的跟女權有關係嗎",
    });
  });

  it("parses visible board rows from a board redraw screen", async () => {
    const mod = await import("../adapter");

    const partial = mod.parsePartialBoardScreen(
      [
        buildBoardLine({
          index: 785690,
          push: "X1",
          date: "4/17",
          author: "userD",
          title: "(本文已被刪除)[userD]",
        }),
        buildBoardLine({
          index: 785691,
          date: "4/17",
          author: "userC",
          status: "R:",
          title: "[新聞] 測試標題",
        }),
        buildBoardLine({
          index: 785692,
          push: "99",
          date: "4/17",
          author: "userB",
          title: "[問卦] 今天吃什麼",
        }),
        buildBoardLine({
          index: 785693,
          push: "3",
          date: "4/17",
          author: "userA",
          title: "[公告] 系統維護",
        }),
        "  看板《Gossiping》[八卦] 人氣:1234",
      ].join("\n"),
    );

    expect(partial).toEqual([
      {
        index: 785693,
        mark: " ",
        pushCount: "3",
        date: "4/17",
        author: "userA",
        title: "[公告] 系統維護",
      },
      {
        index: 785692,
        mark: " ",
        pushCount: "99",
        date: "4/17",
        author: "userB",
        title: "[問卦] 今天吃什麼",
      },
      {
        index: 785691,
        mark: " ",
        pushCount: "",
        date: "4/17",
        author: "userC",
        title: "Re: [新聞] 測試標題",
      },
      {
        index: 785690,
        mark: " ",
        pushCount: "X1",
        date: "4/17",
        author: "userD",
        title: "(本文已被刪除)[userD]",
      },
    ]);
  });

  it("drops stale normal rows left below the current board redraw", async () => {
    const mod = await import("../adapter");

    const partial = mod.parsePartialBoardScreen(
      [
        buildBoardLine({
          index: "*82008",
          push: "15",
          date: "4/15",
          author: "longbow2",
          title: "[公告] 警察機關來信",
        }),
        buildBoardLine({
          index: 782002,
          push: "2",
          date: "4/22",
          author: "indoman",
          title: "[問卦] 為何以前怕萊牛來台灣？",
        }),
        buildBoardLine({
          index: 782001,
          push: "3",
          date: "4/22",
          author: "masi",
          title: "[問卦] 開始熱了肥宅是期待還是?",
        }),
        buildBoardLine({
          index: 782000,
          push: "3",
          date: "4/22",
          author: "A00610lol",
          title: "[問卦] 十年後的科技會發展成什麼樣子？",
        }),
        buildBoardLine({
          index: 82002,
          push: "1",
          date: "11/25",
          author: "akakbest",
          title: "Re: [新聞] 高三生遭水泥車輾斃 家屬悲喊：申請國賠",
        }),
        buildBoardLine({
          index: 82001,
          push: "9",
          date: "11/25",
          author: "tommy6",
          title: "[問卦] 為什麼八卦版一堆人在討論包手+檳榔?",
        }),
      ].join("\n"),
    );

    expect(partial.map((row: { index: number }) => row.index)).toEqual([
      782000,
      782001,
      782002,
      82008,
    ]);
  });

  it("parses board rows with fixed-width columns like ptt-client", async () => {
    const mod = await import("../adapter");

    const partial = mod.parsePartialBoardScreen(
      [
        buildBoardLine({
          index: 779752,
          date: "4/21",
          author: "a40494",
          status: "R:",
          title: "[問卦] 伊朗現在是不對稱作戰的教科書嗎？",
        }),
        buildBoardLine({
          index: 779753,
          push: "13",
          date: "4/21",
          author: "LIN9",
          title: "[新聞] 退黨1個月接受民進黨徵召引議 林靖冠：",
        }),
        buildBoardLine({
          index: 779754,
          push: "16",
          date: "4/21",
          author: "carotyao",
          title: "[爆卦] 納坦雅胡:沒有猶太人就沒有美國存在",
        }),
      ].join("\n"),
    );

    expect(partial).toEqual([
      {
        index: 779754,
        mark: " ",
        pushCount: "16",
        date: "4/21",
        author: "carotyao",
        title: "[爆卦] 納坦雅胡:沒有猶太人就沒有美國存在",
      },
      {
        index: 779753,
        mark: " ",
        pushCount: "13",
        date: "4/21",
        author: "LIN9",
        title: "[新聞] 退黨1個月接受民進黨徵召引議 林靖冠：",
      },
      {
        index: 779752,
        mark: " ",
        pushCount: "",
        date: "4/21",
        author: "a40494",
        title: "Re: [問卦] 伊朗現在是不對稱作戰的教科書嗎？",
      },
    ]);
  });

  it("fixes the missing first row id the same way as ptt-client", async () => {
    const mod = await import("../adapter");

    const partial = mod.parsePartialBoardScreen(
      [
        buildBoardLine({
          push: "12",
          date: "4/21",
          author: "gigaman",
          title: "[問卦] 現在台股漲七百多點是在漲什麼意思的",
        }),
        buildBoardLine({
          index: 779750,
          push: "26",
          date: "4/21",
          author: "Workforme",
          title: "[新聞] 高雄翁「激戰女兒同學」搞同居！直銷妹",
        }),
        buildBoardLine({
          index: 779751,
          push: "10",
          date: "4/21",
          author: "iamandre",
          title: "[問卦] 台南人是不是很重吃早餐",
        }),
      ].join("\n"),
    );

    expect(partial.map((row: { index: number }) => row.index)).toEqual([
      779751,
      779750,
      779749,
    ]);
  });

  it("ignores board footer and command rows when parsing a redraw screen", async () => {
    const mod = await import("../adapter");

    const partial = mod.parsePartialBoardScreen(
      [
        "  看板《Gossiping》[八卦] 人氣:4615",
        buildBoardLine({
          index: 779752,
          date: "4/21",
          author: "a40494",
          status: "R:",
          title: "[問卦] 伊朗現在是不對稱作戰的教科書嗎？",
        }),
        "   日 期 章 標 題 人氣:4615 作 者",
        "[ ]閱 章 [d]刪除 [z]精華區 [i]看板資訊/設定 [h]說明 [Ctrl-P]發",
        "cs /Augu 翻] 420哈們！反毒大本營！ 看板《Gossiping》 t2006/red..",
        "  (y)回 (=[]<>)相關主題(/?a)找標題/作者 (b)進板畫面 (X)推文(^X)",
        buildBoardLine({
          index: 779753,
          push: "13",
          date: "4/21",
          author: "LIN9",
          title: "[新聞] 退黨1個月接受民進黨徵召引議 林靖冠：",
        }),
      ].join("\n"),
    );

    expect(partial).toEqual([
      {
        index: 779753,
        mark: " ",
        pushCount: "13",
        date: "4/21",
        author: "LIN9",
        title: "[新聞] 退黨1個月接受民進黨徵召引議 林靖冠：",
      },
      {
        index: 779752,
        mark: " ",
        pushCount: "",
        date: "4/21",
        author: "a40494",
        title: "Re: [問卦] 伊朗現在是不對稱作戰的教科書嗎？",
      },
    ]);
  });

  it("keeps fixed article ids when the board row includes a leading star marker", async () => {
    const mod = await import("../adapter");

    const partial = mod.parsePartialBoardScreen(
      [
        buildBoardLine({
          index: "*779793",
          push: "40",
          date: "4/11",
          author: "tobetwob",
          title: "[公告] 落實板規十七條實名檢舉規定暨修正草案",
        }),
        buildBoardLine({
          index: "*779794",
          push: "16",
          date: "4/15",
          author: "longbow2",
          title: "[公告] 警察機關來信，請使用者明辨言論真實性",
        }),
      ].join("\n"),
    );

    expect(partial.map((row: { index: number }) => row.index)).toEqual([
      779794,
      779793,
    ]);
    expect(partial.every((row: { fixed?: boolean }) => row.fixed)).toBe(true);
  });

  it("reuses the current board screen when opening an article from the same board", async () => {
    const mod = await import("../adapter");
    const calls: string[] = [];
    const bot = {
      async enterBoardByName(boardName: string) {
        calls.push(`enter:${boardName}`);
        return true;
      },
      async send(command: string) {
        calls.push(`send:${command}`);
        return true;
      },
      async getLines() {
        return [
          "作者  tester (測試)",
          "標題  [問卦] 同看板直開",
          "時間  Thu Apr  9 21:41:07 2026",
          "───────────────────────────────────────",
          "內文第一行",
        ];
      },
      getLine(index: number) {
        const rows = [
          { str: "  看板《Gossiping》[八卦] 人氣:1234" },
          { str: "" },
          { str: "" },
          {
            str: buildBoardLine({
              index: 782696,
              push: "5",
              date: "4/21",
              author: "tester",
              title: "[問卦] 同看板直開",
            }),
          },
        ];
        return rows[index] ?? { str: "" };
      },
    };

    await mod.fetchArticleFromBotManually(bot, "Gossiping", 782696);

    expect(calls).toEqual(["send:782696\r\r", "send:q"]);
  });

  it("re-enters the board list before opening when the current screen is an article in the same board", async () => {
    const mod = await import("../adapter");
    const calls: string[] = [];
    let mode: "article" | "board" | "opened" = "article";
    const boardRows = [
      "  看板《Gossiping》[八卦] 人氣:1234",
      "",
      "",
      buildBoardLine({
        index: 782696,
        push: "5",
        date: "4/21",
        author: "tester",
        title: "[問卦] 同板但目前仍在文章頁",
      }),
    ];
    const articleRows = [
      "作者  olduser (舊文章作者)                 看板  Gossiping",
      "標題  [問卦] 舊文章",
      "時間  Tue Apr 21 09:00:00 2026",
      "───────────────────────────────────────",
      "舊文章內容",
    ];
    const openedRows = [
      "作者  tester (測試)",
      "標題  [問卦] 同板但目前仍在文章頁",
      "時間  Tue Apr 21 10:10:00 2026",
      "───────────────────────────────────────",
      "新文章內容",
    ];
    const bot = {
      async enterBoardByName(boardName: string) {
        calls.push(`enter:${boardName}`);
        mode = "board";
        return true;
      },
      async send(command: string) {
        calls.push(`send:${command}`);
        if (command === "q") {
          mode = "board"; // q exits article view back to board list
        }
        if (command === "782696\r\r") {
          mode = "opened";
        }
        return true;
      },
      async getLines() {
        return openedRows;
      },
      getLine(index: number) {
        const rows =
          mode === "article" ? articleRows : mode === "board" ? boardRows : openedRows;
        return { str: rows[index] ?? "" };
      },
    };

    await mod.fetchArticleFromBotManually(bot, "Gossiping", 782696);

    // q exits article → board list (preserving filter mode if applicable),
    // then article is opened directly without re-entering the board.
    expect(calls).toEqual(["send:q", "send:782696\r\r", "send:q"]);
  });

  it("reads a board page manually without leaving the board view", async () => {
    const mod = await import("../adapter");
    const calls: string[] = [];
    const bot = {
      async send(command: string) {
        calls.push(`send:${command}`);
        return true;
      },
      async enterBoardByName(boardName: string) {
        calls.push(`enter:${boardName}`);
        return true;
      },
      async enterIndex() {
        calls.push("enterIndex");
        return true;
      },
      getLine(index: number) {
        const rows = [
          "  看板《Gossiping》[八卦] 人氣:1234",
          "",
          "",
          buildBoardLine({
            index: 785691,
            date: "4/17",
            author: "userC",
            status: "R:",
            title: "[新聞] 測試標題",
          }),
          buildBoardLine({
            index: 785692,
            push: "99",
            date: "4/17",
            author: "userB",
            title: "[問卦] 今天吃什麼",
          }),
          buildBoardLine({
            index: 785693,
            push: "3",
            date: "4/17",
            author: "userA",
            title: "[公告] 系統維護",
          }),
          "",
        ];
        return { str: rows[index] ?? "" };
      },
    };

    const articles = await mod.fetchBoardArticlesFromBotManually(bot, "Gossiping");

    expect(articles.map((article: { index: number }) => article.index)).toEqual([
      785693,
      785692,
      785691,
    ]);
    expect(calls).toEqual([]);
  });

  it("re-enters the board when forceReenter is true, even if already on a normal board list screen", async () => {
    // Regression test for push-filter mode persistence bug:
    // A push-filtered board list looks identical to a normal board list (no "系列《" marker),
    // so ensureNormalBoardView would return early without re-entering.
    // forceReenter=true bypasses that early return to guarantee the board is entered fresh.
    const mod = await import("../adapter");
    const calls: string[] = [];
    const bot = {
      async send(command: string) {
        calls.push(`send:${command}`);
        return true;
      },
      async enterBoardByName(boardName: string) {
        calls.push(`enter:${boardName}`);
        return true;
      },
      async enterIndex() {
        calls.push("enterIndex");
        return true;
      },
      getLine(index: number) {
        const rows = [
          "  看板《Gossiping》[八卦] 人氣:1234",
          "",
          "",
          buildBoardLine({
            index: 785691,
            date: "4/17",
            author: "userC",
            status: "R:",
            title: "[新聞] 測試標題",
          }),
          buildBoardLine({
            index: 785692,
            push: "99",
            date: "4/17",
            author: "userB",
            title: "[問卦] 今天吃什麼",
          }),
          buildBoardLine({
            index: 785693,
            push: "3",
            date: "4/17",
            author: "userA",
            title: "[公告] 系統維護",
          }),
          "",
        ];
        return { str: rows[index] ?? "" };
      },
    };

    await mod.fetchBoardArticlesFromBotManually(bot, "Gossiping", 0, true);

    expect(calls).toContain("enter:Gossiping");
  });

  it("uses board-list search fallback when entering from the PTT board directory", async () => {
    const mod = await import("../adapter");
    const calls: string[] = [];
    let state: "directory" | "matched" | "board" = "directory";

    const bot = {
      async send(command: string) {
        calls.push(command);
        if (command === "Tech_Job\r") state = "matched";
        if (command === "r") state = "board";
        return true;
      },
      async enterBoardByName() {
        throw new TypeError("Cannot read properties of undefined");
      },
      getLine(index: number) {
        const screens = {
          directory: [
            "【看板列表】                     批踢踢實業坊",
            "[←][q]回上層 [→][r]閱讀 [↑↓]選擇 [PgUp][PgDn]翻頁 [c]新文章 [/]搜尋 [h]求助",
            "   編號   看  板       類別   中   文   敘   述               人氣 板   主",
            "      1 ˇBaseball     棒球 ◎[棒球] 一馬首轟不一樣富貴邦MFGA   爆!Matthew10244",
          ],
          matched: [
            "【看板列表】                     批踢踢實業坊",
            "[←][q]回上層 [→][r]閱讀 [↑↓]選擇 [PgUp][PgDn]翻頁 [c]新文章 [/]搜尋 [h]求助",
            "   編號   看  板       類別   中   文   敘   述               人氣 板   主",
            "●   88 ˇTech_Job     科技 ◎[科技] 工作板                         96",
          ],
          board: [
            "  看板《Tech_Job》[科技] 人氣:96",
            "",
            "",
            buildBoardLine({
              index: 9981,
              push: "10",
              date: "5/13",
              author: "worker",
              title: "[請益] offer 選擇",
            }),
          ],
        } satisfies Record<typeof state, string[]>;

        return { str: screens[state][index] ?? "" };
      },
    };

    const articles = await mod.fetchBoardArticlesFromBotManually(bot, "Tech_Job");

    expect(calls).toContain("/");
    expect(calls).toContain("Tech_Job\r");
    expect(calls).toContain("r");
    expect(articles[0]?.title).toBe("[請益] offer 選擇");
  });

  it("returns to index before manual board entry when board-directory search misses", async () => {
    const mod = await import("../adapter");
    const calls: string[] = [];
    let state: "directory" | "index" | "board" = "directory";

    const bot = {
      async send(command: string) {
        calls.push(command);
        if (command === "r") state = "directory";
        if (command === "sTech_Job\r \x1b[1~\x1b[4~") state = "board";
        return true;
      },
      async enterBoardByName() {
        throw new TypeError("Cannot read properties of undefined");
      },
      async enterIndex() {
        calls.push("enterIndex");
        state = "index";
        return true;
      },
      getLine(index: number) {
        const screens = {
          directory: [
            "【看板列表】                     批踢踢實業坊                     看板《MyCIA》",
            "[←][q]回上層 [→][r]閱讀 [↑↓]選擇 [PgUp][PgDn]翻頁 [c]新文章 [/]搜尋 [h]求助",
            "   編號   看  板       類別   中   文   敘   述               人氣 板   主",
            "      1 ˇBaseball     棒球 ◎[棒球] 一馬首轟不一樣富貴邦MFGA   爆!Matthew10244",
          ],
          index: [
            "主功能表",
            "(F)avorite 我的最愛",
            "(C)lass 分組討論區",
            "(S)earch 搜尋看板",
          ],
          board: [
            "  看板《Tech_Job》[科技] 人氣:96",
            "",
            "",
            buildBoardLine({
              index: 9981,
              push: "10",
              date: "5/13",
              author: "worker",
              title: "[請益] offer 選擇",
            }),
          ],
        } satisfies Record<typeof state, string[]>;

        return { str: screens[state][index] ?? "" };
      },
    };

    const articles = await mod.fetchBoardArticlesFromBotManually(bot, "Tech_Job");

    expect(calls).toContain("enterIndex");
    expect(calls).toContain("sTech_Job\r \x1b[1~\x1b[4~");
    expect(articles[0]?.title).toBe("[請益] offer 選擇");
  });

  it("parses favorite board names from the PTT favorite screen without ptt-client Board.fromLine", async () => {
    const mod = await import("../adapter");
    const screen = [
      "【看板列表】                     批踢踢實業坊                     我的最愛",
      "[←][q]回上層 [→][r]閱讀 [↑↓]選擇 [PgUp][PgDn]翻頁 [c]新文章 [/]搜尋 [h]求助",
      "   編號   看  板       類別   中   文   敘   述               人氣 板   主",
      "●    1 ˇBaseball     棒球 ◎[棒球] 一馬首轟不一樣富貴邦MFGA   爆!Matthew10244",
      "     2 ˇStock        學術 ◎[股票] ＊溫聲股票板＊             爆!rayccccc/Pau",
      "     3   C_Chat       閒談 ◎[希洽] 這裡是ACG閒聊板           HOTdaniel0527",
      "     4   Test         測試 ◎[測試] 每週定期清除本板文章        3 hank2579",
    ].join("\n");

    expect(mod.parseFavoriteBoardNamesFromScreen(screen)).toEqual([
      "Baseball",
      "Stock",
      "C_Chat",
      "Test",
    ]);
  });

  it("reads favorites from the terminal screen instead of ptt-client getFavorite", async () => {
    const mod = await import("../adapter");
    const calls: string[] = [];
    const rows = [
      "【看板列表】                     批踢踢實業坊                     我的最愛",
      "[←][q]回上層 [→][r]閱讀 [↑↓]選擇 [PgUp][PgDn]翻頁 [c]新文章 [/]搜尋 [h]求助",
      "   編號   看  板       類別   中   文   敘   述               人氣 板   主",
      "●    1 ˇBaseball     棒球 ◎[棒球] 一馬首轟不一樣富貴邦MFGA   爆!Matthew10244",
      "     2 ˇStock        學術 ◎[股票] ＊溫聲股票板＊             爆!rayccccc/Pau",
    ];

    const bot = {
      async getFavorite() {
        calls.push("getFavorite");
        return [{ name: "Brother" }] as never;
      },
      async enterFavorite() {
        calls.push("enterFavorite");
        return true;
      },
      async enterIndex() {
        calls.push("enterIndex");
        return true;
      },
      getLine(index: number) {
        return { str: rows[index] ?? "" };
      },
    };

    await expect(mod.fetchFavoriteBoardNamesFromBot(bot)).resolves.toEqual([
      "Baseball",
      "Stock",
    ]);
    expect(calls).toEqual(["enterIndex", "enterFavorite", "enterIndex"]);
  });

  it("resets to the PTT index before reading favorites", async () => {
    const mod = await import("../adapter");
    const calls: string[] = [];
    const rows = [
      "【看板列表】                     批踢踢實業坊                     我的最愛",
      "",
      "",
      "●    1 ˇBaseball     棒球 ◎[棒球] 一馬首轟不一樣富貴邦MFGA   爆!Matthew10244",
    ];
    const bot = {
      async enterIndex() {
        calls.push("enterIndex");
        return true;
      },
      async enterFavorite() {
        calls.push("enterFavorite");
        return true;
      },
      getLine(index: number) {
        return { str: rows[index] ?? "" };
      },
    };

    await expect(mod.fetchFavoriteBoardNamesFromBot(bot)).resolves.toEqual([
      "Baseball",
    ]);
    expect(calls).toEqual(["enterIndex", "enterFavorite", "enterIndex"]);
  });

  it("leaves an article reader before reading favorites", async () => {
    const mod = await import("../adapter");
    const calls: string[] = [];
    let inArticle = true;
    const bot = {
      async send(command: string) {
        calls.push(command);
        if (command === "q") inArticle = false;
        return true;
      },
      async enterFavorite() {
        calls.push("enterFavorite");
        return true;
      },
      async enterIndex() {
        calls.push("enterIndex");
        return true;
      },
      getLine(index: number) {
        if (!inArticle) {
          const rows = [
            "【看板列表】                     批踢踢實業坊                     我的最愛",
            "",
            "",
            "●    1 ˇBaseball     棒球 ◎[棒球] 一馬首轟不一樣富貴邦MFGA   爆!Matthew10244",
          ];
          return { str: rows[index] ?? "" };
        }
        const rows = [
          " 標題  [公告] 申請組務時 請用預設的分類",
          " 時間  Thu Jan 26 04:21:47 2006",
          "───────────────────────────────────────",
          "申請組務時 請從以下八個選項選擇一個",
          "  瀏覽 第 1/2 頁 ( 58%)  目前顯示: 第 02~23 行  (y)回應(X%)推文(h)說明(←)離開",
        ];
        return { str: rows[index] ?? "" };
      },
    };

    await expect(mod.fetchFavoriteBoardNamesFromBot(bot)).resolves.toEqual([
      "Baseball",
    ]);
    expect(calls).toEqual(["q", "enterIndex", "enterFavorite", "enterIndex"]);
  });

  it("continues manual favorite parsing across multiple favorite pages", async () => {
    const mod = await import("../adapter");
    const calls: string[] = [];
    let page = 0;
    const pages = [
      [
        "【看板列表】                     批踢踢實業坊                     我的最愛",
        "[←][q]回上層 [→][r]閱讀 [↑↓]選擇 [PgUp][PgDn]翻頁 [c]新文章 [/]搜尋 [h]求助",
        "   編號   看  板       類別   中   文   敘   述               人氣 板   主",
        "●    1 ˇBaseball     棒球 ◎[棒球] 一馬首轟不一樣富貴邦MFGA   爆!Matthew10244",
        "     2 ˇStock        學術 ◎[股票] ＊溫聲股票板＊             爆!rayccccc/Pau",
        "     3 ˇBoard03      分類 ◎[測試] 第三個看板                   1 admin",
        "     4 ˇBoard04      分類 ◎[測試] 第四個看板                   1 admin",
        "     5 ˇBoard05      分類 ◎[測試] 第五個看板                   1 admin",
        "     6 ˇBoard06      分類 ◎[測試] 第六個看板                   1 admin",
        "     7 ˇBoard07      分類 ◎[測試] 第七個看板                   1 admin",
        "     8 ˇBoard08      分類 ◎[測試] 第八個看板                   1 admin",
        "     9 ˇBoard09      分類 ◎[測試] 第九個看板                   1 admin",
        "    10 ˇBoard10      分類 ◎[測試] 第十個看板                   1 admin",
        "    11 ˇBoard11      分類 ◎[測試] 第十一個看板                 1 admin",
        "    12 ˇBoard12      分類 ◎[測試] 第十二個看板                 1 admin",
        "    13 ˇBoard13      分類 ◎[測試] 第十三個看板                 1 admin",
        "    14 ˇBoard14      分類 ◎[測試] 第十四個看板                 1 admin",
        "    15 ˇBoard15      分類 ◎[測試] 第十五個看板                 1 admin",
        "    16 ˇBoard16      分類 ◎[測試] 第十六個看板                 1 admin",
        "    17 ˇBoard17      分類 ◎[測試] 第十七個看板                 1 admin",
        "    18 ˇBoard18      分類 ◎[測試] 第十八個看板                 1 admin",
        "    19 ˇBoard19      分類 ◎[測試] 第十九個看板                 1 admin",
        "    20 ˇBoard20      分類 ◎[測試] 第二十個看板                 1 admin",
      ],
      [
        "【看板列表】                     批踢踢實業坊                     我的最愛",
        "[←][q]回上層 [→][r]閱讀 [↑↓]選擇 [PgUp][PgDn]翻頁 [c]新文章 [/]搜尋 [h]求助",
        "   編號   看  板       類別   中   文   敘   述               人氣 板   主",
        "     3   C_Chat       閒談 ◎[希洽] 這裡是ACG閒聊板           HOTdaniel0527",
        "     4   Test         測試 ◎[測試] 每週定期清除本板文章        3 hank2579",
      ],
    ];

    const bot = {
      async getFavorite() {
        throw new RangeError("Invalid count value: -1");
      },
      async enterFavorite() {
        calls.push("enterFavorite");
        return true;
      },
      async send(command: string) {
        calls.push(command);
        page = Math.min(page + 1, pages.length - 1);
        return true;
      },
      async enterIndex() {
        calls.push("enterIndex");
        return true;
      },
      getLine(index: number) {
        return { str: pages[page]?.[index] ?? "" };
      },
    };

    await expect(mod.fetchFavoriteBoardNamesFromBot(bot)).resolves.toEqual([
      "Baseball",
      "Stock",
      "Board03",
      "Board04",
      "Board05",
      "Board06",
      "Board07",
      "Board08",
      "Board09",
      "Board10",
      "Board11",
      "Board12",
      "Board13",
      "Board14",
      "Board15",
      "Board16",
      "Board17",
      "Board18",
      "Board19",
      "Board20",
      "C_Chat",
      "Test",
    ]);
    expect(calls).toEqual([
      "enterIndex",
      "enterFavorite",
      "\x1b[6~",
      "enterIndex",
    ]);
  });

  it("opens an article through explicit board navigation using the same open sequence as ptt-client", async () => {
    const mod = await import("../adapter");
    const calls: string[] = [];
    const bot = {
      async enterBoardByName(boardName: string) {
        calls.push(`enter:${boardName}`);
        return true;
      },
      async send(command: string) {
        calls.push(`send:${command}`);
        return true;
      },
      async getLines() {
        return [
          "作者  poggssi (冠軍車手321)",
          "標題  Re: [問卦] 生育率真的跟女權有關係嗎",
          "時間  Thu Apr  9 21:41:07 2026",
          "───────────────────────────────────────",
          "內文第一行",
          "推 user1: hi 04/09 21:45",
        ];
      },
      getLine(index: number) {
        const rows = [
          { str: "作者  poggssi (冠軍車手321)" },
          { str: "標題  Re: [問卦] 生育率真的跟女權有關係嗎" },
          { str: "時間  Thu Apr  9 21:41:07 2026" },
        ];
        return rows[index] ?? { str: "" };
      },
    };

    const article = await mod.fetchArticleFromBot(bot, "Gossiping", 782696);

    expect(calls).toEqual([
      "enter:Gossiping",
      "send:782696\r\r",
      "send:q",
    ]);
    expect(article).toMatchObject({
      title: "Re: [問卦] 生育率真的跟女權有關係嗎",
      author: "poggssi (冠軍車手321)",
      board: "Gossiping",
    });
    expect(article?.date).toContain("Thu Apr");
    expect(article?.date).toContain("21:41:07 2026");
    expect(article?.body).toContain("內文第一行");
  });

  it("reads an article manually without relying on bot.getArticle", async () => {
    const mod = await import("../adapter");
    const calls: string[] = [];
    const bot = {
      async enterBoardByName(boardName: string) {
        calls.push(`enter:${boardName}`);
        return true;
      },
      async send(command: string) {
        calls.push(`send:${command}`);
        return true;
      },
      async getLines() {
        return [
          "作者  poggssi (冠軍車手321)",
          "標題  Re: [問卦] 手動開文",
          "時間  Thu Apr  9 21:41:07 2026",
          "───────────────────────────────────────",
          "內文第一行",
          "推 user1: hi 04/09 21:45",
        ];
      },
      async getArticle() {
        throw new Error("should not use bot.getArticle");
      },
      getLine(index: number) {
        const rows = [
          { str: "作者  poggssi (冠軍車手321)" },
          { str: "標題  Re: [問卦] 手動開文" },
          { str: "時間  Thu Apr  9 21:41:07 2026" },
        ];
        return rows[index] ?? { str: "" };
      },
    };

    const article = await mod.fetchArticleFromBotManually(bot, "Gossiping", 782696);

    expect(calls).toEqual([
      "enter:Gossiping",
      "send:782696\r\r",
      "send:q",
    ]);
    expect(article).toMatchObject({
      title: "Re: [問卦] 手動開文",
      author: "poggssi (冠軍車手321)",
      board: "Gossiping",
    });
  });

  it("extracts a partial article immediately from the current terminal snapshot", async () => {
    const mod = await import("../adapter");

    const partial = mod.parsePartialScreen(
      [
        "作者  poggssi (冠軍車手321)                 看板  Gossiping",
        "標題  Re: [問卦] 手動開文",
        "時間  Thu Apr  9 21:41:07 2026",
        "───────────────────────────────────────",
        "內文第一行",
        "推 user1: 第一則                         111.22.33.44 04/09 21:45",
        "瀏覽 第 1/3 頁 (33%)",
      ].join("\n"),
    );

    expect(partial).toMatchObject({
      title: "Re: [問卦] 手動開文",
      author: "poggssi (冠軍車手321)",
      date: "Thu Apr  9 21:41:07 2026",
      board: "Gossiping",
      body: "內文第一行",
    });
    expect(partial?.pushes).toEqual([
      expect.objectContaining({ author: "user1", content: "第一則" }),
    ]);
  });

  it("waits for the first article screen before progressive paging", async () => {
    const mod = await import("../adapter");
    const calls: string[] = [];
    const page1 = [
      "作者  poggssi (冠軍車手321)                 看板  Gossiping",
      "標題  Re: [問卦] 手動開文",
      "時間  Thu Apr  9 21:41:07 2026",
      "───────────────────────────────────────",
      "內文第一行",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "瀏覽 第 1/2 頁 (50%)",
    ];
    const page2 = [
      "內文第一行",
      "內文第二行",
      "推 user1: hi 04/09 21:45",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "瀏覽 第 2/2 頁 (100%)",
    ];

    let currentPage = page1;
    const partials: string[] = [];
    const bot = {
      async enterBoardByName(boardName: string) {
        calls.push(`enter:${boardName}`);
        return true;
      },
      async send(command: string) {
        calls.push(`send:${command}`);
        if (command === "\u001b[6~") {
          currentPage = page2;
        }
        if (command === "\u001b[1~") {
          currentPage = page1;
        }
        return true;
      },
      getLine(index: number) {
        return { str: currentPage[index] ?? "" };
      },
    };

    const article = await mod.fetchArticleFromBotManually(
      bot,
      "Gossiping",
      782696,
      (partial: { body: string }) => {
        partials.push(partial.body);
      },
    );

    expect(partials[0]).toContain("內文第一行");
    expect(calls.indexOf("send:\u001b[6~")).toBeGreaterThan(
      calls.indexOf("send:782696\r\r"),
    );
    expect(article?.body).toContain("內文第二行");
  });

  it("emits progressively larger partial article bodies while manually paging", async () => {
    const mod = await import("../adapter");
    const partials: Array<{
      body: string;
      pushes?: Array<{ author: string; content: string }>;
    }> = [];
    let currentPage = 0;
    const pages = [
      [
        "作者  poggssi (冠軍車手321)                 看板  Gossiping",
        "標題  Re: [問卦] progressive",
        "時間  Thu Apr  9 21:41:07 2026",
        "───────────────────────────────────────",
        "第一頁第一行",
        "第一頁第二行",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "瀏覽 第 1/2 頁 (50%)",
      ],
      [
        "作者  poggssi (冠軍車手321)                 看板  Gossiping",
        "標題  Re: [問卦] progressive",
        "時間  Thu Apr  9 21:41:07 2026",
        "───────────────────────────────────────",
        "第一頁第二行",
        "第二頁第一行",
        "第二頁第二行",
        "推 user1: hi 04/09 21:45",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "瀏覽 第 2/2 頁 (100%)",
      ],
    ];

    const bot = {
      async enterBoardByName() {
        return true;
      },
      async send(command: string) {
        if (command === "\u001b[6~") currentPage = 1;
        if (command === "\u001b[1~") currentPage = 0;
        return true;
      },
      async getLines() {
        throw new Error("should not use getLines when progressive partial is enabled");
      },
      getLine(index: number) {
        return { str: pages[currentPage][index] ?? "" };
      },
    };

    const article = await mod.fetchArticleFromBotManually(
      bot,
      "Gossiping",
      782696,
      (partial: {
        body: string;
        pushes?: Array<{ author: string; content: string }>;
      }) => {
        partials.push(partial);
      },
    );

    expect(partials.length).toBeGreaterThanOrEqual(2);
    expect(partials[0].body).toContain("第一頁第一行");
    expect(partials[0].body).not.toContain("第二頁第一行");
    expect(partials[partials.length - 1].body).toContain("第二頁第一行");
    expect(partials[partials.length - 1].body).not.toContain("推 user1: hi");
    expect(partials[partials.length - 1].pushes).toEqual([
      expect.objectContaining({ author: "user1", content: "hi" }),
    ]);
    expect(article?.body).toContain("第二頁第二行");
  });

  it("continues from the first detected screen without re-emitting the first page", async () => {
    const mod = await import("../adapter");
    const partialBodies: string[] = [];
    let currentPage = 0;
    const pages = [
      [
        "作者  poggssi (冠軍車手321)                 看板  Gossiping",
        "標題  Re: [問卦] continuous",
        "時間  Thu Apr  9 21:41:07 2026",
        "───────────────────────────────────────",
        "第一頁第一行",
        "第一頁第二行",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "瀏覽 第 1/2 頁 (50%)",
      ],
      [
        "作者  poggssi (冠軍車手321)                 看板  Gossiping",
        "標題  Re: [問卦] continuous",
        "時間  Thu Apr  9 21:41:07 2026",
        "───────────────────────────────────────",
        "第一頁第二行",
        "第二頁第一行",
        "第二頁第二行",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "瀏覽 第 2/2 頁 (100%)",
      ],
    ];

    const bot = {
      async enterBoardByName() {
        return true;
      },
      async send(command: string) {
        if (command === "\u001b[6~") currentPage = 1;
        if (command === "\u001b[1~") currentPage = 0;
        return true;
      },
      getLine(index: number) {
        return { str: pages[currentPage][index] ?? "" };
      },
    };

    await mod.fetchArticleFromBotManually(
      bot,
      "Gossiping",
      782696,
      (partial: { body: string }) => {
        partialBodies.push(partial.body);
      },
    );

    expect(partialBodies.length).toBeGreaterThanOrEqual(2);
    expect(partialBodies[0]).toContain("第一頁第一行");
    expect(partialBodies[1]).toContain("第二頁第一行");
  });

  it("emits the second body page immediately after the first PgDn screen change", async () => {
    const mod = await import("../adapter");
    const events: string[] = [];
    let currentPage = 0;
    const pages = [
      [
        "作者  poggssi (冠軍車手321)                 看板  Gossiping",
        "標題  Re: [問卦] first pgdn emit",
        "時間  Thu Apr  9 21:41:07 2026",
        "───────────────────────────────────────",
        "第一頁正文",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "瀏覽 第 1/2 頁 (50%)",
      ],
      [
        "作者  poggssi (冠軍車手321)                 看板  Gossiping",
        "標題  Re: [問卦] first pgdn emit",
        "時間  Thu Apr  9 21:41:07 2026",
        "───────────────────────────────────────",
        "第一頁正文",
        "第二頁正文",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "瀏覽 第 2/2 頁 (100%)",
      ],
    ];

    const bot = {
      async enterBoardByName() {
        return true;
      },
      async send(command: string) {
        if (command === "\u001b[6~") {
          events.push("send:pgdn");
          currentPage = 1;
        }
        if (command === "\u001b[1~") {
          events.push("send:home");
          currentPage = 0;
        }
        return true;
      },
      getLine(index: number) {
        return { str: pages[currentPage][index] ?? "" };
      },
    };

    await mod.fetchArticleFromBotManually(
      bot,
      "Gossiping",
      782696,
      (partial: { body: string }) => {
        events.push(
          partial.body.includes("第二頁正文")
            ? "partial:page2"
            : "partial:page1",
        );
      },
    );

    const firstPgDnIndex = events.indexOf("send:pgdn");
    const secondPagePartialIndex = events.indexOf("partial:page2");
    const homeIndex = events.indexOf("send:home");

    expect(firstPgDnIndex).toBeGreaterThanOrEqual(0);
    expect(secondPagePartialIndex).toBeGreaterThan(firstPgDnIndex);
    expect(secondPagePartialIndex).toBeLessThan(homeIndex);
  });

  it("emits the first screen partial before sending the first PgDn", async () => {
    const mod = await import("../adapter");
    const events: string[] = [];
    let currentPage = 0;
    const pages = [
      [
        "作者  poggssi (冠軍車手321)                 看板  Gossiping",
        "標題  Re: [問卦] first screen first",
        "時間  Thu Apr  9 21:41:07 2026",
        "───────────────────────────────────────",
        "第一屏正文",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "瀏覽 第 1/2 頁 (50%)",
      ],
      [
        "作者  poggssi (冠軍車手321)                 看板  Gossiping",
        "標題  Re: [問卦] first screen first",
        "時間  Thu Apr  9 21:41:07 2026",
        "───────────────────────────────────────",
        "第一屏正文",
        "第二屏正文",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "瀏覽 第 2/2 頁 (100%)",
      ],
    ];

    const bot = {
      async enterBoardByName() {
        return true;
      },
      async send(command: string) {
        if (command === "\u001b[6~") {
          events.push("send:pgdn");
          currentPage = 1;
        }
        if (command === "\u001b[1~") {
          currentPage = 0;
        }
        return true;
      },
      getLine(index: number) {
        return { str: pages[currentPage][index] ?? "" };
      },
    };

    await mod.fetchArticleFromBotManually(
      bot,
      "Gossiping",
      782696,
      (partial: { body: string }) => {
        events.push(
          partial.body.includes("第二屏正文")
            ? "partial:page2"
            : "partial:page1",
        );
      },
    );

    expect(events.indexOf("partial:page1")).toBeGreaterThanOrEqual(0);
    expect(events.indexOf("partial:page1")).toBeLessThan(
      events.indexOf("send:pgdn"),
    );
  });

  it("keeps partial pushes grouped while progressive reading is still in flight", async () => {
    const mod = await import("../adapter");
    const partialPushContents: string[][] = [];
    let currentPage = 0;
    const pages = [
      [
        "作者  poggssi (冠軍車手321)                 看板  Gossiping",
        "標題  Re: [問卦] grouped partial",
        "時間  Thu Apr  9 21:41:07 2026",
        "───────────────────────────────────────",
        "正文",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "瀏覽 第 1/2 頁 (50%)",
      ],
      [
        "作者  poggssi (冠軍車手321)                 看板  Gossiping",
        "標題  Re: [問卦] grouped partial",
        "時間  Thu Apr  9 21:41:07 2026",
        "───────────────────────────────────────",
        "正文",
        "推 alice: 第一段 04/09 21:45",
        "推 alice: 第二段 04/09 21:46",
        "推 bob: 回1樓：收到 04/09 21:47",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "瀏覽 第 2/2 頁 (100%)",
      ],
    ];

    const bot = {
      async enterBoardByName() {
        return true;
      },
      async send(command: string) {
        if (command === "\u001b[6~") currentPage = 1;
        if (command === "\u001b[1~") currentPage = 0;
        return true;
      },
      getLine(index: number) {
        return { str: pages[currentPage][index] ?? "" };
      },
    };

    await mod.fetchArticleFromBotManually(
      bot,
      "Gossiping",
      782696,
      (partial: {
        pushes?: Array<{ author: string; content: string; replyTo: string | null }>;
      }) => {
        if ((partial.pushes?.length ?? 0) > 0) {
          partialPushContents.push(
            partial.pushes!.map(
              (push) => `${push.author}:${push.content}:${push.replyTo ?? "root"}`,
            ),
          );
        }
      },
    );

    expect(partialPushContents[0]).toEqual([
      "alice:第一段第二段:root",
      "bob:收到:push-0",
    ]);
  });

  it("continues emitting partial pushes across screens that already show 100 percent", async () => {
    const mod = await import("../adapter");
    const pushCounts: number[] = [];
    let currentPage = 0;
    const pages = [
      [
        "作者  poggssi (冠軍車手321)                 看板  Gossiping",
        "標題  Re: [問卦] push pages",
        "時間  Thu Apr  9 21:41:07 2026",
        "───────────────────────────────────────",
        "正文",
        "推 user1: first 04/09 21:45",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "瀏覽 第 2/2 頁 (100%)",
      ],
      [
        "作者  poggssi (冠軍車手321)                 看板  Gossiping",
        "標題  Re: [問卦] push pages",
        "時間  Thu Apr  9 21:41:07 2026",
        "───────────────────────────────────────",
        "正文",
        "推 user1: first 04/09 21:45",
        "推 user2: second 04/09 21:46",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "瀏覽 第 2/2 頁 (100%)",
      ],
    ];

    const bot = {
      async enterBoardByName() {
        return true;
      },
      async send(command: string) {
        if (command === "\u001b[6~") {
          currentPage = Math.min(currentPage + 1, pages.length - 1);
        }
        if (command === "\u001b[1~") currentPage = 0;
        return true;
      },
      getLine(index: number) {
        return { str: pages[currentPage][index] ?? "" };
      },
    };

    const article = await mod.fetchArticleFromBotManually(
      bot,
      "Gossiping",
      782696,
      (partial: { pushes?: Array<{ author: string }> }) => {
        pushCounts.push(partial.pushes?.length ?? 0);
      },
    );

    expect(pushCounts).toContain(1);
    expect(pushCounts).toContain(2);
    expect(article?.pushes.map((push: { author: string }) => push.author)).toEqual([
      "user1",
      "user2",
    ]);
  });

  it("opens article by aid through the same progressive manual flow", async () => {
    const mod = await import("../adapter");
    const partialBodies: string[] = [];
    const sentCommands: string[] = [];
    let currentPage = -1;
    const pages = [
      [
        "作者  tester (測試者)                   看板  Gossiping",
        "標題  [問卦] aid progressive",
        "時間  Fri Apr 24 18:00:00 2026",
        "───────────────────────────────────────",
        "第一頁正文",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "瀏覽 第 1/2 頁 (50%)",
      ],
      [
        "作者  tester (測試者)                   看板  Gossiping",
        "標題  [問卦] aid progressive",
        "時間  Fri Apr 24 18:00:00 2026",
        "───────────────────────────────────────",
        "第一頁正文",
        "第二頁正文",
        "推 user1: hi 04/24 18:01",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "瀏覽 第 2/2 頁 (100%)",
      ],
    ];

    const bot = {
      async enterBoardByName() {
        sentCommands.push("enterBoardByName");
        return true;
      },
      async send(command: string) {
        sentCommands.push(command);
        if (command === "#1fwkuLQh\r") currentPage = 0;
        if (command === "\u001b[6~") currentPage = Math.min(currentPage + 1, 1);
        if (command === "\u001b[1~") currentPage = 0;
        return true;
      },
      getLine(index: number) {
        if (currentPage < 0) return { str: "" };
        return { str: pages[currentPage][index] ?? "" };
      },
    };

    const article = await mod.fetchArticleByAidFromBotManually(
      bot,
      "Gossiping",
      "1fwkuLQh",
      (partial: { body: string }) => {
        partialBodies.push(partial.body);
      },
    );

    expect(sentCommands).toContain("#1fwkuLQh\r");
    expect(partialBodies[0]).toContain("第一頁正文");
    expect(partialBodies[partialBodies.length - 1]).toContain("第二頁正文");
    expect(article).toMatchObject({
      title: "[問卦] aid progressive",
      body: expect.stringContaining("第二頁正文"),
    });
    expect(article?.pushes.map((push: { author: string }) => push.author)).toEqual([
      "user1",
    ]);
  });

  it("includes a dev debug dump with raw line and parsed push summaries", async () => {
    const mod = await import("../adapter");

    const bot = {
      async getArticle(_boardName: string, _articleIndex: number) {
        return {
          author: "poggssi (冠軍車手321)",
          title: "Re: [問卦] debug",
          timestamp: "Thu Apr  9 21:41:07 2026",
          boardname: "Gossiping",
          lines: [
            "作者  poggssi (冠軍車手321) 看板  Gossiping",
            "標題  Re: [問卦] debug",
            "時間  Thu Apr  9 21:41:07 2026",
            "───────────────────────────────────────",
            "內文第一行",
            "推 user1: 第一則                         111.22.33.44 04/09 21:45",
            "推 user2: 第二則                         111.22.33.55 04/09 21:46",
            "瀏覽 第 2/2 頁 (100%)",
          ],
        };
      },
    };

    const article = await mod.fetchArticleFromBot(bot, "Gossiping", 782696);

    expect(article?.debug).toMatchObject({
      boardName: "Gossiping",
      articleIndex: 782696,
      rawLineCount: 8,
      parsedPushCount: 2,
      bottomStatusLine: "瀏覽 第 2/2 頁 (100%)",
    });
    const debug = article?.debug;
    const lastDebugLine = debug?.lastLines[debug.lastLines.length - 1];
    const lastParsedPush =
      debug?.parsedLastPushes[debug.parsedLastPushes.length - 1];
    expect(lastDebugLine).toBe("瀏覽 第 2/2 頁 (100%)");
    expect(lastParsedPush).toMatchObject({
      author: "user2",
      content: "第二則",
    });
  });

  it("parses padded Stock-style push author columns throughout article reading", async () => {
    const mod = await import("../adapter");

    const bot = {
      async getArticle(_boardName: string, _articleIndex: number) {
        return {
          author: "joanzkow (星浪)",
          title: "[新聞] 快訊",
          timestamp: "Sat Apr 11 16:08:24 2026",
          boardname: "Stock",
          lines: [
            "作者  joanzkow (星浪)                                            看板  Stock ",
            "標題  [新聞] 快訊",
            "時間  Sat Apr 11 16:08:24 2026",
            "───────────────────────────────────────",
            "內文第一行",
            "推 wheat1130   : https://i.meee.com.tw/hC3mVOL.jpg                 04/11 19:46",
            "→ bb10181128  : 伊朗外長平常都穿西裝啊                            04/11 20:25",
            "噓 Rutschman   : 垃圾媒體放什麼話                                  04/11 20:30",
          ],
        };
      },
    };

    const article = await mod.fetchArticleFromBot(bot, "Stock", 198761);

    expect(article?.pushes.filter((push) => push.type !== "edit")).toHaveLength(3);
    expect(article?.pushes.map((push) => push.author)).toEqual([
      "wheat1130",
      "bb10181128",
      "Rutschman",
    ]);
    const pushes = article?.pushes ?? [];
    const lastPush = pushes[pushes.length - 1];
    expect(lastPush).toMatchObject({
      type: "boo",
      content: "垃圾媒體放什麼話",
      time: "04/11 20:30",
    });
  });

  it("keeps edit records article-level while threading OP edited text when reading an article", async () => {
    const mod = await import("../adapter");

    const bot = {
      async getArticle(_boardName: string, _articleIndex: number) {
        return {
          author: "poggssi (冠軍車手321)",
          title: "Re: [問卦] 生育率真的跟女權有關係嗎",
          timestamp: "Thu Apr  9 21:41:07 2026",
          boardname: "Gossiping",
          lines: [
            "作者  poggssi (冠軍車手321) 看板  Gossiping",
            "標題  Re: [問卦] 生育率真的跟女權有關係嗎",
            "時間  Thu Apr  9 21:41:07 2026",
            "───────────────────────────────────────",
            "內文第一行",
            "推 user1: 第一則推文                         111.22.33.44 04/09 21:45",
            "※ 編輯: poggssi (1.2.3.4), 04/09/2026 21:46:07",
            "補充說明",
            "推 user2: 第二則推文                         111.22.33.55 04/09 21:47",
          ],
        };
      },
    };

    const article = await mod.fetchArticleFromBot(bot, "Gossiping", 782696);

    expect(article).toMatchObject({
      title: "Re: [問卦] 生育率真的跟女權有關係嗎",
      author: "poggssi (冠軍車手321)",
      board: "Gossiping",
    });
    expect(article?.pushes.filter((push) => push.type !== "edit")).toHaveLength(2);
    expect(article?.pushes[0]?.content).toBe("第一則推文");
    expect(
      article?.pushes.filter(
        (push) => push.replyTo === article.pushes[0]?.id && push.type === "edit",
      ),
    ).toEqual([
      expect.objectContaining({
        marker: "作者編輯",
        content: "補充說明",
      }),
    ]);
    expect(article?.pushes[1]?.content).toBe("第二則推文");
    expect(article?.articleNotes ?? []).toEqual([
      expect.objectContaining({
        marker: "※ 編輯:",
        content: "poggssi (1.2.3.4), 04/09/2026 21:46:07",
      }),
    ]);
  });

  it("keeps edit-note attachment stable when ANSI bytes appear before a later push", async () => {
    const mod = await import("../adapter");

    const bot = {
      async getArticle(_boardName: string, _articleIndex: number) {
        return {
          author: "poggssi (冠軍車手321)",
          title: "Re: [問卦] 生育率真的跟女權有關係嗎",
          timestamp: "Thu Apr  9 21:41:07 2026",
          boardname: "Gossiping",
          lines: [
            "作者  poggssi (冠軍車手321) 看板  Gossiping",
            "標題  Re: [問卦] 生育率真的跟女權有關係嗎",
            "時間  Thu Apr  9 21:41:07 2026",
            "───────────────────────────────────────",
            "內文第一行",
            "推 user1: 第一則推文                         111.22.33.44 04/09 21:45",
            "※ 編輯: poggssi (1.2.3.4), 04/09/2026 21:46:07",
            "補充說明",
            "\u001b[31m推 user2: 第二則推文                         111.22.33.55 04/09 21:47\u001b[0m",
          ],
        };
      },
    };

    const article = await mod.fetchArticleFromBot(bot, "Gossiping", 782696);

    expect(article?.pushes.filter((push) => push.type !== "edit")).toHaveLength(2);
    expect(article?.pushes[0]?.content).toBe("第一則推文");
    expect(
      article?.pushes.filter(
        (push) => push.replyTo === article.pushes[0]?.id && push.type === "edit",
      ),
    ).toEqual([expect.objectContaining({ content: "補充說明" })]);
    expect(article?.pushes[1]?.content).toBe("第二則推文");
    expect(article?.articleNotes ?? []).toHaveLength(1);
  });

  it("preserves compressed same-line pushes when reading an article", async () => {
    const mod = await import("../adapter");

    const bot = {
      async getArticle(_boardName: string, _articleIndex: number) {
        return {
          author: "poggssi (冠軍車手321)",
          title: "Re: [問卦] 生育率真的跟女權有關係嗎",
          timestamp: "Thu Apr  9 21:41:07 2026",
          boardname: "Gossiping",
          lines: [
            "作者  poggssi (冠軍車手321) 看板  Gossiping",
            "標題  Re: [問卦] 生育率真的跟女權有關係嗎",
            "時間  Thu Apr  9 21:41:07 2026",
            "───────────────────────────────────────",
            "內文第一行",
            "\u001b[31m推 user1: 第一則推文                         111.22.33.44 04/09 21:45推 user2: 第二則推文                         111.22.33.55 04/09 21:46\u001b[0m",
          ],
        };
      },
    };

    const article = await mod.fetchArticleFromBot(bot, "Gossiping", 782696);

    expect(article?.pushes.filter((push) => push.type !== "edit")).toHaveLength(2);
    expect(article?.pushes.map((push) => push.content)).toEqual([
      "第一則推文",
      "第二則推文",
    ]);
  });

  it("attaches OP edited text after compressed same-line pushes to the later push", async () => {
    const mod = await import("../adapter");

    const bot = {
      async getArticle(_boardName: string, _articleIndex: number) {
        return {
          author: "poggssi (冠軍車手321)",
          title: "Re: [問卦] 生育率真的跟女權有關係嗎",
          timestamp: "Thu Apr  9 21:41:07 2026",
          boardname: "Gossiping",
          lines: [
            "作者  poggssi (冠軍車手321) 看板  Gossiping",
            "標題  Re: [問卦] 生育率真的跟女權有關係嗎",
            "時間  Thu Apr  9 21:41:07 2026",
            "───────────────────────────────────────",
            "內文第一行",
            "推 user1: 第一則推文                         111.22.33.44 04/09 21:45推 user2: 第二則推文                         111.22.33.55 04/09 21:46",
            "※ 編輯: poggssi (1.2.3.4), 04/09/2026 21:47:07",
            "補充說明",
          ],
        };
      },
    };

    const article = await mod.fetchArticleFromBot(bot, "Gossiping", 782696);

    expect(article?.pushes.filter((push) => push.type !== "edit")).toHaveLength(2);
    expect(
      article?.pushes.filter(
        (push) => push.replyTo === article.pushes[0]?.id && push.type === "edit",
      ),
    ).toHaveLength(0);
    expect(
      article?.pushes.filter(
        (push) => push.replyTo === article.pushes[1]?.id && push.type === "edit",
      ),
    ).toEqual([expect.objectContaining({ content: "補充說明" })]);
  });

  it("treats the paragraph immediately before an edit marker as reply content when no trailing edit content exists", async () => {
    const mod = await import("../adapter");

    const bot = {
      async getArticle(_boardName: string, _articleIndex: number) {
        return {
          author: "Lineage097 (狐狸壽司)",
          title: "Re: [問卦] 某個機關怎麼破",
          timestamp: "Thu Apr  9 21:41:07 2026",
          boardname: "Gossiping",
          lines: [
            "作者  Lineage097 (狐狸壽司) 看板  Gossiping",
            "標題  Re: [問卦] 某個機關怎麼破",
            "時間  Thu Apr  9 21:41:07 2026",
            "───────────────────────────────────────",
            "推 cowardlyman: 最後怎麼破的，忘了                 111.22.33.44 04/09 21:45",
            "靠鋼珠把圓盤全部塞滿 硬擠進去",
            "※ 編輯: Lineage097 (1.2.3.4), 04/09/2026 21:46:07",
          ],
        };
      },
    };

    const article = await mod.fetchArticleFromBot(bot, "Gossiping", 782696);
    const parent = article?.pushes.find((push) => push.author === "cowardlyman");

    expect(parent?.content).toBe("最後怎麼破的，忘了");
    expect(
      article?.pushes.filter(
        (push) => push.replyTo === parent?.id && push.type === "edit",
      ),
    ).toEqual([
      expect.objectContaining({
        content: "靠鋼珠把圓盤全部塞滿 硬擠進去",
        marker: "作者編輯",
        author: "Lineage097 (狐狸壽司)",
      }),
    ]);
    expect(article?.articleNotes ?? []).toEqual([
      expect.objectContaining({
        marker: "※ 編輯:",
        content: "Lineage097 (1.2.3.4), 04/09/2026 21:46:07",
      }),
    ]);
  });

  it("keeps OP edited text between normal pushes out of the previous push block", async () => {
    const mod = await import("../adapter");

    const bot = {
      async getArticle(_boardName: string, _articleIndex: number) {
        return {
          author: "Lineage097 (狐狸壽司)",
          title: "Re: [問卦] 刪推文",
          timestamp: "Sat Apr 11 12:50:00 2026",
          boardname: "Gossiping",
          lines: [
            "作者  Lineage097 (狐狸壽司) 看板  Gossiping",
            "標題  Re: [問卦] 刪推文",
            "時間  Sat Apr 11 12:50:00 2026",
            "───────────────────────────────────────",
            "推 darren2586: 哇靠老哥你是把推文全刪了喔        04/11 12:53",
            "真的抱歉 我按編輯不知道為什麼全不見了...",
            "→ zteboom46: 刪推文喔?                         04/11 12:53",
          ],
        };
      },
    };

    const article = await mod.fetchArticleFromBot(bot, "Gossiping", 782700);
    const parent = article?.pushes.find((push) => push.author === "darren2586");

    expect(parent?.content).toBe("哇靠老哥你是把推文全刪了喔");
    expect(
      article?.pushes.filter(
        (push) => push.replyTo === parent?.id && push.type === "edit",
      ),
    ).toEqual([
      expect.objectContaining({
        marker: "作者編輯",
        author: "Lineage097 (狐狸壽司)",
        content: "真的抱歉 我按編輯不知道為什麼全不見了...",
      }),
    ]);
  });

  it("parses article headers even when author and board share the same line", async () => {
    const mod = await import("../adapter");
    const article = mod.parseArticleHeaderBlock(
      [
        "作者  poggssi (冠軍車手321) 看板  Gossiping",
        "標題  Re: [問卦] 生育率真的跟女權有關係嗎",
        "時間  Thu Apr  9 21:41:07 2026",
        "───────────────────────────────────────",
        "內文第一行",
      ].join("\n"),
    );

    expect(article).toMatchObject({
      author: "poggssi (冠軍車手321)",
      board: "Gossiping",
      title: "Re: [問卦] 生育率真的跟女權有關係嗎",
    });
    expect(article.date).toContain("Thu Apr");
    expect(article.date).toContain("21:41:07 2026");
  });

  it("prefers the library getArticle flow while neutralizing its unsafe enterIndex step", async () => {
    const mod = await import("../adapter");
    let dangerousEnterIndexCalls = 0;

    const bot = {
      async getArticle(_boardName: string, _articleIndex: number) {
        await this.enterIndex();
        return {
          author: "poggssi (冠軍車手321)",
          title: "Re: [問卦] 生育率真的跟女權有關係嗎",
          timestamp: "Thu Apr  9 21:41:07 2026",
          boardname: "Gossiping",
          lines: [
            "作者  poggssi (冠軍車手321) 看板  Gossiping",
            "標題  Re: [問卦] 生育率真的跟女權有關係嗎",
            "時間  Thu Apr  9 21:41:07 2026",
            "───────────────────────────────────────",
            "內文第一行",
            "推 user1: hi 04/09 21:45",
          ],
        };
      },
      async enterIndex() {
        dangerousEnterIndexCalls += 1;
        return true;
      },
    };

    const article = await mod.fetchArticleFromBot(bot, "Gossiping", 782696);

    expect(dangerousEnterIndexCalls).toBe(0);
    expect(article).toMatchObject({
      title: "Re: [問卦] 生育率真的跟女權有關係嗎",
      author: "poggssi (冠軍車手321)",
      board: "Gossiping",
    });
    expect(article?.body).toContain("內文第一行");
  });

  it("emits progressive partials from the fast library getArticle path", async () => {
    const mod = await import("../adapter");
    const partialSnapshots: Array<{ body: number; pushes: number }> = [];

    const bot = {
      async getArticle(_boardName: string, _articleIndex: number) {
        const fillerLines = Array.from({ length: 40 }, (_, index) => `正文第${index + 1}行`);
        return {
          author: "tester (fast path)",
          title: "[問卦] fast partial",
          timestamp: "Fri Apr 24 20:20:00 2026",
          boardname: "Gossiping",
          lines: [
            "作者  tester (fast path) 看板  Gossiping",
            "標題  [問卦] fast partial",
            "時間  Fri Apr 24 20:20:00 2026",
            "───────────────────────────────────────",
            ...fillerLines,
            "推 user1: 第一則推文                         111.22.33.44 04/24 20:21",
            "推 user2: 第二則推文                         111.22.33.55 04/24 20:22",
          ],
        };
      },
    };

    await mod.fetchArticleFromBot(bot, "Gossiping", 784107, (partial) => {
      partialSnapshots.push({
        body: partial.body.length,
        pushes: partial.pushes?.length ?? 0,
      });
    });

    expect(partialSnapshots.length).toBeGreaterThan(1);
    const last = partialSnapshots[partialSnapshots.length - 1];
    expect(last.body).toBeGreaterThan(partialSnapshots[0].body);
    expect(last.pushes).toBeGreaterThanOrEqual(partialSnapshots[0].pushes);
  });

  it("returns the current article screen even when its fingerprint matches the previous snapshot", async () => {
    const mod = await import("../adapter");
    const oldScreen = [
      "作者  olduser (舊文章作者)                 看板  Gossiping",
      "標題  [問卦] 舊文章",
      "時間  Thu Apr  9 21:30:00 2026",
      "───────────────────────────────────────",
      "這是舊文章內容",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "瀏覽 第 1/2 頁 (50%)",
    ];
    const partial = await mod.waitForArticleFirstScreen(
      {
        getLine(index: number) {
          return { str: oldScreen[index] ?? "" };
        },
      },
      "Gossiping",
      {
        timeoutMs: 200,
        previousFingerprint:
          "Gossiping|[問卦] 舊文章|olduser (舊文章作者)|Thu Apr  9 21:30:00 2026",
      },
    );

    expect(partial?.partial).toMatchObject({
      title: "[問卦] 舊文章",
      author: "olduser (舊文章作者)",
      body: "這是舊文章內容",
    });
    expect(partial?.screenLines).toEqual(oldScreen);
  });

  it("records article open timing trace during manual fetch", async () => {
    const mod = await import("../adapter");
    mod.clearLastArticleOpenTrace();

    const bot = {
      async send() {
        return true;
      },
      getLine(index: number) {
        const rows = [
          "作者  traceuser (追蹤者)                 看板  Gossiping",
          "標題  [問卦] trace",
          "時間  Thu Apr  9 21:41:07 2026",
          "───────────────────────────────────────",
          "第一行",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "瀏覽 第 1/1 頁 (100%)",
        ];
        return { str: rows[index] ?? "" };
      },
    };

    await mod.fetchArticleFromBotManually(bot, "Gossiping", 123, () => undefined);

    const trace = mod.getLastArticleOpenTrace();
    expect(trace?.boardName).toBe("Gossiping");
    expect(trace?.articleIndex).toBe(123);
    expect(
      trace?.events.some((event: { name: string }) => event.name === "send_open_done"),
    ).toBe(true);
    expect(
      trace?.events.some(
        (event: { name: string }) => event.name === "final_article_settled",
      ),
    ).toBe(true);
    expect(trace?.partialCandidates[0]?.title).toBe("[問卦] trace");
  });
});
