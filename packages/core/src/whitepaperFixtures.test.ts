import { describe, expect, it } from "vitest";
import aggregation from "../../../docs/fixtures/thread-events/aggregation.json";
import nestedReplies from "../../../docs/fixtures/thread-events/nested-replies.json";
import schema from "../../../docs/fixtures/thread-events/schema.json";
import votesAndEdits from "../../../docs/fixtures/thread-events/votes-and-edits.json";
import whitepaper from "../../../docs/whitepaper/pttzzz-core.md?raw";
import {
  aggregatePushes,
  aggregateThreadSnapshot,
  normalizeThreadEvents,
} from "./pushAggregator.js";
import type {
  AggregatedThread,
  NormalizedThreadEvent,
  ThreadSnapshotStatus,
} from "./pushAggregator.js";
import type { RawPush } from "./parser.js";

interface StableReply {
  author: string;
  content: string;
  replyToAuthor: string | null;
  score: number;
}

interface FixtureCase {
  id: string;
  rules: string[];
  articleAuthor: string;
  rawPushes: RawPush[];
  expected: {
    replies: StableReply[];
    nativeArticleScore: number;
    articlePushVoters: string[];
    articleBooVoters: string[];
  };
  stages?: Array<{
    complete: boolean;
    rawPushCount: number;
    expected: FixtureCase["expected"] & { status: ThreadSnapshotStatus };
  }>;
  expectedNormalizedEvents?: NormalizedThreadEvent[];
}

function assertRecord(
  value: unknown,
  path: string,
  allowedKeys: readonly string[],
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) throw new Error(`${path}.${key} is unknown`);
  }
}

function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string") throw new Error(`${path} must be a string`);
}

function assertNonEmptyString(value: unknown, path: string): asserts value is string {
  assertString(value, path);
  if (value.trim().length === 0) throw new Error(`${path} must not be empty`);
}

function assertIntegerAtLeast(
  value: unknown,
  minimum: number,
  path: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) {
    throw new Error(`${path} must be an integer >= ${minimum}`);
  }
}

function assertStringArray(value: unknown, path: string): asserts value is string[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  value.forEach((item, index) => assertString(item, `${path}[${index}]`));
}

function validateExpected(value: unknown, path: string, withStatus = false): void {
  const keys = [
    "replies",
    "nativeArticleScore",
    "articlePushVoters",
    "articleBooVoters",
    ...(withStatus ? ["status"] : []),
  ];
  assertRecord(value, path, keys);
  if (!Array.isArray(value.replies)) throw new Error(`${path}.replies must be an array`);
  value.replies.forEach((reply, index) => {
    const replyPath = `${path}.replies[${index}]`;
    assertRecord(reply, replyPath, ["author", "content", "replyToAuthor", "score"]);
    assertString(reply.author, `${replyPath}.author`);
    assertString(reply.content, `${replyPath}.content`);
    if (reply.replyToAuthor !== null) {
      assertString(reply.replyToAuthor, `${replyPath}.replyToAuthor`);
    }
    if (!Number.isInteger(reply.score)) throw new Error(`${replyPath}.score must be an integer`);
  });
  if (!Number.isInteger(value.nativeArticleScore)) {
    throw new Error(`${path}.nativeArticleScore must be an integer`);
  }
  assertStringArray(value.articlePushVoters, `${path}.articlePushVoters`);
  assertStringArray(value.articleBooVoters, `${path}.articleBooVoters`);
  if (withStatus && value.status !== "incomplete" && value.status !== "final") {
    throw new Error(`${path}.status must be incomplete or final`);
  }
}

