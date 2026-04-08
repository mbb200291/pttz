import type { SessionState } from "./session";

export function getEnterBoardCommand(
  state: SessionState,
  boardName: string,
): string {
  return `s ${boardName}\r`;
}
