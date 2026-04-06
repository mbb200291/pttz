import { describe, it, expect } from "vitest";
import { aggregatePushes, calcArticleScore } from "../pushAggregator";
import type { RawPush } from "../parser";

const OP = "opUser";

function push(author: string, content: string, time = "01/01 12:00", type: "push" | "boo" | "neutral" = "push"): RawPush {
  return { type, author, content, time };
}

// ─── 基本合併 ──────────────────────────────────────────────────────────────────

describe("單則推文不聚合", () => {
  it("單則直接輸出", () => {
    const result = aggregatePushes([push("alice", "Hello")], OP);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("Hello");
    expect(result[0].author).toBe("alice");
  });
});

describe("連續同作者推文合併", () => {
  it("兩則連續推文合併成一則", () => {
    const raw = [push("alice", "Hello"), push("alice", " World")];
    const result = aggregatePushes(raw, OP);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("Hello World");
  });

  it("中間有他人則不連續", () => {
    const raw = [push("alice", "Hello"), push("bob", "Hi"), push("alice", "World")];
    const result = aggregatePushes(raw, OP);
    expect(result).toHaveLength(3);
  });
});

describe("不連續推文的合併條件", () => {
  // 塞滿：製造一個接近 45 bytes 的內容
  const full45 = "a".repeat(44); // 44 ASCII = 44 bytes，算塞滿

  it("前則塞滿且無句號且時間間隔小 → 合併", () => {
    const raw = [
      push("alice", full45, "01/01 12:00"),
      push("bob", "插入一句"),
      push("alice", "接續", "01/01 12:03"),
    ];
    const result = aggregatePushes(raw, OP);
    // alice 的兩則應合併成一則
    const alicePushes = result.filter((r) => r.author === "alice");
    expect(alicePushes).toHaveLength(1);
    expect(alicePushes[0].content).toBe(full45 + "接續");
  });

  it("前則塞滿但結尾是句號 → 不合併", () => {
    const raw = [
      push("alice", full45 + "。", "01/01 12:00"),
      push("bob", "插入"),
      push("alice", "接續", "01/01 12:01"),
    ];
    const result = aggregatePushes(raw, OP);
    const alicePushes = result.filter((r) => r.author === "alice");
    expect(alicePushes).toHaveLength(2);
  });

  it("前則塞滿但時間間隔超過 5 分鐘 → 不合併", () => {
    const raw = [
      push("alice", full45, "01/01 12:00"),
      push("bob", "插入"),
      push("alice", "接續", "01/01 12:10"),
    ];
    const result = aggregatePushes(raw, OP);
    const alicePushes = result.filter((r) => r.author === "alice");
    expect(alicePushes).toHaveLength(2);
  });
});

// ─── 嵌套回覆 ─────────────────────────────────────────────────────────────────

describe("嵌套回覆識別", () => {
  it("「回1樓：...」應設 replyTo", () => {
    const raw = [
      push("alice", "第一樓"),       // floor 0
      push("bob", "回1樓：回覆alice"),
    ];
    const result = aggregatePushes(raw, OP);
    const alicePush = result.find((r) => r.author === "alice")!;
    const bobPush = result.find((r) => r.author === "bob")!;
    expect(bobPush.replyTo).toBe(alicePush.id);
    expect(bobPush.content).toBe("回覆alice");
  });

  it("未包含「回x樓」則 replyTo 為 null", () => {
    const raw = [push("alice", "普通推文")];
    const result = aggregatePushes(raw, OP);
    expect(result[0].replyTo).toBeNull();
  });
});

// ─── OP 標示 ──────────────────────────────────────────────────────────────────

describe("原 po 標示", () => {
  it("推文作者 === 文章作者 → isOP=true", () => {
    const raw = [push(OP, "我是原 po"), push("other", "路人")];
    const result = aggregatePushes(raw, OP);
    expect(result.find((r) => r.author === OP)!.isOP).toBe(true);
    expect(result.find((r) => r.author === "other")!.isOP).toBe(false);
  });
});

// ─── 推/噓計分 ────────────────────────────────────────────────────────────────

describe("推文評分", () => {
  it("文章層級：push+1, boo-1, neutral 不計", () => {
    const raw = [
      push("a", "推", "01/01 12:00", "push"),
      push("b", "推", "01/01 12:01", "push"),
      push("c", "噓", "01/01 12:02", "boo"),
    ];
    const result = aggregatePushes(raw, OP);
    expect(calcArticleScore(result)).toBe(1); // 2 push - 1 boo
  });

  it("嵌套推文的 score 正確累計", () => {
    const raw = [
      push("alice", "第一樓"),
      push("b", "回1樓：好", "01/01 12:01", "push"),
      push("c", "回1樓：不好", "01/01 12:02", "boo"),
    ];
    const result = aggregatePushes(raw, OP);
    const alicePush = result.find((r) => r.author === "alice")!;
    expect(alicePush.score).toBe(0); // 1 push + 1 boo = 0
  });
});
