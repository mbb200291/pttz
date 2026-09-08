export const MAX_PTT_PUSH_BYTES = 80;

export function approximatePttBytes(value: string): number {
  let bytes = 0;
  for (const character of value) bytes += character.codePointAt(0)! > 127 ? 2 : 1;
  return bytes;
}

export function formatReplyPush(floor: number, body: string): string {
  return `回${floor}樓：${body.trim()}`;
}

export function formatReplyVoteCommand(
  floor: number,
  direction: "push" | "boo",
): string {
  return `${direction === "push" ? "推" : "噓"}${floor}樓`;
}

export function formatReplyVoteWithdrawalCommand(
  floor: number,
  direction: "push" | "boo",
): string {
  return `撤回我對${floor}樓的${direction === "push" ? "推" : "噓"}`;
}

export function formatEditPushCommand(
  floor: number,
  mode: "append" | "replace",
  body: string,
): string {
  return `${mode === "append" ? "補充" : "更正"}我在${floor}樓發言：${body.trim()}`;
}

export interface WireSectionChange {
  start: number;
  end: number;
  replacement: string;
}

export function validateSectionChanges(
  changes: readonly WireSectionChange[],
): string | null {
  if (changes.length === 0) return "區段修改至少需要一個範圍";
  const ordered = [...changes].sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 0; index < ordered.length; index += 1) {
    const change = ordered[index];
    if (!Number.isInteger(change.start) || !Number.isInteger(change.end) || change.start < 0 || change.end < change.start) {
      return "區段修改範圍必須是有效的零起點半開區間";
    }
    if (change.replacement.includes(";")) return "區段替代文字不可包含分隔符號 ;";
    const previous = ordered[index - 1];
    if (previous && (
      change.start < previous.end ||
      (change.start === change.end && previous.start === previous.end && change.start === previous.start)
    )) return "區段修改範圍不可互相重疊";
  }
  return null;
}

export function formatSectionEditCommand(
  floor: number,
  changes: readonly WireSectionChange[],
): string {
  const body = changes
    .map(({ start, end, replacement }) => `^${start}:${end}=${replacement}`)
    .join(";");
  return formatEditPushCommand(floor, "replace", body);
}
