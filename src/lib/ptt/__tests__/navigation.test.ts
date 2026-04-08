import { describe, expect, it } from "vitest";
import { getEnterBoardCommand } from "../navigation";

describe("getEnterBoardCommand", () => {
  it("uses known-board entry from the board list screen", () => {
    expect(getEnterBoardCommand("board_list", "Gossiping")).toBe(
      "s Gossiping\r",
    );
  });

  it("uses search-style entry from the main menu", () => {
    expect(getEnterBoardCommand("main_menu", "Gossiping")).toBe(
      "s Gossiping\r",
    );
  });
});
