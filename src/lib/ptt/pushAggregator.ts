/**
 * 推文聚合器
 *
 * 依照 idea.md 的規則：
 * 1. 同作者推文在前一則可續接時合併
 * 2. 可續接條件：未用終止符，或以 || 明確標記續接
 * 3. 「回x樓：...」識別為嵌套回覆
 * 4. 原 po 回覆標示 isOP
 * 5. 計算每則聚合推文的 score（明確投票的 push - boo）
 */

import type {
  ArticleEditRecord,
  OpEditedReplySegment,
  RawPush,
  PushType,
} from "./parser";

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
  editMode?: "append" | "replace" | "withdraw";
  targetEndFloor?: number;
}

type ParsedRawPush = AnchoredRawPush & {
  intent: ParsedPushIntent;
  originalContent: string;
  structuralContent: string;
  withdrawn: boolean;
  editHistory: PushEditHistoryRecord[];
};

export interface PushEditHistoryRecord {
  time: string;
  content: string;
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
}

export interface AggregatedThread {
  pushes: AggregatedPush[];
  articleNotes: ArticleEditRecord[];
  nativeArticleScore: number;
  nativePushCount: number;
  nativeBooCount: number;
  nativeNeutralCount: number;
  articlePushVoters: string[];
  articleBooVoters: string[];
}

export function detectArticleVote(content: string): "push" | "boo" | null {
  const normalized = content.trim();
  if (normalized === "推") return "push";
  if (normalized === "噓") return "boo";
  return null;
}

// PTT 推文內容區會受作者欄、IP 與時間欄擠壓；約 37 bytes 已會貼近 IP 欄。
const MIN_FULL_PUSH_BYTES = 37;
// 同作者不連續但允許合併的最大時間間隔（分鐘）
const TIME_GAP_MINUTES = 5;
const MAX_NESTED_REPLY_DEPTH = 2; // top-level=0, nested replies can display up to third layer
const CONTINUATION_MARKER_RE = /\|\|\s*$/u;
const END_TERMINATOR_RE = /[。.!?！？;；]$/u;

// ─── 工具函式 ─────────────────────────────────────────────────────────────────

/** 計算字串的 Big5 byte 長度（近似：ASCII = 1 byte，非 ASCII = 2 bytes） */
function approximateBytes(s: string): number {
  let count = 0;
  for (const ch of s) {
    count += ch.codePointAt(0)! > 127 ? 2 : 1;
  }
  return count;
}

/** 判斷此推文內容是否「塞滿」（接近 PTT 推文欄位上限） */
function isFull(content: string): boolean {
  return approximateBytes(content) >= MIN_FULL_PUSH_BYTES;
}

function hasContinuationMarker(content: string): boolean {
  return CONTINUATION_MARKER_RE.test(content.trimEnd());
}

function stripContinuationMarker(content: string): string {
  return content.replace(CONTINUATION_MARKER_RE, "").trimEnd();
}

function isFullPushLine(push: ParsedRawPush): boolean {
  const visibleContent = stripContinuationMarker(push.structuralContent);
  return push.isFullWidthLine ?? isFull(visibleContent);
}

function canContinueFromPush(push: ParsedRawPush): boolean {
  if (hasContinuationMarker(push.structuralContent)) return true;

  const visibleContent = stripContinuationMarker(push.structuralContent);
  return !END_TERMINATOR_RE.test(visibleContent);
}

