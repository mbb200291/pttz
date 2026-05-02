import { describe, it, expect } from "vitest";
import { aggregatePushes, calcArticleScore, detectVote } from "../pushAggregator";
import type { ArticleEditRecord, OpEditedReplySegment, RawPush } from "../parser";

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
  const full45 = "a".repeat(44);

  it("短的連續同作者推文未用終止符時合併為多行", () => {
    const raw = [push("alice", "Hello"), push("alice", "World")];
    const thread = aggregatePushes(raw, OP);
    const alicePushes = thread.pushes.filter((r) => r.author === "alice");
    expect(alicePushes).toHaveLength(1);
    expect(alicePushes[0].content).toBe("Hello\nWorld");
  });

  it("連續同作者且前則塞滿且未用終止符時合併", () => {
    const raw = [push("alice", full45), push("alice", "接續")];
    const thread = aggregatePushes(raw, OP);
    const alicePushes = thread.pushes.filter((r) => r.author === "alice");
    expect(alicePushes).toHaveLength(1);
    expect(alicePushes[0].content).toBe(`${full45}接續`);
  });

  it("PTT 視覺上貼近 IP 欄的中文推文視為塞滿並合併", () => {
    const raw = [
      {
        ...push("neoa01", "新聞：專家：「跑山獸的存在」讓7.5億消", "04/11 23:01"),
        isFullWidthLine: true,
      },
      push("neoa01", "防計畫像詐騙　林教官神隱5天", "04/11 23:01"),
    ];
    const thread = aggregatePushes(raw, OP);
    const neoaPushes = thread.pushes.filter((r) => r.author === "neoa01");

    expect(neoaPushes).toHaveLength(1);
    expect(neoaPushes[0].content).toBe(
      "新聞：專家：「跑山獸的存在」讓7.5億消防計畫像詐騙　林教官神隱5天",
    );
  });

  it("parser 標記為未塞滿時，同作者連續合併後保留為獨立行", () => {
    const raw = [
      { ...push("neoa01", "短句", "04/11 23:01"), isFullWidthLine: false },
      push("neoa01", "下一句", "04/11 23:01"),
    ];
    const thread = aggregatePushes(raw, OP);
    const neoaPushes = thread.pushes.filter((r) => r.author === "neoa01");

    expect(neoaPushes).toHaveLength(1);
    expect(neoaPushes[0].content).toBe("短句\n下一句");
  });

  it("連續同作者且前則以串接符號結尾時合併並移除串接符號", () => {
    const raw = [push("alice", "Hello ||"), push("alice", "World")];
    const thread = aggregatePushes(raw, OP);
    const alicePushes = thread.pushes.filter((r) => r.author === "alice");
    expect(alicePushes).toHaveLength(1);
    expect(alicePushes[0].content).toBe("Hello\nWorld");
  });

  it("中間有他人但時間間隔小且前則未用終止符時仍合併", () => {
    const raw = [push("alice", "Hello"), push("bob", "Hi"), push("alice", "World")];
    const thread = aggregatePushes(raw, OP);
    const alicePushes = thread.pushes.filter((r) => r.author === "alice");
    expect(alicePushes).toHaveLength(1);
    expect(alicePushes[0].content).toBe("Hello\nWorld");
  });
});

describe("不連續推文的合併條件", () => {
  const full45 = "a".repeat(44);

  it("前則未用終止符且時間間隔小 → 合併為多行", () => {
    const raw = [
      push("alice", "短句", "01/01 12:00"),
      push("bob", "插入一句"),
      push("alice", "接續", "01/01 12:03"),
    ];
    const result = aggregatePushes(raw, OP).pushes;
    const alicePushes = result.filter((r) => r.author === "alice");
    expect(alicePushes).toHaveLength(1);
    expect(alicePushes[0].content).toBe("短句\n接續");
  });

  it("前則塞滿且未用終止符時，下一行直接接續該行", () => {
    const raw = [
      push("alice", full45, "01/01 12:00"),
      push("bob", "插入一句"),
      push("alice", "接續", "01/01 12:03"),
    ];
    const result = aggregatePushes(raw, OP).pushes;
    const alicePushes = result.filter((r) => r.author === "alice");
    expect(alicePushes).toHaveLength(1);
    expect(alicePushes[0].content).toBe(`${full45}接續`);
  });

  it("前則結尾是終止符 → 不合併", () => {
    const raw = [
      push("alice", "短句。", "01/01 12:00"),
      push("bob", "插入"),
      push("alice", "接續", "01/01 12:01"),
    ];
    const result = aggregatePushes(raw, OP).pushes;
    const alicePushes = result.filter((r) => r.author === "alice");
    expect(alicePushes).toHaveLength(2);
  });

  it("前則未用終止符但時間間隔超過 5 分鐘 → 不合併", () => {
    const raw = [
      push("alice", "短句", "01/01 12:00"),
      push("bob", "插入"),
      push("alice", "接續", "01/01 12:10"),
    ];
    const result = aggregatePushes(raw, OP).pushes;
    const alicePushes = result.filter((r) => r.author === "alice");
    expect(alicePushes).toHaveLength(2);
  });

  it("前則結尾是驚嘆號或問號 → 不合併", () => {
    const raw = [
      push("alice", "短句!", "01/01 12:00"),
      push("bob", "插入"),
      push("alice", "接續", "01/01 12:01"),
    ];
    const result = aggregatePushes(raw, OP).pushes;
    expect(result.filter((r) => r.author === "alice")).toHaveLength(2);
  });

  it("前則結尾是分號 → 不合併", () => {
    const raw = [
      push("alice", "短句；", "01/01 12:00"),
      push("bob", "插入"),
      push("alice", "接續", "01/01 12:01"),
    ];
    const result = aggregatePushes(raw, OP).pushes;
    expect(result.filter((r) => r.author === "alice")).toHaveLength(2);
  });

  it("不連續但前則以串接符號結尾且時間間隔小 → 合併並移除串接符號", () => {
    const raw = [
      push("alice", "Hello||", "01/01 12:00"),
      push("bob", "插入"),
      push("alice", "World", "01/01 12:03"),
    ];
    const result = aggregatePushes(raw, OP).pushes;
    const alicePushes = result.filter((r) => r.author === "alice");
    expect(alicePushes).toHaveLength(1);
    expect(alicePushes[0].content).toBe("Hello\nWorld");
  });

  it("前則有終止符但後方有串接符號時仍合併", () => {
    const raw = [
      push("alice", "Hello.||", "01/01 12:00"),
      push("bob", "插入"),
      push("alice", "World", "01/01 12:03"),
    ];
    const result = aggregatePushes(raw, OP).pushes;
    const alicePushes = result.filter((r) => r.author === "alice");
    expect(alicePushes).toHaveLength(1);
    expect(alicePushes[0].content).toBe("Hello.\nWorld");
  });
});

