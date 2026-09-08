import { describe, expect, it } from "vitest";
import editCases from "../../../docs/fixtures/thread-events/edit.json";
import mergeCases from "../../../docs/fixtures/thread-events/merge.json";
import opCases from "../../../docs/fixtures/thread-events/op.json";
import rawCases from "../../../docs/fixtures/thread-events/raw.json";
import schema from "../../../docs/fixtures/thread-events/schema.json";
import threadCases from "../../../docs/fixtures/thread-events/thread.json";
import voteCases from "../../../docs/fixtures/thread-events/vote.json";
import whitepaper from "../../../docs/whitepaper/pttzzz-core.md?raw";
import { PttzzzClient } from "./client.js";
import type {
  ActionReceipt,
  GatewayEvent,
  GetArticleInput,
  LoginInput,
  PttCommand,
  PttGateway,
  Reply,
} from "./contracts.js";
import {
  aggregatePushes,
  aggregateThreadSnapshot,
  normalizeThreadEvents,
} from "./pushAggregator.js";
import { formatEditPushCommand, formatSectionEditCommand } from "./pushWire.js";
import type {
  AggregatedThread,
  NormalizedThreadEvent,
  ThreadSnapshotStatus,
} from "./pushAggregator.js";
import type { OpEditedReplySegment, RawPush } from "./parser.js";

interface StableReply {
  author: string;
  content: string;
  replyToAuthor: string | null;
  score: number;
}

interface FixtureCase {
  id: string;
  primaryRule: string;
  rules: string[];
  articleAuthor: string;
  rawPushes: RawPush[];
  opEditedReplies?: OpEditedReplySegment[];
  expected: {
    replies: StableReply[];
    nativeArticleScore: number;
    articlePushVoters: string[];
    articleBooVoters: string[];
  };
  expectedArticleScores?: {
    articlePushCount: number;
    articleBooCount: number;
    articleScore: number;
    nativePushCount: number;
    nativeBooCount: number;
    nativeArticleScore: number;
  };
  stages?: Array<{
    complete: boolean;
    rawPushCount: number;
    expected: FixtureCase["expected"] & { status: ThreadSnapshotStatus };
  }>;
  expectedNormalizedEvents?: NormalizedThreadEvent[];
  expectedReplyDetails?: Array<{
    author: string;
    content: string;
    isOP: boolean;
    sourceFloors: number[];
    visible: boolean;
    editKinds: string[];
  }>;
  expectedCommand?: {
    action: "vote-reply" | "withdraw-reply-vote" | "withdraw-article-vote" | "edit-reply";
    actor: string;
    targetFloor?: number;
    direction?: "push" | "boo";
    mode?: "append" | "replace" | "section";
    inputContent?: string;
    changes?: Array<{ start: number; end: number; replacement: string }>;
    pushType?: "push" | "boo" | "neutral";
    content?: string;
    suppressed?: boolean;
    reason?: string;
  };
}

const fixtureArticleKey = { board: "Fixture", index: 1 } as const;

class FixtureCommandGateway implements PttGateway {
  commands: PttCommand[] = [];
  source = "";

  async connect() {}
  async login(input: LoginInput) { return { userId: input.username }; }
  async disconnect() {}
  async listBoards() { return { kind: "boards" as const, items: [] }; }
  async searchBoards() { return { kind: "boards" as const, items: [] }; }
  async filterBoards() { return { kind: "boards" as const, items: [] }; }
  async listArticles() { return { items: [] }; }
  async searchArticles() { return { items: [] }; }
  async filterArticles() { return { items: [] }; }
  async *readArticle(input: GetArticleInput) {
    yield {
      articleKey: input.article,
      completeness: "final" as const,
      rawText: this.source,
      revision: 1,
    };
  }
  async execute(command: PttCommand): Promise<ActionReceipt> {
    this.commands.push(command);
    return { ok: true, outcome: "sent" };
  }
  subscribe(_listener: (event: GatewayEvent) => void) { return () => {}; }
}

