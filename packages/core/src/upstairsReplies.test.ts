import { describe, expect, it } from "vitest";
import { aggregatePushes, normalizeThreadEvents } from "./pushAggregator.js";
import type { RawPush } from "./parser.js";

const row = (author: string, content: string, type: RawPush["type"] = "neutral", rawFloor?: number) =>
  ({ author, content, type, time: "09/08 12:00", ...(rawFloor === undefined ? {} : { rawFloor }) });
const parse = (...rows: ReturnType<typeof row>[]) => aggregatePushes(rows, "op");

describe("upstairs replies", () => {
  it("uses the immediately preceding raw event even within the same minute", () => {
    const result = parse(row("a", "原本的問題。"), row("b", "插入的問題。"), row("c", "回樓上：同意"));
    expect(result.pushes[2]).toMatchObject({ content: "同意", replyTo: "reply:2" });
  });

  it("maps the preceding source floor to its aggregated card", () => {
    const result = parse(row("a", "我認為"), row("a", "可以試試。"), row("b", "推樓上", "push"));
    expect(result.pushes).toHaveLength(1);
    expect(result.pushes[0]).toMatchObject({ sourceFloors: [1, 2], score: 1, pushVoters: ["b"] });
    expect(result).toMatchObject({ articleScore: 0, nativeArticleScore: 1 });
  });

  it("allows a vote with a separate visible body without interpreting its payload", () => {
    const result = parse(row("a", "問題。"), row("b", "推樓上 回12樓不是指令", "boo"));
    expect(result.pushes[0].score).toBe(1);
    expect(result.pushes[1]).toMatchObject({ replyTo: "reply:1", content: "回12樓不是指令" });
    expect(result).toMatchObject({ articleScore: 0, nativeArticleScore: -1 });
  });

  it.each(["推", "推1樓", "補充我在1樓說的：補充", "撤回我在1樓的發言"])("does not skip a control event: %s", (control) => {
    const result = parse(row("a", "原文。"), row("a", control), row("b", "推樓上", "push"));
    expect(result.pushes.at(-1)).toMatchObject({ author: "b", content: "推樓上", replyTo: null });
    expect(result.articleScore).toBe(1);
  });

  it("keeps first-event and missing-floor references as ordinary text", () => {
    expect(parse(row("a", "回樓上：沒有前文")).pushes[0]).toMatchObject({ content: "回樓上：沒有前文", replyTo: null });
    const result = parse(row("a", "原文。", "neutral", 8), row("b", "推樓上", "neutral", 10));
    expect(result.pushes[1]).toMatchObject({ content: "推樓上", replyTo: null });
    expect(result.pushes[0].score).toBe(0);
  });

  it.each(["推樓上的貓", "回樓上住戶", "我想推樓上", "噓樓上的貓", "我想噓樓上"])("does not parse ordinary or unsupported wording: %s", (content) => {
    const result = parse(row("a", "問題。"), row("b", content));
    expect(result.pushes[1]).toMatchObject({ content, replyTo: null });
    expect(result.pushes[0].score).toBe(0);
  });

  it("isolates an unresolved relative reply from the author's earlier target", () => {
    const result = parse(row("a", "問題。"), row("b", "回1樓：先回答"), row("c", "推"), row("b", "回樓上：再回答"), row("b", "繼續說明。"));
    expect(result.pushes).toHaveLength(3);
    expect(result.pushes[1]).toMatchObject({ content: "先回答", replyTo: "reply:1" });
    expect(result.pushes[2]).toMatchObject({ content: "回樓上：再回答\n繼續說明。", replyTo: null });
  });

  it("does not merge a relative reply into its own target", () => {
    const result = parse(row("a", "補一句"), row("a", "回樓上：是我自己說的"));
    expect(result.pushes).toHaveLength(2);
    expect(result.pushes[1].replyTo).toBe(result.pushes[0].id);
  });

  it("never redirects a vote after its original target is withdrawn", () => {
    const rows = [row("z", "更早的話。"), row("a", "目標。"), row("b", "推樓上")];
    expect(parse(...rows).pushes[1].score).toBe(1);
    const result = parse(...rows, row("a", "撤回我在2樓的發言"));
    expect(result.pushes[0].score).toBe(0);
    expect(result.pushes[1]).toMatchObject({ content: "推樓上", replyTo: null });
    expect(normalizeThreadEvents([...rows, row("a", "撤回我在2樓的發言")])[2]).toMatchObject({ content: "推樓上", visible: true });
  });

  it("does not reinterpret edit payloads or change a relative target on editing", () => {
    const rows = [row("a", "問題。"), row("b", "回樓上：原回答"), row("b", "更正我在2樓的說法：推樓上")];
    const result = parse(...rows);
    expect(result.pushes[1]).toMatchObject({ content: "推樓上", replyTo: "reply:1" });
    expect(result.pushes[0].score).toBe(0);
    expect(normalizeThreadEvents(rows)[1]).toMatchObject({ content: "推樓上", visible: true });
  });

  it("preserves an edited body when its target is later withdrawn", () => {
    const rows = [row("a", "問題。"), row("b", "回樓上：原回答"), row("b", "更正我在2樓的說法：推樓上"), row("a", "撤回我在1樓的發言")];
    const result = parse(...rows);
    expect(result.pushes[0]).toMatchObject({ content: "推樓上", replyTo: null, score: 0 });
    expect(normalizeThreadEvents(rows)[1]).toMatchObject({ content: "推樓上", visible: true });
  });

  it.each([
    ["補充我在2樓說的：補充回答", "原回答\n補充回答"],
    ["更正我在2樓的說法：^0:1=新", "新回答"],
  ])("keeps body-relative editing after target withdrawal: %s", (command, content) => {
    const rows = [
      row("a", "問題。"),
      row("b", "回樓上：原回答"),
      row("b", command),
      row("a", "撤回我在1樓的發言"),
    ];
    expect(normalizeThreadEvents(rows)[1]).toMatchObject({ content, visible: true });
    expect(parse(...rows).pushes[0]).toMatchObject({ content, replyTo: null });
  });
});

