import { describe, expect, it } from "vitest";

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
    ]);
    expect(article).toMatchObject({
      title: "Re: [問卦] 生育率真的跟女權有關係嗎",
      author: "poggssi (冠軍車手321)",
      board: "Gossiping",
    });
    expect(article?.date).toContain("Thu Apr");
    expect(article?.date).toContain("21:41:07 2026");
    expect(article.body).toContain("內文第一行");
  });

  it("threads article edit notes through push aggregation when reading an article", async () => {
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
        marker: "※ 編輯:",
        content: "補充說明",
      }),
    ]);
    expect(article?.pushes[1]?.content).toBe("第二則推文");
    expect(article?.articleNotes ?? []).toHaveLength(0);
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
    expect(article?.articleNotes ?? []).toHaveLength(0);
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

  it("attaches an edit note after compressed same-line pushes to the later push", async () => {
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
        marker: "※ 編輯:",
        author: "Lineage097 (狐狸壽司)",
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
});
