import { expect, it } from "vitest";
import { PttzzzClient } from "@pttzzz/core";
import { createFakeBrowserGateway } from "@pttzzz/browser/testing";
import { renderArticle } from "./view";

it("reads current continuation and stop markers through the public core", async () => {
  const key = { board: "Test", index: 2 };
  const gateway = createFakeBrowserGateway();
  gateway.readArticle = async function* () {
    yield { articleKey: key, completeness: "final" as const, revision: 1, rawText: [
      "作者  alice (Reader)                 看板  Test",
      "標題  [測試] multipart",
      "時間  Wed Sep 16 23:20:00 2026",
      "───────────────────────────────────────",
      "正文",
      "→ alice: 第一段。| 09/16 23:21",
      "→ alice: 第二段\\ 09/16 23:30",
      "→ alice: 另一則。 09/16 23:30",
    ].join("\n") };
  };
  const result = await new PttzzzClient(gateway).getArticle({ article: key });
  if (!result.ok) throw new Error(result.error.message);
  const element = renderArticle(result.value);
  expect([...element.querySelectorAll(".reply-content")].map(item => item.textContent))
    .toEqual(["第一段。\n第二段", "另一則。"]);
});

it("renders terminal edits and withdrawal without flattening the discussion tree", async () => {
  const key = { board: "Test", index: 1 };
  const gateway = createFakeBrowserGateway();
  gateway.readArticle = async function* () {
    yield { articleKey: key, completeness: "final" as const, revision: 1, rawText: [
      "作者  askz0 (Reader)                 看板  Test",
      "標題  [測試] versions",
      "時間  Wed Sep 16 23:20:00 2026",
      "───────────────────────────────────────",
      "\x1b[31m正文\x1b[0m",
      "→ askz0: 測試 09/16 23:21", "→ askz0: 喔喔 09/16 23:22",
      "→ MBB200291: 推1樓 09/16 23:24", "→ MBB200291: 回1樓：♡ 09/16 23:26",
      "→ MBB200291: 回4樓：♥♥♥♥♥ 09/16 23:30",
      "→ MBB200291: 更正我在5樓發言：^1:4=♡♥♡ 09/16 23:31",
      "→ MBB200291: 更正我在5樓發言：^5:5=♡ 09/16 23:35",
      "→ MBB200291: 撤回我在4樓的發言 09/16 23:43",
    ].join("\n") };
  };
  const result = await new PttzzzClient(gateway).getArticle({ article: key });
  if (!result.ok) throw new Error(result.error.message);
  const element = renderArticle(result.value);
  const parent = element.querySelector('[data-reply-id="reply:4"]')!;
  expect(parent.querySelector(":scope > .withdrawn")?.textContent).toBe("此回文已撤回");
  const child = parent.querySelector('[data-reply-id="reply:5"]')!;
  expect(child.querySelector(".reply-content")?.textContent).toBe("♥♡♥♡♥♡");
  const versions = [...child.querySelectorAll("details pre")].map(item => item.textContent?.split("\n").at(-1));
  expect(versions).toEqual(["♥♥♥♥♥", "♥♡♥♡♥", "♥♡♥♡♥♡"]);
  expect(element.textContent).not.toContain("^1:4=");
  expect(element.querySelector(".article-body")?.textContent).not.toContain("\x1b");
});