function fixtureArticle(fixture: FixtureCase): string {
  const marker = { push: "推", boo: "噓", neutral: "→", edit: "→" } as const;
  return [
    `作者  ${fixture.articleAuthor} (Fixture)                 看板  Fixture`,
    "標題  fixture",
    "時間  Sat Aug 22 10:00:00 2026",
    "───────────────────────────────────────",
    "fixture body",
    ...fixture.rawPushes.map((push) =>
      `${marker[push.type]} ${push.author}: ${push.content} ${push.time}`),
  ].join("\n");
}

function flattenReplies(replies: readonly Reply[]): Reply[] {
  return replies.flatMap((reply) => [reply, ...flattenReplies(reply.children)]);
}

function commandWire(command: PttCommand): { pushType: "push" | "boo" | "neutral"; content: string } {
  switch (command.type) {
    case "vote-floor":
      return { pushType: "neutral", content: `${command.direction === "push" ? "推" : "噓"}${command.floor}樓` };
    case "withdraw-floor-vote":
      return {
        pushType: "neutral",
        content: `撤回我對${command.floor}樓的${command.direction === "push" ? "推" : "噓"}`,
      };
    case "withdraw-article-vote":
      return command.direction === "push"
        ? { pushType: "boo", content: "噓" }
        : { pushType: "push", content: "推" };
    case "edit-floor":
      return {
        pushType: "neutral",
        content: command.mode === "section"
          ? formatSectionEditCommand(command.floor, command.changes)
          : formatEditPushCommand(command.floor, command.mode, command.content),
      };
    default:
      throw new Error(`fixture command is not a push command: ${command.type}`);
  }
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
      "primaryRule",
      "rules",
      "articleAuthor",
      "rawPushes",
      "opEditedReplies",
      "expected",
      "expectedArticleScores",
      "stages",
      "expectedNormalizedEvents",
      "expectedReplyDetails",
      "expectedCommand",
    ]);
    assertNonEmptyString(fixture.id, `${path}.id`);
    assertNonEmptyString(fixture.primaryRule, `${path}.primaryRule`);
    assertStringArray(fixture.rules, `${path}.rules`);
    if (fixture.rules.length === 0) throw new Error(`${path}.rules must not be empty`);
    if (new Set(fixture.rules).size !== fixture.rules.length) {
      throw new Error(`${path}.rules must be unique`);
    }
    fixture.rules.forEach((rule, ruleIndex) => {
      if (!/^(RAW|MERGE|THREAD|VOTE|EDIT|OP)-[0-9]{3}\.[0-9]+$/u.test(rule)) {
        throw new Error(`${path}.rules[${ruleIndex}] is invalid`);
      }
    });
    if (!/^(RAW|MERGE|THREAD|VOTE|EDIT|OP)-[0-9]{3}\.[0-9]+$/u.test(fixture.primaryRule)) {
      throw new Error(`${path}.primaryRule is invalid`);
    }
    if (!fixture.rules.includes(fixture.primaryRule)) {
      throw new Error(`${path}.primaryRule must be included in rules`);
    }
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
        "remainingContentColumns",
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
      if (
        push.remainingContentColumns !== undefined &&
        (!Number.isInteger(push.remainingContentColumns) || push.remainingContentColumns < 0)
      ) {
        throw new Error(`${pushPath}.remainingContentColumns must be a non-negative integer`);
      }
      if (push.isFullWidthLine !== undefined && typeof push.isFullWidthLine !== "boolean") {
        throw new Error(`${pushPath}.isFullWidthLine must be a boolean`);
      }
    });
    if (fixture.opEditedReplies !== undefined) {
      if (!Array.isArray(fixture.opEditedReplies)) {
        throw new Error(`${path}.opEditedReplies must be an array`);
      }
      fixture.opEditedReplies.forEach((segment, segmentIndex) => {
        const segmentPath = `${path}.opEditedReplies[${segmentIndex}]`;
        assertRecord(segment, segmentPath, [
          "marker",
          "content",
          "rawBlock",
          "contentAnchorOffset",
          "markerOffset",
        ]);
        assertString(segment.marker, `${segmentPath}.marker`);
        assertString(segment.content, `${segmentPath}.content`);
        assertString(segment.rawBlock, `${segmentPath}.rawBlock`);
        assertIntegerAtLeast(segment.contentAnchorOffset, 0, `${segmentPath}.contentAnchorOffset`);
        assertIntegerAtLeast(segment.markerOffset, 0, `${segmentPath}.markerOffset`);
      });
    }
    validateExpected(fixture.expected, `${path}.expected`);
    if (fixture.expectedArticleScores !== undefined) {
      const scorePath = `${path}.expectedArticleScores`;
      assertRecord(fixture.expectedArticleScores, scorePath, [
        "articlePushCount",
        "articleBooCount",
        "articleScore",
        "nativePushCount",
        "nativeBooCount",
        "nativeArticleScore",
      ]);
      for (const key of [
        "articlePushCount",
        "articleBooCount",
        "articleScore",
        "nativePushCount",
        "nativeBooCount",
        "nativeArticleScore",
      ] as const) {
        if (!Number.isInteger(fixture.expectedArticleScores[key])) {
          throw new Error(`${scorePath}.${key} must be an integer`);
        }
      }
    }
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
    if (fixture.expectedReplyDetails !== undefined) {
      if (!Array.isArray(fixture.expectedReplyDetails)) {
        throw new Error(`${path}.expectedReplyDetails must be an array`);
      }
      fixture.expectedReplyDetails.forEach((reply, replyIndex) => {
        const replyPath = `${path}.expectedReplyDetails[${replyIndex}]`;
        assertRecord(reply, replyPath, [
          "author",
          "content",
          "isOP",
          "sourceFloors",
          "visible",
          "editKinds",
        ]);
        assertString(reply.author, `${replyPath}.author`);
        assertString(reply.content, `${replyPath}.content`);
        if (typeof reply.isOP !== "boolean") throw new Error(`${replyPath}.isOP must be a boolean`);
        if (!Array.isArray(reply.sourceFloors)) throw new Error(`${replyPath}.sourceFloors must be an array`);
        reply.sourceFloors.forEach((floor, floorIndex) =>
          assertIntegerAtLeast(floor, 1, `${replyPath}.sourceFloors[${floorIndex}]`));
        if (typeof reply.visible !== "boolean") throw new Error(`${replyPath}.visible must be a boolean`);
        assertStringArray(reply.editKinds, `${replyPath}.editKinds`);
      });
    }
    if (fixture.expectedCommand !== undefined) {
      const commandPath = `${path}.expectedCommand`;
      assertRecord(fixture.expectedCommand, commandPath, [
        "action",
        "actor",
        "targetFloor",
        "direction",
        "mode",
        "inputContent",
        "changes",
        "pushType",
        "content",
        "suppressed",
        "reason",
      ]);
      assertNonEmptyString(fixture.expectedCommand.action, `${commandPath}.action`);
      assertNonEmptyString(fixture.expectedCommand.actor, `${commandPath}.actor`);
      if (fixture.expectedCommand.targetFloor !== undefined) {
        assertIntegerAtLeast(fixture.expectedCommand.targetFloor, 1, `${commandPath}.targetFloor`);
      }
      if (
        fixture.expectedCommand.direction !== undefined &&
        !["push", "boo"].includes(fixture.expectedCommand.direction)
      ) throw new Error(`${commandPath}.direction is invalid`);
      if (
        fixture.expectedCommand.mode !== undefined &&
        !["append", "replace", "section"].includes(fixture.expectedCommand.mode)
      ) throw new Error(`${commandPath}.mode is invalid`);
      if (fixture.expectedCommand.inputContent !== undefined) {
        assertString(fixture.expectedCommand.inputContent, `${commandPath}.inputContent`);
      }
      if (fixture.expectedCommand.changes !== undefined) {
        if (!Array.isArray(fixture.expectedCommand.changes)) {
          throw new Error(`${commandPath}.changes must be an array`);
        }
        fixture.expectedCommand.changes.forEach((change, changeIndex) => {
          const changePath = `${commandPath}.changes[${changeIndex}]`;
          assertRecord(change, changePath, ["start", "end", "replacement"]);
          assertIntegerAtLeast(change.start, 0, `${changePath}.start`);
          assertIntegerAtLeast(change.end, 0, `${changePath}.end`);
          assertString(change.replacement, `${changePath}.replacement`);
        });
      }
      switch (fixture.expectedCommand.action) {
        case "vote-reply":
        case "withdraw-reply-vote":
          if (fixture.expectedCommand.targetFloor === undefined) {
            throw new Error(`${commandPath}.targetFloor is required`);
          }
          if (fixture.expectedCommand.direction === undefined) {
            throw new Error(`${commandPath}.direction is required`);
          }
          break;
        case "withdraw-article-vote":
          if (fixture.expectedCommand.direction === undefined) {
            throw new Error(`${commandPath}.direction is required`);
          }
          break;
        case "edit-reply":
          if (fixture.expectedCommand.targetFloor === undefined) {
            throw new Error(`${commandPath}.targetFloor is required`);
          }
          if (fixture.expectedCommand.mode === undefined) {
            throw new Error(`${commandPath}.mode is required`);
          }
          if (
            fixture.expectedCommand.mode === "section" &&
            !fixture.expectedCommand.changes?.length
          ) throw new Error(`${commandPath}.changes is required`);
          if (
            fixture.expectedCommand.mode !== "section" &&
            fixture.expectedCommand.inputContent === undefined
          ) throw new Error(`${commandPath}.inputContent is required`);
          break;
        default:
          throw new Error(`${commandPath}.action is invalid`);
      }
      if (fixture.expectedCommand.suppressed === true) {
        assertNonEmptyString(fixture.expectedCommand.reason, `${commandPath}.reason`);
      } else {
        if (!fixture.expectedCommand.pushType || !["push", "boo", "neutral"].includes(fixture.expectedCommand.pushType)) {
          throw new Error(`${commandPath}.pushType is invalid`);
        }
        assertString(fixture.expectedCommand.content, `${commandPath}.content`);
      }
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

function stableThread(
  rawPushes: RawPush[],
  articleAuthor: string,
  opEditedReplies: OpEditedReplySegment[] = [],
) {
  return stableAggregatedThread(aggregatePushes(rawPushes, articleAuthor, opEditedReplies));
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
    primaryRule: "RAW-001.1",
    rules: ["RAW-001.1"],
    articleAuthor: "op",
    rawPushes: [],
    expected: validExpected(),
  };
}