function mergePushContents(pushes: ParsedRawPush[]): string {
  if (pushes.length === 0) return "";

  let merged = stripContinuationMarker(pushes[0].intent.visibleContent);
  for (let i = 1; i < pushes.length; i += 1) {
    const previous = pushes[i - 1];
    const current = stripContinuationMarker(pushes[i].intent.visibleContent);
    const separator = isFullPushLine(previous) ? "" : "\n";
    merged += `${separator}${current}`;
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

function buildGroupEditHistory(group: PushGroup): PushEditHistoryRecord[] | undefined {
  const editedPushes = group.pushes.filter((push) => push.editHistory.length > 0);
  if (editedPushes.length === 0) return undefined;
  if (group.pushes.length === 1) return group.pushes[0].editHistory;

  const originalContent = mergePushContents(
    group.pushes.map((push) => ({
      ...push,
      intent: { ...push.intent, visibleContent: push.structuralContent },
    })),
  );
  const editRecords = editedPushes.flatMap((push) => push.editHistory.slice(1));
  const latestEdit = editRecords[editRecords.length - 1];
  const lastPush = group.pushes[group.pushes.length - 1];
  return [
    { time: group.pushes[0].time, content: originalContent },
    { time: latestEdit?.time ?? lastPush?.time ?? "", content: mergePushContents(group.pushes) },
  ];
}

/** 解析 "MM/DD HH:mm" → 當年的分鐘數（用於計算時間差） */
function parsePttTime(time: string): number {
  // "12/31 23:59"
  const match = time.match(/^(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/);
  if (!match) return 0;
  const [, mm, dd, hh, min] = match.map(Number);
  // 粗略換算成分鐘（跨年不處理，僅比較間隔）
  return ((mm * 31 + dd) * 24 + hh) * 60 + min;
}

/** 計算兩個 PTT 時間字串之間的分鐘差（絕對值） */
function timeDiffMinutes(t1: string, t2: string): number {
  return Math.abs(parsePttTime(t1) - parsePttTime(t2));
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
function groupPushes(rawPushes: ParsedRawPush[]): PushGroup[] {
  const groups: PushGroup[] = [];

  for (let i = 0; i < rawPushes.length; i++) {
    const cur = rawPushes[i];

    // Vote events must stay independent from adjacent discussion content.
    if (cur.intent.isControl) {
      groups.push({
        pushes: [cur],
        anchorOrder: cur.anchorOffset ?? i,
        targetFloor: cur.intent.targetFloor ?? null,
      });
      continue;
    }

    if (groups.length === 0) {
      groups.push({
        pushes: [cur],
        anchorOrder: cur.anchorOffset ?? i,
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
        anchorOrder: cur.anchorOffset ?? i,
        targetFloor: cur.intent.targetFloor ?? null,
      });
      continue;
    }

    const sameGroup = groups[sameAuthorGroupIdx];
    const lastPush = sameGroup.pushes[sameGroup.pushes.length - 1];

    if (lastPush.intent.isControl) {
      groups.push({
        pushes: [cur],
        anchorOrder: cur.anchorOffset ?? i,
        targetFloor: cur.intent.targetFloor ?? null,
      });
      continue;
    }

    // 明確指向不同樓層的內容不得聚合；沒有 prefix 的續行則繼承前一群的目標。
    const currentTarget = cur.intent.targetFloor ?? sameGroup.targetFloor;
    if (currentTarget !== sameGroup.targetFloor) {
      groups.push({
        pushes: [cur],
        anchorOrder: cur.anchorOffset ?? i,
        targetFloor: cur.intent.targetFloor ?? null,
      });
      continue;
    }

    // 連續同作者：上一則全域推文就是同作者。
    const prevGlobal = rawPushes[i - 1];
    const isConsecutive = prevGlobal.author === cur.author;

    // 前一段必須可續接。非連續時還必須在 k 分鐘內。
    const timeOk =
      timeDiffMinutes(lastPush.time, cur.time) <= TIME_GAP_MINUTES;

    if (canContinueFromPush(lastPush) && (isConsecutive || timeOk)) {
      sameGroup.pushes.push(cur);
    } else {
      groups.push({
        pushes: [cur],
        anchorOrder: cur.anchorOffset ?? i,
        targetFloor: cur.intent.targetFloor ?? null,
      });
    }
  }

  return groups;
}

// ─── 嵌套偵測 ─────────────────────────────────────────────────────────────────

const FLOOR_NUMBER_SOURCE = "[0-9零〇一二兩三四五六七八九十百千萬]+";
const REPLY_PATTERNS: RegExp[] = [
  new RegExp(`^\\s*回\\s*(${FLOOR_NUMBER_SOURCE})\\s*樓(?=$|[\\s\\u3000：:])(?:[\\s\\u3000]*[：:]?[\\s\\u3000]*)([\\s\\S]*)$`, "iu"),
  new RegExp(`^\\s*回\\s*(${FLOOR_NUMBER_SOURCE})\\s*[fF](?=$|[\\s\\u3000：:])(?:[\\s\\u3000]*[：:]?[\\s\\u3000]*)([\\s\\S]*)$`, "iu"),
  new RegExp(`^\\s*reply\\s+to\\s+(${FLOOR_NUMBER_SOURCE})\\s*[fF](?=$|[\\s\\u3000：:])(?:[\\s\\u3000]*[：:]?[\\s\\u3000]*)([\\s\\S]*)$`, "iu"),
  new RegExp(`^\\s*to\\s*(${FLOOR_NUMBER_SOURCE})\\s*[fF](?=$|[\\s\\u3000：:])(?:[\\s\\u3000]*[：:]?[\\s\\u3000]*)([\\s\\S]*)$`, "iu"),
  new RegExp(`^\\s*>>\\s*(${FLOOR_NUMBER_SOURCE})\\s*[fF](?=$|[\\s\\u3000：:])(?:[\\s\\u3000]*[：:]?[\\s\\u3000]*)([\\s\\S]*)$`, "iu"),
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
      strippedContent: (m[2] ?? "").trimStart(),
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

  const edit = content.match(
    new RegExp(`^\\s*(補充|修正|更正(?:一下)?)我在\\s*(${FLOOR_NUMBER_SOURCE})\\s*樓(?:\\s*(?:說的|的說法|的回覆|發言))?\\s*[：:]\\s*([\\s\\S]*)$`, "u"),
  );
  if (edit) {
    const targetFloor = parseFloorNumber(edit[2]);
    if (targetFloor !== null) {
      return {
        kind: "edit",
        editMode: edit[1] === "補充" ? "append" : "replace",
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
          time: target.time,
          content: target.intent.visibleContent,
        });
      }

      if (command.intent.editMode === "withdraw") {
        target.withdrawn = true;
        target.editHistory.push({ time: command.time, content: " " });
        continue;
      }

      if (command.intent.editMode === "append") {
        const addition = command.intent.visibleContent;
        target.intent.visibleContent = target.intent.visibleContent
          ? `${target.intent.visibleContent}\n${addition}`
          : addition;
      } else {
        target.intent.visibleContent = command.intent.visibleContent;
      }
      target.editHistory.push({
        time: command.time,
        content: target.intent.visibleContent,
      });
    }
  }
}

function extractAuthorId(author: string): string {
  return author.trim().split(/\s+/u)[0] ?? "";
}

export function normalizePttId(author: string): string {
  return extractAuthorId(author).toLowerCase();
}

function getReplyDepth(
  push: AggregatedPush,
  pushById: Map<string, AggregatedPush>,
): number {
  let depth = 0;
  let current = push;
  const visited = new Set<string>();

  while (current.replyTo) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    const parent = pushById.get(current.replyTo);
    if (!parent) break;
    depth += 1;
    current = parent;
  }

  return depth;
}

function clampReplyTargetDepth(
  target: AggregatedPush,
  pushById: Map<string, AggregatedPush>,
): AggregatedPush {
  let current = target;
  let depth = getReplyDepth(current, pushById);
  const visited = new Set<string>();

  while (depth >= MAX_NESTED_REPLY_DEPTH && current.replyTo) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    const parent = pushById.get(current.replyTo);
    if (!parent) break;
    current = parent;
    depth -= 1;
  }

  return current;
}