function validateFixtureCases(value: unknown): FixtureCase[] {
  if (!Array.isArray(value)) throw new Error("fixtures must be an array");
  value.forEach((fixture, fixtureIndex) => {
    const path = `fixture[${fixtureIndex}]`;
    assertRecord(fixture, path, [
      "id",
      "rules",
      "articleAuthor",
      "rawPushes",
      "expected",
      "stages",
      "expectedNormalizedEvents",
    ]);
    assertNonEmptyString(fixture.id, `${path}.id`);
    assertStringArray(fixture.rules, `${path}.rules`);
    if (fixture.rules.length === 0) throw new Error(`${path}.rules must not be empty`);
    if (new Set(fixture.rules).size !== fixture.rules.length) {
      throw new Error(`${path}.rules must be unique`);
    }
    fixture.rules.forEach((rule, ruleIndex) => {
      if (!/^(RAW|THREAD|VOTE|EDIT|PARTIAL)-[0-9]{3}$/u.test(rule)) {
        throw new Error(`${path}.rules[${ruleIndex}] is invalid`);
      }
    });
    assertNonEmptyString(fixture.articleAuthor, `${path}.articleAuthor`);
    if (!Array.isArray(fixture.rawPushes)) throw new Error(`${path}.rawPushes must be an array`);
    fixture.rawPushes.forEach((push, pushIndex) => {
      const pushPath = `${path}.rawPushes[${pushIndex}]`;
      assertRecord(push, pushPath, [
        "type",
        "author",
        "content",
        "time",
        "ipAddress",
        "isFullWidthLine",
      ]);
      if (
        typeof push.type !== "string" ||
        !["push", "boo", "neutral", "edit"].includes(push.type)
      ) {
        throw new Error(`${pushPath}.type is invalid`);
      }
      assertString(push.author, `${pushPath}.author`);
      assertString(push.content, `${pushPath}.content`);
      assertString(push.time, `${pushPath}.time`);
      if (push.ipAddress !== undefined) assertString(push.ipAddress, `${pushPath}.ipAddress`);
      if (push.isFullWidthLine !== undefined && typeof push.isFullWidthLine !== "boolean") {
        throw new Error(`${pushPath}.isFullWidthLine must be a boolean`);
      }
    });
    validateExpected(fixture.expected, `${path}.expected`);
    if (fixture.stages !== undefined) {
      if (!Array.isArray(fixture.stages)) throw new Error(`${path}.stages must be an array`);
      if (fixture.stages.length < 2) throw new Error(`${path}.stages must contain at least 2 items`);
      fixture.stages.forEach((stage, stageIndex) => {
        const stagePath = `${path}.stages[${stageIndex}]`;
        assertRecord(stage, stagePath, ["complete", "rawPushCount", "expected"]);
        if (typeof stage.complete !== "boolean") {
          throw new Error(`${stagePath}.complete must be a boolean`);
        }
        assertIntegerAtLeast(stage.rawPushCount, 0, `${stagePath}.rawPushCount`);
        validateExpected(stage.expected, `${stagePath}.expected`, true);
      });
    }
    if (fixture.expectedNormalizedEvents !== undefined) {
      if (!Array.isArray(fixture.expectedNormalizedEvents)) {
        throw new Error(`${path}.expectedNormalizedEvents must be an array`);
      }
      fixture.expectedNormalizedEvents.forEach((event, eventIndex) => {
        const eventPath = `${path}.expectedNormalizedEvents[${eventIndex}]`;
        assertRecord(event, eventPath, ["rawFloor", "author", "content", "withdrawn", "visible"]);
        assertIntegerAtLeast(event.rawFloor, 1, `${eventPath}.rawFloor`);
        assertString(event.author, `${eventPath}.author`);
        assertString(event.content, `${eventPath}.content`);
        if (typeof event.withdrawn !== "boolean") throw new Error(`${eventPath}.withdrawn must be a boolean`);
        if (typeof event.visible !== "boolean") throw new Error(`${eventPath}.visible must be a boolean`);
      });
    }
  });
  return value as FixtureCase[];
}

function stableAggregatedThread(result: AggregatedThread) {
  const authorById = new Map(result.pushes.map((push) => [push.id, push.author]));
  return {
    replies: result.pushes.map((push) => ({
      author: push.author,
      content: push.content,
      replyToAuthor: push.replyTo ? authorById.get(push.replyTo) ?? null : null,
      score: push.score,
    })),
    nativeArticleScore: result.nativeArticleScore,
    articlePushVoters: result.articlePushVoters,
    articleBooVoters: result.articleBooVoters,
  };
}

function stableThread(rawPushes: RawPush[], articleAuthor: string) {
  return stableAggregatedThread(aggregatePushes(rawPushes, articleAuthor));
}

function validExpected(status?: ThreadSnapshotStatus) {
  return {
    replies: [],
    nativeArticleScore: 0,
    articlePushVoters: [],
    articleBooVoters: [],
    ...(status ? { status } : {}),
  };
}

function validFixtureInput(): Record<string, unknown> {
  return {
    id: "valid-case",
    rules: ["RAW-001"],
    articleAuthor: "op",
    rawPushes: [],
    expected: validExpected(),
  };
}

