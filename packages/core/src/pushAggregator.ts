/**
 * 推文聚合器
 *
 * 依照 idea.md 的規則：
 * 1. 同作者推文在前一則可續接時合併
 * 2. 可續接條件：未用終止符，或以 | 明確標記續接；_ 切斷後續合併
 * 3. 「回x樓：...」識別為嵌套回覆
 * 4. 原 po 回覆標示 isOP
 * 5. 計算每則聚合推文的 score（明確投票的 push - boo）
 */

import type {
  ArticleEditRecord,
  OpEditedReplySegment,
  RawPush,
  PushType,
} from "./parser.js";

type AnchoredRawPush = RawPush & {
  anchorOffset?: number;
  rawFloor?: number;
};

type VoteDirection = "push" | "boo";

interface ParsedPushIntent {
  kind:
    | "plain"
    | "reply"
    | "reply-vote"
    | "article-vote"
    | "reply-vote-withdraw"
    | "edit";
  targetFloor?: number;
  direction?: VoteDirection;
  visibleContent: string;
  isControl: boolean;
  editMode?: "append" | "replace" | "section" | "withdraw";
  sectionChanges?: SectionChange[];
  targetEndFloor?: number;
  /** Relative references start a new structural segment, including fallbacks. */
  relativeUpstairs?: boolean;
}

interface SectionChange {
  start: number;
  end: number;
  replacement: string;
}

type ParsedRawPush = AnchoredRawPush & {
  commandOrder: number;
  intent: ParsedPushIntent;
  originalContent: string;
  structuralContent: string;
  withdrawn: boolean;
  editHistory: PushEditHistoryRecord[];
};

export interface PushEditHistoryRecord {
  kind: "original" | "append" | "replace" | "withdraw";
  /** Zero-based raw command order; authoritative when PTT timestamps tie. */
  commandOrder: number;
  time: string;
  /** Operation payload; original and withdraw use their visible snapshot. */
  content: string;
  /** Content after this operation was applied. */
  resultContent: string;
}

export interface NormalizedThreadEvent {
  rawFloor: number;
  author: string;
  content: string;
  withdrawn: boolean;
  visible: boolean;
}

export interface AggregatedPush {
  id: string;
  type: PushType;
  author: string;
  content: string;
  time: string;
  ipAddresses: string[];
  isOP: boolean;
  replyTo: string | null; // 被回覆推文的 id
  score: number; // 此推文收到的明確投票 push - boo
  floorNumber: number; // 在第一層的樓層號（0-indexed），嵌套推文繼承父層
  anchorOrder: number;
  sourceFloors: number[];
  marker?: string;
  pushVoters: string[]; // 對此聚合推文投「推」的作者（已去重）
  booVoters: string[];  // 對此聚合推文投「噓」的作者（已去重）
  editHistory?: PushEditHistoryRecord[];
  visible?: boolean;
}

export interface AggregatedThread {
  pushes: AggregatedPush[];
  withdrawnPushes: AggregatedPush[];
  articleNotes: ArticleEditRecord[];
  articleScore: number;
  articlePushCount: number;
  articleBooCount: number;
  nativeArticleScore: number;
  nativePushCount: number;
  nativeBooCount: number;
  nativeNeutralCount: number;
  articlePushVoters: string[];
  articleBooVoters: string[];
}

export type ThreadSnapshotStatus = "incomplete" | "final";

export interface AggregatedThreadSnapshot {
  status: ThreadSnapshotStatus;
  thread: AggregatedThread;
}

export function detectArticleVote(content: string): "push" | "boo" | null {
  const normalized = content.trim();
  if (normalized === "推") return "push";
  if (normalized === "噓") return "boo";
  return null;
}

// 同作者不連續但允許合併的最大時間間隔（分鐘）
const TIME_GAP_MINUTES = 2;
const CONTINUATION_MARKER_RE = /\|\s*$/u;
const STOP_MARKER_RE = /_\s*$/u;
// Consume exactly one latest-rule marker; preceding symbols remain literal.
const MERGE_MARKER_RE = /[|_]\s*$/u;
const END_TERMINATOR_RE = /[。.!?！？;；]$/u;

export interface PushAggregationOptions {
  /** Maximum gap for interleaved fragments; consecutive fragments ignore time. Default: 2. */
  nonconsecutiveGapMinutes?: number;
}

export function resolvePushAggregationOptions(options: PushAggregationOptions = {}): Required<PushAggregationOptions> {
  const nonconsecutiveGapMinutes = options.nonconsecutiveGapMinutes ?? TIME_GAP_MINUTES;
  if (!Number.isFinite(nonconsecutiveGapMinutes) || nonconsecutiveGapMinutes < 0) {
    throw new RangeError("nonconsecutiveGapMinutes must be finite and nonnegative");
  }
  return { nonconsecutiveGapMinutes };
}

// ─── 工具函式 ─────────────────────────────────────────────────────────────────

function hasContinuationMarker(content: string): boolean {
  return CONTINUATION_MARKER_RE.test(content.trimEnd());
}

function stripContinuationMarker(content: string): string {
  return content.replace(MERGE_MARKER_RE, "").replace(/[ \t\r\n]+$/g, "");
}

