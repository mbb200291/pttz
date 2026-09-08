import { describe, it, expect } from "vitest";
import {
  aggregateThreadSnapshot,
  aggregatePushes,
  calcArticleScore,
  detectArticleVote,
  detectVote,
  normalizeThreadEvents,
  normalizePttId,
} from "./pushAggregator.js";
import { parsePushBuffer } from "./parser.js";
import type { ArticleEditRecord, OpEditedReplySegment, RawPush } from "./parser.js";

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

describe("stable reply identity", () => {
  it("anchors deterministic ids to the first immutable source floor", () => {
    const input = [
      push("alice", "first", "08/12 22:40", "neutral", 10, 1),
      push("alice", "second.", "08/12 22:41", "neutral", 20, 2),
    ];

    const first = aggregatePushes(input, OP).pushes[0].id;
    const second = aggregatePushes(input, OP).pushes[0].id;

    expect(first).toBe("reply:1");
    expect(second).toBe(first);
    expect(aggregatePushes([input[0]], OP).pushes[0].id).toBe("reply:1");
  });

  it("keeps the anchor id when continuation adds another source floor", () => {
    const partial = aggregatePushes([
      push("alice", "first", "08/12 22:40", "neutral", 10, 1),
    ], OP).pushes[0];
    const final = aggregatePushes([
      push("alice", "first", "08/12 22:40", "neutral", 10, 1),
      push("alice", "second.", "08/12 22:41", "neutral", 20, 2),
    ], OP).pushes[0];

    expect(partial.id).toBe("reply:1");
    expect(final).toMatchObject({ id: "reply:1", sourceFloors: [1, 2] });
  });

  it("keeps identity when an edit payload contains a terminator", () => {
    const before = aggregatePushes([
      push("alice", "first", "08/12 22:40", "neutral", 10, 1),
      push("alice", "second.", "08/12 22:41", "neutral", 20, 2),
    ], OP).pushes[0];
    const edited = aggregatePushes([
      push("alice", "first", "08/12 22:40", "neutral", 10, 1),
      push("alice", "second.", "08/12 22:41", "neutral", 20, 2),
      push("alice", "更正我在1樓發言：first edited.", "08/12 22:42", "neutral", 30, 3),
    ], OP).pushes[0];

    expect(edited).toMatchObject({ id: before.id, sourceFloors: [1, 2] });
  });

  it("does not recycle a withdrawn leading reply id for the following card", () => {
    const thread = aggregatePushes([
      push("alice", "withdraw me.", "08/12 22:40", "neutral", 10, 1),
      push("bob", "keep me.", "08/12 22:41", "neutral", 20, 2),
      push("alice", "撤回我在1樓的發言", "08/12 22:42", "neutral", 30, 3),
    ], OP);

    expect(thread.pushes).toHaveLength(1);
    expect(thread.pushes[0]).toMatchObject({ author: "bob", id: "reply:2" });
  });

  it("uses target identity and per-target ordinal for synthetic edit replies", () => {
    const rawPushes = [push("alice", "reply.", "08/12 22:40", "neutral", 10, 1)];
    const opSegments = [{
      marker: "作者編輯",
      content: "補充",
      rawBlock: "補充",
      contentAnchorOffset: 20,
      markerOffset: 15,
    }];
    const ids = aggregatePushes(rawPushes, OP, opSegments).pushes.map((item) => item.id);

    expect(ids).toEqual(["reply:1", "edit:reply:1:1"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps synthetic ids stable when earlier body length shifts offsets and avoids collisions", () => {
    const rawPushes = [push("alice", "reply.", "08/12 22:40", "neutral", 10, 1)];
    const notes = (shift: number) => [
      {
        marker: "作者編輯",
        content: "one",
        rawBlock: "one",
        contentAnchorOffset: 20 + shift,
        markerOffset: 15 + shift,
      },
      {
        marker: "作者編輯",
        content: "two",
        rawBlock: "two",
        contentAnchorOffset: 30 + shift,
        markerOffset: 25 + shift,
      },
    ];
    const ids = (shift: number) => aggregatePushes(rawPushes, OP, notes(shift))
      .pushes.filter((item) => item.type === "edit").map((item) => item.id);

    expect(ids(0)).toEqual(["edit:reply:1:1", "edit:reply:1:2"]);
    expect(ids(100)).toEqual(ids(0));
    expect(new Set(ids(0)).size).toBe(2);
  });
});

describe("thread snapshot status", () => {
  it.each([
    [false, "incomplete"],
    [true, "final"],
  ] as const)("maps complete=%s to %s", (complete, status) => {
    const snapshot = aggregateThreadSnapshot(
      [push("alice", "Hello")],
      OP,
      complete,
    );

    expect(snapshot.status).toBe(status);
    expect(snapshot.thread.pushes[0].content).toBe("Hello");
  });
});

describe("過深嵌套回文", () => {
  it("核心保留第四層以後的原始回覆目標", () => {
    const thread = aggregatePushes(
      [
        push("alice", "A", "06/03 21:54", "push", 10, 1),
        push("bob", "回1樓：B", "06/03 21:55", "push", 20, 2),
        push("mary", "回2樓：C", "06/03 21:56", "push", 30, 3),
        push("david", "回3樓：D", "06/03 21:57", "push", 40, 4),
        push("erin", "回4樓：E", "06/03 21:58", "push", 50, 5),
      ],
      OP,
    );

    const byAuthor = new Map(thread.pushes.map((item) => [item.author, item]));
    const alice = byAuthor.get("alice")!;
    const bob = byAuthor.get("bob")!;
    const mary = byAuthor.get("mary")!;
    const david = byAuthor.get("david")!;
    const erin = byAuthor.get("erin")!;

    expect(bob.replyTo).toBe(alice.id);
    expect(mary.replyTo).toBe(bob.id);
    expect(david.replyTo).toBe(mary.id);
    expect(erin.replyTo).toBe(david.id);
    expect(david.content).toBe("D");
    expect(erin.content).toBe("E");
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
    const raw = [
      { ...push("alice", full45), isFullWidthLine: true },
      push("alice", "接續"),
    ];
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

  it("remaining content columns take precedence over the legacy full-line flag", () => {
    const full = aggregatePushes([
      {
        ...push("alice", "前段", "04/11 23:01"),
        remainingContentColumns: 1,
        isFullWidthLine: false,
      },
      push("alice", "後段", "04/11 23:02"),
    ], OP);
    const notFull = aggregatePushes([
      {
        ...push("bob", "前段", "04/11 23:01"),
        remainingContentColumns: 2,
        isFullWidthLine: true,
      },
      push("bob", "後段", "04/11 23:02"),
    ], OP);

    expect(full.pushes[0].content).toBe("前段後段");
    expect(notFull.pushes[0].content).toBe("前段\n後段");
  });

  it("uses parsed PTT content capacity to choose direct or newline concatenation", () => {
    const aligned = parsePushBuffer([
      "→ ayufly      : 3W9那是第一次有撐 會再下去第二次代表出大事一定破  08/29 16:55",
      "→ ayufly      : 接續內容                                             08/29 16:55",
    ].join("\n"));
    const unaligned = parsePushBuffer([
      "推 SouthEast62: 雖然會被拒租是有點誇張，但50歲還需要租房，的確     08/24 13:23",
      "→ SouthEast62: 會讓人有種「為什麼他到現在還需要租房」的疑問，     08/24 13:23",
    ].join("\n"));

    expect(aggregatePushes(aligned, OP).pushes[0].content).toBe(
      "3W9那是第一次有撐 會再下去第二次代表出大事一定破接續內容",
    );
    expect(aggregatePushes(unaligned, OP).pushes[0].content).toBe(
      "雖然會被拒租是有點誇張，但50歲還需要租房，的確\n會讓人有種「為什麼他到現在還需要租房」的疑問，",
    );
  });

  it("連續同作者且前則以串接符號結尾時合併並移除串接符號", () => {
    const raw = [push("alice", "Hello ||"), push("alice", "World")];
    const thread = aggregatePushes(raw, OP);
    const alicePushes = thread.pushes.filter((r) => r.author === "alice");
    expect(alicePushes).toHaveLength(1);
    expect(alicePushes[0].content).toBe("Hello\nWorld");
  });

  it("連續同作者同目標以串接符號續接即使相隔六分鐘仍合併", () => {
    const raw = [
      push("root", "根。", "01/01 12:00", "neutral", 10, 1),
      push("alice", "回1樓：前段。||", "01/01 12:01", "neutral", 20, 2),
      push("alice", "回1樓：六分鐘後", "01/01 12:07", "neutral", 30, 3),
    ];
    const alicePushes = aggregatePushes(raw, OP).pushes.filter(
      (item) => item.author === "alice",
    );

    expect(alicePushes).toHaveLength(1);
    expect(alicePushes[0].content).toBe("前段。\n六分鐘後");
  });

  it("連續同作者在時間格式無效時仍依連續條件合併", () => {
    const raw = [
      push("alice", "前段", "invalid-a"),
      push("alice", "後段", "invalid-b"),
    ];

    expect(aggregatePushes(raw, OP).pushes).toHaveLength(1);
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
      { ...push("alice", full45, "01/01 12:00"), isFullWidthLine: true },
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

  it("不連續相隔六分鐘時不合併", () => {
    const raw = [
      push("alice", "前段", "01/01 12:00"),
      push("bob", "插入。", "01/01 12:01"),
      push("alice", "後段", "01/01 12:06"),
    ];

    expect(aggregatePushes(raw, OP).pushes.filter((item) => item.author === "alice"))
      .toHaveLength(2);
  });

  it("不連續跨月一分鐘時合併", () => {
    const raw = [
      push("alice", "前段", "01/31 23:59"),
      push("bob", "插入。", "02/01 00:00"),
      push("alice", "後段", "02/01 00:00"),
    ];

    expect(aggregatePushes(raw, OP).pushes.filter((item) => item.author === "alice"))
      .toHaveLength(1);
  });

  it.each([
    ["02/28 23:59", "03/01 00:00"],
    ["02/29 23:59", "03/01 00:00"],
  ])("不連續跨二月邊界 %s → %s 一分鐘時合併", (before, after) => {
    const raw = [
      push("alice", "前段", before),
      push("bob", "插入。", after),
      push("alice", "後段", after),
    ];

    expect(aggregatePushes(raw, OP).pushes.filter((item) => item.author === "alice"))
      .toHaveLength(1);
  });

  it("不連續且時間無效或缺失時不合併", () => {
    const invalid: AnchoredRawPush[] = [
      push("alice", "前段", "invalid-a"),
      push("bob", "插入。", "01/01 12:01"),
      push("alice", "後段", "invalid-b"),
    ];
    const missing: AnchoredRawPush[] = [
      { type: "push", author: "alice", content: "前段" } as RawPush,
      push("bob", "插入。", "01/01 12:01"),
      { type: "push", author: "alice", content: "後段" } as RawPush,
    ];

    for (const raw of [invalid, missing]) {
      expect(aggregatePushes(raw, OP).pushes.filter((item) => item.author === "alice"))
        .toHaveLength(2);
    }
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

  it("回覆標記只在行首生效", () => {
    const raw = [
      push("root", "第一層", "06/03 22:00", "push", 10, 1),
      push("alice", "回1樓：AAAA", "06/03 22:01", "push", 20, 2),
      push("bob", "回1樓：BBBBB", "06/03 22:02", "push", 30, 3),
      push("mary", "BBB 回3樓：CCCC", "06/03 22:03", "push", 40, 4),
    ];

    const thread = aggregatePushes(raw, OP);
    const maryPush = thread.pushes.find((r) => r.author === "mary")!;

    expect(maryPush.replyTo).toBeNull();
    expect(maryPush.content).toBe("BBB 回3樓：CCCC");
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

  it("不能回覆尚未出現的未來樓層", () => {
    const raw = [
      push("bob", "回2樓 未來內容", "01/01 12:00", "neutral", 10, 1),
      push("alice", "第二樓", "01/01 12:01", "neutral", 20, 2),
    ];
    const bobPush = aggregatePushes(raw, OP).pushes.find(
      (item) => item.author === "bob",
    )!;

    expect(bobPush.replyTo).toBeNull();
    expect(bobPush.content).toBe("回2樓 未來內容");
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

  it("keeps first appearance for ordering while edits attach after the latest source", () => {
    const raw = [
      push("alice", "a".repeat(44), "01/01 12:00", "push", 100),
      push("bob", "插入一句", "01/01 12:01", "push", 150),
      push("alice", "接續", "01/01 12:02", "push", 200),
    ];

    const thread = aggregatePushes(raw, OP, [opEditedReply(250, "合併後補充")]);

    expect(thread.pushes.find((r) => r.author === "alice")?.anchorOrder).toBe(
      100,
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
  it("辨識只有單獨推噓的文章投票事件", () => {
    expect(detectArticleVote(" 推 ")).toBe("push");
    expect(detectArticleVote("噓")).toBe("boo");
    expect(detectArticleVote("推 好文")).toBeNull();
    expect(detectArticleVote("噓1樓")).toBeNull();
  });

  it("文章原生分數只看 PTT 類別，不看內容", () => {
    const raw = [
      push("alice", "噓", "01/01 12:00", "neutral", 10, 1),
    ];
    const thread = aggregatePushes(raw, OP);

    expect(thread.nativeArticleScore).toBe(0);
    expect(calcArticleScore(raw)).toBe(0);
  });

  it("文章投票事件不與同作者後續普通回文合併", () => {
    const thread = aggregatePushes([
      push("alice", "噓", "01/01 12:00", "boo", 10, 1),
      push("alice", "補充原因", "01/01 12:01", "neutral", 20, 2),
    ], OP);

    expect(thread.pushes.map((item) => item.content)).toEqual(["補充原因"]);
  });

  it("文章層級：push+1, boo-1, neutral 不計", () => {
    const raw = [
      push("a", "推", "01/01 12:00", "push"),
      push("b", "推", "01/01 12:01", "push"),
      push("c", "噓", "01/01 12:02", "boo"),
    ];
    const thread = aggregatePushes(raw, OP);
    expect(calcArticleScore(raw)).toBe(1); // 2 push - 1 boo
    expect(thread.nativeArticleScore).toBe(1);
  });

  it("使用 PTT 原生推類別的巢狀回覆會推被回覆者", () => {
    const raw = [
      push("alice", "第一樓"),
      push("bob", "回1樓：同意", "01/01 12:01", "push"),
    ];
    const thread = aggregatePushes(raw, OP);
    const target = thread.pushes.find((item) => item.author === "alice")!;
    expect(target.score).toBe(1);
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
  it("以不分大小寫的 PTT ID 覆蓋舊投票方向", () => {
    const raw = [
      push("alice", "第一樓", "08/12 22:06", "neutral", 10, 1),
      push("MBB200291", "推1樓", "08/12 22:07", "push", 20, 2),
      push("mbb200291", "噓1樓", "08/12 22:08", "boo", 30, 3),
    ];
    const target = aggregatePushes(raw, OP).pushes.find(
      (item) => item.author === "alice",
    )!;

    expect(normalizePttId(" MBB200291 ")).toBe("mbb200291");
    expect(target.pushVoters).toEqual([]);
    expect(target.booVoters).toEqual(["mbb200291"]);
    expect(target.score).toBe(-1);
  });

  it("實站重複序列只保留同一 ID 的最後一個推", () => {
    const raw = [
      push("MBB200291", "測試回文", "08/12 22:06", "neutral", 10, 1),
      push("MBB200291", "推1樓", "08/12 22:07", "push", 20, 2),
      push("MBB200291", "推1樓", "08/12 22:07", "push", 30, 3),
      push("MBB200291", "推1樓", "08/12 22:07", "push", 40, 4),
      push("MBB200291", "噓1樓", "08/12 22:07", "boo", 50, 5),
      push("MBB200291", "推1樓", "08/12 22:07", "push", 60, 6),
      push("MBB200291", "推1樓", "08/12 22:08", "push", 70, 7),
    ];
    const target = aggregatePushes(raw, OP).pushes.find(
      (item) => item.content === "測試回文",
    )!;

    expect(target.pushVoters).toEqual(["MBB200291"]);
    expect(target.booVoters).toEqual([]);
    expect(target.score).toBe(1);
  });

  it("隱藏投票後仍以 PTT 原始樓號投到後續回文", () => {
    const raw = [
      push("alice", "第一樓", "01/01 12:00", "neutral", 10, 1),
      push("bob", "推1樓", "01/01 12:01", "push", 20, 2),
      push("carol", "第三樓", "01/01 12:02", "neutral", 30, 3),
      push("dave", "推3樓", "01/01 12:03", "push", 40, 4),
    ];
    const thread = aggregatePushes(raw, OP);
    const thirdFloor = thread.pushes.find((item) => item.author === "carol")!;

    expect(thread.pushes.some((item) => item.content === "推1樓")).toBe(false);
    expect(thread.pushes.some((item) => item.content === "推3樓")).toBe(false);
    expect(thirdFloor.pushVoters).toEqual(["dave"]);
    expect(thirdFloor.sourceFloors).toEqual([3]);
  });

  it("score 等於已去重的明確投票淨值", () => {
    const raw = [
      push("alice", "第一樓", "01/01 12:00", "neutral", 10, 1),
      push("bob", "推1樓", "01/01 12:01", "push", 20, 2),
      push("bob", "推1樓", "01/01 12:02", "push", 30, 3),
      push("carol", "推1樓", "01/01 12:03", "push", 40, 4),
      push("dave", "噓1樓", "01/01 12:04", "boo", 50, 5),
    ];
    const thread = aggregatePushes(raw, OP);
    const target = thread.pushes.find((item) => item.author === "alice")!;
    expect(target.pushVoters).toEqual(["bob", "carol"]);
    expect(target.booVoters).toEqual(["dave"]);
    expect(target.score).toBe(1);
  });

  it("同一 ID 先推後噓時 score 採最後方向", () => {
    const raw = [
      push("alice", "第一樓", "01/01 12:00", "neutral", 10, 1),
      push("bob", "推1樓", "01/01 12:01", "push", 20, 2),
      push("bob", "噓1樓", "01/01 12:02", "boo", 30, 3),
    ];
    const thread = aggregatePushes(raw, OP);
    const target = thread.pushes.find((item) => item.author === "alice")!;
    expect(target.score).toBe(-1);
  });

  it("混合明確投票與原生噓巢狀回覆時兩者都計入", () => {
    const raw = [
      push("alice", "第一樓", "01/01 12:00", "neutral", 10, 1),
      push("bob", "推1樓", "01/01 12:01", "push", 20, 2),
      push("carol", "回1樓：不同意", "01/01 12:02", "boo", 30, 3),
    ];
    const thread = aggregatePushes(raw, OP);
    const target = thread.pushes.find((item) => item.author === "alice")!;
    expect(target.score).toBe(0);
  });

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

describe("HTML vote model alignment", () => {
  it("treats vote patterns with bodies as visible nested replies and votes", () => {
    const thread = aggregatePushes(
      [
        push("carol", "第十二樓", "08/12 22:06", "neutral", 10, 12),
        push("alice", "推12樓 我同意", "08/12 22:07", "neutral", 20, 13),
        push("bob", "噓12樓：我反對", "08/12 22:08", "neutral", 30, 14),
      ],
      OP,
    );

    const target = thread.pushes.find((item) => item.author === "carol")!;
    const alice = thread.pushes.find((item) => item.author === "alice")!;
    const bob = thread.pushes.find((item) => item.author === "bob")!;

    expect(alice).toMatchObject({ replyTo: target.id, content: "我同意" });
    expect(bob).toMatchObject({ replyTo: target.id, content: "我反對" });
    expect(target.pushVoters).toEqual(["alice"]);
    expect(target.booVoters).toEqual(["bob"]);
    expect(target.score).toBe(0);
  });

  it("requires a delimiter after the target floor", () => {
    expect(detectVote("推12樓主整理得很好")).toBeNull();

    const thread = aggregatePushes(
      [
        push("carol", "第十二樓", "08/12 22:06", "neutral", 10, 12),
        push("alice", "推12樓主整理得很好", "08/12 22:07", "neutral", 20, 13),
      ],
      OP,
    );
    const alice = thread.pushes.find((item) => item.author === "alice")!;

    expect(alice.replyTo).toBeNull();
    expect(alice.content).toBe("推12樓主整理得很好");
  });

  it("does not merge a pure control event with the following comment", () => {
    const thread = aggregatePushes(
      [
        push("carol", "第十二樓", "08/12 22:06", "neutral", 10, 12),
        push("alice", "推12樓", "08/12 22:07", "neutral", 20, 13),
        push("alice", "我另外補充一件事", "08/12 22:08", "neutral", 30, 14),
      ],
      OP,
    );

    expect(thread.pushes.some((item) => item.content === "推12樓")).toBe(false);
    expect(thread.pushes.find((item) => item.author === "alice")).toMatchObject({
      replyTo: null,
      content: "我另外補充一件事",
      sourceFloors: [14],
    });
  });

  it("aggregates interleaved continuations by author and structural target", () => {
    const thread = aggregatePushes(
      [
        push("alice", "主題第一段還沒結束", "08/12 22:50", "neutral", 10, 1),
        push("bob", "回1樓：我先回應 Alice", "08/12 22:51", "neutral", 20, 2),
        push("alice", "主題第二段補完。", "08/12 22:52", "neutral", 30, 3),
        push("carol", "回2樓：我先回 Bob", "08/12 22:53", "neutral", 40, 4),
        push("bob", "延續我對 Alice 的回覆。", "08/12 22:54", "neutral", 50, 5),
        push("dave", "回3樓：我補充 Alice。", "08/12 22:55", "neutral", 60, 6),
        push("carol", "接著把回覆說完。", "08/12 22:56", "neutral", 70, 7),
        push("erin", "回5樓：我從另一角度回 Bob。", "08/12 22:57", "neutral", 80, 8),
      ],
      OP,
    );

    const byAuthor = new Map(thread.pushes.map((item) => [item.author, item]));
    const alice = byAuthor.get("alice")!;
    const bob = byAuthor.get("bob")!;
    const carol = byAuthor.get("carol")!;
    const dave = byAuthor.get("dave")!;
    const erin = byAuthor.get("erin")!;

    expect(thread.pushes).toHaveLength(5);
    expect(alice.sourceFloors).toEqual([1, 3]);
    expect(bob).toMatchObject({ replyTo: alice.id, sourceFloors: [2, 5] });
    expect(carol).toMatchObject({ replyTo: bob.id, sourceFloors: [4, 7] });
    expect(dave.replyTo).toBe(alice.id);
    expect(erin.replyTo).toBe(bob.id);
    expect(alice.anchorOrder).toBe(10);
    expect(bob.anchorOrder).toBe(20);
    expect(carol.anchorOrder).toBe(40);
  });

  it("keeps explicit replies to different targets in separate groups", () => {
    const thread = aggregatePushes(
      [
        push("root-a", "A。", "08/12 22:50", "neutral", 10, 1),
        push("root-b", "B。", "08/12 22:51", "neutral", 20, 2),
        push("alice", "回1樓：先回 A", "08/12 22:52", "neutral", 30, 3),
        push("alice", "回2樓：再回 B", "08/12 22:53", "neutral", 40, 4),
      ],
      OP,
    );

    const replies = thread.pushes.filter((item) => item.author === "alice");
    expect(replies).toHaveLength(2);
    expect(replies.map((item) => item.sourceFloors)).toEqual([[3], [4]]);
    expect(replies[0].replyTo).not.toBe(replies[1].replyTo);
  });

  it("keeps native article score independent from reply vote semantics", () => {
    const thread = aggregatePushes(
      [
        push("carol", "第十二樓", "08/12 22:06", "neutral", 10, 12),
        push("alice", "推12樓", "08/12 22:07", "push", 20, 13),
        push("bob", "推12樓", "08/12 22:08", "boo", 30, 14),
        push("dave", "回12樓：一般回覆", "08/12 22:09", "push", 40, 15),
      ],
      OP,
    );

    const target = thread.pushes.find((item) => item.author === "carol")!;
    expect(thread.nativeArticleScore).toBe(1);
    expect(thread.nativePushCount).toBe(2);
    expect(thread.nativeBooCount).toBe(1);
    expect(thread.articlePushCount).toBe(0);
    expect(thread.articleBooCount).toBe(0);
    expect(thread.articleScore).toBe(0);
    expect(target.pushVoters).toEqual(["alice", "bob", "dave"]);
    expect(target.score).toBe(3);
  });

  it("reduces pure article votes per author and hides their raw events", () => {
    const thread = aggregatePushes(
      [
        push("alice", "推", "08/12 22:07", "push", 10, 1),
        push("alice", "推", "08/12 22:08", "push", 20, 2),
        push("bob", "噓", "08/12 22:09", "boo", 30, 3),
      ],
      OP,
    );

    expect(thread.pushes).toHaveLength(0);
    expect(thread.nativeArticleScore).toBe(1);
    expect(thread.articlePushVoters).toEqual(["alice"]);
    expect(thread.articleBooVoters).toEqual(["bob"]);
  });

  it("uses an inverse pure article vote to cancel application state", () => {
    const thread = aggregatePushes(
      [
        push("alice", "推", "08/12 22:07", "push", 10, 1),
        push("alice", "噓", "08/12 22:08", "boo", 20, 2),
      ],
      OP,
    );

    expect(thread.nativeArticleScore).toBe(0);
    expect(thread.articlePushVoters).toEqual([]);
    expect(thread.articleBooVoters).toEqual([]);
  });

  it("withdraws only the matching reply vote and keeps composite body", () => {
    const thread = aggregatePushes(
      [
        push("carol", "第十二樓。", "08/12 22:40", "neutral", 10, 12),
        push("alice", "推12樓 我同意這個觀點。", "08/12 22:41", "neutral", 20, 13),
        push("alice", "撤回我對12樓的推", "08/12 22:42", "neutral", 30, 14),
      ],
      OP,
    );

    const target = thread.pushes.find((item) => item.author === "carol")!;
    const reply = thread.pushes.find((item) => item.author === "alice")!;
    expect(target.score).toBe(0);
    expect(reply).toMatchObject({ replyTo: target.id, content: "我同意這個觀點。" });
  });

  it("keeps both composite bodies when the same author changes vote direction", () => {
    const thread = aggregatePushes(
      [
        push("carol", "第十二樓。", "08/12 22:40", "neutral", 10, 12),
        push("alice", "推12樓 我同意第一點", "08/12 22:41", "neutral", 20, 13),
        push("alice", "噓12樓 但不同意第二點", "08/12 22:44", "neutral", 30, 14),
      ],
      OP,
    );

    const target = thread.pushes.find((item) => item.author === "carol")!;
    const reply = thread.pushes.find((item) => item.author === "alice")!;
    expect(target.score).toBe(-1);
    expect(target.booVoters).toEqual(["alice"]);
    expect(reply).toMatchObject({
      replyTo: target.id,
      sourceFloors: [13, 14],
      content: "我同意第一點\n但不同意第二點",
    });
  });

  it("withdraws a whole composite event including its body and vote", () => {
    const thread = aggregatePushes(
      [
        push("carol", "第十二樓。", "08/12 22:40", "neutral", 10, 12),
        push("alice", "推12樓 我同意這個觀點。", "08/12 22:41", "neutral", 20, 13),
        push("alice", "撤回我在13樓的發言", "08/12 22:42", "neutral", 30, 14),
      ],
      OP,
    );

    const target = thread.pushes.find((item) => item.author === "carol")!;
    expect(target.score).toBe(0);
    expect(thread.pushes.some((item) => item.author === "alice")).toBe(false);
  });

  it("projects a withdrawn raw event as an invisible single-space placeholder", () => {
    const events = normalizeThreadEvents([
      push("root", "目標。", "08/12 22:40", "neutral", 10, 1),
      push("alice", "推1樓 原回覆。", "08/12 22:41", "neutral", 20, 2),
      push("alice", "撤回我在2樓的發言", "08/12 22:42", "neutral", 30, 3),
    ]);

    expect(events.find((event) => event.rawFloor === 2)).toEqual({
      rawFloor: 2,
      author: "alice",
      content: " ",
      withdrawn: true,
      visible: false,
    });
  });

  it("keeps a fully withdrawn aggregate as one hidden reply", () => {
    const thread = aggregatePushes([
      push("alice", "first", "08/12 22:40", "neutral", 10, 1),
      push("alice", "second.", "08/12 22:41", "neutral", 20, 2),
      push("alice", "撤回我在1~2樓的發言", "08/12 22:42", "neutral", 30, 3),
    ], OP);

    expect(thread.pushes).toEqual([]);
    expect(thread.withdrawnPushes).toHaveLength(1);
    expect(thread.withdrawnPushes[0]).toMatchObject({
      id: "reply:1",
      sourceFloors: [1, 2],
      content: " ",
      visible: false,
      editHistory: [
        expect.objectContaining({ kind: "original" }),
        expect.objectContaining({ kind: "withdraw", content: " ", resultContent: " " }),
      ],
    });
    expect(thread.withdrawnPushes[0].editHistory).toHaveLength(2);
  });

  it("regroups surviving lines and creates no duplicate hidden reply after a partial withdraw", () => {
    const thread = aggregatePushes([
      push("alice", "first", "08/12 22:40", "neutral", 10, 1),
      push("alice", "second.", "08/12 22:41", "neutral", 20, 2),
      push("alice", "撤回我在1樓的發言", "08/12 22:42", "neutral", 30, 3),
    ], OP);

    expect(thread.pushes).toHaveLength(1);
    expect(thread.pushes[0]).toMatchObject({ id: "reply:2", sourceFloors: [2] });
    expect(thread.withdrawnPushes).toEqual([]);
  });

  it("applies Replace to body as opaque text without changing structure or vote", () => {
    const thread = aggregatePushes(
      [
        push("carol", "第十二樓。", "08/12 22:06", "neutral", 10, 12),
        push("alice", "推12樓 我不同意", "08/12 22:07", "boo", 20, 13),
        push("alice", "更正我在13樓發言：回99樓：我改過的文字", "08/12 22:08", "neutral", 30, 14),
      ],
      OP,
    );

    const target = thread.pushes.find((item) => item.author === "carol")!;
    const reply = thread.pushes.find((item) => item.author === "alice")!;
    expect(thread.nativeArticleScore).toBe(-1);
    expect(target.score).toBe(1);
    expect(reply).toMatchObject({
      replyTo: target.id,
      content: "回99樓：我改過的文字",
    });
    expect(reply.editHistory).toEqual([
      expect.objectContaining({ kind: "original", content: "我不同意" }),
      expect.objectContaining({ kind: "replace", content: "回99樓：我改過的文字" }),
    ]);
  });

  it("does not let edited punctuation retroactively change aggregation", () => {
    const thread = aggregatePushes(
      [
        push("alice", "第一段尚未結束", "08/12 22:40", "neutral", 10, 1),
        push("alice", "第二段完成。", "08/12 22:41", "neutral", 20, 2),
        push("alice", "更正我在1樓發言：第一段已改成句號。", "08/12 22:42", "neutral", 30, 3),
      ],
      OP,
    );

    expect(thread.pushes).toHaveLength(1);
    expect(thread.pushes[0].sourceFloors).toEqual([1, 2]);
    expect(thread.pushes[0].content).toBe("第一段已改成句號。\n第二段完成。");
  });

  it("treats Append payload as opaque body text", () => {
    const thread = aggregatePushes(
      [
        push("carol", "第十二樓。", "08/12 22:40", "neutral", 10, 12),
        push("alice", "回12樓：原本內容。", "08/12 22:41", "neutral", 20, 13),
        push("alice", "補充我在13樓發言：推99樓 只是補充文字", "08/12 22:42", "neutral", 30, 14),
      ],
      OP,
    );
    const target = thread.pushes.find((item) => item.author === "carol")!;
    const reply = thread.pushes.find((item) => item.author === "alice")!;

    expect(reply.replyTo).toBe(target.id);
    expect(reply.content).toBe("原本內容。\n推99樓 只是補充文字");
    expect(reply.editHistory).toEqual([
      expect.objectContaining({ kind: "original", content: "原本內容。" }),
      expect.objectContaining({ kind: "append", content: "推99樓 只是補充文字" }),
    ]);
    expect(target.score).toBe(0);
  });

  it("preserves edit kinds and payloads when an edited floor belongs to a group", () => {
    const thread = aggregatePushes(
      [
        push("alice", "first", "08/12 22:40", "neutral", 10, 1),
        push("alice", "second.", "08/12 22:41", "neutral", 20, 2),
        push("alice", "補充我在1樓發言：extra", "08/12 22:42", "neutral", 30, 3),
      ],
      OP,
    );

    expect(thread.pushes[0].editHistory).toEqual([
      expect.objectContaining({ kind: "original", content: "first\nsecond." }),
      expect.objectContaining({ kind: "append", content: "extra" }),
    ]);
  });

  it("orders interleaved grouped edits by raw command chronology", () => {
    const thread = aggregatePushes(
      [
        push("alice", "first", "08/12 22:40", "neutral", 10, 1),
        push("alice", "second.", "08/12 22:41", "neutral", 20, 2),
        push("alice", "補充我在2樓發言：edit-second", "08/12 22:42", "neutral", 30, 3),
        push("alice", "更正我在1樓發言：edit-first", "08/12 22:42", "neutral", 40, 4),
      ],
      OP,
    );

    expect(thread.pushes[0].editHistory?.slice(1).map(({ kind, content }) => ({ kind, content }))).toEqual([
      { kind: "append", content: "edit-second" },
      { kind: "replace", content: "edit-first" },
    ]);
  });

  it("withdraws a floor range only for the command author", () => {
    const thread = aggregatePushes(
      [
        push("alice", "第一段||", "08/12 22:40", "neutral", 10, 11),
        push("bob", "別人的內容。", "08/12 22:41", "neutral", 20, 12),
        push("alice", "第二段。", "08/12 22:42", "neutral", 30, 13),
        push("alice", "撤回我在11~13樓的發言", "08/12 22:43", "neutral", 40, 14),
      ],
      OP,
    );

    expect(thread.pushes.map((item) => item.author)).toEqual(["bob"]);
    expect(thread.pushes[0].sourceFloors).toEqual([12]);
  });

  it("aggregates each nested level and resolves any source floor to its card", () => {
    const thread = aggregatePushes(
      [
        push("alice", "第一層內容還沒說完", "08/12 22:50", "neutral", 10, 1),
        push("alice", "第一層接續完成。", "08/12 22:51", "neutral", 20, 2),
        push("bob", "回1樓：第二層先說前半段", "08/12 22:52", "neutral", 30, 3),
        push("bob", "第二層再補完。", "08/12 22:53", "neutral", 40, 4),
        push("carol", "回4樓：第三層先回一部分", "08/12 22:54", "neutral", 50, 5),
        push("carol", "第三層接著回完。", "08/12 22:55", "neutral", 60, 6),
      ],
      OP,
    );

    const alice = thread.pushes.find((item) => item.author === "alice")!;
    const bob = thread.pushes.find((item) => item.author === "bob")!;
    const carol = thread.pushes.find((item) => item.author === "carol")!;
    expect(thread.pushes).toHaveLength(3);
    expect(alice.sourceFloors).toEqual([1, 2]);
    expect(bob).toMatchObject({ replyTo: alice.id, sourceFloors: [3, 4] });
    expect(carol).toMatchObject({ replyTo: bob.id, sourceFloors: [5, 6] });
  });

  it("keeps fourth-level reply targets for the UI presentation layer", () => {
    const thread = aggregatePushes(
      [
        push("alice", "第一層。", "08/12 22:20", "neutral", 10, 1),
        push("bob", "回1樓：第二層。", "08/12 22:21", "neutral", 20, 2),
        push("carol", "回2樓：第三層。", "08/12 22:22", "neutral", 30, 3),
        push("dave", "回3樓：第四層輸入。", "08/12 22:23", "neutral", 40, 4),
      ],
      OP,
    );
    const bob = thread.pushes.find((item) => item.author === "bob")!;
    const carol = thread.pushes.find((item) => item.author === "carol")!;
    const dave = thread.pushes.find((item) => item.author === "dave")!;

    expect(carol.replyTo).toBe(bob.id);
    expect(dave.replyTo).toBe(carol.id);
  });
});
