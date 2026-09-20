import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

function readRealPttFixture(name: string): string {
  const local = resolve(process.cwd(), "src/internal/__fixtures__/real-ptt/2026-08-31_2026-09-01", name);
  const fromRepositoryRoot = resolve(
    process.cwd(),
    "packages/browser/src/internal/__fixtures__/real-ptt/2026-08-31_2026-09-01",
    name,
  );
  return readFileSync(existsSync(local) ? local : fromRepositoryRoot, "utf8");
}

function fixtureSection(source: string, heading: string): string {
  const marker = `=== ${heading} ===`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing fixture section: ${heading}`);
  const bodyStart = start + marker.length;
  const next = source.indexOf("\n=== ", bodyStart);
  return source.slice(bodyStart, next < 0 ? undefined : next).trim();
}

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

describe("terminal driver module", () => {
  it.each(["edit", "reply"] as const)("rejects formatted whitespace before %s navigation", async (kind) => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const bot = { getLines: async () => [], getLine: () => ({ str: "" }), send: async (value: string) => { sent.push(value); return true; } };
    const request = { boardName: "Test", articleIndex: 0, expectedAuthor: "alice", expectedTitle: "title", body: " \t\n ", formatting: [{ start: 0, end: 4, bold: true }] };
    const result = await (kind === "edit" ? mod.submitArticleEditFromBot(bot, request) : mod.submitArticleReplyToBoardFromBot(bot, request));
    expect(result).toMatchObject({ ok: false, outcome: "not-sent", reason: kind === "edit" ? "文章正文不可為空" : "回應正文不可為空" });
    expect(sent).toEqual([]);
  });

  it.each([{ editor: true, body: "red" }, { editor: false, body: "red" }, { editor: true, body: "   " }])("requires nonblank content and an actual editor before formatted create ($editor, '$body')", async ({ editor, body }) => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    let rows = ["【主功能表】"];
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      enterBoardByName: async () => { rows = ["看板《Test》", buildBoardLine({ index: 1, author: "alice", title: "old" })]; return true; },
      getLine: (index: number) => ({ str: rows[index] ?? "" }),
      getLines: async () => rows,
      send: async (command: string) => {
        sent.push(command);
        if (command === "\x10") rows = ["標題:"];
        else if (command === "title\r") rows = [editor ? "文章編輯  離開[Ctrl-X]  插入模式" : "權限不足，請按任意鍵繼續"];
        else if (command === "\x18") rows = ["文章已發表"];
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);
    const result = await driver.postArticle("Test", "", "title", body, [{ start: 0, end: 3, color: 31 }]);
    if (editor && body.trim()) {
      expect(result).toMatchObject({ ok: true, outcome: "sent" });
      expect(sent).toContain("\x15[0;31mred\x15[0m\r");
    } else {
      expect(result).toMatchObject({ ok: false, outcome: "not-sent" });
      expect(sent.some(command => command.includes("\x15"))).toBe(false);
      if (!body.trim()) expect(sent).toEqual([]);
    }
  });

  it("parses canonical AID evidence from the PTT article-info screen", async () => {
    const mod = await import("./terminalDriver.js");
    expect(mod.parseArticleInfoAid(
      "文章代碼(AID): #1fwkuLQh (Test)\n文章網址: https://www.ptt.cc/bbs/Test/M.1.A.1.html",
    )).toEqual({ aid: "1fwkuLQh", board: "Test" });
    expect(mod.parseArticleInfoAid("作者 alice 看板 Test")).toBeNull();
  });

  it("refuses a push when the exact index opens a different article", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 42, date: "08/22", author: "alice", title: "目標文章" }),
    ];
    const wrongRows = [
      "作者  bob 看板 Test",
      "標題  其他文章",
      "時間  Sat Aug 22 10:00:00 2026",
      "───────────────────────────────────────",
      "錯誤內容",
    ];
    let screenRows = boardRows;
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      getLine(index: number) { return { str: screenRows[index] ?? "" }; },
      async getLines() { return screenRows; },
      async send(command: string) {
        sent.push(command);
        if (command === "42\r\r") screenRows = wrongRows;
        if (command === "q") screenRows = boardRows;
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);

    await expect(driver.executeArticleCommand({
      type: "reply-article",
      article: { board: "Test", index: 42 },
      content: "不可送出",
      pushType: "neutral",
    })).resolves.toMatchObject({ ok: false, outcome: "not-sent" });
    expect(sent).not.toContain("X");
    expect(sent).not.toContain("不可送出\r");
    expect(sent.at(-1)).toBe("q");
  });

  it("refuses a push when getLines is stale but the visible screen is another article", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 42, date: "08/22", author: "alice", title: "目標文章" }),
    ];
    const staleTargetRows = [
      "作者  alice 看板 Test",
      "標題  目標文章",
      "時間  Sat Aug 22 10:00:00 2026",
      "───────────────────────────────────────",
      "舊快照內容",
    ];
    const visibleWrongRows = [
      "作者  bob 看板 Test",
      "標題  其他文章",
      "時間  Sat Aug 22 11:00:00 2026",
      "───────────────────────────────────────",
      "目前畫面內容",
    ];
    let screenRows = boardRows;
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      getLine(index: number) { return { str: screenRows[index] ?? "" }; },
      async getLines() { return staleTargetRows; },
      async send(command: string) {
        sent.push(command);
        if (command === "42\r\r") screenRows = visibleWrongRows;
        else if (command === "q") screenRows = boardRows;
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);

    await expect(driver.executeArticleCommand({
      type: "reply-article",
      article: { board: "Test", index: 42 },
      content: "不可送到錯文",
      pushType: "neutral",
    })).resolves.toMatchObject({ ok: false, outcome: "not-sent" });

    expect(sent).not.toContain("X");
    expect(sent).not.toContain("不可送到錯文\r");
    expect(sent.at(-1)).toBe("q");
  });

  it("does not authorize or record a push when disconnected during article acquisition", async () => {
    const mod = await import("./terminalDriver.js");
    const { ArticleSessionTracker } = await import("./articleSession.js");
    const record = vi.spyOn(ArticleSessionTracker.prototype, "record");
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const sent: string[] = [];
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 42, date: "08/22", author: "alice", title: "目標文章" }),
    ];
    const articleRows = [
      "作者  alice 看板 Test",
      "標題  目標文章",
      "時間  Sat Aug 22 10:00:00 2026",
      "───────────────────────────────────────",
      "文章內容",
    ];
    let screenRows = boardRows;
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on(event: string, listener: (...args: unknown[]) => void) {
        listeners.set(event, listener);
        return this;
      },
      getLine(index: number) { return { str: screenRows[index] ?? "" }; },
      async getLines() { return articleRows; },
      async send(command: string) {
        sent.push(command);
        if (command === "42\r\r") {
          screenRows = articleRows;
          listeners.get("disconnect")?.();
        } else if (command === "q") {
          screenRows = boardRows;
        }
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);

    try {
      await expect(driver.executeArticleCommand({
        type: "reply-article",
        article: { board: "Test", index: 42 },
        content: "斷線不可送",
        pushType: "neutral",
      })).resolves.toMatchObject({ ok: false, outcome: "not-sent" });

      expect(sent).not.toContain("X");
      expect(sent).not.toContain("斷線不可送\r");
      expect(record).not.toHaveBeenCalled();
    } finally {
      record.mockRestore();
    }
  });

  it("rejects wrong canonical AID evidence before every article write workflow", async () => {
    const mod = await import("./terminalDriver.js");
    const key = { board: "Test", aid: "#expected" } as const;
    const commands = [
      { type: "reply-article", article: key, content: "x", pushType: "neutral" },
      { type: "edit-article", article: key, content: "new" },
      { type: "delete-article", article: key },
      { type: "reply-article-to-board", article: key, content: "response" },
    ] as const;

    for (const command of commands) {
      const sent: string[] = [];
      const boardRows = [
        "看板《Test》",
        buildBoardLine({ index: 42, date: "08/22", author: "alice", title: "目標文章" }),
      ];
      const articleRows = [
        "作者  alice 看板 Test",
        "標題  目標文章",
        "時間  Sat Aug 22 10:00:00 2026",
        "───────────────────────────────────────",
        "內容",
        ...Array.from({ length: 18 }, () => ""),
        "瀏覽 第 1/1 頁 (100%)",
      ];
      const infoRows = ["文章代碼(AID): #other (Test)"];
      let mode: "board" | "article" | "info" = "board";
      const bot = {
        state: { connect: true, login: true },
        _state: { connect: true, login: true, position: { boardname: "Test" } },
        on() { return this; },
        getLine(index: number) {
          const rows = mode === "board" ? boardRows : mode === "article" ? articleRows : infoRows;
          return { str: rows[index] ?? "" };
        },
        async getLines() { return articleRows; },
        async send(value: string) {
          sent.push(value);
          if (value === "#expected\r") mode = "article";
          else if (value === "Q") mode = "info";
          else if (value === "q") mode = mode === "info" ? "article" : "board";
          return true;
        },
      };
      const driver = mod.createTerminalDriverForTesting(bot);
      await expect(driver.executeArticleCommand(command)).resolves.toMatchObject({
        ok: false,
        outcome: "not-sent",
      });
      expect(sent).not.toContain("X");
      expect(sent).not.toContain("E");
      expect(sent).not.toContain("d");
      expect(sent).not.toContain("y");
    }
  });

  it("rejects a wrong index target before edit, delete, or board-reply keys", async () => {
    const mod = await import("./terminalDriver.js");
    const key = { board: "Test", index: 42 } as const;
    const commands = [
      { type: "edit-article", article: key, content: "new" },
      { type: "delete-article", article: key },
      { type: "reply-article-to-board", article: key, content: "response" },
    ] as const;
    for (const command of commands) {
      const sent: string[] = [];
      const boardRows = [
        "看板《Test》",
        buildBoardLine({ index: 42, date: "08/22", author: "alice", title: "目標文章" }),
      ];
      const wrongRows = [
        "作者  bob 看板 Test",
        "標題  其他文章",
        "時間  Sat Aug 22 10:00:00 2026",
        "───────────────────────────────────────",
        "錯誤內容",
      ];
      let screenRows = boardRows;
      const bot = {
        state: { connect: true, login: true },
        _state: { connect: true, login: true, position: { boardname: "Test" } },
        on() { return this; },
        getLine(index: number) { return { str: screenRows[index] ?? "" }; },
        async getLines() { return screenRows; },
        async send(value: string) {
          sent.push(value);
          if (value === "42\r\r") screenRows = wrongRows;
          else if (value === "q") screenRows = boardRows;
          return true;
        },
      };
      const driver = mod.createTerminalDriverForTesting(bot);
      await expect(driver.executeArticleCommand(command)).resolves.toMatchObject({
        ok: false,
        outcome: "not-sent",
      });
      expect(sent).not.toContain("E");
      expect(sent).not.toContain("d");
      expect(sent).not.toContain("y");
    }
  });

  it("re-locates the exact article after reads and board-list work before writing", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 42, date: "08/22", author: "alice", title: "目標文章" }),
    ];
    const articleRows = [
      "作者  alice 看板 Test",
      "標題  目標文章",
      "時間  Sat Aug 22 10:00:00 2026",
      "───────────────────────────────────────",
      "內容",
      ...Array.from({ length: 18 }, () => ""),
      "瀏覽 第 1/1 頁 (100%)",
    ];
    let screenRows = boardRows;
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      getLine(index: number) { return { str: screenRows[index] ?? "" }; },
      async getLines() { return screenRows; },
      async send(command: string) {
        sent.push(command);
        if (command === "42\r\r") screenRows = articleRows;
        else if (command === "q") screenRows = boardRows;
        else if (command === "X") screenRows = ["1.值得推薦 2.給它噓聲 3.只加註解"];
        else if (command === "3") screenRows = ["→ TEST_USER:"];
        else if (command === "安全送出\r") screenRows = ["→ TEST_USER: 安全送出    確定[y/N]:"];
        else if (command === "y\r") screenRows = articleRows;
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);

    await driver.getArticle("Test", 42);
    await driver.listArticles("Test");
    await expect(driver.executeArticleCommand({
      type: "reply-article",
      article: { board: "Test", index: 42 },
      content: "安全送出",
      pushType: "neutral",
    })).resolves.toEqual({ ok: true, outcome: "sent" });

    expect(sent.filter((command) => command === "42\r\r")).toHaveLength(2);
    expect(sent.indexOf("X")).toBeGreaterThan(sent.lastIndexOf("42\r\r"));
    expect(sent).toContain("安全送出\r");
    expect(sent.at(-1)).toBe("y\r");
  });

  it("does not submit push content when the connection invalidates the article session after type selection", async () => {
    const mod = await import("./terminalDriver.js");
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const sent: string[] = [];
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 42, date: "08/22", author: "alice", title: "目標文章" }),
    ];
    const articleRows = [
      "作者  alice 看板 Test",
      "標題  目標文章",
      "時間  Sat Aug 22 10:00:00 2026",
      "───────────────────────────────────────",
      "內容",
      ...Array.from({ length: 18 }, () => ""),
      "瀏覽 第 1/1 頁 (100%)",
    ];
    let screenRows = boardRows;
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on(event: string, listener: (...args: unknown[]) => void) {
        listeners.set(event, listener);
        return this;
      },
      getLine(index: number) { return { str: screenRows[index] ?? "" }; },
      async getLines() { return screenRows; },
      async send(command: string) {
        sent.push(command);
        if (command === "42\r\r") screenRows = articleRows;
        else if (command === "X") screenRows = ["您覺得這篇文章 1.值得推薦 2.給它噓聲 3.只加→註解 [1]?"];
        else if (command === "3") {
          screenRows = ["→ TEST_USER: "];
          listeners.get("disconnect")?.();
        } else if (command === "q") {
          screenRows = boardRows;
        }
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);

    await expect(driver.executeArticleCommand({
      type: "reply-article",
      article: { board: "Test", index: 42 },
      content: "PRIVATE_DRAFT",
      pushType: "neutral",
    })).resolves.toMatchObject({ ok: false, outcome: "not-sent", retryable: true });
    expect(sent).not.toContain("PRIVATE_DRAFT\r");
    expect(sent).not.toContain("\x03");
  });

  it("does not confirm a legacy reply when the connection invalidates after content submission", async () => {
    const mod = await import("./terminalDriver.js");
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const articleRows = [
      "作者  alice 看板 Test",
      "標題  目標文章",
      "時間  Sat Aug 22 10:00:00 2026",
      "───────────────────────────────────────",
      "文章內容",
      ...Array.from({ length: 18 }, () => ""),
      "瀏覽 第 1/1 頁 (100%)",
    ];
    let screenRows = articleRows;
    const sent: string[] = [];
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on(event: string, listener: (...args: unknown[]) => void) {
        listeners.set(event, listener);
        return this;
      },
      getLine(index: number) { return { str: screenRows[index] ?? "" }; },
      async send(command: string) {
        sent.push(command);
        if (command === "X") screenRows = [...articleRows.slice(0, -1), "您覺得這篇文章 1.值得推薦 2.給它噓聲 3.只加→註解 [1]?"];
        else if (command === "3") screenRows = [...articleRows.slice(0, -1), "→ TEST_USER: "];
        else if (command === "PRIVATE_DRAFT\r") {
          screenRows = [...articleRows.slice(0, -1), "→ TEST_USER: PRIVATE_DRAFT 確定[y/N]:"];
          listeners.get("disconnect")?.();
        }
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);

    await expect(driver.replyToArticle("PRIVATE_DRAFT", "neutral", "Test"))
      .resolves.toMatchObject({ ok: false, outcome: "uncertain" });
    expect(sent).not.toContain("y\r");
  });

  it("reports a legacy reply as uncertain when the connection invalidates while sending confirmation", async () => {
    const mod = await import("./terminalDriver.js");
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const articleRows = [
      "作者  alice 看板 Test",
      "標題  目標文章",
      "時間  Sat Aug 22 10:00:00 2026",
      "───────────────────────────────────────",
      "文章內容",
      ...Array.from({ length: 18 }, () => ""),
      "瀏覽 第 1/1 頁 (100%)",
    ];
    const boardRows = ["看板《Test》"];
    let screenRows = articleRows;
    const sent: string[] = [];
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on(event: string, listener: (...args: unknown[]) => void) {
        listeners.set(event, listener);
        return this;
      },
      getLine(index: number) { return { str: screenRows[index] ?? "" }; },
      async send(command: string) {
        sent.push(command);
        if (command === "X") screenRows = [...articleRows.slice(0, -1), "→ TEST_USER: "];
        else if (command === "PRIVATE_DRAFT\r") {
          screenRows = [...articleRows.slice(0, -1), "→ TEST_USER: PRIVATE_DRAFT 確定[y/N]:"];
        } else if (command === "y\r") {
          screenRows = articleRows;
          listeners.get("disconnect")?.();
        } else if (command === "q") {
          screenRows = boardRows;
        }
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);

    await expect(driver.replyToArticle("PRIVATE_DRAFT", "neutral", "Test"))
      .resolves.toMatchObject({ ok: false, outcome: "uncertain" });
    expect(sent).toContain("y\r");
    expect(sent).not.toContain("q");
  });

  it("does not send generic cleanup keys when a full article screen retains an unknown push overlay", async () => {
    const mod = await import("./terminalDriver.js");
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 42, date: "08/22", author: "alice", title: "目標文章" }),
    ];
    const articleRows = [
      "作者  alice 看板 Test",
      "標題  目標文章",
      "時間  Sat Aug 22 10:00:00 2026",
      "───────────────────────────────────────",
      "文章內容",
      ...Array.from({ length: 18 }, () => ""),
      "瀏覽 第 1/1 頁 (100%)",
    ];
    const overlayRows = [...articleRows.slice(0, -1), "系統忙碌，請稍後再試"];
    let screenRows = boardRows;
    const sent: string[] = [];
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      getLine(index: number) { return { str: screenRows[index] ?? "" }; },
      async getLines() { return screenRows; },
      async send(command: string) {
        sent.push(command);
        if (command === "42\r\r") screenRows = articleRows;
        else if (command === "X") screenRows = overlayRows;
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);

    await expect(driver.executeArticleCommand({
      type: "reply-article",
      article: { board: "Test", index: 42 },
      content: "PRIVATE_DRAFT",
      pushType: "neutral",
    })).resolves.toMatchObject({ ok: false, outcome: "not-sent" });
    expect(sent).toEqual(["42\r\r", "X"]);
  });

  it("writes to a title-search result by its captured AID instead of its relative index", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const filteredRows = [
      "系列《Test》",
      buildBoardLine({ index: 1, date: "08/31", author: "alice", title: "搜尋結果" }),
    ];
    const normalRows = [
      "看板《Test》",
      buildBoardLine({ index: 672, date: "08/31", author: "alice", title: "搜尋結果" }),
    ];
    const articleRows = [
      "作者  alice 看板 Test",
      "標題  搜尋結果",
      "時間  Mon Aug 31 23:41:01 2026",
      "───────────────────────────────────────",
      "內容",
      ...Array.from({ length: 18 }, () => ""),
      "瀏覽 第 1/1 頁 (100%)",
    ];
    const infoRows = ["文章代碼(AID): #canonicalAid (Test)"];
    let mode: "filtered" | "normal" | "article" | "info" | "push-menu" | "push-input" | "confirm" = "filtered";
    const rows = () => mode === "filtered" ? filteredRows
      : mode === "normal" ? normalRows
        : mode === "info" ? infoRows
          : mode === "push-menu" ? ["1.值得推薦 2.給它噓聲 3.只加註解"]
            : mode === "push-input" ? ["→ TEST_USER:"]
              : mode === "confirm" ? ["→ TEST_USER: 安全回覆    確定[y/N]:"]
                : articleRows;
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      getLine(index: number) { return { str: rows()[index] ?? "" }; },
      async getLines() { return rows(); },
      async enterIndex() { mode = "normal"; return true; },
      async enterBoardByName() { mode = "normal"; return true; },
      async send(value: string) {
        sent.push(value);
        if (value === "1\r\r" && mode === "filtered") mode = "article";
        else if (value === "#canonicalAid\r") mode = "article";
        else if (value === "Q" && mode === "article") mode = "info";
        else if (value === "q" && mode === "info") mode = "article";
        else if (value === "q" && mode === "article") mode = "filtered";
        else if (value === "X" && mode === "article") mode = "push-menu";
        else if (value === "3" && mode === "push-menu") mode = "push-input";
        else if (value === "安全回覆\r" && mode === "push-input") mode = "confirm";
        else if (value === "y\r" && mode === "confirm") mode = "article";
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);

    await driver.readArticleSource(
      { board: "Test", index: 1 },
      () => undefined,
    );
    sent.length = 0;
    await expect(driver.executeArticleCommand({
      type: "reply-article",
      article: { board: "Test", index: 1 },
      content: "安全回覆",
      pushType: "neutral",
    })).resolves.toEqual({ ok: true, outcome: "sent" });

    expect(sent[0]).toBe("X");
    expect(sent).not.toContain("#canonicalAid\r");
    expect(sent).toContain("安全回覆\r");
    expect(sent.slice(-2)).toEqual(["Q", "q"]);
    expect(sent).not.toContain("q安全回覆\r");
  });

  it("refuses to write a filtered relative index when canonical AID evidence is unavailable", async () => {
    const mod = await import("./terminalDriver.js");
    const filteredRows = [
      "系列《Test》",
      buildBoardLine({ index: 1, date: "08/31", author: "alice", title: "搜尋結果" }),
    ];
    const articleRows = [
      "作者  alice 看板 Test",
      "標題  搜尋結果",
      "時間  Mon Aug 31 23:41:01 2026",
      "───────────────────────────────────────",
      "內容",
      ...Array.from({ length: 18 }, () => ""),
      "瀏覽 第 1/1 頁 (100%)",
    ];
    const missingInfoRows = ["文章資訊暫時無法取得"];
    let mode: "filtered" | "article" | "info" | "push-menu" | "push-input" = "filtered";
    const rows = () => mode === "filtered" ? filteredRows
      : mode === "info" ? missingInfoRows
        : mode === "push-menu" ? ["您覺得這篇文章 1.值得推薦 2.給它噓聲 3.只加→註解 [1]?"]
          : mode === "push-input" ? ["→ TEST_USER:"]
            : articleRows;
    const sent: string[] = [];
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      getLine(index: number) { return { str: rows()[index] ?? "" }; },
      async getLines() { return rows(); },
      async send(value: string) {
        sent.push(value);
        if (value === "1\r\r" && mode === "filtered") mode = "article";
        else if (value === "Q" && mode === "article") mode = "info";
        else if (value === "q" && mode === "info") mode = "article";
        else if (value === "X" && mode === "article") mode = "push-menu";
        else if (value === "3" && mode === "push-menu") mode = "push-input";
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);

    await driver.readArticleSource({ board: "Test", index: 1 }, () => undefined);
    sent.length = 0;
    await expect(driver.executeArticleCommand({
      type: "reply-article",
      article: { board: "Test", index: 1 },
      content: "不可用相對樓號送出",
      pushType: "neutral",
    })).resolves.toMatchObject({ ok: false, outcome: "not-sent" });

    expect(sent).not.toContain("X");
    expect(sent).not.toContain("不可用相對樓號送出\r");
  });

  it("does not treat an unread filtered result index as an absolute board index", async () => {
    const mod = await import("./terminalDriver.js");
    const normalRows = [
      "看板《Test》",
      buildBoardLine({ index: 1, date: "08/31", author: "wrong", title: "一般列表第一篇" }),
    ];
    const filteredRows = [
      "系列《Test》",
      buildBoardLine({ index: 1, date: "08/31", author: "alice", title: "搜尋結果" }),
    ];
    const wrongArticleRows = [
      "作者  wrong 看板 Test",
      "標題  一般列表第一篇",
      "時間  Mon Aug 31 23:41:01 2026",
      "───────────────────────────────────────",
      "錯誤文章",
      "瀏覽 第 1/1 頁 (100%)",
    ];
    let mode: "normal" | "filtered" | "article" = "normal";
    const rows = () => mode === "filtered" ? filteredRows : mode === "article" ? wrongArticleRows : normalRows;
    const sent: string[] = [];
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      getLine(index: number) { return { str: rows()[index] ?? "" }; },
      async getLines() { return rows(); },
      async enterIndex() { mode = "normal"; return true; },
      async enterBoardByName() { mode = "normal"; return true; },
      async send(command: string) {
        sent.push(command);
        if (command === "/topic\r") mode = "filtered";
        else if (command === "1\r\r" && mode === "normal") mode = "article";
        else if (command === "q" && mode === "article") mode = "normal";
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);
    const internal = driver as unknown as {
      articleAidByRelativeIndex: Map<string, string>;
    };
    internal.articleAidByRelativeIndex.set("test:1", "staleAid");

    await expect(driver.searchArticles("Test", "topic")).resolves.toEqual([
      expect.objectContaining({ index: 1, author: "alice", title: "搜尋結果" }),
    ]);
    sent.length = 0;
    await expect(driver.executeArticleCommand({
      type: "reply-article",
      article: { board: "Test", index: 1 },
      content: "不可寫入一般列表第一篇",
      pushType: "neutral",
    })).resolves.toMatchObject({ ok: false, outcome: "not-sent" });
    expect(sent).not.toContain("1\r\r");
    expect(sent).not.toContain("X");
  });

  it("keeps prior filtered result indexes non-writable after filter pagination", async () => {
    const mod = await import("./terminalDriver.js");
    const normalRows = [
      "看板《Test》",
      buildBoardLine({ index: 1, date: "08/31", author: "wrong", title: "一般列表第一篇" }),
    ];
    const firstPageRows = [
      "系列《Test》",
      buildBoardLine({ index: 1, date: "08/31", author: "alice", title: "第一頁搜尋結果" }),
    ];
    const secondPageRows = [
      "系列《Test》",
      buildBoardLine({ index: 2, date: "08/30", author: "bob", title: "第二頁搜尋結果" }),
    ];
    const wrongArticleRows = [
      "作者  wrong 看板 Test",
      "標題  一般列表第一篇",
      "時間  Mon Aug 31 23:41:01 2026",
      "───────────────────────────────────────",
      "錯誤文章",
      "瀏覽 第 1/1 頁 (100%)",
    ];
    let mode: "normal" | "first" | "second" | "article" = "normal";
    const rows = () => mode === "first" ? firstPageRows
      : mode === "second" ? secondPageRows
        : mode === "article" ? wrongArticleRows
          : normalRows;
    const sent: string[] = [];
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      getLine(index: number) { return { str: rows()[index] ?? "" }; },
      async getLines() { return rows(); },
      async enterIndex() { mode = "normal"; return true; },
      async enterBoardByName() { mode = "normal"; return true; },
      async send(command: string) {
        sent.push(command);
        if (command === "/topic\r") mode = "first";
        else if (command.endsWith("11\r") && mode === "first") mode = "second";
        else if (command === "1\r\r" && mode === "normal") mode = "article";
        else if (command === "q" && mode === "article") mode = "normal";
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);

    await expect(driver.searchArticles("Test", "topic")).resolves.toEqual([
      expect.objectContaining({ index: 1 }),
    ]);
    await expect(driver.searchArticles("Test", "topic", 20)).resolves.toEqual([
      expect.objectContaining({ index: 2 }),
    ]);
    sent.length = 0;

    await expect(driver.executeArticleCommand({
      type: "reply-article",
      article: { board: "Test", index: 1 },
      content: "不可寫入舊搜尋結果",
      pushType: "neutral",
    })).resolves.toMatchObject({ ok: false, outcome: "not-sent" });
    expect(sent).not.toContain("1\r\r");
    expect(sent).not.toContain("X");
    expect(sent).not.toContain("不可寫入舊搜尋結果\r");
  });

  it("clears a stale filtered AID mapping when the same index is read from a normal board list", async () => {
    const mod = await import("./terminalDriver.js");
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 42, date: "08/31", author: "alice", title: "一般文章" }),
    ];
    const articleRows = [
      "作者  alice 看板 Test",
      "標題  一般文章",
      "時間  Mon Aug 31 23:41:01 2026",
      "───────────────────────────────────────",
      "內容",
      ...Array.from({ length: 18 }, () => ""),
      "瀏覽 第 1/1 頁 (100%)",
    ];
    let screenRows = boardRows;
    const sent: string[] = [];
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      getLine(index: number) { return { str: screenRows[index] ?? "" }; },
      async getLines() { return screenRows; },
      async send(command: string) {
        sent.push(command);
        if (command === "42\r\r") screenRows = articleRows;
        else if (command === "X") screenRows = ["→ TEST_USER:"];
        else if (command === "安全內容\r") screenRows = ["→ TEST_USER: 安全內容 確定[y/N]:"];
        else if (command === "y\r") screenRows = articleRows;
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);
    const internal = driver as unknown as {
      articleAidByRelativeIndex: Map<string, string>;
      unresolvedRelativeArticleIndexes: Set<string>;
    };
    internal.articleAidByRelativeIndex.set("test:42", "staleAid");
    internal.unresolvedRelativeArticleIndexes.add("test:42");

    await driver.readArticleSource({ board: "Test", index: 42 }, () => undefined);
    sent.length = 0;
    await expect(driver.executeArticleCommand({
      type: "reply-article",
      article: { board: "Test", index: 42 },
      content: "安全內容",
      pushType: "neutral",
    })).resolves.toEqual({ ok: true, outcome: "sent" });

    expect(sent[0]).toBe("X");
    expect(sent).not.toContain("#staleAid\r");
  });

  it("emits each reply vote and edit control command exactly once", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 42, date: "08/22", author: "alice", title: "目標文章" }),
    ];
    const articleRows = [
      "作者  alice 看板 Test",
      "標題  目標文章",
      "時間  Sat Aug 22 10:00:00 2026",
      "───────────────────────────────────────",
      "內容",
      ...Array.from({ length: 18 }, () => ""),
      "瀏覽 第 1/1 頁 (100%)",
    ];
    let screenRows = boardRows;
    const controls = new Set([
      "推12樓",
      "撤回我對12樓的推",
      "補充我在12樓發言：補充內容",
      "更正我在12樓發言：^1:3=新",
    ]);
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      getLine(index: number) { return { str: screenRows[index] ?? "" }; },
      async getLines() { return screenRows; },
      async send(value: string) {
        sent.push(value);
        if (value === "42\r\r") screenRows = articleRows;
        else if (value === "q") screenRows = boardRows;
        else if (value === "X") screenRows = ["1.值得推薦 2.給它噓聲 3.只加註解"];
        else if (value === "3") screenRows = ["→ TEST_USER:"];
        else if (controls.has(value.replace(/\r$/u, ""))) screenRows = [`→ TEST_USER: ${value.trim()}    確定[y/N]:`];
        else if (value === "y\r") screenRows = articleRows;
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);
    const article = { board: "Test", index: 42 } as const;

    await driver.executeArticleCommand({ type: "vote-floor", article, floor: 12, direction: "push" });
    await driver.executeArticleCommand({
      type: "withdraw-floor-vote", article, floor: 12, direction: "push",
    });
    await driver.executeArticleCommand({
      type: "edit-floor", article, floor: 12, mode: "append", content: " 補充內容 ",
    });
    await driver.executeArticleCommand({
      type: "edit-floor",
      article,
      floor: 12,
      mode: "section",
      changes: [{ start: 1, end: 3, replacement: "新" }],
    });

    for (const control of controls) {
      expect(sent.filter((value) => value === `${control}\r`), control).toHaveLength(1);
    }
    expect(sent).not.toContain("補充我在12樓發言：補充我在12樓發言：補充內容\r");
  });

  it("locates an older index through board pagination before writing", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const newestRows = [
      "看板《Test》",
      buildBoardLine({ index: 100, date: "08/22", author: "new", title: "新文章" }),
    ];
    const targetRows = [
      "看板《Test》",
      buildBoardLine({ index: 42, date: "08/01", author: "alice", title: "舊目標" }),
    ];
    const articleRows = [
      "作者  alice 看板 Test",
      "標題  舊目標",
      "時間  Sat Aug  1 10:00:00 2026",
      "───────────────────────────────────────",
      "內容",
      ...Array.from({ length: 18 }, () => ""),
      "瀏覽 第 1/1 頁 (100%)",
    ];
    let screenRows = newestRows;
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      getLine(index: number) { return { str: screenRows[index] ?? "" }; },
      async getLines() { return screenRows; },
      async send(value: string) {
        sent.push(value);
        if (value.endsWith("42\r") && value !== "42\r\r") screenRows = targetRows;
        else if (value === "42\r\r") screenRows = articleRows;
        else if (value === "q") screenRows = targetRows;
        else if (value === "X") screenRows = ["→ TEST_USER:"];
        else if (value === "安全送出\r") screenRows = ["→ TEST_USER: 安全送出    確定[y/N]:"];
        else if (value === "y\r") screenRows = articleRows;
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);
    await expect(driver.executeArticleCommand({
      type: "reply-article",
      article: { board: "Test", index: 42 },
      content: "安全送出",
      pushType: "neutral",
    })).resolves.toEqual({ ok: true, outcome: "sent" });
    expect(sent.some((value) => value.endsWith("42\r") && value !== "42\r\r")).toBe(true);
    expect(sent).toContain("X");
  });

  it("keeps a multi-range withdrawal inside one serialized terminal task", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 42, date: "08/22", author: "alice", title: "目標文章" }),
    ];
    const articleRows = [
      "作者  alice 看板 Test",
      "標題  目標文章",
      "時間  Sat Aug 22 10:00:00 2026",
      "───────────────────────────────────────",
      "內容",
      ...Array.from({ length: 18 }, () => ""),
      "瀏覽 第 1/1 頁 (100%)",
    ];
    let screenRows = boardRows;
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      getLine(index: number) { return { str: screenRows[index] ?? "" }; },
      async getLines() { return screenRows; },
      async send(value: string) {
        sent.push(value);
        if (value === "42\r\r") screenRows = articleRows;
        else if (value === "q") screenRows = boardRows;
        else if (value === "X") screenRows = ["→ TEST_USER:"];
        else if (value.startsWith("撤回我在")) screenRows = [`→ TEST_USER: ${value.trim()}    確定[y/N]:`];
        else if (value === "y\r") screenRows = articleRows;
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);
    const withdrawal = driver.executeArticleCommand({
      type: "withdraw-floor",
      article: { board: "Test", index: 42 },
      ranges: [{ start: 2, end: 2 }, { start: 4, end: 4 }],
    });
    const concurrent = driver.send("SECOND");
    await expect(withdrawal).resolves.toEqual({ ok: true, outcome: "sent" });
    await concurrent;

    expect(sent.indexOf("SECOND")).toBeGreaterThan(sent.indexOf("撤回我在4樓發言\r"));
    expect(sent.filter((value) => value === "X")).toHaveLength(2);
    expect(sent.filter((value) => value === "42\r\r")).toHaveLength(1);
    expect(sent).not.toContain("q");
    expect(sent).toContain("撤回我在2樓發言\r");
    expect(sent).toContain("撤回我在4樓發言\r");
    expect(sent).not.toContain("撤回我在2~4樓發言\r");
  });

  it("reports uncertain without retry when a later withdrawal content send is ambiguous", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 42, date: "08/22", author: "alice", title: "目標文章" }),
    ];
    const articleRows = [
      "作者  alice 看板 Test",
      "標題  目標文章",
      "時間  Sat Aug 22 10:00:00 2026",
      "───────────────────────────────────────",
      "內容",
      ...Array.from({ length: 18 }, () => ""),
      "瀏覽 第 1/1 頁 (100%)",
    ];
    let screenRows = boardRows;
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      getLine(index: number) { return { str: screenRows[index] ?? "" }; },
      async getLines() { return screenRows; },
      async send(value: string) {
        sent.push(value);
        if (value === "42\r\r") screenRows = articleRows;
        else if (value === "q") screenRows = boardRows;
        else if (value === "X") screenRows = ["→ TEST_USER:"];
        else if (value === "撤回我在2樓發言\r") screenRows = ["→ TEST_USER: 撤回我在2樓發言    確定[y/N]:"];
        else if (value === "撤回我在4樓發言\r") return false;
        else if (value === "y\r") screenRows = articleRows;
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);

    await expect(driver.executeArticleCommand({
      type: "withdraw-floor",
      article: { board: "Test", index: 42 },
      ranges: [{ start: 2, end: 2 }, { start: 4, end: 4 }],
    })).resolves.toMatchObject({ ok: false, outcome: "uncertain", retryable: false });
    expect(sent).toContain("撤回我在2樓發言\r");
    expect(sent).toContain("撤回我在4樓發言\r");
  });

  it("aborts a slow article read and releases the serialized queue", async () => {
    const mod = await import("./terminalDriver.js");
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 42, date: "08/22", author: "alice", title: "目標文章" }),
    ];
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      getLine(index: number) { return { str: boardRows[index] ?? "" }; },
      async getLines() { return boardRows; },
      async send() { return true; },
    };
    const driver = mod.createTerminalDriverForTesting(bot);
    const controller = new AbortController();
    const read = driver.readArticleSource(
      { board: "Test", index: 42 },
      () => undefined,
      controller.signal,
    );
    controller.abort();

    await expect(read).rejects.toMatchObject({ name: "AbortError" });
    await expect(driver.listArticles("Test")).resolves.toEqual([
      expect.objectContaining({ index: 42, title: "目標文章" }),
    ]);
  });

  it("keeps a successfully read article open and records its final verified screen", async () => {
    const mod = await import("./terminalDriver.js");
    const { ArticleSessionTracker } = await import("./articleSession.js");
    const record = vi.spyOn(ArticleSessionTracker.prototype, "record");
    const sent: string[] = [];
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 42, date: "08/22", author: "alice", title: "目標 文章" }),
    ];
    const articleRows = [
      "作者  alice 看板 Test",
      "標題  目標 文章",
      "時間  Sat Aug 22 10:00:00 2026",
      "───────────────────────────────────────",
      "文章內容",
      ...Array.from({ length: 18 }, () => ""),
      "瀏覽 第 1/1 頁 (100%)",
    ];
    const finalArticleRows = [
      "作者  ALICE 看板 test",
      "標題    目標   文章",
      ...articleRows.slice(2),
    ];
    let screenRows = boardRows;
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      getLine(index: number) { return { str: screenRows[index] ?? "" }; },
      async getLines() { return screenRows; },
      async send(command: string) {
        sent.push(command);
        if (command === "42\r\r") screenRows = articleRows;
        else if (command === "\x1b[1~") screenRows = finalArticleRows;
        else if (command === "q") screenRows = boardRows;
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);

    try {
      await driver.readArticleSource(
        { board: "Test", index: 42 },
        () => undefined,
      );

      expect(sent).not.toContain("q");
      expect(screenRows).toBe(finalArticleRows);
      expect(record).toHaveBeenCalledWith({
        key: { board: "Test", index: 42 },
        board: "Test",
        author: "alice",
        title: "目標 文章",
        snapshot: finalArticleRows.join("\n"),
      });
    } finally {
      record.mockRestore();
    }
  });

  it("reuses an exactly matching active article session without reopening before push entry", async () => {
    const mod = await import("./terminalDriver.js");
    const { ArticleSessionTracker } = await import("./articleSession.js");
    const match = vi.spyOn(ArticleSessionTracker.prototype, "match");
    const sent: string[] = [];
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 42, date: "08/22", author: "alice", title: "目標文章" }),
    ];
    const articleRows = [
      "作者  alice 看板 Test",
      "標題  目標文章",
      "時間  Sat Aug 22 10:00:00 2026",
      "───────────────────────────────────────",
      "文章內容",
      ...Array.from({ length: 18 }, () => ""),
      "瀏覽 第 1/1 頁 (100%)",
    ];
    let screenRows = boardRows;
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      getLine(index: number) { return { str: screenRows[index] ?? "" }; },
      async getLines() { return screenRows; },
      async send(command: string) {
        sent.push(command);
        if (command === "42\r\r") screenRows = articleRows;
        else if (command === "q") screenRows = boardRows;
        else if (command === "X") screenRows = ["1.值得推薦 2.給它噓聲 3.只加註解"];
        else if (command === "3") screenRows = ["→ TEST_USER:"];
        else if (command === "沿用文章\r") screenRows = ["→ TEST_USER: 沿用文章    確定[y/N]:"];
        else if (command === "y\r") screenRows = articleRows;
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);

    try {
      await driver.readArticleSource({ board: "Test", index: 42 }, () => undefined);
      sent.length = 0;
      match.mockClear();

      await expect(driver.executeArticleCommand({
        type: "reply-article",
        article: { board: "Test", index: 42 },
        content: "沿用文章",
        pushType: "neutral",
      })).resolves.toEqual({ ok: true, outcome: "sent" });

      expect(sent[0]).toBe("X");
      expect(sent).not.toContain("q");
      expect(sent).not.toContain("42\r\r");
      expect(match).toHaveBeenCalledWith({
        key: { board: "Test", index: 42 },
        board: "Test",
        author: "alice",
        title: "目標文章",
        snapshot: articleRows.join("\n"),
      });
    } finally {
      match.mockRestore();
    }
  });

  it("invalidates an exact-snapshot mismatch and uses the existing locate-and-reopen checks", async () => {
    const mod = await import("./terminalDriver.js");
    const { ArticleSessionTracker } = await import("./articleSession.js");
    const invalidate = vi.spyOn(ArticleSessionTracker.prototype, "invalidate");
    const sent: string[] = [];
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 42, date: "08/22", author: "alice", title: "目標文章" }),
    ];
    const articleRows = [
      "作者  alice 看板 Test",
      "標題  目標文章",
      "時間  Sat Aug 22 10:00:00 2026",
      "───────────────────────────────────────",
      "文章內容",
      ...Array.from({ length: 18 }, () => ""),
      "瀏覽 第 1/1 頁 (100%)",
    ];
    const changedRows = articleRows.map((line, index) => index === 4 ? "畫面已更新" : line);
    let screenRows = boardRows;
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      getLine(index: number) { return { str: screenRows[index] ?? "" }; },
      async getLines() { return screenRows; },
      async send(command: string) {
        sent.push(command);
        if (command === "42\r\r") screenRows = articleRows;
        else if (command === "q") screenRows = boardRows;
        else if (command === "X") screenRows = ["1.值得推薦 2.給它噓聲 3.只加註解"];
        else if (command === "3") screenRows = ["→ TEST_USER:"];
        else if (command === "重新確認\r") screenRows = ["→ TEST_USER: 重新確認    確定[y/N]:"];
        else if (command === "y\r") screenRows = articleRows;
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);

    try {
      await driver.readArticleSource({ board: "Test", index: 42 }, () => undefined);
      screenRows = changedRows;
      sent.length = 0;
      invalidate.mockClear();

      await expect(driver.executeArticleCommand({
        type: "reply-article",
        article: { board: "Test", index: 42 },
        content: "重新確認",
        pushType: "neutral",
      })).resolves.toEqual({ ok: true, outcome: "sent" });

      expect(invalidate).toHaveBeenCalledWith("mismatch");
      expect(sent.indexOf("q")).toBeGreaterThanOrEqual(0);
      expect(sent.indexOf("42\r\r")).toBeGreaterThan(sent.indexOf("q"));
      expect(sent.indexOf("X")).toBeGreaterThan(sent.indexOf("42\r\r"));
    } finally {
      invalidate.mockRestore();
    }
  });

  it("stops a multi-range withdrawal when post-send AID verification fails", async () => {
    const mod = await import("./terminalDriver.js");
    const { ArticleSessionTracker } = await import("./articleSession.js");
    const invalidate = vi.spyOn(ArticleSessionTracker.prototype, "invalidate");
    const sent: string[] = [];
    const boardRows = ["看板《Test》"];
    const articleRows = [
      "作者  alice 看板 Test",
      "標題  AID 文章",
      "時間  Sat Aug 22 10:00:00 2026",
      "───────────────────────────────────────",
      "文章內容",
      ...Array.from({ length: 18 }, () => ""),
      "瀏覽 第 1/1 頁 (100%)",
    ];
    const expectedInfoRows = ["文章代碼(AID): #expectedAid (Test)"];
    const wrongInfoRows = ["文章代碼(AID): #otherAid (Test)"];
    let postSent = false;
    let submittedContent = "";
    let mode: "board" | "article" | "info" | "push-menu" | "push-input" | "confirm" = "board";
    const rows = () => mode === "board" ? boardRows
      : mode === "info" ? (postSent ? wrongInfoRows : expectedInfoRows)
        : mode === "push-menu" ? ["1.值得推薦 2.給它噓聲 3.只加註解"]
          : mode === "push-input" ? ["→ TEST_USER:"]
          : mode === "confirm" ? [`→ TEST_USER: ${submittedContent}    確定[y/N]:`]
              : articleRows;
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      getLine(index: number) { return { str: rows()[index] ?? "" }; },
      async getLines() { return rows(); },
      async send(command: string) {
        sent.push(command);
        if (command === "#expectedAid\r") mode = "article";
        else if (command === "Q" && mode === "article") mode = "info";
        else if (command === "q" && mode === "info") mode = "article";
        else if (command === "q" && mode === "article") mode = "board";
        else if (command === "X" && mode === "article") mode = "push-menu";
        else if (command === "3" && mode === "push-menu") mode = "push-input";
        else if (command.startsWith("撤回我在") && mode === "push-input") {
          submittedContent = command.trim();
          mode = "confirm";
        }
        else if (command === "y\r" && mode === "confirm") {
          postSent = true;
          mode = "article";
        }
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);

    try {
      await driver.readArticleSource(
        { board: "Test", aid: "expectedAid" },
        () => undefined,
      );
      sent.length = 0;
      invalidate.mockClear();

      await expect(driver.executeArticleCommand({
        type: "withdraw-floor",
        article: { board: "Test", aid: "expectedAid" },
        ranges: [{ start: 2, end: 2 }, { start: 4, end: 4 }],
      })).resolves.toMatchObject({ ok: false, outcome: "uncertain" });

      expect(sent[0]).toBe("X");
      expect(sent.slice(-3)).toEqual(["y\r", "Q", "q"]);
      expect(mode).toBe("article");
      expect(invalidate).toHaveBeenCalledWith("push-postcondition-failed");
      expect(sent).toContain("撤回我在2樓發言\r");
      expect(sent).not.toContain("撤回我在4樓發言\r");
    } finally {
      invalidate.mockRestore();
    }
  });

  it("does not resurrect an AID session when an error occurs during post-send verification", async () => {
    const mod = await import("./terminalDriver.js");
    const { ArticleSessionTracker } = await import("./articleSession.js");
    const record = vi.spyOn(ArticleSessionTracker.prototype, "record");
    const invalidate = vi.spyOn(ArticleSessionTracker.prototype, "invalidate");
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const sent: string[] = [];
    const boardRows = ["看板《Test》"];
    const articleRows = [
      "作者  alice 看板 Test",
      "標題  AID 文章",
      "時間  Sat Aug 22 10:00:00 2026",
      "───────────────────────────────────────",
      "文章內容",
      ...Array.from({ length: 18 }, () => ""),
      "瀏覽 第 1/1 頁 (100%)",
    ];
    const infoRows = ["文章代碼(AID): #expectedAid (Test)"];
    let postSent = false;
    let mode: "board" | "article" | "info" | "push-menu" | "push-input" | "confirm" = "board";
    const rows = () => mode === "board" ? boardRows
      : mode === "info" ? infoRows
        : mode === "push-menu" ? ["1.值得推薦 2.給它噓聲 3.只加註解"]
          : mode === "push-input" ? ["→ TEST_USER:"]
            : mode === "confirm" ? ["→ TEST_USER: 驗證期間錯誤    確定[y/N]:"]
              : articleRows;
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on(event: string, listener: (...args: unknown[]) => void) {
        listeners.set(event, listener);
        return this;
      },
      getLine(index: number) { return { str: rows()[index] ?? "" }; },
      async getLines() { return rows(); },
      async send(command: string) {
        sent.push(command);
        if (command === "#expectedAid\r") mode = "article";
        else if (command === "Q" && mode === "article") {
          mode = "info";
          if (postSent) listeners.get("error")?.();
        } else if (command === "q" && mode === "info") mode = "article";
        else if (command === "q" && mode === "article") mode = "board";
        else if (command === "X" && mode === "article") mode = "push-menu";
        else if (command === "3" && mode === "push-menu") mode = "push-input";
        else if (command === "驗證期間錯誤\r" && mode === "push-input") mode = "confirm";
        else if (command === "y\r" && mode === "confirm") {
          postSent = true;
          mode = "article";
        }
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);

    try {
      await driver.readArticleSource(
        { board: "Test", aid: "expectedAid" },
        () => undefined,
      );
      sent.length = 0;
      record.mockClear();
      invalidate.mockClear();

      await expect(driver.executeArticleCommand({
        type: "reply-article",
        article: { board: "Test", aid: "expectedAid" },
        content: "驗證期間錯誤",
        pushType: "neutral",
      })).resolves.toMatchObject({ ok: false, outcome: "uncertain" });

      expect(record).not.toHaveBeenCalled();
      expect(invalidate).toHaveBeenCalledWith("connection-error");
      expect(mode).toBe("article");
      expect(sent.slice(-2)).toEqual(["Q", "q"]);
    } finally {
      record.mockRestore();
      invalidate.mockRestore();
    }
  });

  it.each(["disconnect", "error"] as const)(
    "does not record an article if a %s event occurs during the read",
    async (eventName) => {
      const mod = await import("./terminalDriver.js");
      const { ArticleSessionTracker } = await import("./articleSession.js");
      const record = vi.spyOn(ArticleSessionTracker.prototype, "record");
      const invalidate = vi.spyOn(ArticleSessionTracker.prototype, "invalidate");
      const listeners = new Map<string, (...args: unknown[]) => void>();
      const sent: string[] = [];
      const boardRows = [
        "看板《Test》",
        buildBoardLine({ index: 42, date: "08/22", author: "alice", title: "目標文章" }),
      ];
      const articleRows = [
        "作者  alice 看板 Test",
        "標題  目標文章",
        "時間  Sat Aug 22 10:00:00 2026",
        "───────────────────────────────────────",
        "文章內容",
        ...Array.from({ length: 18 }, () => ""),
        "瀏覽 第 1/1 頁 (100%)",
      ];
      let screenRows = boardRows;
      const bot = {
        state: { connect: true, login: true },
        _state: { connect: true, login: true, position: { boardname: "Test" } },
        on(event: string, listener: (...args: unknown[]) => void) {
          listeners.set(event, listener);
          return this;
        },
        getLine(index: number) { return { str: screenRows[index] ?? "" }; },
        async getLines() { return screenRows; },
        async send(command: string) {
          sent.push(command);
          if (command === "42\r\r") screenRows = articleRows;
          else if (command === "\x1b[1~") listeners.get(eventName)?.();
          else if (command === "q") screenRows = boardRows;
          return true;
        },
      };
      const driver = mod.createTerminalDriverForTesting(bot);

      try {
        await driver.readArticleSource(
          { board: "Test", index: 42 },
          () => undefined,
        );
        expect(record).not.toHaveBeenCalled();
        expect(invalidate).toHaveBeenCalledWith(
          eventName === "disconnect" ? "disconnected" : "connection-error",
        );
        expect(sent.at(-1)).toBe("q");
      } finally {
        record.mockRestore();
        invalidate.mockRestore();
      }
    },
  );

  it("keeps a directly opened AID article active after Q/q verification", async () => {
    const mod = await import("./terminalDriver.js");
    const { ArticleSessionTracker } = await import("./articleSession.js");
    const record = vi.spyOn(ArticleSessionTracker.prototype, "record");
    const sent: string[] = [];
    const boardRows = ["看板《Test》"];
    const articleRows = [
      "作者  alice 看板 Test",
      "標題  AID 文章",
      "時間  Sat Aug 22 10:00:00 2026",
      "───────────────────────────────────────",
      "文章內容",
      ...Array.from({ length: 18 }, () => ""),
      "瀏覽 第 1/1 頁 (100%)",
    ];
    const infoRows = ["文章代碼(AID): #1AbCdEfG (Test)"];
    let mode: "board" | "article" | "info" = "board";
    const rows = () => mode === "board" ? boardRows : mode === "info" ? infoRows : articleRows;
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      getLine(index: number) { return { str: rows()[index] ?? "" }; },
      async getLines() { return rows(); },
      async send(command: string) {
        sent.push(command);
        if (command === "#1AbCdEfG\r") mode = "article";
        else if (command === "Q") mode = "info";
        else if (command === "q" && mode === "info") mode = "article";
        else if (command === "q") mode = "board";
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);

    try {
      await driver.readArticleSource(
        { board: "Test", aid: "1AbCdEfG" },
        () => undefined,
      );
      expect(sent.slice(-2)).toEqual(["Q", "q"]);
      expect(mode).toBe("article");
      expect(record).toHaveBeenCalledWith(expect.objectContaining({
        key: { board: "Test", aid: "1AbCdEfG" },
        board: "Test",
        author: "alice",
        title: "AID 文章",
      }));
    } finally {
      record.mockRestore();
    }
  });

  it("exits and invalidates an article session when a read is aborted", async () => {
    const mod = await import("./terminalDriver.js");
    const { ArticleSessionTracker } = await import("./articleSession.js");
    const invalidate = vi.spyOn(ArticleSessionTracker.prototype, "invalidate");
    const controller = new AbortController();
    const sent: string[] = [];
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 42, date: "08/22", author: "alice", title: "目標文章" }),
    ];
    const articleRows = [
      "作者  alice 看板 Test",
      "標題  目標文章",
      "時間  Sat Aug 22 10:00:00 2026",
      "───────────────────────────────────────",
      "文章內容",
      ...Array.from({ length: 18 }, () => ""),
      "瀏覽 第 1/1 頁 (100%)",
    ];
    let screenRows = boardRows;
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      getLine(index: number) { return { str: screenRows[index] ?? "" }; },
      async getLines() { return screenRows; },
      async send(command: string) {
        sent.push(command);
        if (command === "42\r\r") {
          screenRows = articleRows;
          controller.abort();
        } else if (command === "q") {
          screenRows = boardRows;
        }
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);

    try {
      await expect(driver.readArticleSource(
        { board: "Test", index: 42 },
        () => undefined,
        controller.signal,
      )).rejects.toMatchObject({ name: "AbortError" });
      expect(sent.at(-1)).toBe("q");
      expect(invalidate).toHaveBeenCalledWith("read-failed");
    } finally {
      invalidate.mockRestore();
    }
  });

  it("exits and invalidates when a final article emission fails", async () => {
    const mod = await import("./terminalDriver.js");
    const { ArticleSessionTracker } = await import("./articleSession.js");
    const invalidate = vi.spyOn(ArticleSessionTracker.prototype, "invalidate");
    const sent: string[] = [];
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 42, date: "08/22", author: "alice", title: "目標文章" }),
    ];
    const articleRows = [
      "作者  alice 看板 Test",
      "標題  目標文章",
      "時間  Sat Aug 22 10:00:00 2026",
      "───────────────────────────────────────",
      "文章內容",
      ...Array.from({ length: 18 }, () => ""),
      "瀏覽 第 1/1 頁 (100%)",
    ];
    let screenRows = boardRows;
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      getLine(index: number) { return { str: screenRows[index] ?? "" }; },
      async getLines() { return screenRows; },
      async send(command: string) {
        sent.push(command);
        if (command === "42\r\r") screenRows = articleRows;
        else if (command === "q") screenRows = boardRows;
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);

    try {
      await expect(driver.readArticleSource(
        { board: "Test", index: 42 },
        ({ completeness }) => {
          if (completeness === "final") throw new Error("consumer failed");
        },
      )).rejects.toThrow("consumer failed");
      expect(sent.at(-1)).toBe("q");
      expect(invalidate).toHaveBeenCalledWith("read-failed");
    } finally {
      invalidate.mockRestore();
    }
  });

  it("does not record a read when the final visible article has a different identity", async () => {
    const mod = await import("./terminalDriver.js");
    const { ArticleSessionTracker } = await import("./articleSession.js");
    const record = vi.spyOn(ArticleSessionTracker.prototype, "record");
    const invalidate = vi.spyOn(ArticleSessionTracker.prototype, "invalidate");
    const sent: string[] = [];
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 42, date: "08/22", author: "alice", title: "目標文章" }),
    ];
    const articleRows = [
      "作者  alice 看板 Test",
      "標題  目標文章",
      "時間  Sat Aug 22 10:00:00 2026",
      "───────────────────────────────────────",
      "文章內容",
      ...Array.from({ length: 18 }, () => ""),
      "瀏覽 第 1/1 頁 (100%)",
    ];
    const wrongArticleRows = [
      "作者  bob 看板 Test",
      "標題  其他文章",
      "時間  Sat Aug 22 11:00:00 2026",
      "───────────────────────────────────────",
      "其他內容",
      ...Array.from({ length: 18 }, () => ""),
      "瀏覽 第 1/1 頁 (100%)",
    ];
    let screenRows = boardRows;
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      getLine(index: number) { return { str: screenRows[index] ?? "" }; },
      async getLines() { return screenRows; },
      async send(command: string) {
        sent.push(command);
        if (command === "42\r\r") screenRows = articleRows;
        else if (command === "\x1b[1~") screenRows = wrongArticleRows;
        else if (command === "q") screenRows = boardRows;
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);

    try {
      await driver.readArticleSource(
        { board: "Test", index: 42 },
        () => undefined,
      );
      expect(record).not.toHaveBeenCalled();
      expect(invalidate).toHaveBeenCalledWith("read-unverified");
      expect(sent.at(-1)).toBe("q");
    } finally {
      record.mockRestore();
      invalidate.mockRestore();
    }
  });

  it.each([
    ["raw send", "raw-send"],
    ["login", "login"],
    ["disconnect", "disconnected"],
    ["board navigation", "navigation"],
  ] as const)("invalidates an established article session before %s", async (label, reason) => {
    const mod = await import("./terminalDriver.js");
    const { ArticleSessionTracker } = await import("./articleSession.js");
    const record = vi.spyOn(ArticleSessionTracker.prototype, "record");
    const invalidate = vi.spyOn(ArticleSessionTracker.prototype, "invalidate");
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 42, date: "08/22", author: "alice", title: "目標文章" }),
    ];
    const articleRows = [
      "作者  alice 看板 Test",
      "標題  目標文章",
      "時間  Sat Aug 22 10:00:00 2026",
      "───────────────────────────────────────",
      "文章內容",
      ...Array.from({ length: 18 }, () => ""),
      "瀏覽 第 1/1 頁 (100%)",
    ];
    let screenRows = boardRows;
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      socket: { disconnect() {} },
      on() { return this; },
      getLine(index: number) { return { str: screenRows[index] ?? "" }; },
      async getLines() { return screenRows; },
      async enterBoardByName() {
        screenRows = boardRows;
        return true;
      },
      async send(command: string) {
        if (command === "42\r\r") screenRows = articleRows;
        else if (command === "q") screenRows = boardRows;
        else if (command === "alice\r") screenRows = ["請輸入您的密碼:"];
        else if (command === "secret\r") screenRows = ["【主功能表】"];
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);

    try {
      await driver.readArticleSource(
        { board: "Test", index: 42 },
        () => undefined,
      );
      expect(record).toHaveBeenCalled();
      invalidate.mockClear();

      if (label === "raw send") await driver.send("x");
      else if (label === "login") {
        screenRows = ["請輸入代號，或以 guest 參觀，或以 new 註冊:"];
        await driver.login("alice", "secret");
      } else if (label === "disconnect") await driver.disconnect();
      else await driver.listArticles("Test");

      expect(invalidate).toHaveBeenCalledWith(reason);
    } finally {
      record.mockRestore();
      invalidate.mockRestore();
    }
  });

  it.each([
    { type: "edit-article", article: { board: "Test", index: 42 }, content: "new" },
    { type: "delete-article", article: { board: "Test", index: 42 } },
    { type: "reply-article-to-board", article: { board: "Test", index: 42 }, content: "reply" },
  ] as const)("invalidates an established session before $type navigation", async (command) => {
    const mod = await import("./terminalDriver.js");
    const { ArticleSessionTracker } = await import("./articleSession.js");
    const record = vi.spyOn(ArticleSessionTracker.prototype, "record");
    const invalidate = vi.spyOn(ArticleSessionTracker.prototype, "invalidate");
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 42, date: "08/22", author: "alice", title: "目標文章" }),
    ];
    const articleRows = [
      "作者  alice 看板 Test",
      "標題  目標文章",
      "時間  Sat Aug 22 10:00:00 2026",
      "───────────────────────────────────────",
      "文章內容",
      ...Array.from({ length: 18 }, () => ""),
      "瀏覽 第 1/1 頁 (100%)",
    ];
    let screenRows = boardRows;
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      getLine(index: number) { return { str: screenRows[index] ?? "" }; },
      async getLines() { return screenRows; },
      async send(command: string) {
        if (command === "42\r\r") screenRows = articleRows;
        else if (command === "q") screenRows = boardRows;
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);

    try {
      await driver.readArticleSource(
        { board: "Test", index: 42 },
        () => undefined,
      );
      expect(record).toHaveBeenCalled();
      invalidate.mockClear();
      bot.state.login = false;

      await expect(driver.executeArticleCommand(command)).rejects.toThrow(
        "PTT login is required",
      );
      expect(invalidate).toHaveBeenCalledWith("navigation");
    } finally {
      record.mockRestore();
      invalidate.mockRestore();
    }
  });

  it("restores the terminal index after a prefix board query", async () => {
    const mod = await import("./terminalDriver.js");
    const calls: string[] = [];
    const bot = {
      select() {
        return {
          where(type: string, value: unknown) { calls.push(`${type}:${String(value)}`); },
          async get() {
            calls.push("get");
            return [{ name: "C_Chat", title: "聊天" }];
          },
        };
      },
      async enterIndex() { calls.push("index"); return true; },
    };
    await expect(mod.queryBoardsFromBot(bot, { prefix: "C_" })).resolves.toEqual([
      { name: "C_Chat", title: "聊天" },
    ]);
    expect(calls).toEqual(["prefix:C_", "get", "index"]);
  });

  it("queries a category subdirectory by private route and restores the index", async () => {
    const mod = await import("./terminalDriver.js");
    const calls: string[] = [];
    const bot = {
      select() {
        return {
          where(type: string, value: unknown) { calls.push(`${type}:${JSON.stringify(value)}`); },
          async get() {
            calls.push("get");
            return [
              { id: 3, title: "子分類", folder: true },
              { name: "C_Chat", title: "聊天", folder: false },
            ];
          },
        };
      },
      async enterIndex() { calls.push("index"); return true; },
    };
    await expect(mod.queryBoardDirectoryFromBot(bot, [1, 2])).resolves.toEqual([
      { kind: "category", title: "子分類", route: [1, 2, 3] },
      { kind: "board", board: { name: "C_Chat", title: "聊天" } },
    ]);
    expect(calls).toEqual([
      "entry:\"class\"", "offsets:[1,2]", "get", "index",
    ]);
  });

  it("waits for a delayed push-type menu before sending a boo", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const reader = "瀏覽 第 1/1 頁 (100%)";
    let screen = reader;
    let snapshotsAfterCommand = 0;
    let waitingForMenu = false;
    const bot = {
      async send(command: string) {
        sent.push(command);
        if (command === "X") waitingForMenu = true;
        if (command === "2") {
          waitingForMenu = false;
          screen = "請輸入推文內容:";
        }
        if (command === "噓\r") screen = "確定送出推文嗎";
        if (command === "y\r") screen = reader;
        return true;
      },
      getLine(index: number) {
        if (waitingForMenu && screen === reader && index === 0) {
          snapshotsAfterCommand += 1;
          if (snapshotsAfterCommand >= 2) {
            screen = "1.值得推薦 2.給它噓聲 3.只加註解";
          }
        }
        return { str: index === 0 ? screen : "" };
      },
    };

    await expect(
      mod.submitPushFromCurrentArticle(bot, "噓", "boo", undefined, {
        typePromptMs: 30,
        confirmMs: 30,
        pollMs: 1,
        afterTypeMs: 0,
        afterConfirmMs: 0,
        afterContinueMs: 0,
      }),
    ).resolves.toEqual({ ok: true, outcome: "sent" });
    expect(sent.slice(0, 4)).toEqual(["X", "2", "噓\r", "y\r"]);
  });

  it("does not send push or boo content when the type menu cannot be confirmed", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const bot = {
      async send(command: string) {
        sent.push(command);
        return true;
      },
      getLine(index: number) {
        return { str: index === 0 ? "瀏覽文章" : "" };
      },
    };

    await expect(
      mod.submitPushFromCurrentArticle(bot, "噓", "boo", undefined, {
        typePromptMs: 5,
        confirmMs: 5,
        pollMs: 1,
        afterTypeMs: 0,
        afterConfirmMs: 0,
        afterContinueMs: 0,
      }),
    ).resolves.toEqual({
      ok: false,
      outcome: "not-sent",
      code: "push-entry-timeout",
      reason: "PTT 未顯示推文方式，請重新載入文章後再試",
      retryable: true,
    });
    expect(sent).toEqual(["X"]);
  });

  it("sends a neutral reply from the author's direct input prompt", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const reader = "瀏覽 第 1/1 頁 (100%)";
    let screen = reader;
    const bot = {
      async send(command: string) {
        sent.push(command);
        if (command === "X") screen = "作者本人，使用 → 加註方式\n→ MBB200291:";
        if (command === "噓1樓\r") screen = "→ MBB200291: 噓1樓    確定[y/N]:";
        if (command === "y\r") screen = reader;
        return true;
      },
      getLine(index: number) {
        return { str: index === 0 ? screen : "" };
      },
    };

    await expect(
      mod.submitPushFromCurrentArticle(bot, "噓1樓", "neutral", undefined, {
        typePromptMs: 10,
        confirmMs: 10,
        pollMs: 1,
        afterTypeMs: 0,
        afterConfirmMs: 0,
        afterContinueMs: 0,
      }),
    ).resolves.toEqual({ ok: true, outcome: "sent" });
    expect(sent).toEqual(["X", "噓1樓\r", "y\r"]);
  });

  it("does not bypass the author's neutral-only prompt for a raw boo", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    let screen = "瀏覽文章";
    const bot = {
      async send(command: string) {
        sent.push(command);
        if (command === "X") screen = "作者本人，使用 → 加註方式\n→ MBB200291:";
        return true;
      },
      getLine(index: number) {
        return { str: index === 0 ? screen : "" };
      },
    };

    await expect(
      mod.submitPushFromCurrentArticle(bot, "噓", "boo", undefined, {
        typePromptMs: 10,
        confirmMs: 10,
        pollMs: 1,
        afterTypeMs: 0,
        afterConfirmMs: 0,
        afterContinueMs: 0,
      }),
    ).resolves.toEqual({
      ok: false,
      outcome: "not-sent",
      code: "push-type-not-allowed",
      reason: "PTT 限制此文章只能使用 → 加註方式",
    });
    expect(sent).toEqual(["X", "\x03"]);
  });

  it("reports when the push content prompt cannot be confirmed", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    let screen = "瀏覽文章";
    const bot = {
      async send(command: string) {
        sent.push(command);
        if (command === "X") screen = "1.值得推薦 2.給它噓聲 3.只加註解";
        return true;
      },
      getLine(index: number) {
        return {
          str: index === 0 ? screen : "",
        };
      },
    };

    await expect(
      mod.submitPushFromCurrentArticle(bot, "內容", "neutral", undefined, {
        typePromptMs: 5,
        confirmMs: 5,
        pollMs: 1,
        afterTypeMs: 0,
        afterConfirmMs: 0,
        afterContinueMs: 0,
      }),
    ).resolves.toEqual({
      ok: false,
      outcome: "not-sent",
      code: "push-content-prompt-timeout",
      reason: "PTT 未顯示推文輸入框，請重新載入文章後再試",
      retryable: true,
    });
    expect(sent).toEqual(["X", "3"]);
  });

  it("returns to the requested board after the legacy replyToArticle workflow", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const articleRows = [
      "作者  alice 看板 Test",
      "標題  目標文章",
      "時間  Sat Aug 22 10:00:00 2026",
      "───────────────────────────────────────",
      "文章內容",
      "瀏覽 第 1/1 頁 (100%)",
    ];
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 42, date: "08/22", author: "alice", title: "目標文章" }),
    ];
    let screenRows = articleRows;
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      getLine(index: number) { return { str: screenRows[index] ?? "" }; },
      async send(command: string) {
        sent.push(command);
        if (command === "X") screenRows = [...articleRows, "您覺得這篇文章 1.值得推薦 2.給它噓聲 3.只加→註解 [1]?"];
        else if (command === "3") screenRows = [...articleRows, "→ TEST_USER: "];
        else if (command === "內容\r") screenRows = [...articleRows, "→ TEST_USER: 內容 確定[y/N]:"];
        else if (command === "y\r") screenRows = articleRows;
        else if (command === "q") screenRows = boardRows;
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);

    await expect(driver.replyToArticle("內容", "neutral", "Test")).resolves.toEqual({
      ok: true,
      outcome: "sent",
    });
    expect(sent).toEqual(["X", "3", "內容\r", "y\r", "q"]);
  });

  it("reports an uncertain result when push confirmation is missing", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    let screen = "瀏覽文章";
    const bot = {
      async send(command: string) {
        sent.push(command);
        if (command === "X") screen = "1.值得推薦 2.給它噓聲 3.只加註解";
        if (command === "3") screen = "→ TEST_USER:";
        if (command === "內容\r") screen = "瀏覽文章";
        return true;
      },
      getLine(index: number) {
        return { str: index === 0 ? screen : "" };
      },
    };

    await expect(
      mod.submitPushFromCurrentArticle(bot, "內容", "neutral", undefined, {
        typePromptMs: 10,
        confirmMs: 5,
        pollMs: 1,
        afterTypeMs: 0,
        afterConfirmMs: 0,
        afterContinueMs: 0,
      }),
    ).resolves.toEqual({
      ok: false,
      outcome: "uncertain",
      code: "push-confirm-timeout",
      reason: "無法確認回文是否送出，請重新整理文章檢查",
    });
    expect(sent).toEqual(["X", "3", "內容\r"]);
  });

  it.each([
    ["push", "1"],
    ["neutral", "3"],
  ] as const)("selects the PTT %s type key from the menu", async (type, key) => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const reader = "瀏覽 第 1/1 頁 (100%)";
    let screen = reader;
    const bot = {
      async send(command: string) {
        sent.push(command);
        if (command === "X") screen = "1.值得推薦 2.給它噓聲 3.只加註解";
        if (command === key) screen = type === "neutral" ? "→ TEST_USER:" : "請輸入推文內容:";
        if (command === "內容\r") screen = "→ TEST_USER: 內容    確定[y/N]:";
        if (command === "y\r") screen = reader;
        return true;
      },
      getLine(index: number) {
        return { str: index === 0 ? screen : "" };
      },
    };

    await expect(
      mod.submitPushFromCurrentArticle(bot, "內容", type, undefined, {
        typePromptMs: 20,
        confirmMs: 20,
        pollMs: 1,
        afterTypeMs: 0,
        afterConfirmMs: 0,
        afterContinueMs: 0,
      }),
    ).resolves.toEqual({ ok: true, outcome: "sent" });
    expect(sent.slice(0, 4)).toEqual(["X", key, "內容\r", "y\r"]);
  });

  it("exports a factory for the ptt-client-backed adapter", async () => {
    const mod = await import("./terminalDriver.js");
    const adapter = mod.createTerminalDriver();

    expect(typeof mod.createTerminalDriver).toBe("function");
    expect(typeof adapter.login).toBe("function");
    expect(typeof adapter.listArticles).toBe("function");
    expect(typeof adapter.getArticle).toBe("function");
    expect(typeof adapter.disconnect).toBe("function");
  });

  it("reports whether the external ptt-client module is available", async () => {
    const mod = await import("./terminalDriver.js");
    expect(mod.pttClientModuleLoaded).toBe(true);
  });

  it("waits for the password prompt before sending the password during login", async () => {
    const mod = await import("./terminalDriver.js");
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
    const mod = await import("./terminalDriver.js");
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
    const mod = await import("./terminalDriver.js");
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
    const mod = await import("./terminalDriver.js");
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

  it("reports a duplicate login without answering PTT's prompt", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    let screen = "請輸入代號，或以 guest 參觀";

    const result = await mod.loginThroughTerminal(
      {
        send: async (message: string) => {
          sent.push(message);
          if (message === "user\r") {
            screen = "請輸入您的密碼:";
          } else if (message === "password\r") {
            screen = "您想刪除其他重複登入的連線嗎？[Y/n]";
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

    expect(result).toEqual({ ok: false, reason: "duplicate_login" });
    expect(sent).toEqual(["user\r", "password\r"]);
  });

  it("recognizes the captured duplicate-session prompt without sending a decision", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const duplicatePrompt = fixtureSection(
      readRealPttFixture("login.txt"),
      "duplicate session",
    );
    let screen = "請輸入代號，或以 guest 參觀";

    const result = await mod.loginThroughTerminal(
      {
        send: async (message: string) => {
          sent.push(message);
          if (message === "user\r") screen = "請輸入您的密碼:";
          if (message === "password\r") screen = duplicatePrompt;
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

    expect(result).toEqual({ ok: false, reason: "duplicate_login" });
    expect(sent).toEqual(["user\r", "password\r"]);
  });

  it("clears PTT's default answer when resuming a duplicate login decision", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    let screen = "您想刪除其他重複登入的連線嗎？[Y/n]";

    const result = await mod.loginThroughTerminal(
      {
        send: async (message: string) => {
          sent.push(message);
          if (message === "\by\r") {
            screen = "【主功能表】 批踢踢實業坊";
          }
          return true;
        },
      },
      {
        username: "user",
        password: "password",
        kickOthers: true,
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
    expect(sent).toEqual(["\by\r"]);
  });

  it("waits for the duplicate prompt to clear when preserving the existing session", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    let screen = "您想刪除其他重複登入的連線嗎？[Y/n]";
    let staleReads = 0;
    let markedLoggedIn = false;

    const result = await mod.loginThroughTerminal(
      {
        send: async (message: string) => {
          sent.push(message);
          if (message === "\bn\r") staleReads = 2;
          if (message === "\r") screen = "【主功能表】 批踢踢實業坊";
          return true;
        },
      },
      {
        username: "user",
        password: "password",
        kickOthers: false,
        readSnapshot: () => {
          if (staleReads > 0) {
            staleReads -= 1;
            return screen;
          }
          if (sent.includes("\bn\r") && !sent.includes("\r")) {
            screen = "保留其他連線\n請按任意鍵繼續";
          }
          return screen;
        },
        markLoggedIn: () => { markedLoggedIn = true; },
        timeouts: {
          promptMs: 30,
          passwordPromptMs: 30,
          loginMs: 30,
          pollMs: 1,
          postSendMs: 0,
        },
      },
    );

    expect(result).toEqual({ ok: true });
    expect(markedLoggedIn).toBe(true);
    expect(sent).toEqual(["\bn\r", "\r"]);
  });

  it("serializes bot operations to avoid overlapping terminal commands", async () => {
    const mod = await import("./terminalDriver.js");
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
    const mod = await import("./terminalDriver.js");
    const adapter = mod.createTerminalDriver();
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
    const mod = await import("./terminalDriver.js");

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
    const mod = await import("./terminalDriver.js");

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
    const mod = await import("./terminalDriver.js");

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

  it("opens PTT TopBoards without backing out of the main menu after login", async () => {
    const mod = await import("./terminalDriver.js");
    const calls: string[] = [];
    let screen = "【主功能表】 批踢踢實業坊";
    const hotRows = [
      "【看板列表】                     批踢踢實業坊                     熱門看板",
      "",
      "",
      "      1 ˇBaseball     棒球 ◎[棒球] 一馬首轟不一樣富貴邦MFGA   爆!Matthew10244",
      "",
    ];
    const bot = {
      async enterIndex() {
        calls.push("enterIndex");
        screen = "【主功能表】 批踢踢實業坊";
        return true;
      },
      async send(message: string) {
        calls.push(message);
        if (message === "\x1at") screen = hotRows.join("\n");
        return true;
      },
      getLine(index: number) {
        return { str: screen.split("\n")[index] ?? "" };
      },
    };

    const boards = await mod.fetchHotBoardsFromBotManually(bot);

    expect(calls).toEqual(["\x1at", "q"]);
    expect(boards.map((board) => board.name)).toEqual(["Baseball"]);
  });

  it("does not send q when the TopBoards shortcut did not open a board list", async () => {
    const mod = await import("./terminalDriver.js");
    const calls: string[] = [];
    const rows = ["【主功能表】 批踢踢實業坊"];
    const bot = {
      async send(command: string) {
        calls.push(command);
        return true;
      },
      getLine(index: number) {
        return { str: rows[index] ?? "" };
      },
    };

    await expect(mod.fetchHotBoardsFromBotManually(bot)).resolves.toEqual([]);
    expect(calls).toEqual(["\x1at"]);
  });

  it("exposes terminal popularity through the implementation-layer Board DTO", async () => {
    const mod = await import("./terminalDriver.js");
    let screen = "【主功能表】 批踢踢實業坊";
    const hotRow = [
      "   ",
      "1".padStart(4),
      " ˇ",
      "Gossiping".padEnd(12),
      "chat".padEnd(6),
      "◎",
      "hot board".padEnd(31),
      " ",
      "4027".padStart(5),
    ].join("");
    const bot = {
      state: { connect: true, login: true },
      on() { return this; },
      async enterIndex() {
        screen = "【主功能表】 批踢踢實業坊";
        return true;
      },
      async send(message: string) {
        if (message === "\x1at") {
          screen = ["【看板列表】", "", "", hotRow, ""].join("\n");
        }
        return true;
      },
      getLine(index: number) {
        return { str: screen.split("\n")[index] ?? "" };
      },
      async getArticles() { return []; },
      async getArticle() { return {}; },
    };
    const driver = mod.createTerminalDriverForTesting(bot as never);

    await expect(driver.listBoardEntries({ kind: "hot" })).resolves.toEqual([
      {
        kind: "board",
        board: {
          name: "Gossiping",
          title: "hot board",
          onlineUsers: 4027,
          popularityLabel: "4027",
        },
      },
    ]);
  });

  it("parses category options from the real post prompt screen", async () => {
    const mod = await import("./terminalDriver.js");

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
    const mod = await import("./terminalDriver.js");

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
    const mod = await import("./terminalDriver.js");
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
    const mod = await import("./terminalDriver.js");
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
    const mod = await import("./terminalDriver.js");
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

  it("leaves a title-search series before starting a write workflow", async () => {
    const mod = await import("./terminalDriver.js");
    const calls: string[] = [];
    let state: "series" | "main" | "board" | "category" | "title" = "series";
    const seriesRows = fixtureSection(
      readRealPttFixture("filtered-write.txt"),
      "title-search list",
    ).split("\n");
    const boardRow = buildBoardLine({
      index: 1,
      date: "8/31",
      author: "TEST_USER",
      title: "[測試] terminal fixture",
    });
    const bot = {
      async enterIndex() {
        calls.push("enterIndex");
        state = "main";
        return true;
      },
      async enterBoardByName(boardName: string) {
        calls.push(`enter:${boardName}`);
        state = "board";
        return true;
      },
      async send(command: string) {
        calls.push(`send:${command}`);
        if (command === "\x10") state = "category";
        if (command === "\x03" && state === "category") state = "title";
        else if (command === "\x03" && state === "title") state = "board";
        return true;
      },
      getLine(index: number) {
        const rows = state === "series"
          ? seriesRows
          : state === "main"
            ? ["【主功能表】 批踢踢實業坊"]
            : state === "board"
              ? ["看板《Test》", "", "", boardRow]
              : state === "category"
                ? [
                    "發表文章於【 Test 】 [測試] 每週定期清除本板文章 看板",
                    "種類： 1.測試 2.色彩 (1-2或不選)",
                  ]
                : ["標題: [測試] "];
        return { str: rows[index] ?? "" };
      },
    };

    await expect(mod.fetchPostCategoryOptionsFromBot(bot, "Test")).resolves.toEqual([
      "測試",
      "色彩",
    ]);
    expect(calls.slice(0, 3)).toEqual(["enterIndex", "enter:Test", "send:\x10"]);
  });

  it("restores Re: prefix when ptt-client splits it into the status field", async () => {
    const mod = await import("./terminalDriver.js");

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
    const mod = await import("./terminalDriver.js");

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
    const mod = await import("./terminalDriver.js");

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
    const mod = await import("./terminalDriver.js");

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
    const mod = await import("./terminalDriver.js");

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
    const mod = await import("./terminalDriver.js");

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
    const mod = await import("./terminalDriver.js");

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
    const mod = await import("./terminalDriver.js");
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
    const mod = await import("./terminalDriver.js");
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
    const mod = await import("./terminalDriver.js");
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
    expect(calls).toEqual(["send:\x1b[4~\x1b[4~"]);
  });

  it("refreshes from the latest screen after an older page was read", async () => {
    const mod = await import("./terminalDriver.js");
    let latest = false;
    const bot = {
      async send(command: string) {
        if (command === "\x1b[4~\x1b[4~") latest = true;
        return true;
      },
      getLine(index: number) {
        const rows = ["  看板《Test》[測試] 人氣:1", "", "",
          buildBoardLine({ index: latest ? 100 : 70, date: "4/17", author: "author", title: "[測試] 文章" }),
          ...(latest ? [buildBoardLine({ index: 101, date: "4/17", author: "mod", title: "[公告] 置底" }).replace("101", "  *")] : []),
        ];
        return { str: rows[index] ?? "" };
      },
    };
    const articles = await mod.fetchBoardArticlesFromBotManually(bot, "Test");
    expect(articles.some((article) => article.index === 100)).toBe(true);
    expect(articles.some((article) => article.fixed)).toBe(true);
  });

  it("refreshes an active title filter from its latest results after pagination", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    let filtered = false;
    let latest = true;
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      async enterBoardByName() { filtered = false; return true; },
      getLine(index: number) {
        const rows = [filtered ? "系列《Test》" : "看板《Test》",
          buildBoardLine({ index: latest ? 30 : 11, date: "4/17", author: "author", title: "matching topic" }),
        ];
        return { str: rows[index] ?? "" };
      },
      async send(command: string) {
        sent.push(command);
        if (command === "/topic\r") filtered = true;
        if (command === "\x1b[4~\x1b[4~") latest = true;
        if (command === "\x1b[4~\x1b[4~11\r") latest = false;
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);
    expect((await driver.searchArticles("Test", "topic"))[0]?.index).toBe(30);
    expect((await driver.searchArticles("Test", "topic", 20))[0]?.index).toBe(11);
    expect((await driver.searchArticles("Test", "topic"))[0]?.index).toBe(30);
    expect(sent.filter((command) => command === "/topic\r")).toHaveLength(1);
    expect(filtered).toBe(true);
  });

  it("serializes filter state before a concurrently queued normal article listing", async () => {
    const mod = await import("./terminalDriver.js");
    const normalRows = [
      "看板《Test》",
      buildBoardLine({ index: 42, date: "4/17", author: "normal", title: "一般文章" }),
    ];
    const filteredRows = [
      "看板《Test》",
      buildBoardLine({ index: 1, date: "4/17", author: "filtered", title: "推文篩選結果" }),
    ];
    let filtered = false;
    const rows = () => filtered ? filteredRows : normalRows;
    const bot = {
      state: { connect: true, login: true },
      _state: { connect: true, login: true, position: { boardname: "Test" } },
      on() { return this; },
      getLine(index: number) { return { str: rows()[index] ?? "" }; },
      async getLines() { return rows(); },
      async enterBoardByName() { filtered = false; return true; },
      async send(command: string) {
        if (command === "Z100\r") filtered = true;
        return true;
      },
    };
    const driver = mod.createTerminalDriverForTesting(bot);

    const filtering = driver.filterArticlesByPush("Test", 100);
    const normalListing = driver.listArticles("Test");

    await expect(filtering).resolves.toEqual([
      expect.objectContaining({ index: 1, author: "filtered" }),
    ]);
    await expect(normalListing).resolves.toEqual([
      expect.objectContaining({ index: 42, author: "normal" }),
    ]);
  });

  it("re-enters the board when forceReenter is true, even if already on a normal board list screen", async () => {
    // Regression test for push-filter mode persistence bug:
    // A push-filtered board list looks identical to a normal board list (no "系列《" marker),
    // so ensureNormalBoardView would return early without re-entering.
    // forceReenter=true bypasses that early return to guarantee the board is entered fresh.
    const mod = await import("./terminalDriver.js");
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
    const mod = await import("./terminalDriver.js");
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
    const mod = await import("./terminalDriver.js");
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
    const mod = await import("./terminalDriver.js");
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

  it("excludes favorite folders and board groups from favorite board names", async () => {
    const mod = await import("./terminalDriver.js");
    const screen = [
      "【看板列表】                     批踢踢實業坊                     我的最愛",
      "[←][q]回上層 [→][r]閱讀 [↑↓]選擇 [PgUp][PgDn]翻頁 [c]新文章 [/]搜尋 [h]求助",
      "   編號   看  板       類別   中   文   敘   述               人氣 板   主",
      "●    1 ˇKaohsiung    地方 ◎防災~                              HOT",
      "     2   TY_Research  分類 Σ我的最愛看板",
      "     3   GetMarry     分類 □我的最愛看板",
      "     4 ˇBabyMother   家庭 ◎[寶寶] 記得打流感疫苗               19",
    ].join("\n");

    expect(mod.parseFavoriteBoardNamesFromScreen(screen)).toEqual([
      "Kaohsiung",
      "BabyMother",
    ]);
  });

  it("reads favorites through the global shortcut without repeated back-navigation", async () => {
    const mod = await import("./terminalDriver.js");
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
      async send(command: string) {
        calls.push(command);
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
    expect(calls).toEqual(["\x1af", "q"]);
  });

  it("waits for the favorite list instead of parsing the stale last hot-board page", async () => {
    const mod = await import("./terminalDriver.js");
    const calls: string[] = [];
    let screenReads = 0;
    const staleHotRows = [
      "【看板列表】                     批踢踢實業坊",
      "[←][q]回上層 [→][r]閱讀 [↑↓]選擇 [PgUp][PgDn]翻頁 [c]新文章 [/]搜尋 [h]求助",
      "   編號   看  板       類別   中   文   敘   述               人氣 板   主",
      "●   94 ˇKaohsiung    地方 ◎防災~                              HOT",
      "    95   TY_Research  分類 ◎研究                                8",
      "    96   GetMarry     生活 ◎結婚                                6",
    ];
    const favoriteRows = [
      "【看板列表】                     批踢踢實業坊",
      "[←][q]回上層 [→][r]閱讀 [↑↓]選擇 [PgUp][PgDn]翻頁 [c]新文章 [/]搜尋 [h]求助",
      "   編號   看  板       類別   中   文   敘   述               人氣 板   主",
      "●    1 ˇBaseball     棒球 ◎[棒球] 中職今年很多補賽             爆!",
      "     2 ˇElephants    CPBL ◎[兄弟] Thank you 緯達                 58",
      "     3 ˇjoke         娛樂 ◎[就可] 我難過                         25",
      "     4 ˇStock        學術 ◎[股票] 樂透進行中                    爆!",
    ];

    const bot = {
      async send(command: string) {
        calls.push(command);
        return true;
      },
      getLine(index: number) {
        if (index === 0) screenReads += 1;
        const rows = screenReads <= 2 ? staleHotRows : favoriteRows;
        return { str: rows[index] ?? "" };
      },
    };

    const names = await mod.fetchFavoriteBoardNamesFromBot(bot);
    expect(names.slice(0, 4)).toEqual([
      "Baseball",
      "Elephants",
      "joke",
      "Stock",
    ]);
    expect(names).not.toContain("Kaohsiung");
    expect(calls).toEqual(["\x1af", "q"]);
  });

  it("rewinds a remembered favorite page before collecting favorites", async () => {
    const mod = await import("./terminalDriver.js");
    const calls: string[] = [];
    let page: "main" | "remembered" | "first" = "main";
    const fixture = readRealPttFixture("favorites.txt");
    const rememberedRows = fixtureSection(
      fixture,
      "remembered page immediately after Ctrl-Z f",
    ).split("\n");
    const firstRows = fixtureSection(fixture, "after Home").split("\n");
    const bot = {
      async send(command: string) {
        calls.push(command);
        if (command === "\x1af") page = "remembered";
        if (command === "\x1b[1~") page = "first";
        return true;
      },
      getLine(index: number) {
        const rows = page === "main"
          ? ["【主功能表】 批踢踢實業坊"]
          : page === "remembered"
            ? rememberedRows
            : firstRows;
        return { str: rows[index] ?? "" };
      },
    };

    const names = await mod.fetchFavoriteBoardNamesFromBot(bot);
    expect(names.slice(0, 4)).toEqual([
      "Baseball",
      "Elephants",
      "joke",
      "Stock",
    ]);
    expect(names).not.toContain("Kaohsiung");
    expect(calls).toEqual(["\x1af", "\x1b[1~", "\x1b[6~", "q"]);
  });

  it("opens favorites directly from the PTT main menu", async () => {
    const mod = await import("./terminalDriver.js");
    const calls: string[] = [];
    const rows = [
      "【看板列表】                     批踢踢實業坊                     我的最愛",
      "",
      "",
      "●    1 ˇBaseball     棒球 ◎[棒球] 一馬首轟不一樣富貴邦MFGA   爆!Matthew10244",
    ];
    const bot = {
      async send(command: string) {
        calls.push(command);
        return true;
      },
      getLine(index: number) {
        return { str: rows[index] ?? "" };
      },
    };

    await expect(mod.fetchFavoriteBoardNamesFromBot(bot)).resolves.toEqual([
      "Baseball",
    ]);
    expect(calls).toEqual(["\x1af", "q"]);
  });

  it("uses the global shortcut to open favorites from an article reader", async () => {
    const mod = await import("./terminalDriver.js");
    const calls: string[] = [];
    let inArticle = true;
    const bot = {
      async send(command: string) {
        calls.push(command);
        if (command === "\x1af") inArticle = false;
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
    expect(calls).toEqual(["\x1af", "q"]);
  });

  it("continues manual favorite parsing across multiple favorite pages", async () => {
    const mod = await import("./terminalDriver.js");
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
      async send(command: string) {
        calls.push(command);
        if (command === "\x1b[6~") page = Math.min(page + 1, pages.length - 1);
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
      "\x1af",
      "\x1b[6~",
      "q",
    ]);
  });

  it("opens an article through explicit board navigation using the same open sequence as ptt-client", async () => {
    const mod = await import("./terminalDriver.js");
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
    const mod = await import("./terminalDriver.js");
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
    const mod = await import("./terminalDriver.js");

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

  it("preserves terminal cell colors in first and subsequent raw article snapshots", async () => {
    const { fetchArticleFromBotManually } = await import("./terminalDriver.js");
    const Terminal = createRequire(import.meta.url)("terminal.js");
    const terminal = new Terminal({ columns: 80, rows: 24 });
    terminal.state.setMode("stringWidth", "dbcs");
    const header = [
      "作者  suwagutao (樹蛙孤逃)                 看板  Baseball",
      "標題  [情報] 下半季",
      "時間  Thu Sep 10 21:00:00 2026",
      "───────────────────────────────────────",
    ];
    const colored = "\x1b[31m1 樂天桃猿 39 22-0-17\x1b[0m";
    const pages = [
      [...header, colored],
      [colored, "\x1b[1;33m2 中信兄弟\x1b[0m", "G321 統一 \x1b[31m6\x1b[0m:0 中信"],
    ];
    const paint = (page: number) => {
      terminal.write("\x1b[0m\x1b[2J\x1b[H" + pages[page].join("\r\n") +
        `\x1b[24;1H瀏覽 第 ${page + 1}/2 頁 (${page ? 100 : 50}%)`);
    };
    paint(0);
    const bot = {
      async enterBoardByName() { return true; },
      async send(command: string) {
        if (command === "\x1b[6~") paint(1);
        return true;
      },
      getLine(index: number) { return terminal.state.getLine(index); },
    };
    const snapshots: string[] = [];
    await fetchArticleFromBotManually(bot, "Baseball", 1, undefined,
      (raw) => snapshots.push(raw));
    expect(snapshots[0]).toContain("\x1b[0;31m1 樂天桃猿");
    const final = snapshots.at(-1)!;
    expect(final).toContain("\x1b[0;1;33m2 中信兄弟");
    expect(final).toContain("\x1b[0;31m6\x1b[0m:0 中信");
    expect(final.match(/樂天桃猿/g)).toHaveLength(1);
  });

  it("waits for the first article screen before progressive paging", async () => {
    const mod = await import("./terminalDriver.js");
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
    const mod = await import("./terminalDriver.js");
    const partials: Array<{
      body: string;
      pushes?: Array<{ author: string; content: string }>;
    }> = [];
    const rawSnapshots: Array<{ rawText: string; completeness: string }> = [];
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
      (rawText: string, completeness: string) => {
        rawSnapshots.push({ rawText, completeness });
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
    expect(rawSnapshots[0]).toMatchObject({ completeness: "incomplete" });
    expect(rawSnapshots[0]?.rawText).toContain("第一頁第一行");
    expect(rawSnapshots.at(-1)).toMatchObject({ completeness: "final" });
    expect(rawSnapshots.at(-1)?.rawText).toContain("第二頁第二行");
  });

  it("continues from the first detected screen without re-emitting the first page", async () => {
    const mod = await import("./terminalDriver.js");
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
    const mod = await import("./terminalDriver.js");
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
    const mod = await import("./terminalDriver.js");
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
    const mod = await import("./terminalDriver.js");
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
      "alice:第一段\n第二段:root",
      "bob:收到:reply:1",
    ]);
  });

  it("continues emitting partial pushes across screens that already show 100 percent", async () => {
    const mod = await import("./terminalDriver.js");
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
    const mod = await import("./terminalDriver.js");
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
    const mod = await import("./terminalDriver.js");

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
    const mod = await import("./terminalDriver.js");

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
    const mod = await import("./terminalDriver.js");

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
    const mod = await import("./terminalDriver.js");

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
    const mod = await import("./terminalDriver.js");

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
    const mod = await import("./terminalDriver.js");

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
    const mod = await import("./terminalDriver.js");

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
    const mod = await import("./terminalDriver.js");

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
    const mod = await import("./terminalDriver.js");
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
    const mod = await import("./terminalDriver.js");
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
    const mod = await import("./terminalDriver.js");
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
    const mod = await import("./terminalDriver.js");
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
    const mod = await import("./terminalDriver.js");
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

  it("recognizes article editor and save confirmation screens", async () => {
    const mod = await import("./terminalDriver.js");

    expect(mod.isArticleEditorScreen("文章編輯  離開[Ctrl-X]  插入模式")).toBe(true);
    expect(mod.isArticleEditorScreen("文章發表綱領")).toBe(false);
    expect(mod.isArticleEditSavePrompt("確定要儲存檔案嗎? [Y/n]")).toBe(true);
    expect(mod.isArticleDeletePrompt("確定要刪除嗎(Y/N)?")).toBe(true);
    expect(mod.isArticleDeletePrompt("[d]刪除 [z]精華區")).toBe(false);
    expect(
      mod.isArticleEditSuccessScreen(
        "文章已更新\n看板《Test》",
        "Test",
        "alice",
        "[測試] 原標題",
      ),
    ).toBe(false);
  });

  it("recognizes the captured Test-board delete confirmation", async () => {
    const mod = await import("./terminalDriver.js");
    const fixture = readRealPttFixture("delete.txt");

    expect(mod.isArticleDeletePrompt(fixtureSection(fixture, "prompt in normal Test board"))).toBe(true);
    expect(fixtureSection(fixture, "verified")).toContain("(本文已被刪除) [TEST_USER]");
  });

  it.each([false, true])("edits the expected article without adding a custom summary (formatted=%s)", async (formatted) => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const articleRows = [
      "作者 alice 看板 Test",
      "標題 [測試] 原標題",
      "時間 Thu Jul 16 10:00:00 2026",
      "───────────────────────────────────────",
      "舊正文",
      "--",
      "舊簽名",
      "※ PTTzzz 編輯摘要：第一次修正",
      "※ 編輯: alice, 07/15/2026 10:00:00",
      "※ PTTzzz 編輯摘要：中間修正",
      "※ 編輯: alice, 07/16/2026 10:00:00",
    ];
    let screenRows = [
      "看板《Test》",
      buildBoardLine({ index: 123, author: "alice", title: "[測試] 原標題" }),
    ];

    const bot = {
      enterBoardByName: async () => true,
      getLines: async () => articleRows,
      getLine: (index: number) => ({ str: screenRows[index] ?? "" }),
      send: async (command: string) => {
        sent.push(command);
        if (command === "123\r\r") screenRows = articleRows;
        else if (command === "q") {
          screenRows = [
            "看板《Test》",
            buildBoardLine({ index: 123, author: "alice", title: "[測試] 原標題" }),
          ];
        } else if (command === "E") {
          screenRows = ["文章編輯  離開[Ctrl-X]  插入模式"];
        } else if (command === "\x18") {
          screenRows = ["確定要儲存檔案嗎? [Y/n]"];
        } else if (command === "y\r") {
          screenRows = [
            "文章已更新",
            "作者 alice 看板 Test",
            "標題 [測試] 原標題",
          ];
        }
        return true;
      },
    };

    const result = await mod.submitArticleEditFromBot(bot, {
      boardName: "Test",
      articleIndex: 123,
      expectedAuthor: "alice",
      expectedTitle: "[測試] 原標題",
      body: "更新正文",
      formatting: formatted ? [{ start: 0, end: 2, bold: true, color: 31 }] : undefined,
    });

    expect(result).toEqual({ ok: true, outcome: "sent" });
    expect(sent).toContain("E");
    expect(sent).toContain(formatted ? "\x15[0;1;31m更新\x15[0m正文\r" : "更新正文\r");
    expect(sent).toContain("\x1b,");
    expect(sent).toContain("舊簽名\r");
    expect(sent).toContain("※ PTTzzz 編輯摘要：第一次修正\r");
    expect(sent.indexOf("※ PTTzzz 編輯摘要：第一次修正\r")).toBeLessThan(
      sent.indexOf("※ 編輯: alice, 07/15/2026 10:00:00\r"),
    );
    expect(sent.indexOf("※ 編輯: alice, 07/15/2026 10:00:00\r")).toBeLessThan(
      sent.indexOf("※ PTTzzz 編輯摘要：中間修正\r"),
    );
    expect(sent.indexOf("※ PTTzzz 編輯摘要：中間修正\r")).toBeLessThan(
      sent.indexOf("※ 編輯: alice, 07/16/2026 10:00:00\r"),
    );
    expect(sent.filter((command) => command === "※ PTTzzz 編輯摘要：第一次修正\r")).toHaveLength(1);
    expect(sent.filter((command) => command === "※ PTTzzz 編輯摘要：中間修正\r")).toHaveLength(1);
    expect(sent).not.toContain("※ PTTzzz 編輯摘要：第二次修正\r");
    expect(sent).toContain("y\r");
  });

  it("locates and reopens an editable article by AID", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const articleRows = [
      "作者 alice 看板 Test",
      "標題 [測試] AID 編輯",
      "時間 Thu Jul 16 10:00:00 2026",
      "───────────────────────────────────────",
      "舊正文",
    ];
    let screenRows = ["看板《Test》"];
    let inInfo = false;
    const bot = {
      enterBoardByName: async () => true,
      getLines: async () => articleRows,
      getLine: (index: number) => ({ str: screenRows[index] ?? "" }),
      send: async (command: string) => {
        sent.push(command);
        if (command === "#1AbCd\r") screenRows = articleRows;
        else if (command === "Q") {
          inInfo = true;
          screenRows = ["文章代碼(AID): #1AbCd (Test)"];
        } else if (command === "q" && inInfo) {
          inInfo = false;
          screenRows = articleRows;
        } else if (command === "q") screenRows = ["看板《Test》"];
        else if (command === "E") screenRows = ["文章編輯  離開[Ctrl-X]  插入模式"];
        else if (command === "\x18") screenRows = ["確定要儲存檔案嗎? [Y/n]"];
        else if (command === "y\r") screenRows = [
          "文章已更新", "作者 alice 看板 Test", "標題 [測試] AID 編輯",
        ];
        return true;
      },
    };
    await expect(mod.submitArticleEditFromBot(bot, {
      boardName: "Test",
      articleIndex: 0,
      articleAid: "#1AbCd",
      expectedAuthor: "alice",
      expectedTitle: "[測試] AID 編輯",
      body: "新正文",
    })).resolves.toEqual({ ok: true, outcome: "sent" });
    expect(sent.filter((command) => command === "#1AbCd\r")).toHaveLength(2);
    expect(sent).not.toContain("※ PTTzzz 編輯摘要：AID 修正\r");
  });

  it("does not enter the editor when the article identity is stale", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const articleRows = [
      "作者 alice 看板 Test",
      "標題 [測試] 已變更標題",
      "時間 Thu Jul 16 10:00:00 2026",
      "───────────────────────────────────────",
      "舊正文",
    ];
    let screenRows = ["看板《Test》"];
    const bot = {
      enterBoardByName: async () => true,
      getLines: async () => articleRows,
      getLine: (index: number) => ({ str: screenRows[index] ?? "" }),
      send: async (command: string) => {
        sent.push(command);
        if (command === "123\r\r") screenRows = articleRows;
        if (command === "q") screenRows = ["看板《Test》"];
        return true;
      },
    };

    const result = await mod.submitArticleEditFromBot(bot, {
      boardName: "Test",
      articleIndex: 123,
      expectedAuthor: "alice",
      expectedTitle: "[測試] 原標題",
      body: "更新正文",
    });

    expect(result).toEqual({
      ok: false, outcome: "not-sent", reason: "文章身分已變更，請重新載入",
    });
    expect(sent).not.toContain("E");
  });

  it("refuses an article edit that exceeds the safe line limit", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const articleRows = [
      "作者 alice 看板 Test",
      "標題 [測試] 長文章",
      "時間 Thu Jul 16 10:00:00 2026",
      "───────────────────────────────────────",
      ...Array.from({ length: 2001 }, (_, index) => `第 ${index + 1} 行`),
    ];
    const bot = {
      enterBoardByName: async () => true,
      getLines: async () => articleRows,
      getLine: (index: number) => ({ str: articleRows[index] ?? "" }),
      send: async (command: string) => {
        sent.push(command);
        return true;
      },
    };

    const result = await mod.submitArticleEditFromBot(bot, {
      boardName: "Test",
      articleIndex: 123,
      expectedAuthor: "alice",
      expectedTitle: "[測試] 長文章",
      body: "更新正文",
    });

    expect(result).toEqual({
      ok: false, outcome: "not-sent", reason: "文章行數超過安全編輯上限",
    });
    expect(sent).not.toContain("E");
    expect(sent.some((command) => command.includes("\x19"))).toBe(false);
  });

  it("does not delete an article when its identity is stale", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const articleRows = [
      "作者 alice 看板 Test",
      "標題 [測試] 已變更標題",
      "時間 Thu Jul 16 10:00:00 2026",
      "───────────────────────────────────────",
      "正文",
    ];
    let screenRows = [
      "看板《Test》",
      buildBoardLine({ index: 123, date: "07/16", author: "alice", title: "[測試] 原標題" }),
    ];
    const bot = {
      enterBoardByName: async () => true,
      getLines: async () => articleRows,
      getLine: (index: number) => ({ str: screenRows[index] ?? "" }),
      send: async (command: string) => {
        sent.push(command);
        if (command === "123\r\r") screenRows = articleRows;
        if (command === "q") screenRows = ["看板《Test》"];
        return true;
      },
    };

    const result = await mod.submitArticleDeleteFromBot(bot, {
      boardName: "Test",
      articleIndex: 123,
      expectedAuthor: "alice",
      expectedTitle: "[測試] 原標題",
    });

    expect(result).toEqual({
      ok: false, outcome: "not-sent", reason: "文章身分已變更，請重新載入",
    });
    expect(sent).not.toContain("d");
    expect(sent).not.toContain("y\r");
  });

  it("does not confirm deletion without a PTT delete prompt", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const articleRows = [
      "作者 alice 看板 Test",
      "標題 [測試] 原標題",
      "時間 Thu Jul 16 10:00:00 2026",
      "───────────────────────────────────────",
      "正文",
    ];
    let screenRows = [
      "看板《Test》",
      buildBoardLine({ index: 123, date: "07/16", author: "alice", title: "[測試] 原標題" }),
    ];
    const bot = {
      enterBoardByName: async () => true,
      getLines: async () => articleRows,
      getLine: (index: number) => ({ str: screenRows[index] ?? "" }),
      send: async (command: string) => {
        sent.push(command);
        if (command === "123\r\r") screenRows = articleRows;
        if (command === "q") screenRows = ["看板《Test》"];
        if (command === "d") screenRows = ["您沒有權限刪除這篇文章"];
        return true;
      },
    };

    const result = await mod.submitArticleDeleteFromBot(bot, {
      boardName: "Test",
      articleIndex: 123,
      expectedAuthor: "alice",
      expectedTitle: "[測試] 原標題",
    });

    expect(result).toEqual({
      ok: false, outcome: "not-sent", reason: "PTT 拒絕刪除這篇文章",
    });
    expect(sent).toContain("d");
    expect(sent).not.toContain("y\r");
  });

  it("deletes a verified article through the PTT terminal", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const articleRows = [
      "作者 alice 看板 Test",
      "標題 [測試] 原標題",
      "時間 Thu Jul 16 10:00:00 2026",
      "───────────────────────────────────────",
      "正文",
    ];
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 123, date: "07/16", author: "alice", title: "[測試] 原標題" }),
    ];
    let screenRows = boardRows;
    const bot = {
      enterBoardByName: async () => true,
      getLines: async () => articleRows,
      getLine: (index: number) => ({ str: screenRows[index] ?? "" }),
      send: async (command: string) => {
        sent.push(command);
        if (command === "123\r\r") screenRows = articleRows;
        if (command === "q") screenRows = boardRows;
        if (command === "d") screenRows = ["確定要刪除這篇文章嗎? [y/N]"];
        if (command === "y\r") {
          screenRows = [
            "看板《Test》",
            buildBoardLine({
              index: 123,
              date: "07/16",
              author: "-",
              title: "(本文已被刪除) [alice]",
            }),
          ];
        }
        return true;
      },
    };

    const result = await mod.submitArticleDeleteFromBot(bot, {
      boardName: "Test",
      articleIndex: 123,
      expectedAuthor: "alice",
      expectedTitle: "[測試] 原標題",
    });

    expect(result).toEqual({ ok: true, outcome: "sent" });
    expect(sent.filter((command) => command === "d")).toHaveLength(1);
    expect(sent.indexOf("d")).toBeLessThan(sent.indexOf("y\r"));
  });

  it("does not treat an off-screen index as deleted when the article still opens", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const articleRows = [
      "作者 alice 看板 Test",
      "標題 [測試] 原標題",
      "時間 Thu Jul 16 10:00:00 2026",
      "───────────────────────────────────────",
      "正文",
    ];
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 124, date: "07/16", author: "bob", title: "[測試] 其他文章" }),
    ];
    let screenRows = boardRows;
    let deletionConfirmed = false;
    const bot = {
      enterBoardByName: async () => true,
      getLines: async () => articleRows,
      getLine: (index: number) => ({ str: screenRows[index] ?? "" }),
      send: async (command: string) => {
        sent.push(command);
        if (command === "123\r\r") screenRows = articleRows;
        if (command === "q") screenRows = boardRows;
        if (command === "d") screenRows = ["確定要刪除這篇文章嗎? [y/N]"];
        if (command === "y\r") {
          deletionConfirmed = true;
          screenRows = boardRows;
        }
        return true;
      },
    };

    const result = await mod.submitArticleDeleteFromBot(bot, {
      boardName: "Test",
      articleIndex: 123,
      expectedAuthor: "alice",
      expectedTitle: "[測試] 原標題",
    });

    expect(deletionConfirmed).toBe(true);
    expect(result).toEqual({
      ok: false,
      outcome: "uncertain",
      reason: "無法確認文章是否刪除成功，請重新整理看板檢查",
    });
    expect(sent.filter((command) => command === "123\r\r")).toHaveLength(2);
  });

  it("locates an article by AID before deleting it", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const articleRows = [
      "作者 alice 看板 Test",
      "標題 [測試] AID 原標題",
      "時間 Thu Jul 16 10:00:00 2026",
      "───────────────────────────────────────",
      "正文",
    ];
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 124, date: "07/16", author: "bob", title: "[測試] 其他文章" }),
      "[←]離開 [d]刪除",
    ];
    let screenRows = boardRows;
    let aidOpenCount = 0;
    let inInfo = false;
    const bot = {
      enterBoardByName: async () => true,
      getLines: async () => articleRows,
      getLine: (index: number) => ({ str: screenRows[index] ?? "" }),
      send: async (command: string) => {
        sent.push(command);
        if (command === "#1AbCdEf\r") {
          aidOpenCount += 1;
          screenRows = aidOpenCount === 1 ? articleRows : ["無此文章代碼(AID)", ...boardRows];
        }
        if (command === "Q") {
          inInfo = true;
          screenRows = ["文章代碼(AID): #1AbCdEf (Test)"];
        } else if (command === "q" && inInfo) {
          inInfo = false;
          screenRows = articleRows;
        } else if (command === "q") screenRows = boardRows;
        if (command === "d") screenRows = ["確定要刪除這篇文章嗎? [y/N]"];
        if (command === "y\r") screenRows = boardRows;
        return true;
      },
    };

    const result = await mod.submitArticleDeleteFromBot(bot, {
      boardName: "Test",
      articleIndex: 0,
      articleAid: "#1AbCdEf",
      expectedAuthor: "alice",
      expectedTitle: "[測試] AID 原標題",
    });

    expect(result).toEqual({ ok: true, outcome: "sent" });
    expect(sent.filter((command) => command === "#1AbCdEf\r")).toHaveLength(2);
    expect(sent).toContain("d");
    expect(sent).toContain("y\r");
  });

  it.each([false, true])("replies to a verified article through the native PTT board flow (formatted=%s)", async (formatted) => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const articleRows = [
      "作者 alice 看板 Test",
      "標題 [測試] 原標題",
      "時間 Thu Jul 16 10:00:00 2026",
      "───────────────────────────────────────",
      "原文正文",
    ];
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 123, date: "07/16", author: "alice", title: "[測試] 原標題" }),
    ];
    let screenRows = boardRows;
    const bot = {
      enterBoardByName: async () => true,
      getLines: async () => articleRows,
      getLine: (index: number) => ({ str: screenRows[index] ?? "" }),
      send: async (command: string) => {
        sent.push(command);
        if (command === "123\r\r") screenRows = articleRows;
        else if (command === "q") screenRows = boardRows;
        else if (command === "y") {
          screenRows = ["回應至 (F)看板 (M)作者信箱 (B)兩者皆是 (Q)取消 [F]"];
        } else if (command === "f\r") {
          screenRows = ["採用原標題[Y/n]?"];
        } else if (command === "\r" && screenRows[0]?.includes("按任意鍵")) {
          screenRows = boardRows;
        } else if (command === "\r") {
          screenRows = ["文章編輯  離開[Ctrl-X]  插入模式"];
        }
        else if (command === "\x18") screenRows = ["確定要儲存檔案嗎? [Y/n]"];
        else if (command === "y\r") screenRows = ["選擇簽名檔 (0-9) [0]"];
        else if (command === "0\r") screenRows = ["文章已發表，請按任意鍵繼續"];
        return true;
      },
    };

    const result = await mod.submitArticleReplyToBoardFromBot(bot, {
      boardName: "Test",
      articleIndex: 123,
      expectedAuthor: "alice",
      expectedTitle: "[測試] 原標題",
      body: "回應第一行\n回應第二行",
      formatting: formatted ? [{ start: 0, end: 5, color: 32 }] : undefined,
    });

    expect(result).toEqual({ ok: true, outcome: "sent" });
    expect(sent).toContain("y");
    expect(sent).toContain("f\r");
    expect(sent).toContain("\r");
    expect(sent).toContain("\x1b,");
    expect(sent).toContain("\x19".repeat(2000));
    expect(sent).toContain(formatted ? "\x15[0;32m回應第一行\x15[0m\r" : "回應第一行\r");
    expect(sent).toContain("回應第二行\r");
    expect(sent).toContain("\x18");
    expect(sent).toContain("y\r");
    expect(sent).toContain("0\r");
    expect(sent.filter((command) => command === "\r")).toHaveLength(2);
    expect(screenRows).toEqual(boardRows);
  });

  it("restores the board without resending an uncertain native reply", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const articleRows = [
      "作者 alice 看板 Test",
      "標題 [測試] 原標題",
      "時間 Thu Jul 16 10:00:00 2026",
      "───────────────────────────────────────",
      "原文正文",
    ];
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 123, date: "07/16", author: "alice", title: "[測試] 原標題" }),
    ];
    let screenRows = boardRows;
    let restoredBoard = false;
    const bot = {
      enterBoardByName: async () => {
        restoredBoard = true;
        screenRows = boardRows;
        return true;
      },
      getLines: async () => articleRows,
      getLine: (index: number) => ({ str: screenRows[index] ?? "" }),
      send: async (command: string) => {
        sent.push(command);
        if (command === "123\r\r") screenRows = articleRows;
        else if (command === "q") screenRows = boardRows;
        else if (command === "y") {
          screenRows = ["回應至 (F)看板 (M)作者信箱 (B)兩者皆是 (Q)取消 [F]"];
        } else if (command === "f\r") screenRows = ["採用原標題[Y/n]?"];
        else if (command === "\r") screenRows = ["文章編輯  離開[Ctrl-X]  插入模式"];
        else if (command === "\x18") screenRows = ["確定要儲存檔案嗎? [Y/n]"];
        else if (command === "y\r") screenRows = ["選擇簽名檔 (0-9) [0]"];
        else if (command === "0\r") screenRows = ["未知的發表完成畫面"];
        return true;
      },
    };

    const result = await mod.submitArticleReplyToBoardFromBot(
      bot,
      {
        boardName: "Test",
        articleIndex: 123,
        expectedAuthor: "alice",
        expectedTitle: "[測試] 原標題",
        body: "不確定結果",
      },
      { completionMs: 5, pollMs: 1, afterPromptMs: 0 },
    );

    expect(result).toEqual({
      ok: false,
      outcome: "uncertain",
      reason: "無法確認回應是否送出，已返回看板，請重新整理檢查",
    });
    expect(restoredBoard).toBe(true);
    expect(sent.filter((command) => command === "不確定結果\r")).toHaveLength(1);
  });

  it("does not treat a board return before save confirmation as success", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const articleRows = [
      "作者 alice 看板 Test",
      "標題 [測試] 原標題",
      "時間 Thu Jul 16 10:00:00 2026",
      "───────────────────────────────────────",
      "原文正文",
    ];
    const boardRows = [
      "看板《Test》",
      buildBoardLine({ index: 123, date: "07/16", author: "alice", title: "[測試] 原標題" }),
    ];
    let screenRows = boardRows;
    const bot = {
      enterBoardByName: async () => true,
      getLines: async () => articleRows,
      getLine: (index: number) => ({ str: screenRows[index] ?? "" }),
      send: async (command: string) => {
        sent.push(command);
        if (command === "123\r\r") screenRows = articleRows;
        else if (command === "q") screenRows = boardRows;
        else if (command === "y") {
          screenRows = ["回應至 (F)看板 (M)作者信箱 (B)兩者皆是 (Q)取消 [F]"];
        } else if (command === "f\r") screenRows = ["採用原標題[Y/n]?"];
        else if (command === "\r") screenRows = ["文章編輯  離開[Ctrl-X]  插入模式"];
        else if (command === "\x18") screenRows = boardRows;
        return true;
      },
    };

    const result = await mod.submitArticleReplyToBoardFromBot(
      bot,
      {
        boardName: "Test",
        articleIndex: 123,
        expectedAuthor: "alice",
        expectedTitle: "[測試] 原標題",
        body: "沒有儲存確認",
      },
      { completionMs: 5, pollMs: 1, afterPromptMs: 0 },
    );

    expect(result).toEqual({
      ok: false,
      outcome: "not-sent",
      reason: "PTT 未顯示回應儲存確認",
    });
    expect(sent).not.toContain("y\r");
  });

  it("does not enter native reply when the source identity is stale", async () => {
    const mod = await import("./terminalDriver.js");
    const sent: string[] = [];
    const articleRows = [
      "作者 alice 看板 Test",
      "標題 [測試] 已變更標題",
      "時間 Thu Jul 16 10:00:00 2026",
      "───────────────────────────────────────",
      "正文",
    ];
    const bot = {
      enterBoardByName: async () => true,
      getLines: async () => articleRows,
      getLine: (index: number) => ({ str: articleRows[index] ?? "" }),
      send: async (command: string) => {
        sent.push(command);
        return true;
      },
    };

    const result = await mod.submitArticleReplyToBoardFromBot(bot, {
      boardName: "Test",
      articleIndex: 123,
      expectedAuthor: "alice",
      expectedTitle: "[測試] 原標題",
      body: "不應送出",
    });

    expect(result).toEqual({
      ok: false, outcome: "not-sent", reason: "文章身分已變更，請重新載入",
    });
    expect(sent).not.toContain("y");
    expect(sent).not.toContain("不應送出\r");
  });
});
