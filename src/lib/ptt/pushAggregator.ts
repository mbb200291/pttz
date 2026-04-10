/**
 * 推文聚合器
 *
 * 依照 idea.md 的規則：
 * 1. 同作者「連續」推文，合併成一則
 * 2. 同作者「不連續」但塞滿且時間間隔小，也合併
 * 3. 「回x樓：...」識別為嵌套回覆
 * 4. 原 po 回覆標示 isOP
 * 5. 計算每則聚合推文的 score（其嵌套回覆中 push - boo）
 */

import type { ArticleEditNote, RawPush, PushType } from "./parser";

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
  articleNotes: ArticleEditNote[];
}

// PTT 推文欄位最大 byte 寬度（Big5 中文 2 bytes/字）
const MAX_PUSH_BYTES = 45;
// 同作者不連續但允許合併的最大時間間隔（分鐘）
const TIME_GAP_MINUTES = 5;

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
  return approximateBytes(content) >= MAX_PUSH_BYTES - 2;
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

    // 連續同作者（同作者群組恰好是 groups 最後一個，且上一則也是同作者）
    const prevGlobal = rawPushes[i - 1];
    const isConsecutive =
      sameAuthorGroupIdx === groups.length - 1 &&
      prevGlobal.author === cur.author;

    if (isConsecutive) {
      sameGroup.pushes.push(cur);
      sameGroup.anchorOrder = cur.anchorOffset ?? i;
      continue;
    }

    // 不連續：前幾則都塞滿、最後一則不以句號結尾、時間間隔夠小
    const allPrevFull = sameGroup.pushes.every((p) => isFull(p.content));
    const lastContent = lastPush.content;
    const noEndPeriod =
      !/[。.!?！？]$/u.test(lastContent);
    const timeOk =
      timeDiffMinutes(lastPush.time, cur.time) <= TIME_GAP_MINUTES;

    if (allPrevFull && noEndPeriod && timeOk) {
      sameGroup.pushes.push(cur);
      sameGroup.anchorOrder = cur.anchorOffset ?? i;
    } else {
      groups.push({ pushes: [cur], anchorOrder: cur.anchorOffset ?? i });
    }
  }

  return groups;
}

// ─── 嵌套偵測 ─────────────────────────────────────────────────────────────────

const REPLY_RE = /^回(\d+)樓[：:]/;

interface ReplyInfo {
  targetFloor: number; // 要回覆的原始樓號（一行一樓）
  strippedContent: string; // 移除「回x樓：」後的內容
}

function detectReply(content: string): ReplyInfo | null {
  const m = content.match(REPLY_RE);
  if (!m) return null;
  return {
    targetFloor: parseInt(m[1], 10),
    strippedContent: content.replace(REPLY_RE, "").trimStart(),
  };
}

// ─── 主要匯出 ─────────────────────────────────────────────────────────────────

export function aggregatePushes(
  rawPushes: AnchoredRawPush[],
  articleAuthor: string,
  editNotes: ArticleEditNote[] = [],
): AggregatedThread {
  // Step 1：分群
  const groups = groupPushes(rawPushes);

  // Step 2：每群合成一則 AggregatedPush（暫時 replyTo=null, score=0）
  const firstLayer: AggregatedPush[] = [];

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const rep = g.pushes[0]; // 代表型別與作者取第一則
    const mergedContent = g.pushes.map((p) => p.content).join("");
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
      isOP: rep.author === articleAuthor,
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
      p.replyTo = target ? target.id : null;
      p.content = reply.strippedContent;
      p.floorNumber = target ? target.floorNumber : floor;
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

  const articleNotes: ArticleEditNote[] = [];
  const sortedEditNotes = [...editNotes].sort((a, b) => {
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
    } else {
      articleNotes.push(note);
    }
  }

  return {
    pushes: threadPushes,
    articleNotes,
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