function whitepaperRuleDetails(document: string): string[] {
  const details: string[] = [];
  let currentRule: string | null = null;

  for (const line of document.split("\n")) {
    const heading = line.match(/^#### ([A-Z]+-[0-9]{3})\b/u);
    if (heading) {
      currentRule = heading[1];
      continue;
    }
    if (/^#{1,6}\s/u.test(line)) {
      currentRule = null;
      continue;
    }
    const item = line.match(/^([0-9]+)\.\s/u);
    if (currentRule && item) details.push(`${currentRule}.${item[1]}`);
  }

  return details;
}

describe("whitepaper conformance fixtures", () => {
  const fixtureFiles = [
    { name: "raw.json", prefix: "RAW", cases: rawCases },
    { name: "merge.json", prefix: "MERGE", cases: mergeCases },
    { name: "thread.json", prefix: "THREAD", cases: threadCases },
    { name: "vote.json", prefix: "VOTE", cases: voteCases },
    { name: "edit.json", prefix: "EDIT", cases: editCases },
    { name: "op.json", prefix: "OP", cases: opCases },
  ] as const;
  const cases = validateFixtureCases(fixtureFiles.flatMap((file) => file.cases));

  describe("fixture contract", () => {
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
          primaryRule: "RAW-001.1",
          rules: ["RAW-001.1"],
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

  it("rejects fixtures without a primary rule detail", () => {
    const fixture = validFixtureInput();
    delete fixture.primaryRule;
    expect(() => validateFixtureCases([fixture])).toThrow(/primaryRule/u);
  });

  it.each([
    ["blank id", (fixture: Record<string, unknown>) => { fixture.id = "  "; }, /fixture\[0\]\.id/u],
    ["blank article author", (fixture: Record<string, unknown>) => { fixture.articleAuthor = " "; }, /articleAuthor/u],
    ["empty rules", (fixture: Record<string, unknown>) => { fixture.rules = []; }, /rules/u],
    ["duplicate rules", (fixture: Record<string, unknown>) => { fixture.rules = ["RAW-001.1", "RAW-001.1"]; }, /rules/u],
    ["malformed rule", (fixture: Record<string, unknown>) => { fixture.rules = ["OTHER-001.1"]; }, /rules\[0\]/u],
    ["primary rule outside rules", (fixture: Record<string, unknown>) => {
      fixture.primaryRule = "RAW-001.2";
    }, /primaryRule/u],
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
    ["incomplete executable command", (fixture: Record<string, unknown>) => {
      fixture.expectedCommand = {
        action: "vote-reply",
        actor: "alice",
        targetFloor: 1,
        pushType: "neutral",
        content: "推1樓",
      };
    }, /direction/u],
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
        required: ["id", "primaryRule", "rules", "articleAuthor", "rawPushes", "expected"],
      },
    });
  });

  it("stops assigning numbered details after leaving a rule heading", () => {
    expect(whitepaperRuleDetails([
      "#### OP-002 原發文者文章編輯",
      "",
      "1. 規則內容",
      "",
      "## 規則邊界和系統風險",
      "",
      "1. 風險內容",
    ].join("\n"))).toEqual(["OP-002.1"]);
  });

  it("uses unique case ids and covers every normative rule", () => {
    const ids = cases.map((fixture) => fixture.id);
    expect(new Set(ids).size).toBe(ids.length);

    const ruleIds = whitepaperRuleDetails(whitepaper);
    const referencedRules = new Set(cases.flatMap((fixture) => fixture.rules));
    const primaryRules = new Set(cases.map((fixture) => fixture.primaryRule));

    expect(ruleIds.length).toBeGreaterThan(0);
    expect(new Set(ruleIds).size).toBe(ruleIds.length);
    expect([...referencedRules].filter((id) => !ruleIds.includes(id))).toEqual([]);
    expect(ruleIds.filter((id) => !referencedRules.has(id))).toEqual([]);
    expect(ruleIds.filter((id) => !primaryRules.has(id))).toEqual([]);
  });

  it("keeps each primary rule in the matching fixture file", () => {
    for (const file of fixtureFiles) {
      for (const fixture of validateFixtureCases(file.cases)) {
        expect(fixture.primaryRule.startsWith(`${file.prefix}-`), fixture.id).toBe(true);
      }
    }
  });

  });

  describe("current implementation behavior", () => {

  it.each(cases)("matches $id", ({ rawPushes, articleAuthor, opEditedReplies, expected }) => {
    expect(stableThread(rawPushes, articleAuthor, opEditedReplies)).toEqual(expected);
  });

  it.each(cases.filter((fixture) => fixture.expectedArticleScores))(
    "matches article score domains for $id",
    ({ rawPushes, articleAuthor, opEditedReplies, expectedArticleScores }) => {
      const thread = aggregatePushes(rawPushes, articleAuthor, opEditedReplies);
      expect({
        articlePushCount: thread.articlePushCount,
        articleBooCount: thread.articleBooCount,
        articleScore: thread.articleScore,
        nativePushCount: thread.nativePushCount,
        nativeBooCount: thread.nativeBooCount,
        nativeArticleScore: thread.nativeArticleScore,
      }).toEqual(expectedArticleScores);
    },
  );

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

  it.each(cases.filter((fixture) => fixture.expectedReplyDetails))(
    "matches detailed replies for $id",
    ({ rawPushes, articleAuthor, opEditedReplies, expectedReplyDetails }) => {
      const thread = aggregatePushes(rawPushes, articleAuthor, opEditedReplies);
      expect([...thread.pushes, ...thread.withdrawnPushes].map((reply) => ({
        author: reply.author,
        content: reply.content,
        isOP: reply.isOP,
        sourceFloors: reply.sourceFloors,
        visible: reply.visible !== false,
        editKinds: (reply.editHistory ?? []).map((edit) => edit.kind),
      }))).toEqual(expectedReplyDetails);
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
      expect.objectContaining({ kind: "original", content: "我原本比較推薦方案 A。" }),
      expect.objectContaining({ kind: "replace", content: "回99樓：看完你的補充後，我改推方案 B。" }),
    ]);
  });

  it.each(cases.filter((fixture) => fixture.expectedCommand))(
    "executes the declared sender command for $id",
    async (fixture) => {
      const expected = fixture.expectedCommand!;
      const gateway = new FixtureCommandGateway();
      gateway.source = fixtureArticle(fixture);
      const client = new PttzzzClient(gateway);
      await client.login({ username: expected.actor, password: "fixture" });
      const article = await client.getArticle({
        article: fixtureArticleKey,
        includeDebugMetadata: true,
      });
      if (!article.ok) throw new Error(`${fixture.id}: fixture article did not load`);

      const target = expected.targetFloor === undefined
        ? undefined
        : flattenReplies(article.value.replies).find((reply) =>
          reply.metadata?.sourceFloors?.includes(expected.targetFloor!));
      if (expected.targetFloor !== undefined && !target) {
        throw new Error(`${fixture.id}: target floor ${expected.targetFloor} is not visible`);
      }

      switch (expected.action) {
        case "vote-reply":
          if (!target || !expected.direction) throw new Error(`${fixture.id}: invalid vote command`);
          await client.voteReply({
            article: fixtureArticleKey,
            replyId: target.replyId,
            direction: expected.direction,
          });
          break;
        case "withdraw-reply-vote":
          if (!target || !expected.direction) throw new Error(`${fixture.id}: invalid withdraw command`);
          await client.withdrawReplyVote({
            article: fixtureArticleKey,
            replyId: target.replyId,
            direction: expected.direction,
          });
          break;
        case "withdraw-article-vote":
          if (!expected.direction) throw new Error(`${fixture.id}: invalid article withdrawal`);
          await client.withdrawArticleVote({ article: fixtureArticleKey, direction: expected.direction });
          break;
        case "edit-reply":
          if (!target || !expected.mode) throw new Error(`${fixture.id}: invalid edit command`);
          await client.editReply(expected.mode === "section"
            ? {
                article: fixtureArticleKey,
                replyId: target.replyId,
                mode: "section",
                changes: expected.changes ?? [],
              }
            : {
                article: fixtureArticleKey,
                replyId: target.replyId,
                mode: expected.mode,
                content: expected.inputContent ?? "",
              });
          break;
      }

      if (expected.suppressed) {
        expect(gateway.commands, expected.reason).toEqual([]);
      } else {
        expect(gateway.commands).toHaveLength(1);
        expect(commandWire(gateway.commands[0])).toEqual({
          pushType: expected.pushType,
          content: expected.content,
        });
      }
    },
  );
  });
});
