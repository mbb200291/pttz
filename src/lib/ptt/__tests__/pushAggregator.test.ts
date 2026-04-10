import { describe, it, expect } from "vitest";
import { aggregatePushes, calcArticleScore } from "../pushAggregator";
import type { ArticleEditNote, RawPush } from "../parser";

const OP = "opUser";

type AnchoredRawPush = RawPush & {
  anchorOffset?: number;
  rawFloor?: number;
};

function push(
  author: string,
  content: string,
  time = "01/01 12:00",
  type: "push" | "boo" | "neutral" = "push",
  anchorOffset?: number,
  rawFloor?: number,
): AnchoredRawPush {
  return { type, author, content, time, anchorOffset, rawFloor };
}

// ─── 基本合併 ──────────────────────────────────────────────────────────────────

describe("單則推文不聚合", () => {
  it("單則直接輸出", () => {
    const thread = aggregatePushes([push("alice", "Hello")], OP);
    expect(thread.pushes).toHaveLength(1);
    expect(thread.pushes[0].content).toBe("Hello");
    expect(thread.pushes[0].author).toBe("alice");
  });
});

describe("連續同作者推文合併", () => {
  it("兩則連續推文合併成一則", () => {
    const raw = [push("alice", "Hello"), push("alice", " World")];
    const thread = aggregatePushes(raw, OP);
    expect(thread.pushes.filter((r) => r.type !== "edit")).toHaveLength(1);
    expect(thread.pushes[0].content).toBe("Hello World");
  });

  it("中間有他人則不連續", () => {
    const raw = [push("alice", "Hello"), push("bob", "Hi"), push("alice", "World")];
    const thread = aggregatePushes(raw, OP);
    expect(thread.pushes.filter((r) => r.type !== "edit")).toHaveLength(3);
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
    const result = aggregatePushes(raw, OP).pushes;
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
    const result = aggregatePushes(raw, OP).pushes;
    const alicePushes = result.filter((r) => r.author === "alice");
    expect(alicePushes).toHaveLength(2);
  });

  it("前則塞滿但時間間隔超過 5 分鐘 → 不合併", () => {
    const raw = [
      push("alice", full45, "01/01 12:00"),
      push("bob", "插入"),
      push("alice", "接續", "01/01 12:10"),
    ];
    const result = aggregatePushes(raw, OP).pushes;
    const alicePushes = result.filter((r) => r.author === "alice");
    expect(alicePushes).toHaveLength(2);
  });

  it("前則塞滿但結尾是驚嘆號或問號 → 不合併", () => {
    const raw = [
      push("alice", `${full45}!`, "01/01 12:00"),
      push("bob", "插入"),
      push("alice", "接續", "01/01 12:01"),
    ];
    const result = aggregatePushes(raw, OP).pushes;
    expect(result.filter((r) => r.author === "alice")).toHaveLength(2);
  });
});

// ─── 嵌套回覆 ─────────────────────────────────────────────────────────────────

describe("嵌套回覆識別", () => {
  it("「回x樓：...」以原始樓號對應聚合後回文", () => {
    const raw = [
      push("alice", "第一段", "01/01 12:00", "push", 10, 1),
      push("alice", "第二段", "01/01 12:01", "push", 20, 2),
      push("bob", "回2樓：回覆alice", "01/01 12:02", "push", 30, 3),
    ];
    const thread = aggregatePushes(raw, OP);
    const alicePush = thread.pushes.find((r) => r.author === "alice")!;
    const bobPush = thread.pushes.find((r) => r.author === "bob")!;
    expect(bobPush.replyTo).toBe(alicePush.id);
    expect(bobPush.content).toBe("回覆alice");
    expect(alicePush.sourceFloors).toEqual([1, 2]);
  });

  it("未包含「回x樓」則 replyTo 為 null", () => {
    const raw = [push("alice", "普通推文")];
    const thread = aggregatePushes(raw, OP);
    expect(thread.pushes[0].replyTo).toBeNull();
  });
});

// ─── OP 標示 ──────────────────────────────────────────────────────────────────

describe("原 po 標示", () => {
  it("推文作者 === 文章作者 → isOP=true", () => {
    const raw = [push(OP, "我是原 po"), push("other", "路人")];
    const thread = aggregatePushes(raw, OP);
    expect(thread.pushes.find((r) => r.author === OP)!.isOP).toBe(true);
    expect(thread.pushes.find((r) => r.author === "other")!.isOP).toBe(false);
  });
});

