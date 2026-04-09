import { stripAnsi } from "./parser";
import type { SessionState } from "./session";

export function getEnterBoardCommand(
  state: SessionState,
  boardName: string,
  raw = "",
): string {
  if (state === "board_list") {
    const plain = stripAnsi(raw);
    const selectedBoardRe = new RegExp(
      `●\\s+\\d+\\s+ˇ?${boardName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "u",
    );

    if (selectedBoardRe.test(plain)) {
      return "\x1b[C";
    }
  }

  return `s ${boardName}\r`;
}
