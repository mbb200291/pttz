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