describe("IP metadata", () => {
  it("keeps unique IP addresses on aggregated pushes", () => {
    const raw: RawPush[] = [
      {
        type: "push",
        author: "alice",
        content: "第一段",
        ipAddress: "1.1.1.1",
        time: "01/01 12:00",
      },
      {
        type: "push",
        author: "alice",
        content: "第二段",
        ipAddress: "1.1.1.1",
        time: "01/01 12:01",
      },
      {
        type: "push",
        author: "bob",
        content: "另一則",
        ipAddress: "2.2.2.2",
        time: "01/01 12:02",
      },
    ];

    const result = aggregatePushes(raw, OP).pushes;

    expect(result.find((r) => r.author === "alice")?.ipAddresses).toEqual([
      "1.1.1.1",
    ]);
    expect(result.find((r) => r.author === "bob")?.ipAddresses).toEqual([
      "2.2.2.2",
    ]);
  });
});

describe("編輯註記", () => {
  function editNote(anchorOffset: number, content: string): ArticleEditNote {
    return {
      marker: "※ 編輯:",
      content,
      rawBlock: `※ 編輯: author\n${content}`,
      contentAnchorOffset: anchorOffset,
      markerOffset: anchorOffset,
    };
  }

  it("uses comparable source offsets to attach edit notes to the nearest previous aggregated reply", () => {
    const raw = [
      push("alice", "第一則", "01/01 12:00", "push", 100),
      push("bob", "第二則", "01/01 12:01", "push", 200),
      push("carol", "第三則", "01/01 12:02", "push", 300),
    ];

    const thread = aggregatePushes(raw, OP, [
      editNote(50, "文章說明"),
      editNote(250, "第二則後補充"),
      editNote(350, "第三則後補充"),
    ]);

    expect(
      thread.pushes.filter((r) => r.type !== "edit").map((r) => r.anchorOrder),
    ).toEqual([100, 200, 300]);
    expect(thread.articleNotes).toEqual([
      expect.objectContaining({ content: "文章說明" }),
    ]);
    const bobChildren = thread.pushes.filter(
      (r) => r.replyTo === thread.pushes.find((node) => node.author === "bob")?.id,
    );
    const carolChildren = thread.pushes.filter(
      (r) =>
        r.replyTo === thread.pushes.find((node) => node.author === "carol")?.id,
    );
    expect(bobChildren[0]).toMatchObject({ type: "edit", content: "第二則後補充" });
    expect(carolChildren[0]).toMatchObject({
      type: "edit",
      content: "第三則後補充",
    });
  });

  it("tracks the latest source offset for merged same-author groups", () => {
    const raw = [
      push("alice", "a".repeat(44), "01/01 12:00", "push", 100),
      push("bob", "插入一句", "01/01 12:01", "push", 150),
      push("alice", "接續", "01/01 12:02", "push", 200),
    ];

    const thread = aggregatePushes(raw, OP, [editNote(250, "合併後補充")]);

    expect(thread.pushes.find((r) => r.author === "alice")?.anchorOrder).toBe(
      200,
    );
    const aliceNode = thread.pushes.find((r) => r.author === "alice")!;
    const bobNode = thread.pushes.find((r) => r.author === "bob")!;
    expect(
      thread.pushes.filter((r) => r.replyTo === aliceNode.id && r.type === "edit"),
    ).toHaveLength(1);
    expect(
      thread.pushes.filter((r) => r.replyTo === bobNode.id && r.type === "edit"),
    ).toHaveLength(0);
  });

  it("keeps article-level notes when there is no previous reply", () => {
    const thread = aggregatePushes([], OP, [editNote(1, "正文補充")]);

    expect(thread.articleNotes).toEqual([
      expect.objectContaining({ content: "正文補充" }),
    ]);
    expect(thread.pushes).toHaveLength(0);
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
    const thread = aggregatePushes(raw, OP);
    expect(calcArticleScore(thread.pushes)).toBe(1); // 2 push - 1 boo
  });

  it("嵌套推文的 score 正確累計", () => {
    const raw = [
      push("alice", "第一樓"),
      push("b", "回1樓：好", "01/01 12:01", "push"),
      push("c", "回1樓：不好", "01/01 12:02", "boo"),
    ];
    const thread = aggregatePushes(raw, OP);
    const alicePush = thread.pushes.find((r) => r.author === "alice")!;
    expect(alicePush.score).toBe(0); // 1 push + 1 boo = 0
  });
});
