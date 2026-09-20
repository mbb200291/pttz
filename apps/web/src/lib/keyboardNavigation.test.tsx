/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canUseShortcut, navigateBoardGrid, navigateList } from "./keyboardNavigation";
afterEach(cleanup);

function setup() {
  const open = vi.fn();
  const back = vi.fn();
  render(<div onKeyDown={(event) => navigateList(event, back)}>
    <button data-navigation-item onClick={open}>第一筆</button>
    <button data-navigation-item disabled>已刪除</button>
    <button data-navigation-item>第三筆</button>
    <input aria-label="搜尋" />
    <div role="button" tabIndex={0} data-navigation-item onClick={open}>看板<button>最愛</button></div>
  </div>);
  return { open, back, first: screen.getByText("第一筆"), third: screen.getByText("第三筆") };
}

describe("scoped keyboard navigation", () => {
  it.each(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"])("initializes an unfocused list on %s without activating/back", (key) => {
    const { open, back, first } = setup();
    fireEvent.keyDown(first.parentElement!, { key });
    expect(first).toHaveFocus();
    expect(open).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });
  it("initializes a grid at the first enabled visible item", () => {
    render(<div onKeyDown={navigateBoardGrid} data-testid="grid">
      <button data-navigation-item disabled>Disabled</button>
      <button data-navigation-item hidden>Hidden</button>
      <button data-navigation-item>Available</button>
    </div>);
    fireEvent.keyDown(screen.getByTestId("grid"), { key: "ArrowLeft" });
    expect(screen.getByText("Available")).toHaveFocus();
  });
  it("guards command shortcuts from editing, dialogs, selection and modifiers", () => {
    const command = vi.fn();
    const { container } = render(<div onKeyDown={(event) => {
      if (canUseShortcut(event)) command();
    }}>
      <button>Command target</button>
      <input aria-label="Command input" />
      <textarea aria-label="Command textarea" />
      <select aria-label="Command select"><option>one</option></select>
      <div contentEditable suppressContentEditableWarning>Editable</div>
      <video aria-label="Command video" />
    </div>);
    const target = screen.getByText("Command target");
    fireEvent.keyDown(target, { key: "x" });
    expect(command).toHaveBeenCalledOnce();
    command.mockClear();
    for (const element of container.querySelectorAll("input, textarea, select, [contenteditable], video")) {
      fireEvent.keyDown(element, { key: "x" });
    }
    for (const extra of [{ repeat: true }, { isComposing: true }, { altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) {
      fireEvent.keyDown(target, { key: "x", ...extra });
    }
    const selection = window.getSelection()!;
    selection.selectAllChildren(target);
    fireEvent.keyDown(target, { key: "x" });
    selection.removeAllRanges();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    target.parentElement!.append(dialog);
    fireEvent.keyDown(target, { key: "x" });
    fireEvent.keyDown(dialog, { key: "x" });
    expect(command).not.toHaveBeenCalled();
  });
  it("moves focus without opening and skips disabled rows", () => {
    const { first, third, open } = setup();
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(third).toHaveFocus();
    fireEvent.keyDown(third, { key: "ArrowUp" });
    expect(first).toHaveFocus();
    expect(open).not.toHaveBeenCalled();
  });
  it("opens with right arrow and goes back with left arrow", () => {
    const { first, open, back } = setup();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(open).toHaveBeenCalledOnce();
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(back).toHaveBeenCalledOnce();
  });
  it("does not intercept inputs, composing text, modifiers or nested actions", () => {
    const { first, open, back } = setup();
    fireEvent.keyDown(screen.getByLabelText("搜尋"), { key: "ArrowLeft" });
    fireEvent.keyDown(first, { key: "ArrowRight", isComposing: true });
    fireEvent.keyDown(first, { key: "ArrowRight", altKey: true });
    fireEvent.keyDown(screen.getByText("最愛"), { key: "ArrowRight" });
    expect(open).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });
  it("activates non-button board cards using Enter", () => {
    const { open } = setup();
    fireEvent.keyDown(screen.getByText("看板"), { key: "Enter" });
    expect(open).toHaveBeenCalledOnce();
  });
});
