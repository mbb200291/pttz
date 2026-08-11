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
}

export interface AggregatedThread {
  pushes: AggregatedPush[];
  articleNotes: ArticleEditRecord[];
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

function isFullPushLine(push: AnchoredRawPush): boolean {
  const visibleContent = stripContinuationMarker(push.content);
  return push.isFullWidthLine ?? isFull(visibleContent);
}

function canContinueFromPush(push: AnchoredRawPush): boolean {
  if (hasContinuationMarker(push.content)) return true;

  const visibleContent = stripContinuationMarker(push.content);
  return !END_TERMINATOR_RE.test(visibleContent);
}

function mergePushContents(pushes: AnchoredRawPush[]): string {
  if (pushes.length === 0) return "";

  let merged = stripContinuationMarker(pushes[0].content);
  for (let i = 1; i < pushes.length; i += 1) {
    const previous = pushes[i - 1];
    const current = stripContinuationMarker(pushes[i].content);
    const separator = isFullPushLine(previous) ? "" : "\n";
    merged += `${separator}${current}`;
  }

  return merged;
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
  pushes: AnchoredRawPush[]; // 要合併在一起的原始推文
  anchorOrder: number;
}

/**
 * 第一步：將原始推文分群（同作者可合併者放在同一群）
 */
function groupPushes(rawPushes: AnchoredRawPush[]): PushGroup[] {
  const groups: PushGroup[] = [];

  for (let i = 0; i < rawPushes.length; i++) {
    const cur = rawPushes[i];

    // 優先檢測純投票：純投票推文獨立成群，不聚合
    if (isPureVote(cur.content)) {
      groups.push({ pushes: [cur], anchorOrder: cur.anchorOffset ?? i });
      continue;
    }

    if (groups.length === 0) {
      groups.push({ pushes: [cur], anchorOrder: cur.anchorOffset ?? i });
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
      groups.push({ pushes: [cur], anchorOrder: cur.anchorOffset ?? i });
      continue;
    }

    const sameGroup = groups[sameAuthorGroupIdx];
    const lastPush = sameGroup.pushes[sameGroup.pushes.length - 1];

    // 若上一推是純投票，不聚合
    if (isPureVote(lastPush.content)) {
      groups.push({ pushes: [cur], anchorOrder: cur.anchorOffset ?? i });
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
      sameGroup.anchorOrder = cur.anchorOffset ?? i;
    } else {
      groups.push({ pushes: [cur], anchorOrder: cur.anchorOffset ?? i });
    }
  }

  return groups;
}

// ─── 嵌套偵測 ─────────────────────────────────────────────────────────────────

const FLOOR_NUMBER_SOURCE = "[0-9零〇一二兩三四五六七八九十百千萬]+";
const REPLY_PATTERNS: RegExp[] = [
  new RegExp(`(^|[\\s\\u3000])回\\s*(${FLOOR_NUMBER_SOURCE})\\s*樓\\s*[：:]?\\s*`, "iu"),
  new RegExp(`(^|[\\s\\u3000])回\\s*(${FLOOR_NUMBER_SOURCE})\\s*[fF]\\b\\s*[：:]?\\s*`, "iu"),
  new RegExp(`(^|[\\s\\u3000])reply\\s+to\\s+(${FLOOR_NUMBER_SOURCE})\\s*[fF]\\b\\s*[：:]?\\s*`, "iu"),
  new RegExp(`(^|[\\s\\u3000])to\\s*(${FLOOR_NUMBER_SOURCE})\\s*[fF]\\b\\s*[：:]?\\s*`, "iu"),
  new RegExp(`(^|[\\s\\u3000])>>\\s*(${FLOOR_NUMBER_SOURCE})\\s*[fF]\\b\\s*[：:]?\\s*`, "iu"),
];

interface ReplyInfo {
  targetFloor: number; // 要回覆的原始樓號（一行一樓）
  strippedContent: string; // 移除「回x樓：」後的內容
}

function detectReply(content: string): ReplyInfo | null {
  for (const pattern of REPLY_PATTERNS) {
    const m = content.match(pattern);
    if (!m) continue;
    const targetFloor = parseFloorNumber(m[2]);
    if (targetFloor === null) return null;
    const before = content.slice(0, m.index).trimEnd();
    const after = content.slice((m.index ?? 0) + m[0].length).trimStart();
    const strippedContent = [before, after].filter(Boolean).join(" ");
    return {
      targetFloor,
      strippedContent,
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
  direction: "push" | "boo";
}> = [
  { re: /^推\s*([0-9零〇一二兩三四五六七八九十百千萬]+)\s*樓/iu, direction: "push" },
  { re: /^([0-9零〇一二兩三四五六七八九十百千萬]+)\s*樓推一個/iu, direction: "push" },
  { re: /^噓\s*([0-9零〇一二兩三四五六七八九十百千萬]+)\s*樓/iu, direction: "boo" },
];

interface VoteInfo {
  targetFloor: number;
  direction: "push" | "boo";
}

export function detectVote(content: string): VoteInfo | null {
  for (const { re, direction } of VOTE_PATTERNS) {
    const m = content.match(re);
    if (!m) continue;
    const targetFloor = parseFloorNumber(m[1]);
    if (targetFloor === null) continue;
    return { targetFloor, direction };
  }
  return null;
}

/**
 * 檢測是否為「純投票」（只有投票操作，後面無其他內容）
 * 例如：「推0樓」是純投票，「推0樓 我同意」不是純投票
 */
function isPureVote(content: string): boolean {
  const vote = detectVote(content);
  if (!vote) return false;

  // 找到投票 pattern 的結尾
  const patterns = [
    /^推\s*([0-9零〇一二兩三四五六七八九十百千萬]+)\s*樓/iu,
    /^([0-9零〇一二兩三四五六七八九十百千萬]+)\s*樓推一個/iu,
    /^噓\s*([0-9零〇一二兩三四五六七八九十百千萬]+)\s*樓/iu,
  ];

  for (const pattern of patterns) {
    const m = content.match(pattern);
    if (!m) continue;

    // 投票後面是否還有其他內容（非空白）
    const afterVote = content.slice(m[0].length).trim();
    return afterVote.length === 0;
  }

  return false;
}

function extractAuthorId(author: string): string {
  return author.trim().split(/\s+/u)[0] ?? "";
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
  const articleAuthorId = extractAuthorId(articleAuthor);

  // Step 1：分群
  const groups = groupPushes(rawPushes);

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
      isOP: rep.author === articleAuthorId,
      replyTo: null,
      score: 0,
      floorNumber: i, // 暫定，後面篩掉嵌套後重排
      anchorOrder: g.anchorOrder,
      sourceFloors: g.pushes.map((push, index) => push.rawFloor ?? i + index + 1),
      pushVoters: [],
      booVoters: [],
    });
  }

