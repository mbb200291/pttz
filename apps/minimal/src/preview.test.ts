import { expect, it, vi } from "vitest";
import { PttzzzClient } from "@pttzzz/core";
import { createFakeBrowserGateway } from "@pttzzz/browser/testing";
import { Reader } from "./controller";

it("reads public fake board/article data without opening a WebSocket", async () => {
  const environment = globalThis as typeof globalThis & { jsdom: { window: Window } };
  vi.stubGlobal("localStorage", environment.jsdom.window.localStorage);
  vi.stubGlobal("sessionStorage", environment.jsdom.window.sessionStorage);
  localStorage.clear();
  sessionStorage.clear();
  const websocket = vi.fn();
  vi.stubGlobal("WebSocket", websocket);
  const reader = new Reader(() => new PttzzzClient(createFakeBrowserGateway()), vi.fn());
  try {
    await reader.login("preview", "preview");
    await reader.hotBoards();
    expect(reader.state.boards.length).toBeGreaterThan(0);
    await reader.openBoard(reader.state.boards[0].name);
    expect(reader.state.articles.length).toBeGreaterThan(0);
    await reader.openArticle(reader.state.articles[0].key);
    expect(reader.state.article?.completeness).toBe("final");
    expect(reader.state.article?.body).toBeTruthy();
    expect(websocket).not.toHaveBeenCalled();
  } finally {
    await reader.dispose();
    vi.unstubAllGlobals();
  }
});
