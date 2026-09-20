import { describe, expect, it } from "vitest";
import { current, legacy } from "../../test-support/realPttReplay.js";
import { isArticleDeletePrompt, isArticleEditSavePrompt, isPostEditorScreen, isPostGuidelineScreen } from "./terminalDriver.js";

describe("captured article write screens", () => {
  it.each([21, 41, 53])("recognizes the compose editor at frame %i", frame => {
    expect(isPostEditorScreen(current(frame))).toBe(true);
  });
  it.each([24, 43, 56])("recognizes the save question at frame %i", frame => {
    expect(isArticleEditSavePrompt(current(frame))).toBe(true);
    // Recognizing the question alone does not verify the driver's response key.
    expect(current(frame)).toContain("[S/V]");
  });
  it.each([
    ["old", legacy("delete.txt", "prompt in normal Test board")],
    ["new", current(68)],
  ])("recognizes the %s delete confirmation", (_name, screen) => {
    expect(isArticleDeletePrompt(screen)).toBe(true);
  });
  it.each([70, 96])("does not treat verified deletion %i as a new confirmation", frame => {
    expect(isArticleDeletePrompt(current(frame))).toBe(false);
    expect(current(frame)).toContain("(本文已被刪除)");
  });
  it("does not confuse the posting guideline with an editor", () => {
    expect(isPostGuidelineScreen(current(19))).toBe(true);
    expect(isPostEditorScreen(current(19))).toBe(false);
  });
});
