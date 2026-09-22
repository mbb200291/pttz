/* @vitest-environment jsdom */
import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/dom";
import { PttzzzClient, type PttGateway } from "@pttzzz/core";
import { mountApp } from "./app";

let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); document.body.replaceChildren(); vi.unstubAllGlobals(); });

function mountRaw(withdrawn = false) {
  const key = { board: "Test", aid: "Stable123" } as const;
  const summary = { key, author: "alice", title: "閱讀回歸" };
  const text = [
    "作者  alice (Alice)                 看板  Test",
    "標題  閱讀回歸",
    "時間  Wed Sep 16 23:20:00 2026",
    "───────────────────────────────────────",
    "\x1b[31m紅字\x1b[0m與普通字",
    "<img src=x onerror=alert(1)>",
    "--",
    "※ 發信站: 批踢踢實業坊(ptt.cc), 來自: 192.0.2.1 (臺灣)",
    "→ alice: ♥♥♥♥♥                                                09/16 23:30",
    "→ bob: 回1樓：子回覆                                           09/16 23:30",
    "→ alice: 更正我在1樓發言：^1:4=♡♥♡                            09/16 23:31",
    "→ alice: 更正我在1樓發言：^5:5=♡                              09/16 23:35",
    ...(withdrawn ? ["→ alice: 撤回我在1樓的發言                                     09/16 23:43"] : []),
  ].join("\n");
  const boards = async () => ({ kind: "boards" as const, items: [{ name: "Test", title: "Test" }] });
  const articles = async () => ({ items: [summary] });
  const gateway: PttGateway = {
    connect: async () => {}, disconnect: async () => {}, login: async () => ({ userId: "reader" }),
    subscribe: () => () => {}, listBoards: boards, searchBoards: boards, filterBoards: boards,
    listArticles: articles, searchArticles: articles, filterArticles: articles,
    async *readArticle() { yield { articleKey: key, rawText: text, revision: 1, completeness: "final" as const }; },
    execute: async () => { throw new Error("Read-only test must not write"); },
  };
  const root = document.createElement("div"); document.body.append(root);
  dispose = mountApp(root, new PttzzzClient(gateway), true);
}

it("renders preserved core ANSI as safe styled text and shows original and resulting edit versions", async () => {
  mountRaw();
  fireEvent.click(await screen.findByRole("button", { name: "閱讀回歸" }));
  await screen.findByText("子回覆");
  const body = document.querySelector(".feed-body")!;
  expect(body.textContent).toContain("紅字與普通字");
  expect(body.textContent).not.toContain("\x1b");
  expect(body.querySelector<HTMLElement>("span")?.style.color).toBeTruthy();
  expect(body.querySelector("img")).toBeNull();
  const history = screen.getByText("編輯歷程").parentElement!;
  const versions = Array.from(history.querySelectorAll("pre")).map(e => e.textContent);
  expect(versions).toHaveLength(3);
  expect(versions[0]).toContain("♥♥♥♥♥");
  expect(versions[1]).toContain("♥♡♥♡♥");
  expect(versions[2]).toContain("♥♡♥♡♥♡");
  expect(history.textContent).not.toContain("^1:4=");
});

it("keeps a withdrawn parent placeholder without revealing its versions and preserves the child", async () => {
  mountRaw(true);
  fireEvent.click(await screen.findByRole("button", { name: "閱讀回歸" }));
  await screen.findByText("子回覆");
  expect(screen.getByText("此回覆已撤回")).toBeTruthy();
  expect(document.querySelectorAll(".reply")).toHaveLength(2);
  expect(document.querySelector(".replies")?.textContent).not.toContain("♥");
  expect(screen.queryByText("編輯歷程")).toBeNull();
});
