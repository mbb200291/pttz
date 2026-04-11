/**
 * 推文聚合器
 *
 * 依照 idea.md 的規則：
 * 1. 同作者推文在前一則可續接時合併
 * 2. 可續接條件：未用終止符，或以 || 明確標記續接
 * 3. 「回x樓：...」識別為嵌套回覆
 * 4. 原 po 回覆標示 isOP
 * 5. 計算每則聚合推文的 score（其嵌套回覆中 push - boo）
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
  score: number; // 此推文收到的嵌套 push - boo
  floorNumber: number; // 在第一層的樓層號（0-indexed），嵌套推文繼承父層
  anchorOrder: number;
  sourceFloors: number[];
  marker?: string;
}

export interface AggregatedThread {
  pushes: AggregatedPush[];
  articleNotes: ArticleEditRecord[];
}

// PTT 推文內容區會受作者欄、IP 與時間欄擠壓；約 37 bytes 已會貼近 IP 欄。
const MIN_FULL_PUSH_BYTES = 37;
// 同作者不連續但允許合併的最大時間間隔（分鐘）
const TIME_GAP_MINUTES = 5;
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

const REPLY_PATTERNS: RegExp[] = [
  /^回\s*([0-9零〇一二兩三四五六七八九十百千萬]+)\s*樓\s*[：:]?\s*/iu,
  /^回\s*([0-9零〇一二兩三四五六七八九十百千萬]+)\s*[fF]\b\s*[：:]?\s*/iu,
  /^to\s*([0-9零〇一二兩三四五六七八九十百千萬]+)\s*[fF]\b\s*[：:]?\s*/iu,
  /^reply\s+to\s+([0-9零〇一二兩三四五六七八九十百千萬]+)\s*[fF]\b\s*[：:]?\s*/iu,
  /^>>\s*([0-9零〇一二兩三四五六七八九十百千萬]+)\s*[fF]\b\s*[：:]?\s*/iu,
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
      strippedContent: content.slice(m[0].length).trimStart(),
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

function extractAuthorId(author: string): string {
  return author.trim().split(/\s+/u)[0] ?? "";
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
    });
  }

  // Step 3：偵測嵌套 → 建立 floorNumber 映射（第一層樓號）
  // 先跑一遍，把不是嵌套的推文給 floorNumber
  const topLevel: AggregatedPush[] = [];
  let floor = 0;
  for (const p of firstLayer) {
    const reply = detectReply(p.content);
    if (reply) {
      const target = firstLayer.find((candidate) =>
        candidate.sourceFloors.includes(reply.targetFloor),
      );
      if (target && target.id !== p.id && target.anchorOrder < p.anchorOrder) {
        p.replyTo = target.id;
        p.content = reply.strippedContent;
        p.floorNumber = target.floorNumber;
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

  // Step 4：計算 score（每則第一層推文，統計其嵌套回覆的 push-boo）
  const scoreMap = new Map<string, number>();
  for (const p of firstLayer) {
    if (p.replyTo !== null) {
      const delta = p.type === "push" ? 1 : p.type === "boo" ? -1 : 0;
      scoreMap.set(p.replyTo, (scoreMap.get(p.replyTo) ?? 0) + delta);
    }
  }
  for (const p of firstLayer) {
    p.score = scoreMap.get(p.id) ?? 0;
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
      });
    }
  }

  return {
    pushes: threadPushes,
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