// ─── 主要匯出 ─────────────────────────────────────────────────────────────────

export function aggregatePushes(
  rawPushes: AnchoredRawPush[],
  articleAuthor: string,
  opReplySegments: OpEditedReplySegment[] = [],
  articleEditRecords: ArticleEditRecord[] = [],
): AggregatedThread {
  const articleAuthorId = normalizePttId(articleAuthor);
  const parsedPushes: ParsedRawPush[] = rawPushes.map((push, index) => {
    const intent = parsePushIntent(push.content);
    return {
      ...push,
      rawFloor: push.rawFloor ?? index + 1,
      intent,
      originalContent: push.content,
      structuralContent: intent.visibleContent,
      withdrawn: false,
      editHistory: [],
    };
  });
  applyPushEdits(parsedPushes);

  // Step 1：分群
  const groups = groupPushes(
    parsedPushes.filter((push) => !push.withdrawn && !push.intent.isControl),
  );

  // Step 2：每群合成一則 AggregatedPush（暫時 replyTo=null, score=0）
  const firstLayer: AggregatedPush[] = [];

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const rep = g.pushes[0]; // 代表型別與作者取第一則
    const mergedContent = mergePushContents(g.pushes);
    const lastTime = g.pushes[g.pushes.length - 1].time;
    const ipAddresses = Array.from(
      new Set(g.pushes.map((p) => p.ipAddress).filter(Boolean)),
    ) as string[];

    firstLayer.push({
      id: `push-${i}`,
      type: rep.type,
      author: rep.author,
      content: mergedContent,
      time: lastTime,
      ipAddresses,
      isOP: normalizePttId(rep.author) === articleAuthorId,
      replyTo: null,
      score: 0,
      floorNumber: i, // 暫定，後面篩掉嵌套後重排
      anchorOrder: g.anchorOrder,
      sourceFloors: g.pushes.map((push, index) => push.rawFloor ?? i + index + 1),
      pushVoters: [],
      booVoters: [],
      editHistory: buildGroupEditHistory(g),
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
      intent.kind !== "reply-vote-withdraw"
    ) {
      continue;
    }
    const targetFloor = intent.targetFloor;
    const direction = intent.direction;
    if (targetFloor === undefined || direction === undefined) continue;
    const target = firstLayer.find((candidate) =>
      candidate.sourceFloors.includes(targetFloor),
    );
    if (!target) continue;

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
  const pushById = new Map(firstLayer.map((push) => [push.id, push]));
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
        const clampedTarget = clampReplyTargetDepth(target, pushById);
        p.replyTo = clampedTarget.id;
        p.floorNumber = clampedTarget.floorNumber;
      } else {
        p.replyTo = null;
        p.content = mergeOriginalPushContents(groups[i].pushes);
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
      threadPushes.push({
        id: `edit-${threadPushes.length}`,
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

  return {
    pushes: threadPushes,
    articleNotes: articleEditRecords,
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
