// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { PttzzzClient } from "@pttzzz/core";
import { BrowserPttGateway, createTerminalGatewayDriverForTesting } from "./gateway";
import { createTerminalDriverForTesting } from "./internal/terminalDriver";
import { useBoard } from "../../../apps/web/src/hooks/useBoard";
import { usePttSocketStore } from "../../../apps/web/src/hooks/usePttSocket";
import { clearPttViewCache } from "../../../apps/web/src/lib/ptt/viewCache";

afterEach(() => { cleanup(); clearPttViewCache(); });

it("reloads after native row removal through terminal, gateway, core and hook", async () => {
  // Replace only the remote terminal. Same titles make metadata-only checks insufficient.
  let ids = ["first", "second", "third"];
  let selected = "third";
  let mode: "board" | "article" | "info" = "board";
  const rows = () => mode === "info" ? [`文章代碼(AID): #${selected} (Test)`]
    : mode === "article" ? ["作者 alice 看板 Test", "標題 same", "時間 Mon Sep 21 00:00:00 2026", "───────────────────────────────────────", "body", "瀏覽 第 1/1 頁 (100%)"]
    : ["看板《Test》", "[←]離開 [→]閱讀 [Ctrl-P]發表文章", ...ids.map((_, i) => `  ${String(i + 1).padStart(5)}     9/21 alice        □ same`)];
  const bot = {
    state: { connect: true, login: true }, on() { return this; },
    getLine: (i: number) => ({ str: rows()[i] ?? "" }), getLines: async () => rows(),
    getArticles: async () => [], getArticle: async () => ({}),
    send: async (key: string) => {
      const index = /^(\d+)\r\r$/u.exec(key);
      const aid = /^#(\w+)\r\r$/u.exec(key);
      if (index) {
        const id = ids[Number(index[1]) - 1];
        if (id) { selected = id; mode = "article"; }
      } else if (aid && ids.includes(aid[1])) { selected = aid[1]; mode = "article"; }
      else if (key === "Q") mode = "info";
      else if (key === "q") mode = "board";
      return true;
    },
  };
  const terminal = createTerminalDriverForTesting(bot, "local", "local");
  const gateway = new BrowserPttGateway(createTerminalGatewayDriverForTesting(terminal));
  const client = new PttzzzClient(gateway);
  const list = client.listArticles.bind(client);
  client.listArticles = input => list({ ...input, limit: 1 });
  clearPttViewCache();
  usePttSocketStore.setState({ client, pttState: "ready" });
  const { result } = renderHook(() => useBoard("Test"));
  await waitFor(() => expect(result.current.articles.map(item => item.key.index)).toEqual([3]), { timeout: 6000 });
  ids = ids.slice(1);
  act(() => result.current.loadMore());
  await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 6000 });
  expect(result.current.articles.map(item => item.key.index)).toEqual([2]);
  expect(result.current.error).toBeNull();
}, 15000);