function isFullPushLine(push: ParsedRawPush): boolean {
  if (push.remainingContentColumns !== undefined) {
    return push.remainingContentColumns < 2;
  }
  return push.isFullWidthLine === true;
}

function canContinueFromPush(push: ParsedRawPush): boolean {
  if (STOP_MARKER_RE.test(push.structuralContent)) return false;
  if (hasContinuationMarker(push.structuralContent)) return true;

  const visibleContent = stripContinuationMarker(push.structuralContent);
  return !END_TERMINATOR_RE.test(visibleContent);
}

function mergePushContents(pushes: ParsedRawPush[]): string {
  return joinPushFragments(
    pushes,
    pushes.map((push) => stripContinuationMarker(push.intent.visibleContent)),
  );
}

/** Join already-visible text without interpreting opaque edit payloads as wire syntax. */
function joinPushFragments(pushes: readonly ParsedRawPush[], contents: readonly string[]): string {
  if (pushes.length === 0) return "";

  let merged = contents[0];
  for (let i = 1; i < pushes.length; i += 1) {
    const previous = pushes[i - 1];
    const separator = isFullPushLine(previous) ? "" : "\n";
    merged += `${separator}${contents[i]}`;
  }

  return merged;
}

function mergeOriginalPushContents(pushes: ParsedRawPush[]): string {
  return mergePushContents(
    pushes.map((push) => ({
      ...push,
      intent: { ...push.intent, visibleContent: push.originalContent },
    })),
  );
}

function originalGroupContent(group: PushGroup): string {
  return mergePushContents(
    group.pushes.map((push) => ({
      ...push,
      intent: { ...push.intent, visibleContent: push.structuralContent },
    })),
  );
}

function applySectionChanges(
  content: string,
  changes: readonly SectionChange[],
): string | null {
  const ordered = [...changes].sort((left, right) => left.start - right.start);
  for (let index = 0; index < ordered.length; index += 1) {
    const change = ordered[index];
    const previous = ordered[index - 1];
    if (
      change.start < 0 ||
      change.end < change.start ||
      change.end > content.length ||
      (previous && change.start < previous.end)
    ) {
      return null;
    }
  }

  let result = content;
  for (const change of ordered.reverse()) {
    result = `${result.slice(0, change.start)}${change.replacement}${result.slice(change.end)}`;
  }
  return result;
}

function groupEditResult(
  group: PushGroup,
  parsedPushes: readonly ParsedRawPush[],
): { content: string; history?: PushEditHistoryRecord[] } {
  const originalContent = originalGroupContent(group);
  const sourceFloors = new Set(group.pushes.map((push) => push.rawFloor));
  const author = normalizePttId(group.pushes[0].author);
  const commands = parsedPushes.filter((push) =>
    push.intent.kind === "edit" &&
    push.intent.editMode !== "withdraw" &&
    push.intent.targetFloor !== undefined &&
    sourceFloors.has(push.intent.targetFloor) &&
    push.commandOrder > group.pushes[0].commandOrder &&
    normalizePttId(push.author) === author,
  );
  if (commands.length === 0) return { content: originalContent };

  // Strip original wire markers once; subsequent replacement payloads stay opaque.
  const fragmentContents = group.pushes.map((push) => stripContinuationMarker(push.structuralContent));
  const appendedContents: string[] = [];
  let flattenedContent: string | null = null;
  const renderFragments = () => {
    const merged = joinPushFragments(group.pushes, fragmentContents);
    return appendedContents.length > 0 ? `${merged}\n${appendedContents.join("\n")}` : merged;
  };
  let content = originalContent;
  const history: PushEditHistoryRecord[] = [
    {
      kind: "original",
      commandOrder: Math.min(...group.pushes.map((push) => push.commandOrder)),
      time: group.pushes[0].time,
      content: originalContent,
      resultContent: originalContent,
    },
  ];

  for (const command of commands) {
    const mode = command.intent.editMode;
    if (mode === "append") {
      if (flattenedContent !== null) {
        flattenedContent = flattenedContent
          ? `${flattenedContent}\n${command.intent.visibleContent}`
          : command.intent.visibleContent;
        content = flattenedContent;
      } else {
        appendedContents.push(command.intent.visibleContent);
        content = renderFragments();
      }
    } else if (mode === "replace") {
      if (flattenedContent !== null) {
        flattenedContent = command.intent.visibleContent;
        content = flattenedContent;
      } else {
        const targetIndex = group.pushes.findIndex(
          (push) => push.rawFloor === command.intent.targetFloor,
        );
        if (targetIndex < 0) continue;
        fragmentContents[targetIndex] = command.intent.visibleContent;
        if (group.pushes.length === 1) appendedContents.length = 0;
        content = renderFragments();
      }
    } else if (mode === "section") {
      const result = applySectionChanges(content, command.intent.sectionChanges ?? []);
      if (result === null) continue;
      flattenedContent = result;
      content = flattenedContent;
    }
    history.push({
      kind: mode === "append" ? "append" : "replace",
      commandOrder: command.commandOrder,
      time: command.time,
      content: command.intent.visibleContent,
      resultContent: content,
    });
  }
  return { content, history };
}