// ─── 嵌套回覆 ─────────────────────────────────────────────────────────────────

describe("嵌套回覆識別", () => {
  it("「回x樓：...」以原始樓號對應聚合後回文", () => {
    const raw = [
      push("alice", "第一段||", "01/01 12:00", "push", 10, 1),
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

  it.each([
    ["回三樓：中文數字", "中文數字"],
    ["回 3f 英文樓層", "英文樓層"],
    ["回3F 大寫樓層", "大寫樓層"],
    ["TO3f 無空白英文寫法", "無空白英文寫法"],
    ["TO 3f 英文寫法", "英文寫法"],
    ["reply to 3f 長英文寫法", "長英文寫法"],
    [">>3f 類 imageboard 寫法", "類 imageboard 寫法"],
  ])("支援回覆樓層變體：%s", (content, strippedContent) => {
    const raw = [
      push("floor1", "第一樓", "01/01 12:00", "push", 10, 1),
      push("floor2", "第二樓", "01/01 12:01", "push", 20, 2),
      push("floor3", "第三樓", "01/01 12:02", "push", 30, 3),
      push("bob", content, "01/01 12:03", "push", 40, 4),
    ];
    const thread = aggregatePushes(raw, OP);
    const target = thread.pushes.find((r) => r.author === "floor3")!;
    const bobPush = thread.pushes.find((r) => r.author === "bob")!;

    expect(bobPush.replyTo).toBe(target.id);
    expect(bobPush.content).toBe(strippedContent);
  });

  it("目標樓層不存在時維持第一層回文", () => {
    const raw = [
      push("alice", "第一樓", "01/01 12:00", "push", 10, 1),
      push("bob", "回9999F 樓層不存在", "01/01 12:01", "push", 20, 2),
    ];
    const thread = aggregatePushes(raw, OP);
    const bobPush = thread.pushes.find((r) => r.author === "bob")!;

    expect(bobPush.replyTo).toBeNull();
    expect(bobPush.content).toBe("回9999F 樓層不存在");
  });

  it("回覆樓層是自己時維持第一層並保留原文", () => {
    const raw = [
      push("alice", "第一樓", "01/01 12:00", "push", 10, 1),
      push("bob", "回2樓 這是自己這樓", "01/01 12:01", "push", 20, 2),
    ];
    const thread = aggregatePushes(raw, OP);
    const bobPush = thread.pushes.find((r) => r.author === "bob")!;

    expect(bobPush.replyTo).toBeNull();
    expect(bobPush.content).toBe("回2樓 這是自己這樓");
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

  it("文章作者含暱稱時仍以帳號 id 標示原 po", () => {
    const raw = [push("askz0", "Ok?"), push("other", "路人")];
    const thread = aggregatePushes(raw, "askz0 (askz0)");

    expect(thread.pushes.find((r) => r.author === "askz0")!.isOP).toBe(true);
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
  function opEditedReply(
    anchorOffset: number,
    content: string,
  ): OpEditedReplySegment {
    return {
      marker: "作者編輯",
      content,
      rawBlock: content,
      contentAnchorOffset: anchorOffset,
      markerOffset: anchorOffset,
    };
  }

  function editRecord(anchorOffset: number, content: string): ArticleEditRecord {
    return {
      marker: "※ 編輯:",
      content,
      rawBlock: `※ 編輯: ${content}`,
      markerOffset: anchorOffset,
    };
  }

  it("uses comparable source offsets to attach OP edited replies to the nearest previous aggregated reply", () => {
    const raw = [
      push("alice", "第一則", "01/01 12:00", "push", 100),
      push("bob", "第二則", "01/01 12:01", "push", 200),
      push("carol", "第三則", "01/01 12:02", "push", 300),
    ];

    const thread = aggregatePushes(raw, OP, [
      opEditedReply(50, "文章說明"),
      opEditedReply(250, "第二則後補充"),
      opEditedReply(350, "第三則後補充"),
    ]);

    expect(
      thread.pushes.filter((r) => r.type !== "edit").map((r) => r.anchorOrder),
    ).toEqual([100, 200, 300]);
    expect(thread.articleNotes).toEqual([]);
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

    const thread = aggregatePushes(raw, OP, [opEditedReply(250, "合併後補充")]);

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

  it("keeps article-level edit records separate from OP edited replies", () => {
    const thread = aggregatePushes(
      [],
      OP,
      [opEditedReply(1, "正文補充")],
      [editRecord(2, "author (1.2.3.4), 04/09/2026 10:02:03")],
    );

    expect(thread.articleNotes).toEqual([
      expect.objectContaining({ content: "author (1.2.3.4), 04/09/2026 10:02:03" }),
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

// ─── detectVote 單元測試 ───────────────────────────────────────────────────────

describe("detectVote", () => {
  it("偵測「推X樓」格式", () => {
    expect(detectVote("推3樓")).toEqual({ targetFloor: 3, direction: "push" });
    expect(detectVote("推三樓")).toEqual({ targetFloor: 3, direction: "push" });
  });

  it("偵測「X樓推一個」格式", () => {
    expect(detectVote("3樓推一個")).toEqual({ targetFloor: 3, direction: "push" });
    expect(detectVote("三樓推一個")).toEqual({ targetFloor: 3, direction: "push" });
  });

  it("偵測「噓X樓」格式", () => {
    expect(detectVote("噓5樓")).toEqual({ targetFloor: 5, direction: "boo" });
    expect(detectVote("噓五樓")).toEqual({ targetFloor: 5, direction: "boo" });
  });

  it("非投票內容返回 null", () => {
    expect(detectVote("普通推文內容")).toBeNull();
    expect(detectVote("回3樓：討論")).toBeNull();
  });
});

// ─── 投票者收集 ───────────────────────────────────────────────────────────────

describe("投票者收集", () => {
  it("「推X樓」推文使作者出現在目標的 pushVoters", () => {
    const raw = [
      push("alice", "第一樓", "01/01 12:00", "push", 10, 1),
      push("bob", "推1樓", "01/01 12:01", "push", 20, 2),
    ];
    const thread = aggregatePushes(raw, OP);
    const alicePush = thread.pushes.find((r) => r.author === "alice")!;
    expect(alicePush.pushVoters).toEqual(["bob"]);
    expect(alicePush.booVoters).toEqual([]);
  });

  it("「噓X樓」推文使作者出現在目標的 booVoters", () => {
    const raw = [
      push("alice", "第一樓", "01/01 12:00", "push", 10, 1),
      push("bob", "噓1樓", "01/01 12:01", "boo", 20, 2),
    ];
    const thread = aggregatePushes(raw, OP);
    const alicePush = thread.pushes.find((r) => r.author === "alice")!;
    expect(alicePush.pushVoters).toEqual([]);
    expect(alicePush.booVoters).toEqual(["bob"]);
  });

  it("同作者對同一推文投票兩次「推」只出現一次", () => {
    const raw = [
      push("alice", "第一樓", "01/01 12:00", "push", 10, 1),
      push("bob", "推1樓", "01/01 12:01", "push", 20, 2),
      push("bob", "推1樓讚！", "01/01 12:02", "push", 30, 3),
    ];
    const thread = aggregatePushes(raw, OP);
    const alicePush = thread.pushes.find((r) => r.author === "alice")!;
    expect(alicePush.pushVoters).toEqual(["bob"]);
  });

  it("同作者先「推」後「噓」→ 移出 pushVoters，加入 booVoters", () => {
    const raw = [
      push("alice", "第一樓", "01/01 12:00", "push", 10, 1),
      push("bob", "推1樓", "01/01 12:01", "push", 20, 2),
      push("bob", "噓1樓", "01/01 12:02", "boo", 30, 3),
    ];
    const thread = aggregatePushes(raw, OP);
    const alicePush = thread.pushes.find((r) => r.author === "alice")!;
    expect(alicePush.pushVoters).toEqual([]);
    expect(alicePush.booVoters).toEqual(["bob"]);
  });

  it("一般非投票推文不影響 voters", () => {
    const raw = [
      push("alice", "第一樓", "01/01 12:00", "push", 10, 1),
      push("bob", "我只是路過", "01/01 12:01", "push", 20, 2),
    ];
    const thread = aggregatePushes(raw, OP);
    const alicePush = thread.pushes.find((r) => r.author === "alice")!;
    expect(alicePush.pushVoters).toEqual([]);
    expect(alicePush.booVoters).toEqual([]);
  });
});