describe("upstairs boos", () => {
  it("votes against the preceding merged source and hides the pure vote", () => {
    const rows = [row("a", "我認為"), row("a", "可以試試。"), row("b", "噓樓上", "boo")];
    const result = parse(...rows);
    expect(result.pushes).toHaveLength(1);
    expect(result.pushes[0]).toMatchObject({ sourceFloors: [1, 2], score: -1, booVoters: ["b"] });
    expect(result).toMatchObject({ articleScore: 0, nativeArticleScore: -1 });
    expect(normalizeThreadEvents(rows)[2]).toMatchObject({ visible: false });
  });

  it.each(["噓樓上 回12樓不是指令", "噓樓上：回12樓不是指令", "噓樓上: 回12樓不是指令"])(
    "uses the textual vote direction and keeps its body opaque: %s", (content) => {
      const result = parse(row("a", "問題。"), row("b", content, "push"));
      expect(result.pushes[0]).toMatchObject({ score: -1, booVoters: ["b"] });
      expect(result.pushes[1]).toMatchObject({ replyTo: "reply:1", content: "回12樓不是指令" });
      expect(result).toMatchObject({ articleScore: 0, nativeArticleScore: 1 });
    },
  );

  it.each(["推", "噓1樓", "撤回我在1樓的發言"])("does not skip hidden events: %s", (control) => {
    const result = parse(row("a", "原文。"), row("a", control), row("b", "噓樓上", "boo"));
    expect(result.pushes.at(-1)).toMatchObject({ content: "噓樓上", replyTo: null });
    expect(result.articleScore).toBe(-1);
  });

  it("preserves first-event and missing-floor boos", () => {
    expect(parse(row("a", "噓樓上", "boo")).pushes[0]).toMatchObject({ content: "噓樓上", replyTo: null });
    const result = parse(row("a", "原文。", "neutral", 8), row("b", "噓樓上", "boo", 10));
    expect(result.pushes[1]).toMatchObject({ content: "噓樓上", replyTo: null });
    expect(result.pushes[0].score).toBe(0);
  });

  it("does not inherit an earlier reply target when upstairs is invalid", () => {
    const result = parse(row("a", "問題。"), row("b", "回1樓：先回答"), row("c", "推"), row("b", "噓樓上"), row("b", "繼續說明。"));
    expect(result.pushes[2]).toMatchObject({ content: "噓樓上\n繼續說明。", replyTo: null });
  });

  it("deduplicates votes and supports explicit vote withdrawal", () => {
    const rows = [row("a", "問題。"), row("b", "噓樓上"), row("b", "噓1樓")];
    expect(parse(...rows).pushes[0]).toMatchObject({ score: -1, booVoters: ["b"] });
    expect(parse(...rows, row("b", "撤回我對1樓的噓")).pushes[0]).toMatchObject({ score: 0, booVoters: [] });
  });

  it("restores ordinary text without redirecting after target withdrawal", () => {
    const rows = [row("z", "更早的話。"), row("a", "目標。"), row("b", "噓樓上", "boo"), row("a", "撤回我在2樓的發言")];
    const result = parse(...rows);
    expect(result.pushes[0].score).toBe(0);
    expect(result.pushes[1]).toMatchObject({ content: "噓樓上", replyTo: null });
    expect(result.articleScore).toBe(-1);
    expect(normalizeThreadEvents(rows)[2]).toMatchObject({ content: "噓樓上", visible: true });
  });
});
