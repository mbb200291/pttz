export const MAX_PTT_PUSH_BYTES = 80;

export function approximatePttBytes(value: string): number {
  let bytes = 0;
  for (const character of value) bytes += character.codePointAt(0)! > 127 ? 2 : 1;
  return bytes;
}

export function formatReplyPush(floor: number, body: string): string {
  return `回${floor}樓：${body.trim()}`;
}

export function formatEditPushCommand(
  floor: number,
  mode: "append" | "replace",
  body: string,
): string {
  return `${mode === "append" ? "補充" : "更正"}我在${floor}樓發言：${body.trim()}`;
}
