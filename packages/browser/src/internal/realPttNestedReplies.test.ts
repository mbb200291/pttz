import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePushBuffer } from "@pttzzz/core/internal";
import { parsePartialScreen } from "./terminalDriver.js";

const relative = "src/internal/__fixtures__/real-ptt/2026-09-13/nested-replies-1gfWDlNT";
const local = resolve(process.cwd(), relative);
const root = existsSync(local) ? local : resolve(process.cwd(), "packages/browser", relative);
const read = (name: string) => readFileSync(resolve(root, name), "utf8");
interface CaptureCase {
  name: string;
  screen: string;
  rawCount: number;
  sentContent?: string;
  expected: Array<{
    id: string;
    sourceFloors: number[];
    replyTo: string | null;
    content: string;
    score: number;
    pushVoters: string[];
    booVoters: string[];
  }>;
}
const cases: CaptureCase[] = JSON.parse(read("cases.json"));

describe("real PTT #1gfWDlNT nested reply captures (offline)", () => {
  it.each(cases)("parses $name with exact targets, content and voter state", (item) => {
    const partial = parsePartialScreen(read(item.screen));
    expect(partial).toMatchObject({ board: "Test", title: "test test", score: 1 });
    expect(partial?.pushes?.map((push) => ({
      id: push.id,
      sourceFloors: push.sourceFloors,
      replyTo: push.replyTo,
      content: push.content,
      score: push.score,
      pushVoters: push.pushVoters,
      booVoters: push.booVoters,
    }))).toEqual(item.expected);
    expect(parsePushBuffer(read(item.screen))).toHaveLength(item.rawCount);
  });

  it.each(cases.slice(1).map((item, index) => ({ ...item, before: cases[index].screen })))(
    "reads back exactly one new neutral event for $name",
    (item) => {
      const before = parsePushBuffer(read(item.before));
      const after = parsePushBuffer(read(item.screen));
      expect(after).toHaveLength(before.length + 1);
      expect(after.slice(0, -1)).toEqual(before);
      expect(after.at(-1)).toMatchObject({
        author: "TEST_USER", type: "neutral", content: item.sentContent,
      });
      expect(after.filter((push) => push.author === "TEST_USER" && push.content === item.sentContent)).toHaveLength(1);
    },
  );

  it("distinguishes a type menu from the cooldown's direct neutral input", () => {
    expect(read("015.txt")).toContain("1.值得推薦 2.給它噓聲 3.只加");
    expect(read("020.txt")).toContain("時間太近, 使用 → 加註方式");
    expect(read("020.txt")).not.toContain("1.值得推薦");
    const events: Array<{ type: string; command?: string }> = JSON.parse(read("events.json"));
    const start = events.findIndex((event) => event.command === "reply-level-2-entry");
    expect(events.slice(start).filter((event) => event.type === "action").slice(0, 4).map((event) => event.command)).toEqual([
      "reply-level-2-entry", "reply-level-2-content", "reply-level-2-confirm", "reply-level-2-readback",
    ]);
  });
});