  // Step 2b：收集投票者（誰推了哪一樓 / 噓了哪一樓）
  // 在原始推文層級掃描，以支援同作者先推後噓的覆蓋邏輯
  // Map<pushId, Map<author, "push"|"boo">> 用於覆蓋式去重
  const voterDirectionMap = new Map<string, Map<string, "push" | "boo">>();
  for (const rawPush of rawPushes) {
    const vote = detectVote(rawPush.content);
    if (!vote) continue;
    const target = firstLayer.find((candidate) =>
      candidate.sourceFloors.includes(vote.targetFloor),
    );
    if (!target) continue;

    if (!voterDirectionMap.has(target.id)) {
      voterDirectionMap.set(target.id, new Map());
    }
    const authorMap = voterDirectionMap.get(target.id)!;
    const previous = authorMap.get(rawPush.author);
    if (previous === vote.direction) continue; // 無變化

    // 移除舊方向
    if (previous === "push") {
      target.pushVoters = target.pushVoters.filter((a) => a !== rawPush.author);
    } else if (previous === "boo") {
      target.booVoters = target.booVoters.filter((a) => a !== rawPush.author);
    }

    // 加入新方向
    if (vote.direction === "push") {
      target.pushVoters.push(rawPush.author);
    } else {
      target.booVoters.push(rawPush.author);
    }
    authorMap.set(rawPush.author, vote.direction);
  }

  for (const push of firstLayer) {
    push.score = push.pushVoters.length - push.booVoters.length;
  }

  // Step 3：偵測嵌套 → 建立 floorNumber 映射（第一層樓號）
  // 先跑一遍，把不是嵌套的推文給 floorNumber
  const topLevel: AggregatedPush[] = [];
  const pushById = new Map(firstLayer.map((push) => [push.id, push]));
  let floor = 1;
  for (const p of firstLayer) {
    const reply = detectReply(p.content);
    if (reply) {
      const target = firstLayer.find((candidate) =>
        candidate.sourceFloors.includes(reply.targetFloor),
      );
      if (target && target.id !== p.id && target.anchorOrder < p.anchorOrder) {
        const clampedTarget = clampReplyTargetDepth(target, pushById);
        p.replyTo = clampedTarget.id;
        p.content = reply.strippedContent;
        p.floorNumber = clampedTarget.floorNumber;
      } else {
        p.replyTo = null;
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
      if (
        candidate.anchorOrder < note.contentAnchorOffset &&
        candidate.anchorOrder > targetOrder
      ) {
        target = candidate;
        targetOrder = candidate.anchorOrder;
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

  // Step 5：過濾掉純投票推文（不顯示為獨立回文）
  // 純投票已在 Step 2b 時對投票目標記錄過投票者，此處只移除顯示
  const displayedPushes = threadPushes.filter((push) => {
    // 編輯記錄類型保留
    if (push.type === "edit") return true;
    // 檢查是否為純投票推文
    return !isPureVote(push.content);
  });

  return {
    pushes: displayedPushes,
    articleNotes: articleEditRecords,
  };
}

/**
 * 計算文章的推/噓總分（只看第一層非嵌套推文）
 */
export function calcArticleScore(pushes: AggregatedPush[]): number {
  return pushes
    .filter((p) => p.replyTo === null)
    .reduce((acc, p) => {
      if (p.type === "push") return acc + 1;
      if (p.type === "boo") return acc - 1;
      return acc;
    }, 0);
}