describe("whitepaper conformance fixtures", () => {
  const cases = validateFixtureCases([aggregation, nestedReplies, votesAndEdits].flat());

  it("rejects fixtures with missing ids", () => {
    expect(() =>
      validateFixtureCases([
        { rules: [], articleAuthor: "op", rawPushes: [], expected: {} },
      ]),
    ).toThrow(/fixture\[0\]\.id/u);
  });

  it("rejects fixtures with invalid push types", () => {
    expect(() =>
      validateFixtureCases([
        {
          id: "invalid-push-type",
          rules: ["RAW-001"],
          articleAuthor: "op",
          rawPushes: [
            { type: "invalid", author: "alice", content: "x", time: "01/01 00:00" },
          ],
          expected: {
            replies: [],
            nativeArticleScore: 0,
            articlePushVoters: [],
            articleBooVoters: [],
          },
        },
      ]),
    ).toThrow(/rawPushes\[0\]\.type/u);
  });

  it.each([
    ["blank id", (fixture: Record<string, unknown>) => { fixture.id = "  "; }, /fixture\[0\]\.id/u],
    ["blank article author", (fixture: Record<string, unknown>) => { fixture.articleAuthor = " "; }, /articleAuthor/u],
    ["empty rules", (fixture: Record<string, unknown>) => { fixture.rules = []; }, /rules/u],
    ["duplicate rules", (fixture: Record<string, unknown>) => { fixture.rules = ["RAW-001", "RAW-001"]; }, /rules/u],
    ["malformed rule", (fixture: Record<string, unknown>) => { fixture.rules = ["OTHER-001"]; }, /rules\[0\]/u],
    ["one stage", (fixture: Record<string, unknown>) => {
      fixture.stages = [
        { complete: false, rawPushCount: 0, expected: validExpected("incomplete") },
      ];
    }, /stages/u],
    ["negative raw push count", (fixture: Record<string, unknown>) => {
      fixture.stages = [
        { complete: false, rawPushCount: -1, expected: validExpected("incomplete") },
        { complete: true, rawPushCount: 0, expected: validExpected("final") },
      ];
    }, /rawPushCount/u],
    ["zero normalized floor", (fixture: Record<string, unknown>) => {
      fixture.expectedNormalizedEvents = [
        { rawFloor: 0, author: "alice", content: "x", withdrawn: false, visible: true },
      ];
    }, /rawFloor/u],
  ] as const)("rejects schema constraint: %s", (_name, mutate, errorPattern) => {
    const fixture = validFixtureInput();
    mutate(fixture);

    expect(() => validateFixtureCases([fixture])).toThrow(errorPattern);
  });

  it("declares the required draft 2020-12 array schema", () => {
    expect(schema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "array",
      items: {
        required: ["id", "rules", "articleAuthor", "rawPushes", "expected"],
      },
    });
  });

  it("uses unique case ids and covers every normative whitepaper rule", () => {
    const ids = cases.map((fixture) => fixture.id);
    expect(new Set(ids).size).toBe(ids.length);

    const ruleIds = [...whitepaper.matchAll(/^### ([A-Z]+-\d{3})\b/gmu)].map(
      ([, id]) => id,
    );
    const referencedRules = new Set(cases.flatMap((fixture) => fixture.rules));

    expect(ruleIds).toHaveLength(18);
    expect([...referencedRules].filter((id) => !ruleIds.includes(id))).toEqual([]);
    expect(ruleIds.filter((id) => !referencedRules.has(id))).toEqual([]);
  });

  it.each(cases)("matches $id", ({ rawPushes, articleAuthor, expected }) => {
    expect(stableThread(rawPushes, articleAuthor)).toEqual(expected);
  });

  it.each(cases.filter((fixture) => fixture.stages))(
    "matches partial and final stages for $id",
    ({ rawPushes, articleAuthor, stages }) => {
      for (const stage of stages ?? []) {
        const snapshot = aggregateThreadSnapshot(
          rawPushes.slice(0, stage.rawPushCount),
          articleAuthor,
          stage.complete,
        );
        expect({
          ...stableAggregatedThread(snapshot.thread),
          status: snapshot.status,
        }).toEqual(stage.expected);
      }
    },
  );

  it.each(cases.filter((fixture) => fixture.expectedNormalizedEvents))(
    "matches normalized events for $id",
    ({ rawPushes, expectedNormalizedEvents }) => {
      expect(normalizeThreadEvents(rawPushes)).toEqual(expectedNormalizedEvents);
    },
  );

  it("preserves the whitepaper append and replace operations in edit history", () => {
    const historyFor = (id: string) => {
      const fixture = cases.find((candidate) => candidate.id === id)!;
      return aggregatePushes(fixture.rawPushes, fixture.articleAuthor).pushes
        .find((reply) => reply.author === "alice")?.editHistory;
    };

    expect(historyFor("edits-append-opaque-payload")).toEqual([
      expect.objectContaining({ kind: "original", content: "原文。" }),
      expect.objectContaining({ kind: "append", content: "推99樓 只是文字" }),
    ]);
    expect(historyFor("edits-replace-preserves-structure")).toEqual([
      expect.objectContaining({ kind: "original", content: "原回覆。" }),
      expect.objectContaining({ kind: "replace", content: "回99樓：opaque" }),
    ]);
  });
});