function withdrawnGroupEditHistory(group: PushGroup): PushEditHistoryRecord[] | undefined {
  const records = group.pushes
    .flatMap((push) => push.editHistory.slice(1))
    .sort((left, right) => left.commandOrder - right.commandOrder)
    .filter((record, index, all) =>
      index === 0 || record.commandOrder !== all[index - 1].commandOrder,
    );
  if (records.length === 0) return undefined;
  const originalContent = originalGroupContent(group);
  return [{
    kind: "original",
    commandOrder: Math.min(...group.pushes.map((push) => push.commandOrder)),
    time: group.pushes[0].time,
    content: originalContent,
    resultContent: originalContent,
  }, ...records];
}

const PTT_CALENDARS = [
  {
    id: "normal",
    monthDays: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
    yearMinutes: 365 * 24 * 60,
  },
  {
    id: "leap",
    monthDays: [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
    yearMinutes: 366 * 24 * 60,
  },
] as const;

interface PttTimeInterpretation {
  calendar: "normal" | "leap";
  minutes: number;
  yearMinutes: number;
}

/** 解析無年份的 "MM/DD HH:mm" → 所有合法曆法 interpretation */
function parsePttTime(time: string | undefined): PttTimeInterpretation[] {
  if (typeof time !== "string") return [];
  const match = time.match(/^(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/);
  if (!match) return [];
  const [, mm, dd, hh, min] = match.map(Number);
  if (mm < 1 || mm > 12 || dd < 1 || hh > 23 || min > 59) return [];

  return PTT_CALENDARS.flatMap((calendar) => {
    if (dd > calendar.monthDays[mm - 1]) return [];
    const elapsedDays = calendar.monthDays
      .slice(0, mm - 1)
      .reduce((sum, days) => sum + days, dd - 1);
    return [{
      calendar: calendar.id,
      minutes: (elapsedDays * 24 + hh) * 60 + min,
      yearMinutes: calendar.yearMinutes,
    }];
  });
}

/** 計算兩個 PTT 時間字串之間的最短環狀分鐘差 */
function timeDiffMinutes(
  t1: string | undefined,
  t2: string | undefined,
): number | null {
  const first = parsePttTime(t1);
  const second = parsePttTime(t2);
  const differences = first.flatMap((left) =>
    second
      .filter((right) => right.calendar === left.calendar)
      .map((right) => {
        const direct = Math.abs(left.minutes - right.minutes);
        return Math.min(direct, left.yearMinutes - direct);
      }),
  );
  return differences.length > 0 ? Math.min(...differences) : null;
}

// ─── 合併群組 ─────────────────────────────────────────────────────────────────

interface PushGroup {
  pushes: ParsedRawPush[]; // 要合併在一起的原始推文
  anchorOrder: number;
  targetFloor: number | null;
}

/**
 * 第一步：將原始推文分群（同作者可合併者放在同一群）
 */
function groupPushes(
  rawPushes: ParsedRawPush[],
  controlOrders: ReadonlySet<number> = new Set(),
  nonconsecutiveGapMinutes = TIME_GAP_MINUTES,
): PushGroup[] {
  const groups: PushGroup[] = [];

  for (let i = 0; i < rawPushes.length; i++) {
    const cur = rawPushes[i];

    // Vote events must stay independent from adjacent discussion content.
    if (cur.intent.isControl || cur.intent.relativeUpstairs) {
      groups.push({
        pushes: [cur],
        anchorOrder: cur.anchorOffset ?? cur.commandOrder,
        targetFloor: cur.intent.targetFloor ?? null,
      });
      continue;
    }

    if (groups.length === 0) {
      groups.push({
        pushes: [cur],
        anchorOrder: cur.anchorOffset ?? cur.commandOrder,
        targetFloor: cur.intent.targetFloor ?? null,
      });
      continue;
    }

    // 找「同作者的最近一個群組」
    let sameAuthorGroupIdx = -1;
    for (let g = groups.length - 1; g >= 0; g--) {
      if (groups[g].pushes[0].author === cur.author) {
        sameAuthorGroupIdx = g;
        break;
      }
    }

    if (sameAuthorGroupIdx === -1) {
      // 從未出現過此作者
      groups.push({
        pushes: [cur],
        anchorOrder: cur.anchorOffset ?? cur.commandOrder,
        targetFloor: cur.intent.targetFloor ?? null,
      });
      continue;
    }

    const sameGroup = groups[sameAuthorGroupIdx];
    const lastPush = sameGroup.pushes[sameGroup.pushes.length - 1];

    if (lastPush.intent.isControl) {
      groups.push({
        pushes: [cur],
        anchorOrder: cur.anchorOffset ?? cur.commandOrder,
        targetFloor: cur.intent.targetFloor ?? null,
      });
      continue;
    }

    // 明確指向不同樓層的內容不得聚合；沒有 prefix 的續行則繼承前一群的目標。
    const currentTarget = cur.intent.targetFloor ?? sameGroup.targetFloor;
    if (currentTarget !== sameGroup.targetFloor) {
      groups.push({
        pushes: [cur],
        anchorOrder: cur.anchorOffset ?? cur.commandOrder,
        targetFloor: cur.intent.targetFloor ?? null,
      });
      continue;
    }

    const prevGlobal = rawPushes[i - 1];
    const isConsecutive = prevGlobal.author === cur.author;
    const timeDiff = timeDiffMinutes(lastPush.time, cur.time);
    const timeOk = timeDiff !== null && timeDiff <= nonconsecutiveGapMinutes;
    const hasControlBetween = Array.from(controlOrders).some((order) =>
      order > lastPush.commandOrder && order < cur.commandOrder,
    );

    if (!hasControlBetween && canContinueFromPush(lastPush) && (isConsecutive || timeOk)) {
      sameGroup.pushes.push(cur);
    } else {
      groups.push({
        pushes: [cur],
        anchorOrder: cur.anchorOffset ?? cur.commandOrder,
        targetFloor: cur.intent.targetFloor ?? null,
      });
    }
  }

  return groups;
}

// ─── 嵌套偵測 ─────────────────────────────────────────────────────────────────

const FLOOR_NUMBER_SOURCE = "[0-9零〇一二兩三四五六七八九十百千萬]+";
const REPLY_PATTERNS: RegExp[] = [
  new RegExp(`^\\s*回\\s*(${FLOOR_NUMBER_SOURCE})\\s*樓(?=$|[\\s\\u3000：:])(?:[ \\t\\u3000]*[：:][ \\t]*|[ \\t\\u3000]*)([\\s\\S]*)$`, "iu"),
  new RegExp(`^\\s*回\\s*(${FLOOR_NUMBER_SOURCE})\\s*[fF](?=$|[\\s\\u3000：:])(?:[ \\t\\u3000]*[：:][ \\t]*|[ \\t\\u3000]*)([\\s\\S]*)$`, "iu"),
  new RegExp(`^\\s*reply\\s+to\\s+(${FLOOR_NUMBER_SOURCE})\\s*[fF](?=$|[\\s\\u3000：:])(?:[ \\t\\u3000]*[：:][ \\t]*|[ \\t\\u3000]*)([\\s\\S]*)$`, "iu"),
  new RegExp(`^\\s*to\\s*(${FLOOR_NUMBER_SOURCE})\\s*[fF](?=$|[\\s\\u3000：:])(?:[ \\t\\u3000]*[：:][ \\t]*|[ \\t\\u3000]*)([\\s\\S]*)$`, "iu"),
  new RegExp(`^\\s*>>\\s*(${FLOOR_NUMBER_SOURCE})\\s*[fF](?=$|[\\s\\u3000：:])(?:[ \\t\\u3000]*[：:][ \\t]*|[ \\t\\u3000]*)([\\s\\S]*)$`, "iu"),
];

interface ReplyInfo {
  targetFloor: number; // 要回覆的原始樓號（一行一樓）
  strippedContent: string; // 移除「回x樓：」後的內容
}

function detectReply(content: string): ReplyInfo | null {
  for (const pattern of REPLY_PATTERNS) {
    const m = content.match(pattern);
    if (!m) continue;
    const targetFloor = parseFloorNumber(m[1]);
    if (targetFloor === null) return null;
    return {
      targetFloor,
      strippedContent: (m[2] ?? "").replace(/^[ \t]+/u, ""),
    };
  }

  return null;
}

function parseFloorNumber(raw: string): number | null {
  if (/^\d+$/u.test(raw)) return parseInt(raw, 10);

  const normalized = raw.replace(/兩/gu, "二").replace(/〇/gu, "零");
  const digitMap = new Map<string, number>([
    ["零", 0],
    ["一", 1],
    ["二", 2],
    ["三", 3],
    ["四", 4],
    ["五", 5],
    ["六", 6],
    ["七", 7],
    ["八", 8],
    ["九", 9],
  ]);
  const unitMap = new Map<string, number>([
    ["十", 10],
    ["百", 100],
    ["千", 1000],
    ["萬", 10000],
  ]);

  let total = 0;
  let section = 0;
  let number = 0;

  for (const char of normalized) {
    if (digitMap.has(char)) {
      number = digitMap.get(char)!;
      continue;
    }

    const unit = unitMap.get(char);
    if (!unit) return null;

    if (unit === 10000) {
      section = (section + number) * unit;
      total += section;
      section = 0;
      number = 0;
      continue;
    }

    section += (number || 1) * unit;
    number = 0;
  }

  const result = total + section + number;
  return result > 0 ? result : null;
}

// ─── 投票偵測 ─────────────────────────────────────────────────────────────────

const VOTE_PATTERNS: Array<{
  re: RegExp;
  direction: VoteDirection;
}> = [
  {
    re: new RegExp(`^\\s*推\\s*(${FLOOR_NUMBER_SOURCE})\\s*樓(?=$|[\\s\\u3000：:])(?:[\\s\\u3000]*[：:]?[\\s\\u3000]*)([\\s\\S]*)$`, "iu"),
    direction: "push",
  },
  {
    re: new RegExp(`^\\s*(${FLOOR_NUMBER_SOURCE})\\s*樓推一個(?=$|[\\s\\u3000：:])(?:[\\s\\u3000]*[：:]?[\\s\\u3000]*)([\\s\\S]*)$`, "iu"),
    direction: "push",
  },
  {
    re: new RegExp(`^\\s*噓\\s*(${FLOOR_NUMBER_SOURCE})\\s*樓(?=$|[\\s\\u3000：:])(?:[\\s\\u3000]*[：:]?[\\s\\u3000]*)([\\s\\S]*)$`, "iu"),
    direction: "boo",
  },
];

interface VoteInfo {
  targetFloor: number;
  direction: VoteDirection;
}

interface ParsedVoteInfo extends VoteInfo {
  remainingContent: string;
}

function parseVote(content: string): ParsedVoteInfo | null {
  for (const { re, direction } of VOTE_PATTERNS) {
    const m = content.match(re);
    if (!m) continue;
    const targetFloor = parseFloorNumber(m[1]);
    if (targetFloor === null) continue;
    return {
      targetFloor,
      direction,
      remainingContent: (m[2] ?? "").trimStart(),
    };
  }
  return null;
}

export function detectVote(content: string): VoteInfo | null {
  const vote = parseVote(content);
  if (!vote) return null;
  return { targetFloor: vote.targetFloor, direction: vote.direction };
}

function parseSectionChanges(payload: string): SectionChange[] | null {
  if (!payload.startsWith("^")) return null;
  const changes: SectionChange[] = [];
  for (const part of payload.split(";")) {
    const match = part.match(/^\^(\d+):(\d+)=(.*)$/su);
    if (!match) return null;
    changes.push({
      start: Number(match[1]),
      end: Number(match[2]),
      replacement: match[3],
    });
  }
  return changes;
}

function parsePushIntent(content: string): ParsedPushIntent {
  const replyVoteWithdrawal = content.match(
    new RegExp(`^\\s*撤回我對\\s*(${FLOOR_NUMBER_SOURCE})\\s*樓的(推|噓)\\s*$`, "u"),
  );
  if (replyVoteWithdrawal) {
    const targetFloor = parseFloorNumber(replyVoteWithdrawal[1]);
    if (targetFloor !== null) {
      return {
        kind: "reply-vote-withdraw",
        targetFloor,
        direction: replyVoteWithdrawal[2] === "推" ? "push" : "boo",
        visibleContent: "",
        isControl: true,
      };
    }
  }

  const withdrawal = content.match(
    new RegExp(`^\\s*撤回我在\\s*(${FLOOR_NUMBER_SOURCE})\\s*(?:樓\\s*)?(?:[~～-]\\s*(${FLOOR_NUMBER_SOURCE})\\s*樓?)?的發言\\s*$`, "u"),
  );
  if (withdrawal) {
    const targetFloor = parseFloorNumber(withdrawal[1]);
    const targetEndFloor = withdrawal[2]
      ? parseFloorNumber(withdrawal[2])
      : targetFloor;
    if (targetFloor !== null && targetEndFloor !== null) {
      return {
        kind: "edit",
        editMode: "withdraw",
        targetFloor,
        targetEndFloor,
        visibleContent: "",
        isControl: true,
      };
    }
  }

  const continuationEdit = content.match(
    new RegExp(`^\\s*續\\s*(${FLOOR_NUMBER_SOURCE})\\s*[fF]\\s*[：:]\\s*([\\s\\S]*)$`, "u"),
  );
  if (continuationEdit) {
    const targetFloor = parseFloorNumber(continuationEdit[1]);
    if (targetFloor !== null) {
      return {
        kind: "edit",
        editMode: "append",
        targetFloor,
        targetEndFloor: targetFloor,
        visibleContent: continuationEdit[2],
        isControl: true,
      };
    }
  }

  const edit = content.match(
    new RegExp(`^\\s*(補充|修正|更正(?:一下)?)我在\\s*(${FLOOR_NUMBER_SOURCE})\\s*(?:樓|[fF])(?:\\s*(?:說的|的說法|的回覆|發言|的留言))?\\s*[：:]\\s*([\\s\\S]*)$`, "u"),
  );
  if (edit) {
    const targetFloor = parseFloorNumber(edit[2]);
    if (targetFloor !== null) {
      const sectionChanges = edit[1] === "補充" ? null : parseSectionChanges(edit[3]);
      return {
        kind: "edit",
        editMode: edit[1] === "補充" ? "append" : sectionChanges ? "section" : "replace",
        ...(sectionChanges ? { sectionChanges } : {}),
        targetFloor,
        targetEndFloor: targetFloor,
        // Payload is intentionally opaque and never parsed as another command.
        visibleContent: edit[3],
        isControl: true,
      };
    }
  }

  const articleVote = detectArticleVote(content);
  if (articleVote) {
    return {
      kind: "article-vote",
      direction: articleVote,
      visibleContent: "",
      isControl: true,
    };
  }

  const vote = parseVote(content);
  if (vote) {
    return {
      kind: "reply-vote",
      targetFloor: vote.targetFloor,
      direction: vote.direction,
      visibleContent: vote.remainingContent,
      isControl: vote.remainingContent.length === 0,
    };
  }

  const reply = detectReply(content);
  if (reply) {
    return {
      kind: "reply",
      targetFloor: reply.targetFloor,
      visibleContent: reply.strippedContent,
      isControl: false,
    };
  }

  return {
    kind: "plain",
    visibleContent: content,
    isControl: false,
  };
}

function applyPushEdits(pushes: ParsedRawPush[]): void {
  for (const command of pushes) {
    if (command.intent.kind !== "edit") continue;
    const start = command.intent.targetFloor;
    const end = command.intent.targetEndFloor ?? start;
    if (start === undefined || end === undefined) continue;

    const commandAuthor = normalizePttId(command.author);
    for (const target of pushes) {
      const floor = target.rawFloor;
      if (
        floor === undefined ||
        floor >= (command.rawFloor ?? Infinity) ||
        floor < Math.min(start, end) ||
        floor > Math.max(start, end) ||
        normalizePttId(target.author) !== commandAuthor ||
        target.intent.isControl
      ) {
        continue;
      }

      if (target.editHistory.length === 0) {
        target.editHistory.push({
          kind: "original",
          commandOrder: target.commandOrder,
          time: target.time,
          content: target.intent.visibleContent,
          resultContent: target.intent.visibleContent,
        });
      }

      if (command.intent.editMode === "withdraw") {
        target.withdrawn = true;
        target.editHistory.push({
          kind: "withdraw",
          commandOrder: command.commandOrder,
          time: command.time,
          content: " ",
          resultContent: " ",
        });
        continue;
      }

      if (command.intent.editMode === "append") {
        const addition = command.intent.visibleContent;
        target.intent.visibleContent = target.intent.visibleContent
          ? `${target.intent.visibleContent}\n${addition}`
          : addition;
      } else if (command.intent.editMode === "section") {
        const result = applySectionChanges(
          target.intent.visibleContent,
          command.intent.sectionChanges ?? [],
        );
        if (result === null) continue;
        target.intent.visibleContent = result;
      } else {
        target.intent.visibleContent = command.intent.visibleContent;
      }
      target.editHistory.push({
        kind: command.intent.editMode === "append" ? "append" : "replace",
        commandOrder: command.commandOrder,
        time: command.time,
        content: command.intent.visibleContent,
        resultContent: target.intent.visibleContent,
      });
    }
  }
}

function parseAndApplyPushEdits(rawPushes: AnchoredRawPush[]): ParsedRawPush[] {
  const parsedPushes: ParsedRawPush[] = [];
  for (const [index, push] of rawPushes.entries()) {
    const rawFloor = push.rawFloor ?? index + 1;
    const previous = parsedPushes[index - 1];
    // Match only explicit prefixes. Never interpret an edit command's payload.
    const relative = /^\s*(?:[推噓]樓上(?=$|\s|[：:])|回樓上\s*[：:])/u.test(push.content);
    let intent = parsePushIntent(push.content);
    if (relative) {
      if (previous && previous.rawFloor === rawFloor - 1 && !previous.intent.isControl) {
        intent = parsePushIntent(push.content.replace(/樓上/u, `${previous.rawFloor}樓`));
      }
      intent.relativeUpstairs = true;
    }
    parsedPushes.push({
      ...push,
      commandOrder: index,
      rawFloor,
      intent,
      originalContent: push.content,
      structuralContent: intent.visibleContent,
      withdrawn: false,
      editHistory: [],
    });
  }
  applyPushEdits(parsedPushes);
  const byFloor = new Map(parsedPushes.map((push) => [push.rawFloor, push]));
  for (const push of parsedPushes) {
    if (!push.intent.relativeUpstairs || push.intent.targetFloor === undefined) continue;
    if (!byFloor.get(push.intent.targetFloor)?.withdrawn) continue;
    // Content replies keep their original parent, now represented by a tombstone.
    // Pure relative votes retain the existing unavailable-target fallback.
    if (!push.intent.isControl) continue;
    // Losing a target never redirects to another event. Keep edited text opaque.
    const content = push.editHistory.length
      ? push.intent.visibleContent
      : push.originalContent;
    push.intent = { kind: "plain", visibleContent: content, isControl: false, relativeUpstairs: true };
    // Edit replay offsets refer to the original visible body, not its prefix.
    if (!push.editHistory.length) push.structuralContent = push.originalContent;
  }
  return parsedPushes;
}

export function normalizeThreadEvents(
  rawPushes: AnchoredRawPush[],
): NormalizedThreadEvent[] {
  return parseAndApplyPushEdits(rawPushes).map((push) => ({
    rawFloor: push.rawFloor!,
    author: push.author,
    content: push.withdrawn
      ? push.editHistory[push.editHistory.length - 1]?.content ?? " "
      : push.intent.visibleContent,
    withdrawn: push.withdrawn,
    visible: !push.withdrawn && !push.intent.isControl,
  }));
}

function extractAuthorId(author: string): string {
  return author.trim().split(/\s+/u)[0] ?? "";
}

export function normalizePttId(author: string): string {
  return extractAuthorId(author).toLowerCase();
}

function replyIdFromAnchorFloor(floors: readonly number[]): string {
  return `reply:${Math.min(...floors)}`;
}

// ─── 主要匯出 ─────────────────────────────────────────────────────────────────

export function aggregatePushes(
  rawPushes: AnchoredRawPush[],
  articleAuthor: string,
  opReplySegments: OpEditedReplySegment[] = [],
  articleEditRecords: ArticleEditRecord[] = [],
  options: PushAggregationOptions = {},
): AggregatedThread {
  const { nonconsecutiveGapMinutes } = resolvePushAggregationOptions(options);
  const articleAuthorId = normalizePttId(articleAuthor);
  const parsedPushes = parseAndApplyPushEdits(rawPushes);
  const controlOrders = new Set(
    parsedPushes.filter((push) => push.intent.isControl).map((push) => push.commandOrder),
  );

  // Retain fully withdrawn groups as structural anchors without reintroducing
  // withdrawn fragments into partially visible aggregates.
  const withdrawnGroups = groupPushes(
    parsedPushes.filter((push) => !push.intent.isControl), controlOrders, nonconsecutiveGapMinutes,
  ).filter((group) => group.pushes.every((push) => push.withdrawn));
  // Step 1：分群
  const groups = [...groupPushes(
    parsedPushes.filter((push) => !push.withdrawn && !push.intent.isControl),
    controlOrders,
    nonconsecutiveGapMinutes,
  ), ...withdrawnGroups].sort((a, b) => a.pushes[0].commandOrder - b.pushes[0].commandOrder);

  // Step 2：每群合成一則 AggregatedPush（暫時 replyTo=null, score=0）
  const firstLayer: AggregatedPush[] = [];

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const rep = g.pushes[0]; // 代表型別與作者取第一則
    const sourceFloors = g.pushes.map((push, index) => push.rawFloor ?? i + index + 1);
    const editedGroup = groupEditResult(g, parsedPushes);
    const lastTime = g.pushes[g.pushes.length - 1].time;
    const ipAddresses = Array.from(
      new Set(g.pushes.map((p) => p.ipAddress).filter(Boolean)),
    ) as string[];

    firstLayer.push({
      id: replyIdFromAnchorFloor(sourceFloors),
      type: rep.type,
      author: rep.author,
      content: rep.withdrawn ? " " : editedGroup.content,
      time: lastTime,
      ipAddresses,
      isOP: normalizePttId(rep.author) === articleAuthorId,
      replyTo: null,
      score: 0,
      floorNumber: i, // 暫定，後面篩掉嵌套後重排
      anchorOrder: g.anchorOrder,
      sourceFloors,
      pushVoters: [],
      booVoters: [],
      editHistory: rep.withdrawn ? withdrawnGroupEditHistory(g) : editedGroup.history,
      ...(rep.withdrawn ? { visible: false } : {}),
    });
  }

  // Step 2b：收集投票者（誰推了哪一樓 / 噓了哪一樓）
  // 在原始推文層級掃描，以支援同作者先推後噓的覆蓋邏輯
  // Map<pushId, Map<author, "push"|"boo">> 用於覆蓋式去重
  const voterDirectionMap = new Map<string, Map<string, VoteDirection>>();
  for (const rawPush of parsedPushes) {
    if (rawPush.withdrawn) continue;
    const intent = rawPush.intent;
    if (
      intent.kind !== "reply-vote" &&
      intent.kind !== "reply-vote-withdraw" &&
      intent.kind !== "reply"
    ) {
      continue;
    }
    const targetFloor = intent.targetFloor;
    const direction = intent.kind === "reply"
      ? rawPush.type === "push"
        ? "push"
        : rawPush.type === "boo"
          ? "boo"
          : undefined
      : intent.direction;
    if (targetFloor === undefined || direction === undefined) continue;
    const target = firstLayer.find((candidate) =>
      candidate.sourceFloors.includes(targetFloor),
    );
    if (!target || target.visible === false) continue;

    if (!voterDirectionMap.has(target.id)) {
      voterDirectionMap.set(target.id, new Map());
    }
    const authorMap = voterDirectionMap.get(target.id)!;
    const voterId = normalizePttId(rawPush.author);
    const previous = authorMap.get(voterId);
    if (intent.kind === "reply-vote-withdraw") {
      if (previous !== direction) continue;
      if (previous === "push") {
        target.pushVoters = target.pushVoters.filter(
          (author) => normalizePttId(author) !== voterId,
        );
      } else {
        target.booVoters = target.booVoters.filter(
          (author) => normalizePttId(author) !== voterId,
        );
      }
      authorMap.delete(voterId);
      continue;
    }
    if (previous === direction) continue; // 無變化

    // 移除舊方向
    if (previous === "push") {
      target.pushVoters = target.pushVoters.filter(
        (author) => normalizePttId(author) !== voterId,
      );
    } else if (previous === "boo") {
      target.booVoters = target.booVoters.filter(
        (author) => normalizePttId(author) !== voterId,
      );
    }

    // 加入新方向
    if (direction === "push") {
      target.pushVoters.push(rawPush.author);
    } else {
      target.booVoters.push(rawPush.author);
    }
    authorMap.set(voterId, direction);
  }

  for (const push of firstLayer) {
    push.score = push.pushVoters.length - push.booVoters.length;
  }

  // Step 3：偵測嵌套 → 建立 floorNumber 映射（第一層樓號）
  // 先跑一遍，把不是嵌套的推文給 floorNumber
  const topLevel: AggregatedPush[] = [];
  let floor = 1;
  for (let i = 0; i < firstLayer.length; i += 1) {
    const p = firstLayer[i];
    const targetFloor = groups[i].targetFloor;
    if (targetFloor !== null) {
      const target = firstLayer.find((candidate) =>
        candidate.sourceFloors.includes(targetFloor),
      );
      const firstSourceFloor = Math.min(...p.sourceFloors);
      if (
        target &&
        target.id !== p.id &&
        targetFloor < firstSourceFloor &&
        target.anchorOrder < p.anchorOrder
      ) {
        p.replyTo = target.id;
        p.floorNumber = target.floorNumber;
      } else {
        p.replyTo = null;
        if (p.visible !== false) p.content = mergeOriginalPushContents(groups[i].pushes);
        p.floorNumber = floor;
        floor++;
        topLevel.push(p);
      }
    } else {
      p.floorNumber = floor;
      floor++;
      topLevel.push(p);
    }
  }

  const sortedEditNotes = [...opReplySegments].sort((a, b) => {
    return a.contentAnchorOffset - b.contentAnchorOffset;
  });
  const threadPushes = [...firstLayer];
  // A target-local event ordinal is stable when earlier article text changes byte offsets.
  const editOrdinalByTarget = new Map<string, number>();

  for (const note of sortedEditNotes) {
    let target: AggregatedPush | undefined;
    let targetOrder = -Infinity;

    for (let i = 0; i < firstLayer.length; i += 1) {
      const candidate = firstLayer[i];
      const candidateLastOrder = Math.max(
        ...groups[i].pushes.map((push, pushIndex) =>
          push.anchorOffset ?? candidate.anchorOrder + pushIndex,
        ),
      );
      if (
        candidateLastOrder < note.contentAnchorOffset &&
        candidateLastOrder > targetOrder
      ) {
        target = candidate;
        targetOrder = candidateLastOrder;
      }
    }

    if (target) {
      const ordinal = (editOrdinalByTarget.get(target.id) ?? 0) + 1;
      editOrdinalByTarget.set(target.id, ordinal);
      threadPushes.push({
        id: `edit:${target.id}:${ordinal}`,
        type: "edit",
        author: articleAuthor,
        content: note.content,
        time: "",
        ipAddresses: [],
        isOP: true,
        replyTo: target.id,
        score: 0,
        floorNumber: target.floorNumber,
        anchorOrder: note.contentAnchorOffset,
        sourceFloors: [],
        marker: note.marker,
        pushVoters: [],
        booVoters: [],
      });
    }
  }

  const articleVoters = new Map<string, { author: string; direction: VoteDirection }>();
  for (const rawPush of parsedPushes) {
    if (rawPush.withdrawn || rawPush.intent.kind !== "article-vote") continue;
    const direction = rawPush.intent.direction;
    if (!direction) continue;
    const voterId = normalizePttId(rawPush.author);
    const previous = articleVoters.get(voterId);
    if (previous?.direction === direction) continue;
    if (previous && previous.direction !== direction) {
      articleVoters.delete(voterId);
      continue;
    }
    articleVoters.set(voterId, { author: rawPush.author, direction });
  }

  const nativePushCount = rawPushes.filter((push) => push.type === "push").length;
  const nativeBooCount = rawPushes.filter((push) => push.type === "boo").length;
  const nativeNeutralCount = rawPushes.filter((push) => push.type === "neutral").length;
  const nestedVisibleFloors = new Set(
    firstLayer
      .filter((push) => push.visible !== false && push.replyTo !== null)
      .flatMap((push) => push.sourceFloors),
  );
  const proposalExcludedFloors = new Set([
    ...nestedVisibleFloors,
    ...parsedPushes
      .filter((push) => push.intent.kind === "reply-vote")
      .flatMap((push) => push.rawFloor === undefined ? [] : [push.rawFloor]),
  ]);
  const articlePushCount = parsedPushes.filter((push) =>
    push.type === "push" && !proposalExcludedFloors.has(push.rawFloor!),
  ).length;
  const articleBooCount = parsedPushes.filter((push) =>
    push.type === "boo" && !proposalExcludedFloors.has(push.rawFloor!),
  ).length;
  const withdrawnPushes = threadPushes.filter((push) => push.visible === false);

  return {
    pushes: threadPushes.filter((push) => push.visible !== false),
    withdrawnPushes,
    articleNotes: articleEditRecords,
    articleScore: articlePushCount - articleBooCount,
    articlePushCount,
    articleBooCount,
    nativeArticleScore: nativePushCount - nativeBooCount,
    nativePushCount,
    nativeBooCount,
    nativeNeutralCount,
    articlePushVoters: [...articleVoters.values()]
      .filter((vote) => vote.direction === "push")
      .map((vote) => vote.author),
    articleBooVoters: [...articleVoters.values()]
      .filter((vote) => vote.direction === "boo")
      .map((vote) => vote.author),
  };
}

export function aggregateThreadSnapshot(
  rawPushes: AnchoredRawPush[],
  articleAuthor: string,
  complete: boolean,
  options: PushAggregationOptions = {},
): AggregatedThreadSnapshot {
  return {
    status: complete ? "final" : "incomplete",
    thread: aggregatePushes(rawPushes, articleAuthor, [], [], options),
  };
}

/**
 * 計算文章的推/噓總分（只看第一層非嵌套推文）
 */
export function calcArticleScore(pushes: Array<Pick<RawPush, "type">>): number {
  return pushes.reduce((score, push) => {
    if (push.type === "push") return score + 1;
    if (push.type === "boo") return score - 1;
    return score;
  }, 0);
}
